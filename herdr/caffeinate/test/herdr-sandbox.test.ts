import test from "node:test";
import assert from "node:assert/strict";
import { sandboxEnvironment, withHerdrSandbox } from "./helpers/herdr-sandbox.ts";

void test("sandbox environment replaces routing, credentials and user configuration roots", () => {
  const env = sandboxEnvironment("/tmp/cf-example", process.execPath);
  for (const key of [
    "HOME",
    "XDG_CONFIG_HOME",
    "XDG_STATE_HOME",
    "XDG_DATA_HOME",
    "PI_CODING_AGENT_DIR",
    "HERDR_CONFIG_PATH",
  ])
    assert.ok(env[key]?.startsWith("/tmp/cf-example/"), key);
  assert.equal(env.HERDR_SOCKET_PATH, undefined);
  assert.equal(env.HERDR_PANE_ID, undefined);
  assert.equal(env.HERDR_ENV, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.SHELL, "/bin/sh");
});

void test("sandbox execution requires explicit opt-in before invoking the callback", async (t) => {
  const previous = process.env.CAFFEINATE_RUN_HERDR_TESTS;
  delete process.env.CAFFEINATE_RUN_HERDR_TESTS;
  t.after(() => {
    if (previous === undefined) delete process.env.CAFFEINATE_RUN_HERDR_TESTS;
    else process.env.CAFFEINATE_RUN_HERDR_TESTS = previous;
  });
  let called = false;
  await assert.rejects(
    withHerdrSandbox(async () => {
      called = true;
    }),
    /explicit opt-in/,
  );
  assert.equal(called, false);
});
