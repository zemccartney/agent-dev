import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { assertCompatible } from "../scripts/probe-herdr.ts";

void test("missing or unverified contracts cannot pass the compatibility gate", () => {
  assert.throws(() => assertCompatible({}), /missing/i);
  const complete = {
    occupantIdentity: true,
    detectionProvenance: true,
    serverIdentity: true,
    pluginEnabledRead: true,
    localTargetGuard: true,
    finiteTimeout: true,
    ownerExitCleanup: true,
  };
  assert.doesNotThrow(() => assertCompatible(complete));
  for (const key of Object.keys(complete))
    assert.throws(() => assertCompatible({ ...complete, [key]: false }), new RegExp(key));
});
void test("OS probe refuses to acquire assertions without explicit opt-in", () => {
  const p = spawnSync(process.execPath, ["scripts/probe-assertions.ts"], { encoding: "utf8" });
  assert.equal(p.status, 2);
  assert.match(p.stderr, /--allow-system-assertion/);
});
