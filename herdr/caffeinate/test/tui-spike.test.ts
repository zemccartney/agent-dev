import test from "node:test";
import assert from "node:assert/strict";
import { runTuiSpike } from "./fixtures/tui-spike.ts";
import { makeTestTerminal } from "./helpers/terminal.ts";

void test("toolkit spike retains numeric drafts across tabs and restores the terminal on Escape", async (t) => {
  const screen = makeTestTerminal({ columns: 80, rows: 20 });
  screen.terminal.write("original terminal");
  const done = runTuiSpike(screen.terminal);
  t.after(() => {
    screen.send("\u0003");
    return screen.dispose();
  });
  await screen.waitFor("Hours: 2");
  screen.send("\u00151.5\u001b[D\u001b[3~25");
  await screen.waitFor("Hours: 1.25");
  screen.send("s");
  await screen.waitFor("Default: 8");
  screen.send("\u00154.5");
  await screen.waitFor("Default: 4.5");
  screen.send("a");
  await screen.waitFor("Hours: 1.25");
  screen.send("s");
  await screen.waitFor("Default: 4.5");
  screen.send("\u001b");
  await done;
  await screen.waitFor("original terminal");
  assert.equal(screen.stopped, true);
  assert.equal(screen.stopCount, 1);
  assert.doesNotMatch(screen.frame(), /Caffeinate toolkit spike/);
});

void test("toolkit spike handles fragmented mouse input, scrolling and reordered identities", async (t) => {
  const screen = makeTestTerminal({ columns: 56, rows: 18 });
  const done = runTuiSpike(screen.terminal);
  t.after(() => {
    screen.send("\u0003");
    return screen.dispose();
  });
  await screen.waitFor("Agent 2");
  const line =
    screen
      .frame()
      .split("\n")
      .findIndex((row) => row.includes("Agent 2")) + 1;
  assert.ok(line > 0);
  screen.send("\u001b[<0;");
  screen.send(`5;${line}M`);
  screen.send(`\u001b[<0;5;${line}m`);
  await screen.waitFor("Selected: agent-2");
  screen.send("r");
  await screen.waitFor("Order: reversed");
  assert.match(screen.frame(), /Selected: agent-2/);
  screen.send(`\u001b[<65;5;${line}M`);
  await screen.waitFor("Selected: agent-1");
  screen.resize(40, 12);
  screen.send("s");
  await screen.waitFor("Default: 8");
  assert.equal(screen.frame().split("\n").length, 12);
  screen.send("\u0003");
  await done;
  assert.equal(screen.stopCount, 1);
});

void test("toolkit spike accepts bracketed numeric paste and renders Unicode at bounded widths", async (t) => {
  for (const columns of [40, 56, 80, 120]) {
    await t.test(`${columns} columns`, async (t) => {
      const screen = makeTestTerminal({ columns, rows: 18 });
      const done = runTuiSpike(screen.terminal);
      t.after(() => {
        screen.send("\u0003");
        return screen.dispose();
      });
      await screen.waitFor("東京");
      assert.match(screen.frame(), /🚀/);
      screen.send("\u0015\u001b[200~3.");
      screen.send("75\u001b[201~");
      await screen.waitFor("Hours: 3.75");
      screen.send("\r");
      await screen.waitFor("Applied: 3.75");
      screen.send("\u0003");
      await done;
      assert.equal(screen.stopped, true);
    });
  }
});
