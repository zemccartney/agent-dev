import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { runPopup, type PopupClient } from "#caffeinate/popup";
import { cellWidth } from "#caffeinate/popup-view";
import { initialState, type AgentState, type Phase, type Command } from "#caffeinate/model";
import type { AgentRow, MonitorSnapshot } from "#caffeinate/monitor";
interface SetupOptions {
  phase?: Phase;
  fail?: boolean;
  state?: Partial<AgentState>;
  extra?: AgentRow[];
}
const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms));
async function setup(
  t: TestContext,
  { phase = "working", fail = false, state = {}, extra = [] }: SetupOptions = {},
) {
  const input = Object.assign(new PassThrough(), {
      isTTY: true,
      isRaw: false,
      setRawMode(value: boolean) {
        this.isRaw = value;
      },
    }),
    output = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 20 });
  let text = "";
  output.on("data", (d) => (text += d));
  const commands: Command[] = [];
  const snap: MonitorSnapshot = {
    now: 1800000000000,
    stopped: false,
    error: null,
    power: "ac",
    config: { automatic: true, defaultDurationMs: 28800000 },
    agents: [
      {
        target: "w1:p1",
        state: { ...initialState("a"), phase, revision: 1, ...state },
        active: false,
        error: null,
      },
      ...extra,
    ],
  };
  const client: PopupClient = {
    request: async (m) => {
      if (m.type === "command") {
        commands.push(m.command);
        if (fail) throw Error("Agent changed\x1b[2J");
      }
      return { snapshot: structuredClone(snap) };
    },
    close() {},
  };
  const labels = { "w1:p1": "pi-ext — caff-test (pi)", "w1:p2": "house — notes (claude)" };
  const done = runPopup({ client, input, output, target: "w1:p1", loadLabels: async () => labels });
  await wait();
  t.after(async () => {
    input.write("\x03");
    await done;
  });
  const screen = () => stripVTControlCharacters(text.slice(text.lastIndexOf("\x1b[H")));
  const key = async (sequence: string) => {
    input.write(sequence);
    await wait(sequence === "\x1b" ? 60 : 10);
  };
  const click = async (label: string) => {
    const lines = screen().split("\r\n"),
      y = lines.findIndex((l) => l.includes(label));
    assert.ok(y >= 0, `Missing ${label}`);
    const x = cellWidth(lines[y].slice(0, lines[y].indexOf(label))) + 1;
    await key(`\x1b[<0;${x};${y + 1}M\x1b[<0;${x};${y + 1}m`);
  };
  return { input, output, commands, done, text: () => text, screen, snap, key, click };
}
void test("duration entry and Enter submit guarded fractional hours; Escape restores terminal and mouse", async (t) => {
  const f = await setup(t);
  await f.key("0.5\r");
  assert.ok(f.commands[0].type === "set-duration");
  assert.equal(f.commands[0].durationMs, 1800000);
  assert.equal(f.commands[0].revision, 1);
  f.output.columns = 35;
  f.output.emit("resize");
  await f.key("\x1b");
  await f.done;
  assert.equal(f.input.isRaw, false);
  assert.match(f.text(), /Set from now/);
  assert.ok(f.text().includes("\x1b[?1006l"));
});
void test("idle controls arm next run; settings and about tabs are clickable without applying a lease", async (t) => {
  const f = await setup(t, { phase: "idle" });
  assert.match(f.screen(), /Set next run/);
  await f.click("settings (s)");
  await f.click("automatic (space)");
  await f.click("[ 8");
  await f.key("12");
  await f.click("save (↵)");
  assert.ok(f.commands[0].type === "set-config");
  assert.equal(f.commands[0].config.automatic, false);
  assert.equal(f.commands[0].config.defaultDurationMs, 43200000);
  await f.click("about (?)");
  assert.match(f.screen(), /ten seconds/);
  await f.click("agents (a)");
  assert.match(f.screen(), /Set next run \(hours\)/);
});
void test("invalid duration is rejected; stale command error remains visible and sanitized", async (t) => {
  const f = await setup(t, { fail: true });
  await f.key("0\r");
  assert.equal(f.commands.length, 0);
  assert.match(f.screen(), /positive/);
  await f.key("\x7f1\r");
  assert.match(f.screen(), /Agent changed/);
  assert.ok(!f.text().includes("Agent changed\x1b[2J"));
});
void test("secondary controls release or cancel arming, not agent execution", async (t) => {
  for (const [phase, state, type] of [
    ["working", { lease: { deadlineAt: 1800000020000, origin: "manual" } }, "release"],
    ["idle", { armedDurationMs: 3600000 }, "cancel-arm"],
  ] as const) {
    const f = await setup(t, { phase, state });
    await f.key("r");
    assert.ok(f.commands[0].type === type);
    assert.equal(f.commands[0].occupant, "a");
    await f.key("\x03");
  }
});
void test("Tab opens all agents; arrows/Enter choose an agent, and mouse apply uses its identity", async (t) => {
  const f = await setup(t, {
    extra: [
      {
        target: "w1:p2",
        state: { ...initialState("b"), phase: "idle", revision: 7 },
        active: false,
        error: null,
      },
    ],
  });
  assert.doesNotMatch(f.screen(), /house — notes/);
  await f.key("\t");
  assert.match(f.screen(), /house — notes/);
  assert.doesNotMatch(f.screen(), /w1:p[12]/);
  await f.key("\x1b[B\r");
  assert.match(f.screen(), /house — notes/);
  assert.match(f.screen(), /Set next run/);
  await f.key("0.5");
  await f.click("apply (↵)");
  assert.ok(f.commands[0].type === "set-duration");
  assert.equal(f.commands[0].occupant, "b");
  assert.equal(f.commands[0].revision, 7);
  assert.equal(f.commands[0].durationMs, 1800000);
  await f.click("all agents (tab)");
  await f.click("pi-ext — caff-test");
  await f.click("open (↵)");
  assert.match(f.screen(), /Set from now/);
});
void test("number field supports caret editing and mouse reports do not enter numeric text", async (t) => {
  const f = await setup(t);
  await f.key("12");
  await f.key("\x1b[D");
  await f.key(".");
  await f.click("apply (↵)");
  assert.ok(f.commands[0].type === "set-duration");
  assert.equal(f.commands[0].durationMs, 4320000);
});
void test("refresh does not silently retarget controls to a replacement agent in the same pane", async (t) => {
  const f = await setup(t, {
    extra: [
      {
        target: "w1:p2",
        state: { ...initialState("b"), phase: "idle" },
        active: false,
        error: null,
      },
    ],
  });
  f.snap.agents[0].state = { ...initialState("replacement"), phase: "working", revision: 9 };
  await wait(1100);
  assert.match(f.screen(), /no longer available/);
  await f.key("\r");
  await f.key("r");
  assert.equal(f.commands.length, 0);
  await f.key("\t");
  await f.key("\x1b[B\r");
  await f.key("\r");
  assert.ok(f.commands[0].type === "set-duration");
  assert.equal(f.commands[0].occupant, "replacement");
});
void test("Settings → About → Settings cannot trap navigation away from the agent", async (t) => {
  const f = await setup(t);
  for (const key of ["s", "?", "s", "s", "a"]) await f.key(key);
  assert.match(f.screen(), /Set from now \(hours\)/);
  assert.equal(f.commands.length, 0);
});
void test("persistent tabs preserve picker selection and unsaved settings; active-tab clicks are idempotent", async (t) => {
  const f = await setup(t, {
    extra: [
      {
        target: "w1:p2",
        state: { ...initialState("b"), phase: "idle" },
        active: false,
        error: null,
      },
    ],
  });
  await f.key("\t");
  await f.click("house — notes");
  await f.click("settings (s)");
  await f.click("[ 8");
  await f.key("12");
  await f.click("about (?)");
  await f.click("settings (s)");
  await f.click("settings (s)");
  assert.match(f.screen(), /Global settings/);
  assert.match(f.screen(), /\[ 12 +\]/);
  await f.click("agents (a)");
  assert.match(f.screen(), /Agents · 2/);
  await f.key("\r");
  assert.match(f.screen(), /house — notes/);
  assert.match(f.screen(), /Set next run \(hours\)/);
  await f.click("agents (a)");
  assert.match(f.screen(), /Set next run \(hours\)/);
  assert.equal(f.commands.length, 0);
});
void test("non-TTY popup refuses without mutating terminal", async () => {
  await assert.rejects(
    runPopup({
      client: {
        request: async () => {
          throw new Error("Unexpected request");
        },
        close() {},
      },
      input: new PassThrough(),
      output: new PassThrough(),
    }),
    /terminal/i,
  );
});
