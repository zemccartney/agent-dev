import test from "node:test";
import assert from "node:assert/strict";
import { renderPopup, cellWidth, type ViewModel } from "#caffeinate/popup-view";
import { initialState } from "#caffeinate/model";
import { themeFromConfig } from "#caffeinate/popup-data";
import { stripVTControlCharacters } from "node:util";
import type { AgentRow } from "#caffeinate/monitor";
const agents: AgentRow[] = Array.from({ length: 30 }, (_, i) => ({
  target: `p${i}`,
  state: { ...initialState(`o${i}`), phase: "working" },
  active: false,
  error: null,
}));
const base = {
  snapshot: { power: "ac", agents, config: { automatic: true, defaultDurationMs: 28800000 } },
  labels: Object.fromEntries(agents.map((a, i) => [a.target, `pi-ext — tab ${i} (pi)`])),
  selected: "o0",
  pick: "o0",
  view: "controls",
  hours: "2",
  caret: 1,
  focus: "duration",
  settingsHours: "8",
  automatic: true,
  message: "",
  width: 80,
  height: 20,
  theme: themeFromConfig('[theme]\nname="gruvbox"'),
} satisfies ViewModel;

void test("focused controls have no duplicate title, one input, cursor and clickable footer at bottom", () => {
  const f = renderPopup(base),
    text = stripVTControlCharacters(f.text);
  assert.doesNotMatch(text, /Caffeination/);
  assert.match(text, /pi-ext — tab 0 \(pi\)/);
  assert.match(text, /Set from now \(hours\)/);
  assert.ok(f.cursor);
  assert.ok(f.hits.find((h) => h.action === "duration"));
  assert.ok(f.hits.find((h) => h.action === "apply"));
  assert.equal(f.hits.find((h) => h.action === "agents")?.y, 18);
  assert.equal(f.hits.find((h) => h.action === "close")?.y, 18);
  assert.ok(f.text.includes("\x1b[48;2;215;153;33m")); // Herdr Gruvbox primary background.
});
void test("picker brackets list, keeps selected row visible, separates contextual and global controls", () => {
  const f = renderPopup({ ...base, view: "picker", pick: "o29" });
  const lines = stripVTControlCharacters(f.text).split("\r\n");
  assert.ok(lines.filter((l) => l.includes("────")).length >= 2);
  assert.match(lines.join("\n"), /tab 29/);
  assert.doesNotMatch(lines.join("\n"), /w7:p|p29/);
  const open = f.hits.find((h) => h.action === "open"),
    close = f.hits.find((h) => h.action === "close");
  assert.ok(open && close);
  assert.ok(open.y < close.y);
  assert.ok(f.hits.every((h) => h.y >= 1 && h.y <= 20 && h.x >= 1 && h.x + h.width - 1 <= 80));
});
void test("cell geometry handles emoji and wide project labels without overflowing", () => {
  assert.equal(cellWidth("☕ 中文"), 7);
  assert.equal(cellWidth("e\u0301"), 1);
  const f = renderPopup({ ...base, width: 60, labels: { p0: "工作 — café ☕ (pi) ".repeat(8) } });
  for (const line of stripVTControlCharacters(f.text).split("\r\n"))
    assert.ok(cellWidth(line) <= 60);
});
void test("short terminal with an agent error does not overwrite an actionable button", () => {
  const a: AgentRow = {
    ...agents[0],
    error: "Power status unavailable",
    state: { ...agents[0].state, lease: { deadlineAt: 1800000020000, origin: "manual" } },
  };
  const f = renderPopup({ ...base, height: 18, snapshot: { ...base.snapshot, agents: [a] } });
  const lines = stripVTControlCharacters(f.text).split("\r\n");
  const secondary = f.hits.find((h) => h.action === "secondary");
  assert.ok(secondary);
  assert.match(lines[secondary.y - 1], /stop caffeinating/);
  assert.match(lines.join("\n"), /Power status unavailable/);
});
void test("every view has the same top tabs with exactly its active tab in the accent color", () => {
  for (const view of ["controls", "picker", "settings", "about"] as const) {
    const f = renderPopup({ ...base, view });
    const lines = f.text.split("\r\n");
    const plain = stripVTControlCharacters(f.text);
    for (const action of ["agent-tab", "settings", "about"])
      assert.equal(f.hits.find((h) => h.action === action)?.y, 2);
    const active =
      view === "settings" ? "settings (s)" : view === "about" ? "about (?)" : "agents (a)";
    assert.ok(lines[1].includes(`\x1b[48;2;215;153;33m ${active} `));
    assert.doesNotMatch(plain, /\(\s|\s\)/);
  }
});
void test("tiny terminal keeps safe close control, not overlapping actionable form fields", () => {
  const f = renderPopup({ ...base, width: 22, height: 8 });
  assert.equal(
    f.hits.some((h) => h.action === "apply"),
    false,
  );
  assert.ok(f.hits.some((h) => h.action === "close"));
});
