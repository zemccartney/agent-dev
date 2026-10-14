import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { connectHerdr } from "#caffeinate/herdr";
import { createMonitor, type HerdrPort } from "#caffeinate/monitor";
import { createAssertions } from "#caffeinate/assertions";

import type { Phase } from "#caffeinate/model";
import type { Power } from "#caffeinate/power";
import { object } from "#caffeinate/validation";
import { deadline } from "./helpers.ts";

void test("socket adapter + model + subprocess assertions: complete lifecycle without agent commands", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cf-e2e-")),
    socketPath = join(dir, "server.sock");
  const sockets = new Set<net.Socket>(),
    methods: string[] = [],
    children: ChildProcess[] = [];
  let state: Phase = "idle",
    seq = 1,
    time = 1800000000000,
    power: Power = "ac",
    exists = true,
    enabled = true,
    session = "first",
    tokens: Record<string, unknown> = {};
  const agent = () => ({
    terminal_id: "term_one",
    agent: "pi",
    agent_status: state,
    screen_detection_skipped: true,
    agent_session: { source: "herdr:pi", agent: "pi", kind: "id", value: session },
    workspace_id: "w1",
    tab_id: "w1:t1",
    pane_id: "w1:p1",
    focused: false,
    state_change_seq: seq,
    revision: 0,
  });
  const server = net.createServer((c) => {
    sockets.add(c);
    c.on("close", () => sockets.delete(c));
    let buffer = "";
    c.on("data", (d) => {
      buffer += d;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const q = object(JSON.parse(buffer.slice(0, end)));
        assert.ok(typeof q.method === "string");
        buffer = buffer.slice(end + 1);
        methods.push(q.method);
        let result = {};
        switch (q.method) {
          case "events.subscribe":
            result = { type: "subscription_started" };
            break;
          case "session.snapshot":
            result = { snapshot: { agents: exists ? [agent()] : [] } };
            break;
          case "agent.get":
            result = { agent: agent() };
            break;
          case "agent.explain":
            result = {
              explain: {
                agent: "pi",
                state,
                screen_detection_skipped: true,
                screen_detection_skip_reason: "full_lifecycle_hook_authority",
              },
            };
            break;
          case "pane.process_info":
            result = { process_info: { foreground_processes: [{ pid: 123, name: "pi" }] } };
            break;
          case "pane.report_metadata":
            tokens = { ...object(object(q.params).tokens) };
            assert.equal(object(q.params).ttl_ms, 6000);
            break;
          default:
            throw Error("Unexpected API method " + q.method);
        }
        c.write(JSON.stringify({ id: q.id, result }) + "\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, r));
  const client = await connectHerdr({
    socketPath,
    verifyHost: async () => ({ instance: "local", local: true, pluginEnabled: enabled }),
    verifyProcess: async () => "123:birth",
  });
  const assertions = createAssertions({
    now: () => time,
    spawn: (_binary, args) => {
      const child = spawn(
        process.execPath,
        ["-e", `setTimeout(()=>{},${Math.min(30000, Number(args.at(-1)) * 1000)})`],
        { stdio: "ignore" },
      );
      children.push(child);
      return child;
    },
  });
  const m = createMonitor({
    herdr: client,
    assertions,
    readPower: async () => power,
    now: () => time,
  });
  t.after(async () => {
    await m.close();
    for (const c of children) c.kill("SIGKILL");
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const change = async (p: Phase) => {
    state = p;
    seq++;
    await m.refresh();
  };
  await m.refresh();
  await change("working");
  time += 9999;
  await m.tick();
  assert.equal(m.snapshot().agents[0].active, false);
  time++;
  await m.tick();
  assert.equal(tokens.caffeination, "☕");
  assert.equal(deadline(m.snapshot().agents[0].state), 1800028800000);
  power = "battery";
  await m.tick();
  assert.equal(tokens.caffeination, null);
  power = "ac";
  await m.tick();
  assert.equal(tokens.caffeination, "☕");
  await change("blocked");
  assert.equal(tokens.caffeination, null);
  time += 1000;
  await change("working");
  time += 10000;
  await m.tick();
  assert.equal(tokens.caffeination, "☕");
  time += 28800000;
  await m.tick();
  assert.equal(tokens.caffeination, null);
  await m.refresh();
  assert.equal(m.snapshot().agents[0].active, false);
  const s = m.snapshot().agents[0].state;
  await m.command({
    type: "set-duration",
    occupant: s.occupant,
    runId: s.runId,
    revision: s.revision,
    durationMs: 30000,
  });
  assert.equal(tokens.caffeination, "☕");
  const old = m.snapshot().agents[0].state;
  session = "replacement";
  seq++;
  await m.refresh();
  assert.equal(m.snapshot().agents[0].active, false);
  await assert.rejects(
    m.command({
      type: "release",
      occupant: old.occupant,
      runId: old.runId,
      revision: old.revision,
    }),
    /changed/,
  );
  exists = false;
  await m.refresh();
  assert.equal(m.snapshot().agents.length, 0);
  assert.ok(
    methods.every(
      (method) =>
        !method.includes("send") && !method.includes("prompt") && !method.includes("close"),
    ),
  );
});

void test("a known idle baseline across a monitoring gap cannot infer a new start time", async () => {
  let phase: Phase = "idle";
  const h: HerdrPort = {
    hostStatus: async () => ({ instance: "s", local: true, pluginEnabled: true }),
    list: async () => [{ occupant: "a", target: "p", kind: "pi" }],
    observe: async () => ({ occupant: "a", phase, evidence: "authoritative" }),
    publishToken: async () => {},
    close() {},
  };
  const m = createMonitor({
    herdr: h,
    assertions: { reconcile: async () => new Map(), close: async () => {} },
    readPower: async () => "ac",
    now: () => 1800000000000,
  });
  await m.refresh();
  await m.markGap();
  phase = "working";
  await m.refresh();
  assert.equal(m.snapshot().agents[0].state.pending, null);
  await m.close();
});
