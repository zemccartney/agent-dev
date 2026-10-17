import { getMarkdownTheme, getSelectListTheme } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Box, Input, Markdown, ScrollView, SelectList, Spacer, matchesKey } from "@earendil-works/pi-tui";
import type { Component, Focusable, TUI, TuiMouseEvent, TuiMouseDispatchResult } from "@earendil-works/pi-tui";
import { actionRow, fixedHeight, framed, modalHeight, oneLine } from "./reference-widgets.ts";
import type { Action } from "./reference-widgets.ts";
import type { ReferenceState, ResponseReference } from "./reference-state.ts";

interface BrowserOptions {
  tui: TUI;
  theme: Theme;
  state: () => ReferenceState;
  setPin: (id: string, label: string | null) => void;
  positions: Map<string, number>;
  close: () => void;
  pinResponse?: ResponseReference;
}

/** Interaction prototype: a response list, read-only reader, and a naming form. */
export class ReferenceBrowser implements Component, Focusable {
  focused = false;
  private view: "list" | "read" | "label" = "list";
  private tab: "all" | "pins" = "pins";
  private search = new Input({ prompt: "Search: ", placeholder: "response text or pin name" });
  private name = new Input({ prompt: "Name: " });
  private list!: SelectList;
  private listIds: string[] = [];
  private listRows = 8;
  private selected?: ResponseReference;
  private markdown?: Markdown;
  private scroll?: ScrollView;
  private pendingScroll?: number;
  private readerRows = 8;
  private root?: Component;
  private labelFromToolbar = false;
  private labelError = false;

  constructor(private readonly options: BrowserOptions) {
    this.rebuildList();
    if (options.pinResponse) this.beginPin(options.pinResponse, true);
  }

  private repaint() { this.options.tui.requestRender(); }
  private remember() {
    if (this.selected && this.scroll && this.view === "read") {
      this.options.positions.set(this.selected.id, this.scroll.scrollTop);
    }
  }
  private close = () => { this.remember(); this.options.close(); };

  refresh() {
    if (this.view === "list") this.rebuildList();
    this.repaint();
  }

  private rebuildList() {
    const state = this.options.state();
    const query = this.search.getValue().trim().toLocaleLowerCase();
    const previous = this.list?.getSelectedItem()?.value;
    const responses = state.responses.filter(response =>
      (this.tab === "all" || state.pins.has(response.id))
      && `${response.text}\n${state.pins.get(response.id) ?? ""}`.toLocaleLowerCase().includes(query));
    const items = responses.map(response => ({
      value: response.id,
      label: this.tab === "pins" ? state.pins.get(response.id)!
        : `${state.pins.has(response.id) ? "◆ " : ""}${response.title}`,
    }));
    this.listIds = items.map(item => item.value);
    // No description column: each response gets the full available row width.
    this.list = new SelectList(items, this.listRows, getSelectListTheme());
    const index = items.findIndex(item => item.value === previous);
    if (index >= 0) this.list.setSelectedIndex(index);
    this.list.onSelect = item => {
      const response = this.options.state().responses.find(response => response.id === item.value);
      if (response) this.read(response);
    };
    this.list.onCancel = this.close;
  }

  /** Add breathing room while translating visual mouse rows back to SelectList rows. */
  private spacedList(): Component {
    let sourceRows: (number | undefined)[] = [];
    return {
      render: width => {
        const raw = this.list.render(width);
        const itemCount = Math.min(this.listRows, this.listIds.length);
        const lines: string[] = [];
        sourceRows = [];
        const length = Math.max(0, Math.min(width - 2, Math.max(2, Math.round(width * 0.05))));
        const divider = width > 2 ? this.options.theme.fg("borderMuted", `  ${"─".repeat(length)}`) : "";
        raw.forEach((line, index) => {
          if (index > 0 && index < itemCount) {
            lines.push(divider);
            sourceRows.push(undefined);
          }
          lines.push(line);
          sourceRows.push(index);
        });
        return lines;
      },
      invalidate: () => this.list.invalidate(),
      handleMouse: event => {
        if (event.type === "wheel") return this.list.handleMouse(event);
        const sourceRow = sourceRows[event.y];
        if (sourceRow === undefined) return { handled: true };
        return this.list.handleMouse({ ...event, y: sourceRow });
      },
    };
  }

  private showList = () => {
    this.remember();
    this.view = "list";
    this.rebuildList();
    this.repaint();
  };

  private read(response: ResponseReference) {
    this.remember();
    this.selected = response;
    this.view = "read";
    this.markdown = new Markdown(response.text, 0, 0, getMarkdownTheme());
    this.scroll = new ScrollView(this.markdown, { scrollbar: "hidden", overscroll: "contain" });
    this.pendingScroll = this.options.positions.get(response.id) ?? 0;
    this.repaint();
  }

  private beginPin(response: ResponseReference, fromToolbar = false) {
    this.remember();
    this.selected = response;
    this.labelFromToolbar = fromToolbar;
    this.name.setValue("");
    this.labelError = false;
    this.view = "label";
    this.repaint();
  }

  private savePin = () => {
    const label = this.name.getValue().replace(/\s+/g, " ").trim().slice(0, 160);
    if (!label || !this.selected) { this.labelError = true; this.repaint(); return; }
    this.options.setPin(this.selected.id, label);
    if (this.labelFromToolbar) this.close();
    else this.read(this.selected);
  };

  private cancelLabel = () => {
    if (this.labelFromToolbar) this.close();
    else if (this.selected) this.read(this.selected);
  };

  private togglePin = () => {
    if (!this.selected) return;
    if (this.options.state().pins.has(this.selected.id)) {
      this.options.setPin(this.selected.id, null);
      this.repaint();
    } else this.beginPin(this.selected);
  };

