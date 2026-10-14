import {
  Input,
  ProcessTerminal,
  TuiAltScreen,
  matchesKey,
  isKeyRelease,
  type Terminal,
} from "@earendil-works/pi-tui";
import { setImmediate } from "node:timers/promises";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { RegistryStore, SessionRecord } from "./store.js";
import type { HerdrClient, HerdrState } from "./herdr.js";
import { refreshCatalog, type DiscoveryContext } from "./discovery.js";
import { queryCatalog, safeDisplay } from "./catalog.js";
import { openSession } from "./resume.js";
import { makeView, type ViewState, type ViewActions } from "./ui-view.js";
export interface PopupOptions {
  store: RegistryStore;
  herdr: HerdrClient;
  context: DiscoveryContext;
  terminal?: Terminal;
  signal?: AbortSignal;
}

export async function runPopup(options: PopupOptions): Promise<void> {
  const { store, herdr, context } = options;
  if (options.signal?.aborted) return;
  const terminal = options.terminal ?? new ProcessTerminal();
  const tui = new TuiAltScreen(terminal, false, undefined, { copyOnSelect: false });
  const controller = new AbortController();
  const { signal } = controller;
  const search = new Input();
  const label = new Input();
  let closed = false;
  let finish!: () => void;
  const finished = new Promise<void>((done) => {
    finish = done;
  });
  let pendingRefresh: Promise<void> | undefined;
  let pendingOpen: Promise<void> | undefined;
  let live: HerdrState | null = null;
  function liveStatus(row: SessionRecord) {
    if (!live) return "Live status unknown";
    const panes = live.panes.filter(
      (p) =>
        p.session?.agent === "pi" &&
        (p.session.kind === "path"
          ? p.session.value === row.sessionPath
          : p.session.value === row.sessionId),
    );
    if (
      panes.some((p) => p.session?.kind === "id") &&
      store.list().filter((r) => r.sessionId === row.sessionId).length !== 1
    )
      return "Ambiguous live reference";
    if (panes.some((p) => p.agent === "pi")) return "Open here";
    return panes.length ? "Restoring / not ready" : "Not open here";
  }
  const state: ViewState = {
    rows: [],
    selected: undefined,
    archived: false,
    status: store.list().length ? "Refreshing…" : "Loading sessions…",
    busy: false,
    editor: false,
    choices: undefined,
    choice: undefined,
    live: liveStatus,
  };
  function reload() {
    state.rows = queryCatalog(store.list(), { query: search.getValue(), archived: state.archived });
    if (!state.rows.some((r) => r.key === state.selected)) state.selected = state.rows[0]?.key;
  }
  function close() {
    if (closed) return;
    closed = true;
    controller.abort();
    finish();
  }
  function cancel() {
    if (state.editor) {
      state.editor = false;
      paint();
    } else if (state.choices) {
      state.choices = undefined;
      state.choice = undefined;
      paint();
    } else close();
  }
  function report(error: unknown) {
    if (closed) return;
    state.status = `Error: ${safeDisplay(error instanceof Error ? error.message : String(error))}`;
    paint();
  }
  function edit(write: (row: SessionRecord) => void, message: string) {
    if (closed || state.busy || !state.selected) return;
    try {
      write(store.get(state.selected));
      reload();
      state.status = message;
      paint();
    } catch (error) {
      report(error);
    }
  }
  function open(paneId?: string) {
    if (closed || state.busy || !state.selected) return;
    state.busy = true;
    state.status = "Opening…";
    paint();
    pendingOpen = openSession(
      state.selected,
      { store, herdr },
      { signal, ...(paneId ? { paneId } : {}) },
    )
      .then((result) => {
        if (closed) return;
        if (result.kind === "opened") {
          close();
          return;
        }
        if (result.kind === "choose") {
          state.choices = result.panes;
          state.choice = result.panes[0]?.paneId;
          state.status = "Choose a matching pane; no new process was started.";
        } else if (result.kind === "pending")
          state.status = "Matching pane is not ready; no duplicate started.";
        else
          state.status = `Error${result.paneId ? ` in ${result.paneId}` : ""}: ${result.message}`;
      })
      .catch(report)
      .finally(() => {
        pendingOpen = undefined;
        state.busy = false;
        if (!closed) paint();
      });
  }
  async function refresh() {
    let warning = "";
    try {
      const current = await herdr.state(signal);
      signal.throwIfAborted();
      for (const pane of current.panes) {
        const ref = pane.session;
        if (ref?.agent !== "pi" || ref.kind !== "path" || !isAbsolute(ref.value)) continue;
        let path: string;
        try {
          path = await realpath(ref.value);
        } catch {
          path = resolve(ref.value);
        }
        signal.throwIfAborted();
        pane.session = { ...ref, value: path };
        store.rememberPath(path);
      }
      live = current;
    } catch (error) {
      signal.throwIfAborted();
      live = null;
      warning = `Herdr unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    const fresh: DiscoveryContext = {
      ...context,
      projectCwds: [
        ...context.projectCwds,
        ...(live?.panes.flatMap((p) => (p.cwd ? [p.cwd] : [])) ?? []),
        ...(live?.workspaces.flatMap((w) => (w.checkoutPath ? [w.checkoutPath] : [])) ?? []),
      ],
      livePaths: [
        ...context.livePaths,
        ...(live?.panes.flatMap((p) =>
          p.session?.agent === "pi" && p.session.kind === "path" && isAbsolute(p.session.value)
            ? [p.session.value]
            : [],
        ) ?? []),
      ],
    };
    const result = await refreshCatalog(store, fresh, signal);
    signal.throwIfAborted();
    reload();
    state.status =
      warning ||
      result.issues.join("; ") ||
      `${store.list().length} saved conversations · This Herdr namespace only`;
    paint();
  }
  function requestRefresh() {
    if (closed || pendingRefresh) return;
    state.status = store.list().length ? "Refreshing…" : "Loading sessions…";
    paint();
    pendingRefresh = refresh()
      .catch((error: unknown) => {
        if (!signal.aborted) report(error);
      })
      .finally(() => {
        pendingRefresh = undefined;
      });
  }
  const actions: ViewActions = {
    select(value) {
      if (state.choices) state.choice = value;
      else state.selected = value;
      paint();
    },
    open,
    pin() {
      edit((row) => store.setPinned(row.key, !row.pinned), "Pin saved");
    },
    label() {
      if (state.busy || !state.selected) return;
      state.editor = true;
      label.setValue(safeDisplay(store.get(state.selected).labelOverride ?? ""));
      state.status = "Empty label restores the native title.";
      paint();
    },
    archive() {
      edit((row) => store.setArchived(row.key, !row.archived), "Archive state saved");
    },
    filter() {
      if (state.busy) return;
      state.archived = !state.archived;
      state.choices = undefined;
      state.choice = undefined;
      reload();
      paint();
    },
    refresh: requestRefresh,
    cancel,
    saveLabel() {
      edit((row) => {
        store.setLabel(row.key, label.getValue() || null);
        state.editor = false;
      }, "Label saved");
    },
  };
  let view: ReturnType<typeof makeView>;
  function paint() {
    if (closed) return;
    view = makeView(state, actions, terminal, search, label);
    tui.setLayoutRoot(view.root);
    tui.setFocus(state.editor ? label : search);
    tui.requestRender();
  }
  reload();
  paint();
  tui.addInputListener((data) => {
    if (closed || isKeyRelease(data)) return { consume: true };
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      cancel();
      return { consume: true };
    }
    if (!view.fits()) return { consume: true };
    if (state.editor) {
      if (matchesKey(data, "enter")) actions.saveLabel();
      else {
        label.handleInput(data);
        tui.requestRender();
      }
      return { consume: true };
    }
    if (matchesKey(data, "up") || matchesKey(data, "down")) view.handleListInput(data);
    else if (matchesKey(data, "enter")) open(state.choice);
    else if (!state.choices) {
      if (matchesKey(data, "tab")) actions.filter();
      else if (matchesKey(data, "ctrl+p")) actions.pin();
      else if (matchesKey(data, "ctrl+l")) actions.label();
      else if (matchesKey(data, "ctrl+x")) actions.archive();
      else if (matchesKey(data, "ctrl+r")) requestRefresh();
      else {
        const previous = search.getValue();
        tui.setFocus(search);
        search.handleInput(data);
        if (search.getValue() !== previous) {
          reload();
          paint();
        } else tui.requestRender();
      }
    }
    return { consume: true };
  });
  options.signal?.addEventListener("abort", close, { once: true });
  try {
    tui.start();
    tui.requestRender(true);
    await setImmediate();
    if (!closed) requestRefresh();
    await finished;
  } finally {
    closed = true;
    controller.abort();
    options.signal?.removeEventListener("abort", close);
    await Promise.allSettled([pendingRefresh, pendingOpen]);
    try {
      await terminal.drainInput(100, 20);
    } finally {
      tui.stop();
    }
  }
}
