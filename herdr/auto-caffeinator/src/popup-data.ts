import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { request } from "./herdr";
import { safeText } from "./presentation";

import { object, records } from "./validation";
export interface Theme {
  fg: string | null;
  bg: string | null;
  accent: string | null;
  muted: string | null;
  surface: string | null;
  selection: string | null;
  danger: string | null;
}
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function labelsFromSnapshot(value: unknown): Record<string, string> {
  const snapshot = object(value);
  const spaces = new Map(records(snapshot.workspaces).map((w) => [w.workspace_id, w]));
  const tabs = new Map(records(snapshot.tabs).map((t) => [t.tab_id, t]));
  const panes = new Map(records(snapshot.panes).map((p) => [p.pane_id, p]));
  const rows = records(snapshot.agents).map((a) => {
    const w = spaces.get(a.workspace_id),
      t = tabs.get(a.tab_id);
    const workspace = text(w?.label) || basename(text(w?.cwd ?? a.cwd)) || "Workspace";
    const tab =
      text(t?.label) ||
      String(typeof t?.number === "number" ? t.number : text(t?.number) || "Terminal");
    return { a, base: `${workspace} — ${tab}`, kind: text(a.agent) || "agent" };
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.base} (${r.kind})`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const ordinals = new Map<string, number>();
  return Object.fromEntries(
    rows.map(({ a, base, kind }) => {
      const key = `${base} (${kind})`;
      const ordinal = (ordinals.get(key) ?? 0) + 1;
      ordinals.set(key, ordinal);
      const detail =
        (counts.get(key) ?? 0) > 1
          ? ` / ${text(panes.get(a.pane_id)?.label) || text(a.name) || `pane ${ordinal}`}`
          : "";
      return [text(a.pane_id), safeText(`${base}${detail} (${kind})`)];
    }),
  );
}
export async function readAgentLabels(socketPath: string) {
  return labelsFromSnapshot((await request(socketPath, "session.snapshot", {})).snapshot ?? {});
}
export const FALLBACK_THEME: Readonly<Theme> = Object.freeze({
  fg: null,
  bg: null,
  accent: null,
  muted: null,
  surface: null,
  selection: null,
  danger: null,
});
const GRUVBOX = {
  fg: "#ebdbb2",
  bg: "#282828",
  accent: "#d79921",
  muted: "#928374",
  surface: "#3c3836",
  selection: "#4b3f27",
  danger: "#fb4934",
};
const LIGHT = {
  fg: "#3c3836",
  bg: "#fbf1c7",
  accent: "#076678",
  muted: "#928374",
  surface: "#ebdbb2",
  selection: "#ebdbb2",
  danger: "#9d0006",
};
/** Deliberately narrow theme bridge, not a TOML parser or Herdr theme resolver.
 * Match static Gruvbox plus simple custom hex tokens. No public resolved-theme
 * API exists in Herdr 0.9.3; other/automatic themes use terminal ANSI colors. */
export function themeFromConfig(text: string): Theme {
  const sections = new Map<string, string>();
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (header) {
      section = header[1];
      continue;
    }
    const value = line.match(
      /^\s*([a-z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(true|false))\s*(?:#.*)?$/,
    );
    if (value) sections.set(`${section}.${value[1]}`, value[2] ?? value[3] ?? value[4]);
  }
  if (sections.get("theme.auto_switch") === "true") return { ...FALLBACK_THEME };
  const name = sections.get("theme.name");
  const palette: Theme = {
    ...(["gruvbox", "gruvbox-dark"].includes(name ?? "")
      ? GRUVBOX
      : name === "gruvbox-light"
        ? LIGHT
        : FALLBACK_THEME),
  };
  const tokens: Record<keyof Theme, string> = {
    fg: "text",
    bg: "panel_bg",
    accent: "accent",
    muted: "overlay0",
    surface: "surface0",
    selection: "selection_bg",
    danger: "red",
  };
  for (const field of Object.keys(tokens) as (keyof Theme)[]) {
    const value = sections.get(`theme.custom.${tokens[field]}`);
    if (value && /^#[\da-f]{6}$/i.test(value)) palette[field] = value;
  }
  return palette;
}
export async function readPopupTheme(env = process.env) {
  const path =
    env.HERDR_CONFIG_PATH ??
    join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "herdr", "config.toml");
  try {
    return themeFromConfig(await readFile(path, "utf8"));
  } catch {
    return { ...FALLBACK_THEME };
  }
}
