import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { selectHostArtifact } from "./helpers/artifact.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

/** @param {import('node:test').TestContext} t */
async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-lence-artifact-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const producer = join(root, "producer/pi/pi-lence");
  if (process.env.PI_LENCE_HOST_TARBALL === undefined) {
    await mkdir(producer, { recursive: true });
    for (const path of ["src", "package.json", "README.md"])
      await cp(join(packageRoot, path), join(producer, path), { recursive: true });
    await cp(resolve(packageRoot, "../../LICENSE"), join(root, "producer/LICENSE"));
  }
  const { tarballPath } = await selectHostArtifact(join(root, "artifacts"), process.env, producer);
  await rm(join(root, "producer"), { recursive: true, force: true });
  const { createHostSandbox } = await import("./helpers/host-sandbox.mjs");
  const host = await createHostSandbox(tarballPath, { nodePath: process.env.PI_LENCE_HOST_NODE });
  t.after(() => host.dispose());
  return { host, tarballPath };
}

/** @param {import('node:child_process').ChildProcessWithoutNullStreams} child */
function collect(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (data) => {
    stdout += data;
  });
  child.stderr.setEncoding("utf8").on("data", (data) => {
    stderr += data;
  });
  /** @type {Promise<{code: number | null, stdout: string, stderr: string}>} */
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  return result;
}

await test(
  "sandbox rejects inherited credentials/resources and cleans up failed or timed-out children",
  { timeout: 30_000 },
  async (t) => {
    const outer = await mkdtemp(join(tmpdir(), "pi-lence-outer-home-"));
    t.after(() => rm(outer, { recursive: true, force: true }));
    const outerAgent = join(outer, ".pi/agent");
    await mkdir(outerAgent, { recursive: true });
    const sentinels = new Map([
      [join(outerAgent, "settings.json"), '{"packages":["./must-not-load.ts"]}'],
      [join(outerAgent, "auth.json"), '{"openai":{"type":"api_key","key":"fake-outer-key"}}'],
      [join(outerAgent, "must-not-load.ts"), 'throw new Error("OUTER_EXTENSION_LOADED");'],
      [join(outer, ".npmrc"), "registry=https://invalid.example.test/\n"],
    ]);
    for (const [path, contents] of sentinels) await writeFile(path, contents);
    const overrides = {
      HOME: outer,
      PI_CODING_AGENT_DIR: outerAgent,
      PI_PACKAGE_DIR: "/not-a-host",
      NODE_OPTIONS: "--invalid-option",
      NODE_TEST_CONTEXT: "child-v8",
      OPENAI_API_KEY: "fake-outer-key",
      npm_config_userconfig: join(outer, ".npmrc"),
      GIT_DIR: "/outer-git",
    };
    const before = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const { host } = await sandbox(t);
      const child = host.spawn(host.nodePath, [
        "-e",
        "console.log(JSON.stringify(process.env)); process.exit(7)",
      ]);
      const result = await collect(child);
      assert.equal(result.code, 7);
      const env = JSON.parse(result.stdout);
      assert.equal(env.HOME, host.home);
      assert.equal(env.PI_CODING_AGENT_DIR, host.agentDir);
      for (const key of [
        "PI_PACKAGE_DIR",
        "NODE_OPTIONS",
        "NODE_TEST_CONTEXT",
        "OPENAI_API_KEY",
        "GIT_DIR",
      ])
        assert.equal(env[key], undefined, key);
      assert.ok(env.npm_config_userconfig.startsWith(host.root));
      const hanging = host.spawn(
        host.nodePath,
        ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
        { timeoutMs: 150 },
      );
      const hungResult = await collect(hanging);
      assert.notEqual(hungResult.code, 0);
      await host.dispose();
      await assert.rejects(readFile(join(host.agentDir, "settings.json")), { code: "ENOENT" });
      const pid = hanging.pid;
      assert.ok(pid);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      for (const [path, contents] of sentinels)
        assert.equal(await readFile(path, "utf8"), contents);
    } finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  },
);

await test("failed sandbox initialization leaves no private state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-lence-init-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = root;
  try {
    const { createHostSandbox } = await import("./helpers/host-sandbox.mjs");
    await assert.rejects(
      createHostSandbox(join(root, "absent.tgz"), { nodePath: join(root, "missing-node") }),
      { code: "ENOENT" },
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
});

await test(
  "packed installation survives removal of its source snapshot, reinstall and removal preserve other state",
  { timeout: 40_000 },
  async (t) => {
    const { host, tarballPath } = await sandbox(t);
    const entry = join(host.agentDir, "npm/node_modules/@grepco/pi-lence/src/reference-ui.ts");
    assert.equal((await readdir(join(host.agentDir, "npm/node_modules/@grepco"))).length, 1);
    await assert.rejects(
      readdir(join(host.agentDir, "npm/node_modules/@grepco/pi-lence/node_modules")),
      { code: "ENOENT" },
    );
    const original = await readFile(entry, "utf8");
    await writeFile(entry, `${original}\nthrow new Error('PI_LENCE_DISCOVERY_CANARY');\n`);
    const failed = await host.run(["--print", "fixture-read"]);
    assert.match(failed.stderr + failed.stdout, /PI_LENCE_DISCOVERY_CANARY/);
    await writeFile(entry, original);
    const good = await host.run(["--print", "fixture-read"]);
    assert.equal(good.code, 0, good.stderr);
    assert.equal(good.stdout.trim(), "Fixture answer: fixture-read");
    assert.doesNotMatch(good.stderr, /error|failed|canary/i);
    const settingsPath = join(host.agentDir, "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    settings.editorPaddingX = 2;
    await writeFile(settingsPath, JSON.stringify(settings));
    const sentinel = join(host.agentDir, "saved-user-state.txt");
    await writeFile(sentinel, "preserve me");
    const source = `npm:@grepco/pi-lence@file:${tarballPath}`;
    const reinstall = await host.run(["install", source]);
    assert.equal(reinstall.code, 0, reinstall.stderr);
    assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), settings);
    const removed = await host.run(["remove", source]);
    assert.equal(removed.code, 0, removed.stderr);
    const after = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(after.editorPaddingX, 2);
    assert.deepEqual(after.packages, []);
    assert.equal(await readFile(sentinel, "utf8"), "preserve me");
    const absent = await host.run(["--print", "fixture-read"]);
    assert.equal(absent.code, 0, absent.stderr);
    assert.equal(absent.stdout, good.stdout);
  },
);

