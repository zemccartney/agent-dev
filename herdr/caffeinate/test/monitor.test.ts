import test from "node:test";
import assert from "node:assert/strict";
import { createMonitor, type HerdrPort, type AssertionsPort } from "#caffeinate/monitor";
import type { Observation, Phase } from "#caffeinate/model";
import type { Power } from "#caffeinate/power";
import { deadline as leaseDeadline, deferred, FakeAssertionChild } from "./helpers.ts";
import { createAssertions } from "#caffeinate/assertions";
function setup(assertionOverride?: AssertionsPort) {
  let time = 1_800_000_000_000,
    power: Power = "ac",
    host = { instance: "host", pluginEnabled: true, local: true },
    fail = false,
    readFault: "host" | "config" | null = null,
    active = new Map<string, number>(),
    config = { automatic: true, defaultDurationMs: 28800000 },
    powerReads = 0;
  let powerReader: () => Promise<Power> = async () => power;
  const phases = new Map<string, Omit<Observation, "occupant">>([
      ["a", { phase: "idle", evidence: "authoritative" }],
      ["b", { phase: "idle", evidence: "positive" }],
    ]),
    tokens: Parameters<HerdrPort["publishToken"]>[] = [];
  const herdr: HerdrPort = {
    hostStatus: async () => {
      if (readFault === "host") throw Error("host read unavailable");
      return host;
    },
    list: async () => {
      if (fail) throw Error("disconnected");
      return [...phases.keys()].map((occupant) => ({ occupant, target: occupant, kind: "pi" }));
    },
    observe: async (target) => {
      const phase = phases.get(target);
      assert.ok(phase);
      return { occupant: target, ...phase };
    },
    publishToken: async (...a) => tokens.push(a),
    close() {},
  };
  const assertions: AssertionsPort = assertionOverride ?? {
    requestClose() {},
    reconcile: async (desired) => {
      active = new Map(desired);
      return new Map([...desired].map(([id, deadlineAt]) => [id, { deadlineAt, pid: 42 }]));
    },
    close: async () => {
      active.clear();
    },
  };
  const m = createMonitor({
    herdr,
    assertions,
    readPower: () => {
      powerReads++;
      return powerReader();
    },
    now: () => time,
    config,
    reloadConfig: async () => {
      if (readFault === "config") throw Error("config read unavailable");
      return config;
    },
    persistConfig: async (next) => {
      config = next;
    },
  });
  return {
    m,
    herdr,
    assertions,
    powerReads: () => powerReads,
    setPowerReader: (reader: typeof powerReader) => {
      powerReader = reader;
    },
    setReadFault: (fault: typeof readFault) => (readFault = fault),
    phases,
    tokens,
    active: () => active,
    advance: (n: number) => (time += n),
    setPower: (p: Power) => (power = p),
    setHost: (h: typeof host) => (host = h),
    setFail: (f: boolean) => (fail = f),
    setPhase(target: string, phase: Phase) {
      const entry = phases.get(target);
      assert.ok(entry);
      entry.phase = phase;
    },
    now: () => time,
    command: (type = "set-duration", durationMs = 7200000) => {
      const s = m.snapshot().agents[0].state;
      return { type, occupant: s.occupant, runId: s.runId, revision: s.revision, durationMs };
    },
  };
}
async function flush() {
  await new Promise<void>((done) => setImmediate(done));
}

