import { safeText, presentAgent, formatLocalDeadline } from "./presentation.js";
import { FALLBACK_THEME, type Theme } from "./popup-data.js";
import type { AgentRow, MonitorSnapshot } from "./monitor.js";
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
export interface Hit {
  x: number;
  y: number;
  width: number;
  height: number;
  action: Action;
  occupant?: string;
  scroll?: number;
  valueX?: number;
}
export interface ViewModel {
  snapshot?: Pick<MonitorSnapshot, "power" | "agents"> & Partial<MonitorSnapshot>;
  labels?: Record<string, string>;
  selected?: string;
  pick?: string;
  view: View;
  focus: Focus;
  hours: string;
  caret: number;
  settingsHours: string;
  automatic: boolean;
  message: string;
  width: number;
  height: number;
  theme?: Theme;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (text: string) => [...segmenter.segment(safeText(text))].map((s) => s.segment);
function widthOf(g: string) {
  const n = g.codePointAt(0) ?? 0;
  if (/^\p{Mark}+$/u.test(g)) return 0;
  if (/\p{Emoji_Presentation}|\uFE0F/u.test(g)) return 2;
  return n >= 0x1100 &&
    (n <= 0x115f ||
      n === 0x2329 ||
      n === 0x232a ||
      (n >= 0x2e80 && n <= 0xa4cf) ||
      (n >= 0xac00 && n <= 0xd7a3) ||
      (n >= 0xf900 && n <= 0xfaff) ||
      (n >= 0xfe10 && n <= 0xfe6f) ||
      (n >= 0xff01 && n <= 0xff60) ||
      (n >= 0xffe0 && n <= 0xffe6) ||
      (n >= 0x20000 && n <= 0x3fffd))
    ? 2
    : 1;
}
export const cellWidth = (text: string) => graphemes(text).reduce((sum, g) => sum + widthOf(g), 0);
function clip(text: string, width: number) {
  let out = "",
    used = 0;
  for (const g of graphemes(text)) {
    const w = widthOf(g);
    if (used + w > width) break;
    out += g;
    used += w;
  }
  return out;
}
function rgb(hex: string | null, background = false) {
  if (!hex || !/^#[\da-f]{6}$/i.test(hex)) return "";
  return `\x1b[${background ? 48 : 38};2;${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(";")}m`;
}

/** Cell-based layout: paint and mouse hit-testing share the exact same geometry. */
export function renderPopup(m: ViewModel): {
  text: string;
  hits: Hit[];
  cursor: { x: number; y: number } | null;
} {
  const width = Math.max(1, Math.floor(m.width)),
    height = Math.max(1, Math.floor(m.height));
  const theme = m.theme ?? FALLBACK_THEME,
    hits: Hit[] = [];
  let cursor: { x: number; y: number } | null = null;
  const base = "\x1b[0m" + rgb(theme.fg) + rgb(theme.bg, true);
  const styles = {
    text: base,
    muted: base + (rgb(theme.muted) || "\x1b[2m"),
    accent: base + (rgb(theme.accent) || "\x1b[33m"),
    input: base + (rgb(theme.surface, true) || "\x1b[4m"),
    selected: base + (rgb(theme.selection, true) || "\x1b[7m"),
    primary: "\x1b[0m" + (rgb(theme.bg) || "\x1b[30m") + (rgb(theme.accent, true) || "\x1b[43m"),
    danger: base + (rgb(theme.danger) || "\x1b[31m"),
  };
  type Style = keyof typeof styles;
  const grid: { text: string; style: Style }[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ text: " ", style: "text" })),
  );
  function put(x: number, y: number, text: string, style: Style = "text", max = width - x + 1) {
    if (y < 1 || y > height || x < 1) return;
    for (const g of graphemes(clip(text, Math.max(0, Math.min(max, width - x + 1))))) {
      const w = widthOf(g);
      if (!w) continue;
      grid[y - 1][x - 1] = { text: g, style };
      for (let i = 1; i < w; i++) grid[y - 1][x + i - 1] = { text: "", style };
      x += w;
    }
  }
  function button(x: number, y: number, text: string, action: Action, primary = false) {
    const label = ` ${text} `,
      w = cellWidth(label);
    if (x + w - 1 > width - 1 || y < 1 || y > height) return;
    put(x, y, label, primary ? "primary" : "muted");
    hits.push({ x, y, width: w, height: 1, action });
    return x + w + 1;
  }
  function rule(y: number) {
    put(3, y, "─".repeat(Math.max(0, width - 5)), "accent");
  }
  function field(
    y: number,
    label: string,
    value: string,
    action: Focus,
    active: boolean,
    caret: number,
  ) {
    const inline = width >= 60,
      labelWidth = cellWidth(label) + 2,
      x = inline ? 3 + labelWidth : 3,
      fy = inline ? y : y + 1,
      boxWidth = Math.min(14, width - x - 2);
    put(3, y, label, "muted");
    const scroll = Math.max(0, caret - (boxWidth - 4));
    put(
      x,
      fy,
      `[ ${value.slice(scroll, scroll + boxWidth - 4).padEnd(boxWidth - 4)} ]`,
      "input",
      boxWidth,
    );
    hits.push({ x, y: fy, width: boxWidth, height: 1, action, scroll, valueX: x + 2 });
    if (active) cursor = { x: Math.min(x + boxWidth - 2, x + 2 + caret - scroll), y: fy };
    return { x: x + boxWidth + 2, y: fy };
  }
  const footerY = Math.max(1, height - 2);
  const closeText = "close (esc)",
    closeX = Math.max(1, width - cellWidth(closeText) - 2);
  if (width < 56 || height < 18) {
    put(2, 2, "Enlarge to edit controls", "muted");
    button(closeX, footerY, closeText, "close");
  } else {
    const agents = m.snapshot?.agents ?? [],
      agent = agents.find((a) => a.state.occupant === m.selected);
    const label = (a: AgentRow) => m.labels?.[a.target] ?? a.label ?? "Local agent";
    let tabX = 3;
    for (const [text, action, active] of [
      ["agents (a)", "agent-tab", m.view === "controls" || m.view === "picker"],
      ["settings (s)", "settings", m.view === "settings"],
      ["about (?)", "about", m.view === "about"],
    ] as const)
      tabX = button(tabX, 2, text, action, active) ?? tabX;
    if (m.view === "picker") {
      put(3, 4, `Agents · ${agents.length}`);
      rule(5);
      const capacity = Math.max(1, height - 12),
        index = agents.findIndex((a) => a.state.occupant === m.pick),
        start = Math.max(0, Math.min(index - capacity + 1, agents.length - capacity));
      const visible = agents.slice(start, start + capacity);
      for (let i = 0; i < visible.length; i++) {
        const a = visible[i],
          chosen = a.state.occupant === m.pick,
          y = 6 + i,
          style = chosen ? "selected" : "text";
        put(3, y, " ".repeat(width - 5), style);
        put(3, y, `${chosen ? "›" : " "} ${a.active ? "☕ " : ""}${label(a)}`, style, width - 5);
        hits.push({
          x: 3,
          y,
          width: width - 5,
          height: 1,
          action: "pick",
          occupant: a.state.occupant,
        });
      }
      if (!agents.length) put(3, 6, "No supported local agents available", "muted");
      const bottom = 6 + Math.max(1, visible.length);
      rule(bottom);
      button(3, bottom + 1, "select (↑/↓)", "next");
      button(24, bottom + 1, "open (↵)", "open", true);
      if (agents.length > capacity)
        put(
          3,
          bottom + 2,
          `${start + 1}–${start + visible.length} of ${agents.length} · scroll to browse`,
          "muted",
        );
    } else if (m.view === "settings") {
      put(3, 4, "Global settings");
      button(3, 6, `[${m.automatic ? "×" : " "}] automatic (space)`, "automatic");
      const pos = field(
        8,
        "Default duration (hours)",
        m.settingsHours,
        "defaultDuration",
        m.focus === "defaultDuration",
        m.caret,
      );
      button(pos.x, pos.y, "save (↵)", "save", true);
      put(3, 11, "Applies to future runs. Existing deadlines stay unchanged.", "muted");
    } else if (m.view === "about") {
      put(3, 4, "How it works");
      [
        "Automatic caffeination starts after ten seconds.",
        "Only while plugged in; the display may sleep.",
        "Finishing or waiting for input ends this run’s caffeine.",
        "Set from now affects this run only, not future defaults.",
        "Idle / permission wait: Set next run arms one run.",
        "Expiration never stops the agent.",
        "Native timeouts may end less than one second early.",
      ].forEach((line, i) => put(3, 6 + i, line, "muted", width - 5));
    } else if (agent) {
      const p = presentAgent(agent, m.snapshot?.power ?? "unknown");
      put(3, 4, label(agent), "text", width - 5);
      put(3, 5, `${p.cup ? p.cup + " " : ""}${agent.state.phase}`, "muted");
      put(3, 7, p.headline, agent.active ? "accent" : "text", width - 5);
      if (agent.state.lease && !agent.active)
        put(3, 8, formatLocalDeadline(agent.state.lease.deadlineAt), "accent");
      const pos = field(
        10,
        `${p.primaryLabel} (hours)`,
        m.hours,
        "duration",
        m.focus === "duration",
        m.caret,
      );
      button(pos.x, pos.y, "apply (↵)", "apply", true);
      if (p.secondaryLabel) button(3, 13, `${p.secondaryLabel.toLowerCase()} (r)`, "secondary");
    } else put(3, 4, "This agent is no longer available. Open agents to choose another.", "muted");
    const note = m.message || m.snapshot?.error || (m.view === "controls" ? agent?.error : null);
    if (note) put(3, height - 4, note, "danger", width - 5);
    if (m.view === "controls" || (m.view === "picker" && agent))
      button(3, footerY, m.view === "picker" ? "back (tab)" : "all agents (tab)", "agents");
    button(closeX, footerY, closeText, "close");
  }
  const lines = grid.map((row) => {
    let last = "",
      out = "";
    for (const c of row) {
      if (c.style !== last) {
        out += styles[c.style];
        last = c.style;
      }
      out += c.text;
    }
    return out + base;
  });
  return { text: base + "\x1b[H" + lines.join("\r\n") + "\x1b[0m", hits, cursor };
}
