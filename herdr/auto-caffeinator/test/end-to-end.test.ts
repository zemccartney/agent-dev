import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
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

void test("agent disappearance releases its active assertion without touching another lease", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cf-active-exit-"));
  const socketPath = join(dir, "server.sock");
  const sockets = new Set<net.Socket>();
  const children: ChildProcess[] = [];
  const methods: string[] = [];
  const tokens = new Map<string, unknown>();
  const present = new Set(["one", "two"]);
  let phase: Phase = "idle",
    seq = 1,
    time = 1800000000000;
  const agent = (id: string) => ({
    terminal_id: `term_${id}`,
    agent: "pi",
    agent_status: phase,
    screen_detection_skipped: true,
    agent_session: { source: "herdr:pi", agent: "pi", kind: "id", value: id },
    workspace_id: "w1",
    tab_id: "w1:t1",
    pane_id: id,
    focused: false,
    state_change_seq: seq,
    revision: 0,
  });
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (data: string) => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const q = object(JSON.parse(buffer.slice(0, end)));
        buffer = buffer.slice(end + 1);
        assert.equal(typeof q.method, "string");
        const method = String(q.method),
          params = object(q.params);
        methods.push(method);
        let result: Record<string, unknown>;
        switch (method) {
          case "events.subscribe":
            result = { type: "subscription_started" };
            break;
          case "session.snapshot":
            result = { snapshot: { agents: [...present].map(agent) } };
            break;
          case "agent.get":
            assert.ok(typeof params.target === "string" && present.has(params.target));
            result = { agent: agent(params.target) };
            break;
          case "agent.explain":
            result = {
              explain: {
                agent: "pi",
                state: phase,
                screen_detection_skipped: true,
                screen_detection_skip_reason: "full_lifecycle_hook_authority",
              },
            };
            break;
          case "pane.process_info":
            result = { process_info: { foreground_processes: [{ pid: 123, name: "pi" }] } };
            break;
          case "pane.report_metadata":
            assert.ok(typeof params.pane_id === "string");
            assert.equal(params.ttl_ms, 6000);
            tokens.set(params.pane_id, object(params.tokens).caffeination);
            result = {};
            break;
          default:
            throw new Error(`Unexpected API method ${method}`);
        }
        socket.write(JSON.stringify({ id: q.id, result }) + "\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const herdr = await connectHerdr({
    socketPath,
    verifyHost: async () => ({ instance: "local", local: true, pluginEnabled: true }),
    verifyProcess: async () => "123:birth",
  });
  const assertions = createAssertions({
    now: () => time,
    spawn: () => {
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
        stdio: "ignore",
      });
      children.push(child);
      return child;
    },
  });
  const monitor = createMonitor({
    herdr,
    assertions,
    readPower: async () => "ac",
    now: () => time,
  });
  t.after(async () => {
    await monitor.close();
    for (const child of children) child.kill("SIGKILL");
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  await monitor.refresh();
  phase = "working";
  seq++;
  await monitor.refresh();
  time += 10000;
  await monitor.tick();
  assert.deepEqual(
    monitor.snapshot().agents.map((row) => row.active),
    [true, true],
  );
  assert.deepEqual(
    [...tokens],
    [
      ["one", "☕"],
      ["two", "☕"],
    ],
  );
  assert.equal(children.length, 2);
  const first = children[0],
    survivor = children[1];
  assert.ok(first.pid && survivor.pid);
  const survivorPid = survivor.pid;
  process.kill(first.pid, 0);
  process.kill(survivorPid, 0);
  const survivorBefore = monitor.snapshot().agents.find((row) => row.target === "two");
  assert.ok(survivorBefore);
  assert.equal(deadline(survivorBefore.state), 1800028800000);
  const firstExited = once(first, "exit", { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );

  present.delete("one");
  await monitor.refresh();
  assert.deepEqual(
    monitor.snapshot().agents.map((row) => row.target),
    ["two"],
  );
  assert.equal(tokens.get("one"), null);
  assert.equal(await firstExited, true, "the vanished agent's assertion child must exit");
  assert.ok(first.exitCode !== null || first.signalCode !== null);
  const survivorAfter = monitor.snapshot().agents[0];
  assert.equal(survivorAfter.active, true);
  assert.equal(survivorAfter.state.occupant, survivorBefore.state.occupant);
  assert.equal(deadline(survivorAfter.state), 1800028800000);
  assert.equal(tokens.get("two"), "☕");
  assert.equal(children.length, 2, "removal must not replace the surviving assertion");
  assert.equal(survivor.pid, survivorPid);
  process.kill(survivorPid, 0);
  assert.ok(methods.every((method) => !/send|prompt|close/.test(method)));
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
    assertions: { requestClose() {}, reconcile: async () => new Map(), close: async () => {} },
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