  render(width: number): string[] {
    const { theme, tui } = this.options;
    const height = modalHeight(tui.terminal.rows);
    if (height < 12) {
      this.root = framed(theme, [oneLine(() => "Enlarge pane · Esc closes")]);
      return this.root.render(width).slice(0, height);
    }
    // Fixed frame: border/padding (4), title/actions/footer (3), and gaps (3).
    const bodyRows = height - 10;
    // Search + gap take two rows. Each item then needs a row and separator;
    // the last separator's space accommodates SelectList's position indicator.
    const rows = Math.max(1, Math.floor((bodyRows - 2) / 2));
    if (rows !== this.listRows) { this.listRows = rows; this.rebuildList(); }
    this.readerRows = bodyRows;
    this.search.focused = this.focused && this.view === "list";
    this.name.focused = this.focused && this.view === "label";

    let title: string;
    let hint: string;
    let actions: Action[];
    let body: Component[];
    if (this.view === "list") {
      title = "Responses";
      actions = [
        { label: "Pins", active: () => this.tab === "pins", run: () => { this.tab = "pins"; this.showList(); } },
        { label: "All", active: () => this.tab === "all", run: () => { this.tab = "all"; this.showList(); } },
        { label: "Close", run: this.close },
      ];
      const state = this.options.state();
      const empty = this.tab === "pins" && state.pins.size === 0
        ? "No pins yet. Open All to find and pin a response."
        : state.responses.length === 0 ? "No assistant responses yet."
        : "No matches in this tab.";
      body = [this.search, new Spacer(1), this.listIds.length ? this.spacedList()
        : oneLine(() => theme.fg("muted", empty))];
      hint = "Wheel / ↑↓ / PgUp/PgDn to browse · click / Enter to read · Tab switches · Esc closes";
    } else if (this.view === "label") {
      title = "Name this pin";
      actions = [{ label: "Save", run: this.savePin }, { label: "Cancel", run: this.cancelLabel }];
      body = [oneLine(() => theme.fg("muted", this.selected!.title)), new Spacer(1), this.name];
      hint = this.labelError ? "Enter a name before saving." : "Enter saves · Esc cancels · other pins are kept";
    } else {
      title = this.options.state().pins.get(this.selected!.id) ?? this.selected!.title;
      actions = [
        { label: "Back", run: this.showList },
        { label: () => this.options.state().pins.has(this.selected!.id) ? "Unpin" : "Pin", run: this.togglePin },
        { label: "Close", run: this.close },
      ];
      body = [{
        render: contentWidth => {
          const lines = this.scroll!.render(contentWidth);
          this.scroll!.updateLayout(lines.length, this.readerRows, () => this.repaint());
          if (this.pendingScroll !== undefined) {
            const position = this.pendingScroll;
            this.pendingScroll = undefined;
            this.scroll!.scrollTo(position);
          }
          const top = this.scroll!.scrollTop;
          return lines.slice(top, top + this.readerRows);
        },
        invalidate: () => this.markdown?.invalidate(),
        handleMouse: event => {
          if (event.type !== "wheel") return;
          this.scroll!.scrollBy(event.wheelDelta ?? 0);
          this.repaint();
          return { handled: true };
        },
      }];
      hint = "Read-only · wheel / ↑↓ / PgUp/PgDn to scroll · Esc returns to your draft";
    }
    const content = new Box(0, 0);
    for (const component of body) content.addChild(component);
    this.root = framed(theme, [
      oneLine(() => theme.fg("accent", title)), new Spacer(1),
      actionRow(theme, actions), new Spacer(1), fixedHeight(content, bodyRows), new Spacer(1),
      oneLine(() => theme.fg(this.labelError && this.view === "label" ? "warning" : "muted", hint)),
    ]);
    return this.root.render(width);
  }

  handleMouse(event: TuiMouseEvent) {
    const result = this.root?.handleMouse?.(event) as TuiMouseDispatchResult | undefined;
    // Input/list children must not steal routing for Escape, tabs, or reader keys.
    return result ? { ...result, focusTarget: this } : undefined;
  }

  handleInput(data: string) {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      if (this.view === "label") this.cancelLabel();
      else this.close();
    } else if (this.view === "label") {
      if (matchesKey(data, "enter")) this.savePin();
      else this.name.handleInput(data);
    } else if (this.view === "list") {
      if (matchesKey(data, "tab")) {
        this.tab = this.tab === "all" ? "pins" : "all";
        this.rebuildList();
      } else if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
        const index = this.listIds.indexOf(this.list.getSelectedItem()?.value ?? "");
        const direction = matchesKey(data, "pageUp") ? -1 : 1;
        if (index >= 0) this.list.setSelectedIndex(index + direction * this.listRows);
      } else if ((["up", "down", "enter"] as const).some(key => matchesKey(data, key))) {
        this.list.handleInput(data);
      } else {
        const before = this.search.getValue();
        this.search.handleInput(data);
        if (before !== this.search.getValue()) this.rebuildList();
      }
    } else if (this.scroll) {
      if (matchesKey(data, "up")) this.scroll.scrollBy(-1);
      if (matchesKey(data, "down")) this.scroll.scrollBy(1);
      if (matchesKey(data, "pageUp")) this.scroll.scrollBy(-this.readerRows);
      if (matchesKey(data, "pageDown")) this.scroll.scrollBy(this.readerRows);
      if (matchesKey(data, "home")) this.scroll.scrollToStart();
      if (matchesKey(data, "end")) this.scroll.scrollToEnd();
    }
    this.repaint();
  }

  invalidate() {
    this.search.invalidate(); this.name.invalidate(); this.list.invalidate();
    this.markdown?.invalidate(); this.root?.invalidate();
  }
}
