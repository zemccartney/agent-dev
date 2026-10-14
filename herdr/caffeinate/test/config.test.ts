import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "#caffeinate/config";
import { createMonitor } from "#caffeinate/monitor";
import type { Phase } from "#caffeinate/model";
import { deadline } from "./helpers.ts";
void test("global preferences propagate to another monitor without changing pending deadlines", async (t) => {
  const d = await mkdtemp(join(tmpdir(), "cg-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  const path = join(d, "settings.json");
  let now = 1800000000000;
  function instance() {
    let phase: Phase = "idle";
    const m = createMonitor({
      now: () => now,
      herdr: {
        hostStatus: async () => ({ instance: "s", local: true, pluginEnabled: true }),
        list: async () => [{ occupant: "a", target: "p", kind: "pi" }],
        observe: async () => ({ occupant: "a", phase, evidence: "positive" }),
        publishToken: async () => {},
        close() {},
      },
      assertions: { reconcile: async (d) => d, close: async () => {} },
      readPower: async () => "ac",
      persistConfig: (c) => saveConfig(path, c),
      reloadConfig: () => loadConfig(path),
    });
    return { m, work: () => (phase = "working") };
  }
  const a = instance(),
    b = instance();
  t.after(() => Promise.all([a.m.close(), b.m.close()]));
  await a.m.refresh();
  await b.m.refresh();
  a.work();
  await a.m.refresh();
  await a.m.command({
    type: "set-config",
    config: { automatic: false, defaultDurationMs: 3600000 },
  });
  await b.m.refresh();
  assert.equal(b.m.snapshot().config.automatic, false);
  b.work();
  await b.m.refresh();
  assert.equal(b.m.snapshot().agents[0].state.pending, null);
  now += 10000;
  await a.m.tick();
  assert.equal(deadline(a.m.snapshot().agents[0].state), 1800028800000);
});
void test("global config persists only validated preferences atomically", async (t) => {
  const d = await mkdtemp(join(tmpdir(), "cf-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  const path = join(d, "settings.json");
  assert.deepEqual(await loadConfig(path), { automatic: true, defaultDurationMs: 28800000 });
  await saveConfig(path, { automatic: false, defaultDurationMs: 1000, leases: ["never persist"] });
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    automatic: false,
    defaultDurationMs: 1000,
  });
  assert.deepEqual(await loadConfig(path), { automatic: false, defaultDurationMs: 1000 });
  await assert.rejects(
    saveConfig(path, { automatic: "yes", defaultDurationMs: 1000 }),
    /automatic/,
  );
  await writeFile(path, '{"automatic":false,"defaultDurationMs":0}');
  await assert.rejects(loadConfig(path), /duration/i);
});