async function start(f: ReturnType<typeof setup>) {
  await f.m.refresh();
  for (const p of f.phases.values()) p.phase = "working";
  await f.m.refresh();
  f.advance(10000);
  await f.m.tick();
}
void test("independent runs, power suspension and expiry preserve original deadlines", async () => {
  const f = setup();
  await start(f);
  assert.equal(f.active().size, 2);
  const deadline = leaseDeadline(f.m.snapshot().agents[0].state);
  f.setPower("battery");
  await f.m.tick();
  assert.equal(f.active().size, 0);
  assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), deadline);
  f.setPower("ac");
  await f.m.tick();
  assert.equal(f.active().size, 2);
  f.setPhase("a", "idle");
  await f.m.refresh();
  assert.equal(f.active().size, 1);
  f.advance(28800000);
  await f.m.tick();
  assert.equal(f.active().size, 0);
  f.setPower("ac");
  await f.m.refresh();
  assert.equal(f.active().size, 0);
  await f.m.close();
});
void test("cold discovery, failed evidence, event gaps and restart do not invent fresh time", async () => {
  const f = setup();
  for (const p of f.phases.values()) p.phase = "working";
  await f.m.refresh();
  f.advance(20000);
  await f.m.tick();
  assert.equal(f.active().size, 0);
  await f.m.command(f.command());
  const deadline = leaseDeadline(f.m.snapshot().agents[0].state);
  f.setFail(true);
  await f.m.refresh();
  assert.equal(f.active().size, 1);
  f.advance(30000);
  f.setFail(false);
  await f.m.refresh();
  assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), deadline);
  await f.m.close();
  const g = setup();
  for (const p of g.phases.values()) p.phase = "working";
  await g.m.refresh();
  assert.equal(g.active().size, 0);
  await g.m.close();
});
void test("stale popup actions cannot arm a run after it finishes or a replacement occupant", async () => {
  const f = setup();
  await start(f);
  const old = f.command();
  f.setPhase("a", "idle");
  await f.m.refresh();
  await assert.rejects(f.m.command(old), /changed|stale/i);
  assert.equal(f.m.snapshot().agents[0].state.armedDurationMs, null);
  f.phases.delete("a");
  f.phases.set("new", { phase: "working", evidence: "positive" });
  await f.m.refresh();
  await assert.rejects(f.m.command(old), /changed|stale/i);
  const replacement = f.m.snapshot().agents.find((a) => a.state.occupant === "new");
  assert.ok(replacement);
  assert.equal(replacement.state.lease, null);
  await f.m.close();
});
void test("server replacement and plugin disable release all owned assertions", async () => {
  for (const host of [
    { instance: "new", local: true, pluginEnabled: true },
    { instance: "host", local: true, pluginEnabled: false },
  ]) {
    const f = setup();
    await start(f);
    f.setHost(host);
    await f.m.refresh();
    assert.equal(f.active().size, 0);
    assert.equal(f.m.snapshot().stopped, true);
  }
});
void test("confirmed server disappearance releases assertions, unlike a transient read failure", async () => {
  let gone = false,
    closed = false;
  const m = createMonitor({
    herdr: {
      hostStatus: async () => {
        if (gone) throw Object.assign(Error("server gone"), { code: "HOST_GONE" });
        return { instance: "s", local: true, pluginEnabled: true };
      },
      list: async () => [],
      observe: async () => {
        throw new Error("Unexpected observation");
      },
      publishToken: async () => {},
      close() {},
    },
    assertions: {
      requestClose() {},
      reconcile: async () => new Map(),
      close: async () => {
        closed = true;
      },
    },
    readPower: async () => "ac",
  });
  await m.refresh();
  gone = true;
  await m.refresh();
  assert.equal(closed, true);
  assert.equal(m.snapshot().stopped, true);
  await m.close();
});
void test("failed save does not acknowledge or alter config; assertion failure never shows active", async () => {
  const m = createMonitor({
    herdr: {
      hostStatus: async () => ({ local: true, instance: "s", pluginEnabled: true }),
      list: async () => [{ target: "a", occupant: "a", kind: "pi" }],
      observe: async () => ({ occupant: "a", phase: "working", evidence: "positive" }),
      publishToken: async () => {},
      close() {},
    },
    assertions: { requestClose() {}, reconcile: async () => new Map(), close: async () => {} },
    readPower: async () => "ac",
    now: () => 100000,
    config: { automatic: true, defaultDurationMs: 28800000 },
    persistConfig: async () => {
      throw Error("disk full");
    },
  });
  await m.refresh();
  const s = m.snapshot().agents[0].state;
  await m.command({
    type: "set-duration",
    occupant: "a",
    runId: s.runId,
    revision: s.revision,
    durationMs: 20000,
  });
  assert.equal(m.snapshot().agents[0].active, false);
  assert.match(m.snapshot().agents[0].error ?? "", /assertion/i);
  await assert.rejects(
    m.command({ type: "set-config", config: { automatic: false, defaultDurationMs: 1000 } }),
    /disk full/,
  );
  assert.equal(m.snapshot().config.automatic, true);
  await m.close();
});
void test("concurrent refresh requests serialize and reread after in-flight invalidation", async () => {
  let reads = 0,
    concurrent = 0,
    max = 0;
  const f = setup();
  const m = createMonitor({
    herdr: {
      hostStatus: async () => ({ local: true, instance: "s", pluginEnabled: true }),
      list: async () => {
        reads++;
        max = Math.max(max, ++concurrent);
        await new Promise((r) => setTimeout(r, 5));
        concurrent--;
        return [];
      },
      observe: async () => {
        throw new Error("Unexpected observation");
      },
      publishToken: async () => {},
      close() {},
    },
    assertions: { requestClose() {}, reconcile: async () => new Map(), close: async () => {} },
    readPower: async () => "ac",
    now: Date.now,
    config: { automatic: true, defaultDurationMs: 28800000 },
  });
  await Promise.all([m.refresh(), m.refresh()]);
  assert.equal(max, 1);
  assert.equal(reads, 2);
  await m.close();
  await f.m.close();
});

