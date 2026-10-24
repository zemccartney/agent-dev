import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createHerdrClient, HerdrError, type Exec } from "#agentlog/herdr";
import { captureEvent } from "#agentlog/capture";
import { openStore } from "#agentlog/store";
import { makeFixture } from "./helpers/fixtures.ts";

const env = {
  HERDR_BIN_PATH: "/sandbox/herdr",
  HERDR_SOCKET_PATH: "/sandbox/socket",
  HERDR_SESSION: "isolated",
};
const rawPane = {
  pane_id: "w1:p1",
  terminal_id: "t1",
  workspace_id: "w1",
  tab_id: "w1:t1",
  focused: false,
  cwd: "/project",
  foreground_cwd: "/different",
  agent: "pi",
  agent_status: "idle",
  state_labels: {},
  tokens: {},
  revision: 1,
  agent_session: { source: "herdr:pi", agent: "pi", kind: "path", value: "/sessions/a.jsonl" },
};
function transport() {
  const calls: Array<{ bin: string; args: readonly string[]; options: Parameters<Exec>[2] }> = [];
  const exec: Exec = (bin, args, options) => {
    calls.push({ bin, args, options });
    const result =
      args[0] === "pane" && args[1] === "list"
        ? { type: "pane_list", panes: [rawPane] }
        : args[0] === "workspace" && args[1] === "list"
          ? {
              type: "workspace_list",
              workspaces: [
                {
                  workspace_id: "w1",
                  number: 1,
                  label: "Unrelated label",
                  focused: true,
                  pane_count: 1,
                  tab_count: 1,
                  active_tab_id: "w1:t1",
                  agent_status: "idle",
                  tokens: {},
                  worktree: {
                    repo_key: "r",
                    repo_name: "r",
                    repo_root: "/repo",
                    checkout_path: "/project",
                    is_linked_worktree: true,
                  },
                },
              ],
            }
          : args[1] === "create"
            ? { type: args[0] + "_created", root_pane: rawPane }
            : { type: "pane_info", pane: rawPane };
    return Promise.resolve({ stdout: JSON.stringify({ id: "test", result }), stderr: "" });
  };
  return { calls, client: createHerdrClient(env, exec) };
}
await test("session paths remain one argv element with current namespace and bounded launch wait", async () => {
  const { client, calls } = transport();
  const path = "/tmp/Alice's work/session.jsonl";
  await client.startPi("w1:p1", path, "agentlog-test");
  assert.deepEqual(calls[0]?.args, [
    "agent",
    "start",
    "agentlog-test",
    "--kind",
    "pi",
    "--pane",
    "w1:p1",
    "--timeout",
    "30000",
    "--",
    "--session",
    path,
  ]);
  assert.equal(calls[0]?.bin, "/sandbox/herdr");
  assert.equal(calls[0]?.options.env.HERDR_SOCKET_PATH, "/sandbox/socket");
  assert.equal(calls[0]?.options.timeout, 35000);
});
await test("lists normalize documented fields, never foreground cwd or guessed workspace cwd", async () => {
  const { client, calls } = transport();
  const state = await client.state();
  assert.equal(state.panes[0]?.cwd, "/project");
  assert.equal(state.panes[0]?.session?.value, "/sessions/a.jsonl");
  assert.deepEqual(state.workspaces, [{ workspaceId: "w1", checkoutPath: "/project" }]);
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      ["pane", "list"],
      ["workspace", "list"],
    ],
  );
});
await test("destinations are created without focus, existing agents focus by pane, popup uses manifest placement", async () => {
  const { client, calls } = transport();
  await client.createDestination("/project");
  await client.createDestination("/project", "w1");
  await client.focus("w1:p1");
  await client.openPopup();
  await client.pane("w1:p1");
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      ["workspace", "create", "--cwd", "/project", "--no-focus"],
      ["tab", "create", "--workspace", "w1", "--cwd", "/project", "--no-focus"],
      ["agent", "focus", "w1:p1"],
      [
        "plugin",
        "pane",
        "open",
        "--plugin",
        "grepco.agentlog",
        "--entrypoint",
        "registry",
        "--focus",
      ],
      ["pane", "get", "w1:p1"],
    ],
  );
});
await test("API error codes survive stderr and malformed state cannot become an empty live list", async () => {
  const exec: Exec = () =>
    Promise.reject(
      Object.assign(new Error("exit 1"), {
        stderr: JSON.stringify({
          id: "e",
          error: { code: "pane_not_found", message: "pane not found" },
        }),
      }),
    );
  await assert.rejects(
    createHerdrClient(env, exec).pane("gone"),
    (error: unknown) => error instanceof HerdrError && error.code === "pane_not_found",
  );
  await assert.rejects(
    createHerdrClient(env, () => Promise.resolve({ stdout: '{"result":{}}', stderr: "" })).state(),
    /invalid|missing/i,
  );
  assert.throws(() => createHerdrClient({}), /Herdr|context/i);
});
await test("capture queries the affected pane and remembers only absolute Pi path references", async (t) => {
  const { root } = await makeFixture(t);
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const { client, calls } = transport();
  const event = JSON.stringify({
    event: "pane.agent_detected",
    data: { type: "pane_agent_detected", pane_id: "w1:p1", agent: "pi" },
  });
  await captureEvent(event, client, store);
  assert.deepEqual(
    calls.map((c) => c.args),
    [["pane", "get", "w1:p1"]],
  );
  assert.deepEqual(store.knownPaths(), ["/sessions/a.jsonl"]);
  for (const session of [
    { agent: "pi", kind: "id", value: "native-id" },
    { agent: "claude", kind: "path", value: "/other.jsonl" },
    { agent: "pi", kind: "path", value: "relative.jsonl" },
  ]) {
    const alternative = createHerdrClient(env, () =>
      Promise.resolve({
        stdout: JSON.stringify({
          id: "test",
          result: { type: "pane_info", pane: { ...rawPane, agent_session: session } },
        }),
        stderr: "",
      }),
    );
    await captureEvent(event, alternative, store);
  }
  const gone = createHerdrClient(env, () =>
    Promise.reject(
      Object.assign(new Error("gone"), {
        stderr: JSON.stringify({ error: { code: "pane_not_found", message: "gone" } }),
      }),
    ),
  );
  await captureEvent(event, gone, store);
  await captureEvent(
    JSON.stringify({ event: "pane.closed", data: { pane_id: "w1:p1" } }),
    client,
    store,
  );
  assert.deepEqual(store.knownPaths(), ["/sessions/a.jsonl"]);
});
await test("cancellation reaches the CLI boundary without launching another request", async () => {
  const { client, calls } = transport();
  const signal = AbortSignal.abort();
  await assert.rejects(client.startPi("w1:p1", "/s.jsonl", "x", signal), { name: "AbortError" });
  assert.equal(calls.length, 0);
});
