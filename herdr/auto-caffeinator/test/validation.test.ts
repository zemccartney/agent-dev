import test from "node:test";
import assert from "node:assert/strict";
import {
  object,
  records,
  errorCode,
  errorMessage,
  parseCommand,
  parseMonitorResponse,
} from "#caffeinate/validation";
import { initialState } from "#caffeinate/model";
void test("untrusted JSON cannot masquerade as a command or monitor snapshot", () => {
  for (const value of [null, [], 42, "x"]) assert.deepEqual(object(value), {});
  assert.deepEqual(records([null, {}, 3]), [{}, {}, {}]);
  for (const value of [
    null,
    { type: "set-duration" },
    { type: "release", occupant: 2, runId: 0, revision: 0 },
  ])
    assert.throws(() => parseCommand(value));
  const command = { type: "release" as const, occupant: "a", runId: 1, revision: 2 };
  assert.deepEqual(parseCommand(command), command);
  const snapshot = {
    now: 100,
    power: "ac",
    config: { automatic: true, defaultDurationMs: 28800000 },
    stopped: false,
    error: null,
    agents: [{ target: "p1", state: initialState("a"), active: false, error: null }],
  };
  assert.deepEqual(parseMonitorResponse({ snapshot }), { snapshot });
  for (const response of [
    null,
    {},
    { snapshot: { ...snapshot, agents: [{ target: "p1", state: {}, active: false }] } },
  ])
    assert.throws(() => parseMonitorResponse(response));
  assert.equal(errorCode(Object.assign(new Error("gone"), { code: "ENOENT" })), "ENOENT");
  assert.equal(errorCode(null), undefined);
  assert.equal(errorMessage(new Error("no")), "no");
});
