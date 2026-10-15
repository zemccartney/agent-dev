import {
  HStack,
  Input,
  MouseRegion,
  SelectList,
  Text,
  TruncatedText,
  VStack,
  truncateToWidth,
  type Component,
  type Terminal,
} from "@earendil-works/pi-tui";
import { basename } from "node:path";
import { displayTitle, safeDisplay } from "./catalog.js";
import type { SessionRecord, SessionKey } from "./store.js";
import type { Pane } from "./herdr.js";

export interface ViewState {
  rows: SessionRecord[];
  selected: SessionKey | undefined;
  archived: boolean;
  status: string;
  loading: boolean;
  busy: boolean;
  editor: boolean;
  choices: Pane[] | undefined;
  choice: string | undefined;
  live: (row: SessionRecord) => string;
}
export interface ViewActions {
  select: (value: string) => void;
  open: (paneId?: string) => void;
  pin: () => void;
  label: () => void;
  archive: () => void;
  filter: () => void;
  refresh: () => void;
  saveLabel: () => void;
  cancel: () => void;
}
const identity = (text: string) => text;
const selected = (text: string) => `\x1b[7m${text}\x1b[27m`;
const theme = {
  selectedPrefix: identity,
  selectedText: selected,
  description: identity,
  scrollInfo: identity,
  noMatch: identity,
};
const text = (value: string) => new Text(safeDisplay(value), 0, 0);
const button = (caption: string, action: () => void) =>
  new MouseRegion(new TruncatedText(`[${caption}] `), (event) => {
    if (event.button === "left" && event.type === "click") {
      action();
      return { handled: true };
    }
    return undefined;
  });
function submitted(row: SessionRecord) {
  if (row.lastUserAt === null) return "No submissions.";
  const date = new Date(row.lastUserAt);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "Submission time unavailable";
}

export function makeView(
  state: ViewState,
  actions: ViewActions,
  terminal: Terminal,
  search: Input,
  label: Input,
) {
  const row = state.rows.find((item) => item.key === state.selected);
  const header = new VStack([
    new TruncatedText(
      state.choices ? "Choose destination" : `Sessions — ${state.archived ? "Archived" : "Saved"}`,
    ),
    new HStack([
      button("Saved", () => {
        if (state.archived) actions.filter();
      }),
      button("Archived", () => {
        if (!state.archived) actions.filter();
      }),
      button("Refresh ^R", actions.refresh),
    ]),
    search,
  ]);
  const footer = new VStack([
    ...(row
      ? [
          text(
            `${submitted(row)} · ${state.live(row)}${row.availability === "available" ? "" : ` · Unavailable: ${row.availability}`}`,
          ),
          text(`Directory: ${row.cwd}`),
          text(`File: ${row.sessionPath}`),
        ]
      : []),
    new HStack([
      button(state.busy ? "Opening…" : "Open Enter", () => actions.open(state.choice)),
      button(row?.pinned ? "Unpin ^P" : "Pin ^P", actions.pin),
    ]),
    new HStack([
      button("Label ^L", actions.label),
      button(state.archived ? "Unarchive ^X" : "Archive ^X", actions.archive),
    ]),
    {
      render(width: number) {
        return new Text(truncateToWidth(safeDisplay(state.status), width * 2), 0, 0).render(width);
      },
      invalidate() {},
    },
    new TruncatedText("Type to search · Tab view · Esc close"),
  ]);
  let list: SelectList | undefined;
  let lastSize = "";
  function getList(width: number): SelectList {
    const count = Math.max(
      1,
      terminal.rows - header.render(width).length - footer.render(width).length - 1,
    );
    const size = `${width}:${count}`;
    if (!list || lastSize !== size) {
      lastSize = size;
      const items =
        state.choices?.map((pane) => ({
          value: pane.paneId,
          label: safeDisplay(pane.paneId),
          description: safeDisplay(
            `${pane.workspaceId} / ${pane.tabId} · ${pane.agent ?? "not ready"}`,
          ),
        })) ??
        state.rows.map((item) => ({
          value: item.key,
          label: `${item.pinned ? "★ " : ""}${displayTitle(item)}`,
          description: safeDisplay(
            `${basename(item.cwd)} · ${submitted(item)} · ${state.live(item)}`,
          ),
        }));
      list = new SelectList(items, count, theme, {
        minPrimaryColumnWidth: 10,
        maxPrimaryColumnWidth: Math.max(10, Math.floor(width / 2)),
      });
      const key = state.choices ? state.choice : state.selected;
      const index = items.findIndex((item) => item.value === key);
      if (index >= 0) list.setSelectedIndex(index);
      list.onSelectionChange = (item) => actions.select(item.value);
      list.onSelect = (item) => {
        actions.select(item.value);
        actions.open(state.choices ? item.value : undefined);
      };
    }
    return list;
  }
  const listComponent: Component = {
    render(width) {
      return getList(width).render(width);
    },
    handleInput(data) {
      getList(terminal.columns).handleInput(data);
    },
    handleMouse(event) {
      return list?.handleMouse(event);
    },
    invalidate() {
      lastSize = "";
    },
  };
  const editor = new VStack([
    text("Label"),
    text("Registry only — does not rename the Pi session."),
    label,
    new HStack([button("Save Enter", actions.saveLabel), button("Cancel Esc", actions.cancel)]),
    text(state.status),
  ]);
  const loading = new VStack([text(state.status), text("Please wait · Esc close")]);
  const content = state.loading
    ? loading
    : state.editor
      ? editor
      : new VStack([header, { component: listComponent, basis: 0, grow: 1, minSize: 1 }, footer]);
  function fits() {
    return (
      terminal.columns >= 35 &&
      terminal.rows >=
        Math.max(
          8,
          state.loading
            ? loading.render(terminal.columns).length
            : state.editor
              ? editor.render(terminal.columns).length
              : header.render(terminal.columns).length + footer.render(terminal.columns).length + 2,
        )
    );
  }
  const root = new VStack([
    {
      component: new VStack([
        new TruncatedText("Terminal too small"),
        new TruncatedText("Esc closes"),
      ]),
      visible: () => !fits(),
    },
    { component: content, basis: 0, grow: 1, visible: fits },
  ]);
  return {
    root,
    fits,
    handleListInput(data: string) {
      listComponent.handleInput?.(data);
    },
  };
}
