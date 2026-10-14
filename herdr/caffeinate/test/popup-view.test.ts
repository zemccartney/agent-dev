import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { TuiAltScreen, visibleWidth } from "@earendil-works/pi-tui";
import { createPopupView, type ViewModel, type Action } from "#caffeinate/popup-view";
import { initialState } from "#caffeinate/model";
import { themeFromConfig } from "#caffeinate/popup-data";
import { makeTestTerminal } from "./helpers/terminal.ts";
import type { AgentRow } from "#caffeinate/monitor";
const agents: AgentRow[] = Array.from({ length: 30 }, (_, i) => ({
  target: `p${i}`,
  state: { ...initialState(`o${i}`), phase: "working" },
  active: false,
  error: null,
}));
const base: ViewModel = {
  snapshot: { power: "ac", agents, config: { automatic: true, defaultDurationMs: 28800000 } },
  labels: Object.fromEntries(agents.map((a, i) => [a.target, `pi-ext — tab ${i} (pi)`])),
  selected: "o0",
  pick: "o0",
  view: "controls",
  hours: "2",
  focus: "duration",
  settingsHours: "8",
  automatic: true,
  message: "",
  width: 80,
  height: 20,
  theme: themeFromConfig('[theme]\nname="gruvbox"'),
};
async function render(t: TestContext, model: ViewModel = base) {
  const screen = makeTestTerminal({ columns: model.width, rows: model.height });
  const actions: Action[] = [];
  const view = createPopupView({
    onAction: (action) => {
      actions.push(action);
    },
    onEdit() {},
  });
  view.update(model);
  const tui = new TuiAltScreen(screen.terminal, true, undefined, { copyOnSelect: false });
  tui.setLayoutRoot(view);
  tui.setFocus(view);
  tui.start();
  t.after(async () => {
    tui.stop({ preserveScreen: true });
    await screen.dispose();
  });
  await screen.waitFor("close (esc)");
  function click(label: string) {
    const lines = screen.frame().split("\n"),
      y = lines.findIndex((line) => line.includes(label));
    assert.ok(y >= 0, `Missing ${label}: ${screen.frame()}`);
    const x = visibleWidth(lines[y].slice(0, lines[y].indexOf(label))) + 1;
    screen.send(`\x1b[<0;${x};${y + 1}M\x1b[<0;${x};${y + 1}m`);
  }
  return { screen, actions, click };
}
void test("focused controls retain labels, input, primary colors and clickable footer", async (t) => {
  const f = await render(t);
  assert.doesNotMatch(f.screen.frame(), /Caffeination/);
  assert.match(f.screen.frame(), /pi-ext — tab 0 \(pi\)/);
  assert.match(f.screen.frame(), /Set from now \(hours\)/);
  assert.ok(f.screen.text().includes("\x1b[48;2;215;153;33m"));
  f.click("apply (↵)");
  f.click("all agents (tab)");
  f.click("close (esc)");
  assert.deepEqual(f.actions, ["apply", "agents", "close"]);
});
void test("picker brackets its list and keeps the selected identity visible", async (t) => {
  const f = await render(t, { ...base, view: "picker", pick: "o29" });
  const text = f.screen.frame();
  assert.match(text, /tab 29/);
  assert.ok(text.split("\n").filter((line) => line.includes("────")).length >= 2);
  assert.ok(text.indexOf("open (↵)") < text.indexOf("close (esc)"));
  f.click("open (↵)");
  assert.deepEqual(f.actions, ["open"]);
});
void test("Unicode and ANSI-looking labels remain safe at bounded widths", async (t) => {
  for (const width of [56, 60, 80, 120]) {
    const f = await render(t, {
      ...base,
      width,
      labels: { p0: "\x1b[2J工作 — café 🚀 é (pi) ".repeat(8) },
    });
    assert.match(f.screen.frame(), /工作/);
    assert.match(f.screen.frame(), /apply/);
    assert.ok(!f.screen.text().includes("\x1b[2J工作"));
    for (const line of f.screen.frame().split("\n")) assert.ok(visibleWidth(line) <= width);
  }
});
void test("56x18 errors do not obscure secondary actions or full local deadlines", async (t) => {
  const a = {
    ...agents[0],
    error: "Power status unavailable",
    state: { ...agents[0].state, lease: { deadlineAt: 1800000020000, origin: "manual" as const } },
  };
  const f = await render(t, {
    ...base,
    width: 56,
    height: 18,
    snapshot: { ...base.snapshot, power: "ac", agents: [a] },
  });
  assert.match(f.screen.frame(), /Power status unavailable/);
  assert.match(f.screen.frame(), /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d/);
  f.click("stop caffeinating");
  assert.deepEqual(f.actions, ["secondary"]);
});
void test("every view has the same clickable persistent tabs", async (t) => {
  for (const view of ["controls", "picker", "settings", "about"] as const) {
    const f = await render(t, { ...base, view });
    const active =
      view === "settings" ? "settings (s)" : view === "about" ? "about (?)" : "agents (a)";
    for (const label of ["agents (a)", "settings (s)", "about (?)"]) {
      const color = f.screen.backgroundAt(f.screen.frame().split("\n")[1].indexOf(label), 1);
      assert.equal(color === 0xd79921, label === active);
      f.click(label);
    }
    assert.deepEqual(f.actions, ["agent-tab", "settings", "about"]);
    assert.doesNotMatch(f.screen.frame(), /\(\s|\s\)/);
  }
});
void test("tiny terminal exposes close, not hidden actionable fields", async (t) => {
  const f = await render(t, { ...base, width: 22, height: 8 });
  assert.doesNotMatch(f.screen.frame(), /apply|hours/);
  f.click("close (esc)");
  assert.deepEqual(f.actions, ["close"]);
});