void test("power cadence removes protection while Herdr observations or token writes are held", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  for (const stage of ["observe", "publish"] as const) {
    for (const source of ["battery", "unknown"] as const) {
      const f = setup();
      await start(f);
      const entered = deferred(),
        release = deferred();
      const originalObserve = f.herdr.observe.bind(f.herdr);
      if (stage === "observe")
        f.herdr.observe = async (target) => {
          entered.resolve();
          await release.promise;
          return originalObserve(target);
        };
      else
        f.herdr.publishToken = async () => {
          entered.resolve();
          await release.promise;
        };
      f.advance(2000);
      const refresh = f.m.refresh();
      t.after(async () => {
        release.resolve();
        await refresh;
        await f.m.close();
      });
      await entered.promise;
      f.setPower(source);
      t.mock.timers.tick(1000);
      await flush();
      assert.equal(f.active().size, 0, `${stage}/${source}`);
      assert.equal(f.m.snapshot().agents[0].active, false);
      assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_028_800_000);
      release.resolve();
      await refresh;
      assert.equal(f.active().size, 0, "late Herdr completion cannot restore AC eligibility");
      await f.m.close();
    }
  }
});

void test("power-only polling never promotes pending work and expiry or AC return never renews", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = setup();
  t.after(() => f.m.close());
  await f.m.refresh();
  f.setPhase("a", "working");
  await f.m.refresh();
  f.advance(10000);
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.active().size, 0, "cached working phase is not a fresh automatic grant");
  await f.m.refresh();
  assert.equal(f.active().size, 1);
  f.setPower("battery");
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.active().size, 0);
  f.setPower("ac");
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.active().size, 1);
  assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_028_800_000);
  f.advance(28800000);
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.active().size, 0);
  f.setPower("battery");
  t.mock.timers.tick(1000);
  await flush();
  f.setPower("ac");
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(f.active().size, 0);
});

void test("power polling coalesces while a power read is outstanding and close prevents late acquisition", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = setup();
  await start(f);
  f.setPower("battery");
  await f.m.refresh();
  const entered = deferred(),
    release = deferred();
  f.setPowerReader(async () => {
    entered.resolve();
    await release.promise;
    return "ac";
  });
  const before = f.powerReads();
  t.mock.timers.tick(1000);
  await flush();
  // Do not wait on entered before checking: the old implementation has no timer.
  t.after(async () => {
    release.resolve();
    await f.m.close();
  });
  assert.equal(f.powerReads(), before + 1);
  await entered.promise;
  t.mock.timers.tick(20000);
  await flush();
  assert.equal(f.powerReads(), before + 1, "no queued backlog of power polls");
  const closing = f.m.close();
  release.resolve();
  await closing;
  await flush();
  assert.equal(f.active().size, 0);
  const after = f.powerReads();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(f.powerReads(), after, "close owns and stops the safety timer");
});

