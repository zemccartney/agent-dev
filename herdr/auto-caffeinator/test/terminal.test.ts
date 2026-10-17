import test from "node:test";
import assert from "node:assert/strict";
import { makeTestTerminal } from "./helpers/terminal.ts";

void test("terminal oracle treats emoji as two cells when following cursor-addressed output", async (t) => {
  const screen = makeTestTerminal({ columns: 40, rows: 12 });
  t.after(() => screen.dispose());
  screen.terminal.write("🚀\x1b[1;3HX");
  await screen.waitFor("X");
  assert.equal(screen.frame().split("\n")[0], "🚀X");
});