await test(
  "JSON executes real tools and settles without terminal output from the installed extension",
  { timeout: 30_000 },
  async (t) => {
    const { host } = await sandbox(t);
    const result = await host.run(["--mode", "json", "fixture-read"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.includes("\x1b"), false, "No terminal escapes in JSON");
    const records = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(records[0].type, "session");
    assert.ok(
      records.some(
        (event) =>
          event.type === "tool_execution_end" &&
          event.toolName === "read" &&
          event.isError === false &&
          JSON.stringify(event.result).includes("Fixture file contents"),
      ),
    );
    assert.ok(
      records.some(
        (event) =>
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.content.some(
            (/** @type {{text?: string}} */ part) => part.text === "Fixture answer: fixture-read",
          ),
      ),
    );
    assert.ok(records.some((event) => event.type === "agent_settled" && event.aborted === false));
    assert.ok(
      records.every(
        (event) => event.type !== "extension_ui_request" && event.type !== "extension_error",
      ),
    );
  },
);

/** @param {Awaited<ReturnType<typeof sandbox>>["host"]} host @param {string} message */
async function rpcRun(host, message) {
  const child = host.spawn(host.nodePath, [host.cliPath, ...host.sessionArgs, "--mode", "rpc"]);
  const finished = collect(child);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stdin.write(`${JSON.stringify({ id: "prompt", type: "prompt", message })}\n`);
  const deadline = Date.now() + 15_000;
  while (!output.includes('"type":"agent_settled"') && Date.now() < deadline) await delay(20);
  assert.match(output, /"type":"agent_settled"/);
  child.stdin.end();
  const result = await finished;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.includes("\x1b"), false, "No terminal escapes in RPC");
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

/** @param {ReturnType<typeof JSON.parse>[]} records */
function assertRpcSuccess(records) {
  assert.ok(
    records.some((event) => event.type === "response" && event.id === "prompt" && event.success),
  );
  assert.ok(
    records.some(
      (event) =>
        event.type === "tool_execution_end" &&
        event.toolName === "read" &&
        event.isError === false &&
        JSON.stringify(event.result).includes("Fixture file contents"),
    ),
    "RPC must return the actual read result",
  );
  const finalAssistant = records.findLast(
    (event) => event.type === "message_end" && event.message.role === "assistant",
  )?.message;
  assert.equal(
    finalAssistant?.stopReason,
    "stop",
    "RPC final assistant must complete successfully",
  );
  assert.ok(
    finalAssistant.content.some(
      (/** @type {{type?:string, text?:string}} */ part) =>
        part.type === "text" && part.text === "Fixture answer: fixture-read",
    ),
    "RPC must return the expected final answer",
  );
  assert.ok(
    records.some((event) => event.type === "agent_settled" && event.aborted === false),
    "RPC must settle without cancellation",
  );
  assert.ok(
    records.every(
      (event) => event.type !== "extension_ui_request" && event.type !== "extension_error",
    ),
  );
}

await test(
  "RPC success gate rejects a provider failure after successful tool work",
  { timeout: 30_000 },
  async (t) => {
    const { host } = await sandbox(t);
    const records = await rpcRun(host, "fixture-fail-after-read");
    assert.ok(
      records.some(
        (event) =>
          event.type === "message_end" &&
          event.message.role === "assistant" &&
          event.message.stopReason === "error" &&
          event.message.errorMessage.includes("Post-tool provider failure canary"),
      ),
    );
    assert.throws(
      () => assertRpcSuccess(records),
      /RPC final assistant must complete successfully/,
    );
  },
);

await test(
  "RPC stays valid through completed tool work and orderly shutdown",
  { timeout: 30_000 },
  async (t) => {
    const { host } = await sandbox(t);
    const records = await rpcRun(host, "fixture-read");
    assertRpcSuccess(records);
    const lifecycle = (await readFile(join(host.root, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(lifecycle.some((event) => event.type === "start" && event.mode === "rpc"));
    assert.ok(lifecycle.some((event) => event.type === "shutdown"));
  },
);