void test("status and timer reconciliation share one assertion writer and retain independent deadlines", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = setup();
  await start(f);
  const originalLeases = new Map(f.active());
  const entered = deferred(),
    release = deferred();
  let writers = 0,
    maximum = 0;
  const reconcile = f.assertions.reconcile.bind(f.assertions);
  f.assertions.reconcile = async (desired) => {
    maximum = Math.max(maximum, ++writers);
    entered.resolve();
    await release.promise;
    try {
      return await reconcile(desired);
    } finally {
      writers--;
    }
  };
  const refresh = f.m.refresh();
  t.after(async () => {
    release.resolve();
    await refresh;
    await f.m.close();
  });
  await entered.promise;
  f.setPower("battery");
  t.mock.timers.tick(1000);
  await flush();
  release.resolve();
  await refresh;
  await flush();
  assert.equal(maximum, 1);
  assert.equal(f.active().size, 0, "queued safety work rereads current power");
  f.setPower("ac");
  t.mock.timers.tick(1000);
  await flush();
  assert.deepEqual(f.active(), originalLeases);
});

void test("close releases assertions before a held observation completes", async (t) => {
  const f = setup();
  await start(f);
  const entered = deferred(),
    release = deferred();
  const original = f.herdr.observe.bind(f.herdr);
  f.herdr.observe = async (target) => {
    entered.resolve();
    await release.promise;
    return original(target);
  };
  const refresh = f.m.refresh();
  await entered.promise;
  const closing = f.m.close();
  t.after(async () => {
    release.resolve();
    await Promise.all([refresh, closing]);
  });
  await flush();
  assert.equal(f.active().size, 0);
  assert.equal(f.m.snapshot().stopped, true);
  release.resolve();
  await Promise.all([refresh, closing]);
  assert.equal(f.active().size, 0);
  assert.ok(f.m.snapshot().agents.every((row) => !row.state.lease && !row.active));
});

void test("manual uncertain-activity grants consume earlier idle boundaries and arming", async (t) => {
  for (const baseline of ["idle", "blocked"] as const) {
    for (const armed of [false, true]) {
      for (const duration of [60000, 72000000]) {
        const f = setup();
        t.after(() => f.m.close());
        f.setPhase("a", baseline);
        await f.m.refresh();
        if (armed) await f.m.command(f.command("set-duration", 3600000));
        f.phases.set("a", { phase: "unknown", evidence: "uncertain" });
        await f.m.refresh();
        await f.m.command(f.command("set-duration", duration));
        const deadline = leaseDeadline(f.m.snapshot().agents[0].state);
        f.phases.set("a", { phase: "working", evidence: "authoritative" });
        await f.m.refresh();
        f.advance(10000);
        await f.m.refresh();
        assert.equal(
          leaseDeadline(f.m.snapshot().agents[0].state),
          deadline,
          `${baseline}/${armed}/${duration}`,
        );
        assert.equal(f.m.snapshot().agents[0].state.armedDurationMs, null);
        assert.equal(f.m.snapshot().agents[0].state.pending, null);
        f.setPhase("a", "idle");
        await f.m.refresh();
        f.setPhase("a", "working");
        await f.m.refresh();
        f.advance(10000);
        await f.m.refresh();
        assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_028_810_000);
      }
    }
  }
});

