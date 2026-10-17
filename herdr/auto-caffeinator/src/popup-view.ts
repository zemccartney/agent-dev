import {
  VStack,
  HStack,
  Text,
  Input,
  MouseRegion,
  SelectList,
  matchesKey,
  visibleWidth,
  truncateToWidth,
  type Component,
  type Focusable,
} from "@earendil-works/pi-tui";
import { safeText, presentAgent, formatLocalDeadline } from "./presentation";
import { FALLBACK_THEME, type Theme } from "./popup-data";
import type { AgentRow, MonitorSnapshot } from "./monitor";
export type View = "controls" | "picker" | "settings" | "about";
export type Focus = "duration" | "defaultDuration" | "automatic";
export type Action =
  | "close"
  | "agents"
  | "agent-tab"
  | "settings"
  | "about"
  | "pick"
  | "next"
  | "open"
  | Focus
  | "save"
  | "apply"
  | "secondary";
export interface ViewModel {
  snapshot?: Pick<MonitorSnapshot, "power" | "agents"> & Partial<MonitorSnapshot>;
  labels?: Record<string, string>;
  selected?: string;
  pick?: string;
  view: View;
  focus: Focus;
  hours: string;
  settingsHours: string;
  automatic: boolean;
  message: string;
  width: number;
  height: number;
  theme?: Theme;
  busy?: boolean;
}
export interface PopupView extends Component, Focusable {
  update(model: ViewModel): void;
}
interface Callbacks {
  onAction(action: Action, occupant?: string): void;
  onEdit(field: "duration" | "defaultDuration", value: string): void;
}
function rgb(hex: string | null, background = false) {
  return hex && /^#[\da-f]{6}$/i.test(hex)
    ? `\x1b[${background ? 48 : 38};2;${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(";")}m`
    : "";
}
export function createPopupView(callbacks: Callbacks): PopupView {
  return new (class extends VStack implements PopupView {
    focused = true;
    private model?: ViewModel;
    private inputs = {
      duration: new Input({ prompt: "[ " }),
      defaultDuration: new Input({ prompt: "[ " }),
    };
    private replace = { duration: true, defaultDuration: true };
    private list?: SelectList;
    private listKey = "";
    handleInput(data: string) {
      const m = this.model;
      if (!m || m.busy || m.width < 56 || m.height < 18) return;
      if (m.view === "picker") {
        if (matchesKey(data, "home") || matchesKey(data, "end")) {
          const rows = m.snapshot?.agents ?? [];
          const row = rows[matchesKey(data, "home") ? 0 : rows.length - 1];
          if (row) callbacks.onAction("pick", row.state.occupant);
        } else this.list?.handleInput(data);
        return;
      }
      const field =
        m.view === "settings" && m.focus === "defaultDuration"
          ? "defaultDuration"
          : m.view === "controls" &&
              m.focus === "duration" &&
              m.snapshot?.agents.some((row) => row.state.occupant === m.selected)
            ? "duration"
            : undefined;
      if (!field) return;
      const input = this.inputs[field],
        before = input.getValue();
      const pasted =
        data.startsWith("\x1b[200~") && data.endsWith("\x1b[201~") ? data.slice(6, -6) : data;
      if (/^[0-9.eE+-]+$/.test(pasted)) {
        if ((this.replace[field] ? 0 : before.length) + pasted.length > 100) return;
        if (this.replace[field]) input.setValue("");
        input.handleInput(data);
      } else if (matchesKey(data, "ctrl+u")) input.setValue("");
      else if (
        (["left", "right", "home", "end", "backspace", "delete"] as const).some((key) =>
          matchesKey(data, key),
        )
      )
        input.handleInput(data);
      else return;
      this.replace[field] = false;
      if (input.getValue() !== before) callbacks.onEdit(field, input.getValue());
    }
    update(m: ViewModel) {
      const previous = this.model;
      this.model = m;
      for (const field of ["duration", "defaultDuration"] as const) {
        const value = field === "duration" ? m.hours : m.settingsHours;
        if (this.inputs[field].getValue() !== value) {
          this.inputs[field].setValue(value);
          this.inputs[field].handleInput("\x05");
        }
        this.inputs[field].focused =
          this.focused &&
          m.focus === field &&
          m.view === (field === "duration" ? "controls" : "settings");
        if (
          !previous ||
          previous.view !== m.view ||
          previous.focus !== m.focus ||
          previous.selected !== m.selected
        )
          this.replace[field] = true;
      }
      const theme = m.theme ?? FALLBACK_THEME;
      const base = rgb(theme.fg) + rgb(theme.bg, true);
      const accent = rgb(theme.accent) || "\x1b[33m";
      const muted = rgb(theme.muted) || "\x1b[2m";
      const primary = (rgb(theme.bg) || "\x1b[30m") + (rgb(theme.accent, true) || "\x1b[43m");
      const text = (value: string, style = base) =>
        new Text(
          style + truncateToWidth(safeText(value), Math.max(1, m.width - 2)) + "\x1b[0m",
          0,
          0,
        );
      const blank = () => new Text("", 0, 0);
      const button = (label: string, action: Action, active = false) => ({
        component: new MouseRegion(text(` ${label} `, active ? primary : muted), (event) => {
          if (event.type !== "click" || event.button !== "left") return;
          callbacks.onAction(action);
          return { handled: true };
        }),
        basis: visibleWidth(label) + 2,
      });
      const field = (
        label: string,
        name: "duration" | "defaultDuration",
        action: "apply" | "save",
      ) => {
        const input = this.inputs[name];
        const styled: Component = {
          render: (width) =>
            input
              .render(width)
              .map((line) => (rgb(theme.surface, true) || "\x1b[4m") + line + "\x1b[0m"),
          invalidate: () => input.invalidate(),
        };
        return new HStack(
          [
            { component: text(`  ${label} `, muted), basis: visibleWidth(label) + 3 },
            {
              component: new MouseRegion(styled, (event) => {
                if (event.type !== "click" || event.button !== "left") return;
                const already = this.model?.focus === name;
                callbacks.onAction(name);
                input.handleMouse(event);
                if (already) this.replace[name] = false;
                return { handled: true };
              }),
              basis: 14,
            },
            { component: text("]"), basis: 1 },
            button(action === "apply" ? "apply (↵)" : "save (↵)", action, true),
          ],
          { gap: 1 },
        );
      };
      this.clear();
      this.addChild(blank(), { basis: 1 });
      if (m.width < 56 || m.height < 18) {
        this.addChild(text("Enlarge to edit controls"));
        this.addChild(blank(), { grow: 1, basis: 0 });
        this.addChild(new HStack([button("close (esc)", "close")]), { basis: 1 });
        return;
      }
      this.addChild(
        new HStack(
          [
            { component: text("  "), basis: 2 },
            button("agents (a)", "agent-tab", m.view === "controls" || m.view === "picker"),
            button("settings (s)", "settings", m.view === "settings"),
            button("about (?)", "about", m.view === "about"),
          ],
          { gap: 1 },
        ),
        { basis: 1 },
      );
      this.addChild(blank(), { basis: 1 });
      const body = new VStack();
      const rows = m.snapshot?.agents ?? [],
        agent = rows.find((row) => row.state.occupant === m.selected);
      const label = (row: AgentRow) =>
        safeText(m.labels?.[row.target] ?? row.label ?? "Local agent");
      const line = (value: string, style = base) =>
        body.addChild(text(`  ${value}`, style), { basis: 1 });
      const rule = () => line("─".repeat(Math.max(1, m.width - 4)), accent);
      if (!m.snapshot) line("Loading caffeination controls…");
      else if (m.view === "picker") {
        line(`Agents · ${rows.length}`);
        rule();
        const items = rows.map((row) => ({
          value: row.state.occupant,
          label: `${row.active ? "☕ " : ""}${label(row)}`,
        }));
        if (m.pick && !items.some((item) => item.value === m.pick))
          items.unshift({
            value: m.pick,
            label: "Previously selected agent is no longer available",
          });
        const plain = (value: string) => value;
        const key = JSON.stringify([items, m.height, theme]);
        const list =
          this.list && this.listKey === key
            ? this.list
            : new SelectList(items, Math.max(1, m.height - 13), {
                selectedPrefix: plain,
                selectedText: (value) =>
                  (rgb(theme.selection, true) || "\x1b[7m") + value + "\x1b[0m",
                description: plain,
                scrollInfo: plain,
                noMatch: () => "No supported local agents available",
              });
        list.setSelectedIndex(
          Math.max(
            0,
            items.findIndex((item) => item.value === m.pick),
          ),
        );
        list.onSelect = list.onSelectionChange = (item) => callbacks.onAction("pick", item.value);
        this.list = list;
        this.listKey = key;
        body.addChild({
          render: (width) => list.render(width),
          invalidate: () => list.invalidate(),
          handleMouse: (event) => {
            // Selection happens on press; release must not retarget after a row refresh.
            if (event.type === "click" || event.type === "release") return { handled: true };
            const result = list.handleMouse(event);
            return result ? { ...result, focus: false } : undefined;
          },
        });
        rule();
        body.addChild(
          new HStack([button("select (↑/↓)", "next"), button("open (↵)", "open", true)], {
            gap: 2,
          }),
          { basis: 1 },
        );
      } else if (m.view === "settings") {
        line("Global settings");
        line("");
        body.addChild(
          new HStack([button(`[${m.automatic ? "×" : " "}] automatic (space)`, "automatic")]),
          { basis: 1 },
        );
        line("");
        body.addChild(field("Default duration (hours)", "defaultDuration", "save"), { basis: 1 });
        line("");
        line("Applies to future runs. Existing deadlines stay unchanged.", muted);
      } else if (m.view === "about") {
        line("How it works");
        line("");
        for (const value of [
          "Automatic caffeination starts after ten seconds.",
          "Only while plugged in; the display may sleep.",
          "Finishing or waiting for input ends this run’s caffeine.",
          "Set from now affects this run only, not future defaults.",
          "Idle / permission wait: Set next run arms one run.",
          "Expiration never stops the agent.",
          "Native timeouts may end less than one second early.",
        ])
          line(value, muted);
      } else if (agent) {
        const p = presentAgent(agent, m.snapshot?.power ?? "unknown");
        line(label(agent));
        line(`${p.cup ? p.cup + " " : ""}${agent.state.phase}`, muted);
        line("");
        line(p.headline, agent.active ? accent : base);
        line(
          agent.state.lease && !agent.active
            ? formatLocalDeadline(agent.state.lease.deadlineAt)
            : "",
          accent,
        );
        line("");
        body.addChild(field(`${p.primaryLabel} (hours)`, "duration", "apply"), { basis: 1 });
        line("");
        if (p.secondaryLabel)
          body.addChild(
            new HStack([button(`${p.secondaryLabel.toLowerCase()} (r)`, "secondary")]),
            { basis: 1 },
          );
      } else line("This agent is no longer available. Open agents to choose another.", muted);
      body.addChild(blank(), { grow: 1, basis: 0 });
      line(
        m.message || m.snapshot?.error || (m.view === "controls" ? agent?.error : "") || "",
        rgb(theme.danger) || "\x1b[31m",
      );
      this.addChild(body, { grow: 1, basis: 0 });
      const footer = new HStack([
        ...(m.view === "controls" || (m.view === "picker" && agent)
          ? [button(m.view === "picker" ? "back (tab)" : "all agents (tab)", "agents")]
          : []),
        { component: blank(), grow: 1, basis: 0 },
        button("close (esc)", "close"),
      ]);
      this.addChild(footer, { basis: 1 });
      this.addChild(blank(), { basis: 2 });
    }
  })();
}
