import test from "node:test";
import assert from "node:assert/strict";
import { runTuiSpike } from "./fixtures/tui-spike.ts";
import { makeTestTerminal } from "./helpers/terminal.ts";

void test("toolkit horizontal tabs receive mouse clicks through viewport layout", async (t) => {
  const screen = makeTestTerminal({ columns: 64, rows: 20 });
  const done = runTuiSpike(screen.terminal);
  t.after(() => {
    screen.send("\x03");
    return screen.dispose();
  });
  await screen.waitFor("Hours: 2");
  const rows = screen.frame().split("\n");
  const selectedRow = rows.findIndex((line) => line.includes("→ Pi"));
  assert.equal(screen.foregroundAt(rows[selectedRow].indexOf("→"), selectedRow), 0xfabd2f);
  const y = rows.findIndex((line) => line.includes("Settings (s)"));
  assert.ok(y >= 0);
  const x = rows[y].indexOf("Settings (s)") + 1;
  screen.send(`\x1b[<0;${x};${y + 1}M\x1b[<0;${x};${y + 1}m`);
  await screen.waitFor("Default: 8");
  assert.doesNotMatch(screen.frame(), /Hours:/);
  screen.send("\x03");
  await done;
});