void test("monitor shutdown cancels replacement before an old assertion exit completes", async (t) => {
  const children: FakeAssertionChild[] = [];
  const manager = createAssertions({
    ownerPid: 77,
    now: () => 1_800_000_000_000,
    spawn: () => {
      const child = new FakeAssertionChild(100 + children.length);
      children.push(child);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  });
  const f = setup(manager);
  await start(f);
  const stopping = deferred();
  children[0].kill = (signal) => {
    children[0].signalCode = signal;
    stopping.resolve();
    return true;
  };
  const command = f.m.command(f.command("set-duration", 60000));
  await stopping.promise;
  const closing = f.m.close();
  t.after(async () => {
    children[0].emit("exit");
    await Promise.all([command, closing]);
  });
  children[0].emit("exit");
  await Promise.all([command, closing]);
  assert.equal(children.length, 2, "shutdown must not spawn a replacement third child");
  assert.equal(children[1].signalCode, "SIGTERM");
});

void test("monitor shutdown interrupts a pending spawn before acquiring another desired child", async () => {
  const entered = deferred();
  const children: FakeAssertionChild[] = [];
  const manager = createAssertions({
    ownerPid: 77,
    now: () => 1_800_000_000_000,
    spawn: () => {
      const child = new FakeAssertionChild(100 + children.length);
      children.push(child);
      if (children.length === 1) entered.resolve();
      else queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  });
  const f = setup(manager);
  const starting = start(f);
  await entered.promise;
  const closing = f.m.close();
  await flush();
  const earlySignal = children[0].signalCode;
  // Unblock the old implementation too, so a regression fails rather than hangs.
  children[0].emit("spawn");
  await Promise.all([starting, closing]);
  assert.equal(earlySignal, "SIGTERM", "cleanup must not await the spawn event");
  assert.equal(children.length, 1);
});

void test("confirmed disappearance stops its real assertion before held token cleanup, leaving survivor unchanged", async (t) => {
  const children: FakeAssertionChild[] = [];
  const manager = createAssertions({
    ownerPid: 77,
    now: () => 1_800_000_000_000,
    spawn: () => {
      const child = new FakeAssertionChild(100 + children.length);
      children.push(child);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  });
  const f = setup(manager);
  await start(f);
  const entered = deferred(),
    release = deferred();
  f.phases.delete("a");
  f.herdr.publishToken = async (target) => {
    if (target === "a") {
      entered.resolve();
      await release.promise;
    }
  };
  const refresh = f.m.refresh();
  t.after(async () => {
    release.resolve();
    await refresh;
    await f.m.close();
  });
  await entered.promise;
  await flush();
  assert.equal(children[0].signalCode, "SIGTERM");
  assert.equal(children[1].signalCode, null);
  assert.equal(children.length, 2);
  assert.equal(f.m.snapshot().agents.length, 1);
  assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_028_800_000);
});

void test("whole-refresh failures cannot promote pending protection; recovery keeps the original deadline", async (t) => {
  for (const failure of ["host", "config", "list"] as const) {
    const f = setup();
    t.after(() => f.m.close());
    await f.m.refresh();
    f.setPhase("a", "working");
    await f.m.refresh();
    if (failure === "list") f.setFail(true);
    else f.setReadFault(failure);
    f.advance(10000);
    await f.m.refresh();
    assert.equal(f.active().size, 0, failure);
    assert.equal(f.m.snapshot().agents[0].state.pending?.deadlineAt, 1_800_028_800_000);
    f.advance(20000);
    f.setFail(false);
    f.setReadFault(null);
    await f.m.refresh();
    assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_028_800_000);
    assert.equal(f.active().size, 1);
  }
});

void test("gaps during host, list or observation awaits invalidate run-start authority immediately", async (t) => {
  for (const stage of ["host", "list", "observe"] as const) {
    const f = setup();
    t.after(() => f.m.close());
    await f.m.refresh();
    f.setPhase("a", "working");
    const entered = deferred(),
      release = deferred();
    async function held<T>(work: () => Promise<T>): Promise<T> {
      entered.resolve();
      await release.promise;
      return work();
    }
    const original = { ...f.herdr };
    if (stage === "host") f.herdr.hostStatus = () => held(() => original.hostStatus());
    if (stage === "list") f.herdr.list = () => held(() => original.list());
    if (stage === "observe") f.herdr.observe = (target) => held(() => original.observe(target));
    const refresh = f.m.refresh();
    await entered.promise;
    const gap = f.m.markGap(),
      secondGap = f.m.markGap();
    release.resolve();
    await Promise.all([refresh, gap, secondGap]);
    Object.assign(f.herdr, original);
    f.advance(10000);
    await f.m.refresh();
    assert.equal(f.active().size, 0, stage);
    assert.equal(f.m.snapshot().agents[0].state.pending, null, stage);
    // A newly observed real boundary after recovery is still usable.
    f.setPhase("a", "idle");
    await f.m.refresh();
    f.setPhase("a", "working");
    await f.m.refresh();
    f.advance(10000);
    await f.m.refresh();
    assert.equal(f.active().size, 1);
  }
});

void test("a later gap preserves an already valid pending deadline and active peer", async (t) => {
  const f = setup();
  t.after(() => f.m.close());
  await f.m.refresh();
  f.setPhase("b", "working");
  await f.m.refresh();
  f.advance(10000);
  await f.m.refresh();
  f.setPhase("a", "working");
  await f.m.refresh();
  await f.m.markGap();
  f.advance(10000);
  await f.m.refresh();
  assert.equal(f.active().size, 2);
  assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_028_810_000);
  assert.equal(leaseDeadline(f.m.snapshot().agents[1].state), 1_800_028_800_000);
});

void test("failed identity revalidation rejects repeated duration intents without altering either deadline", async (t) => {
  const f = setup();
  t.after(() => f.m.close());
  await start(f);
  const deadlines = f.m.snapshot().agents.map((row) => leaseDeadline(row.state));
  f.setPhase("a", "idle");
  f.setFail(true);
  await f.m.refresh();
  await assert.rejects(
    f.m.command(f.command("set-duration", 72000000)),
    /verify|changed|unavailable/i,
  );
  assert.deepEqual(
    f.m.snapshot().agents.map((row) => leaseDeadline(row.state)),
    deadlines,
  );
  // Reducing protection remains possible with the current cached guard.
  await f.m.command(f.command("release"));
  assert.equal(f.active().size, 1);
});

void test("failed rereads cannot arm idle work and cached cancel-arm still reduces protection", async (t) => {
  const f = setup();
  t.after(() => f.m.close());
  await f.m.refresh();
  f.setReadFault("host");
  await f.m.refresh();
  await assert.rejects(f.m.command(f.command()), /verify|changed|unavailable/i);
  assert.equal(f.m.snapshot().agents[0].state.armedDurationMs, null);
  assert.equal(f.active().size, 0);
  f.setReadFault(null);
  await f.m.refresh();
  await f.m.command(f.command("set-duration", 60000));
  assert.equal(f.m.snapshot().agents[0].state.armedDurationMs, 60000);
  f.setFail(true);
  await f.m.refresh();
  await f.m.command(f.command("cancel-arm"));
  assert.equal(f.m.snapshot().agents[0].state.armedDurationMs, null);
});

void test("manual unknown-activity protection requires successful occupant observation, not a failing peer", async (t) => {
  const f = setup();
  t.after(() => f.m.close());
  await start(f);
  f.phases.set("a", { phase: "unknown", evidence: "uncertain" });
  await f.m.refresh();
  await f.m.command(f.command("set-duration", 60000));
  assert.equal(leaseDeadline(f.m.snapshot().agents[0].state), 1_800_000_070_000);
  const original = f.herdr.observe.bind(f.herdr);
  f.herdr.observe = async (target) => {
    if (target === "a") throw Error("identity cannot be established");
    return original(target);
  };
  await f.m.refresh();
  await assert.rejects(
    f.m.command(f.command("set-duration", 72000000)),
    /verify|changed|unavailable/i,
  );
  assert.equal(leaseDeadline(f.m.snapshot().agents[1].state), 1_800_028_800_000);
  const b = f.m.snapshot().agents[1].state;
  await f.m.command({
    type: "set-duration",
    occupant: b.occupant,
    runId: b.runId,
    revision: b.revision,
    durationMs: 120000,
  });
  assert.equal(leaseDeadline(f.m.snapshot().agents[1].state), 1_800_000_130_000);
});
