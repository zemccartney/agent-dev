import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { openStore } from "#agentlog/store";
const root = fileURLToPath(new URL("../", import.meta.url));
await test("manifest has an on-demand popup and no startup command", async () => {
  const path = join(root, "herdr-plugin.toml");
  assert.ok(existsSync(path), "plugin manifest required");
  const manifest = await readFile(path, "utf8");
  assert.match(manifest, /placement = "popup"/);
  assert.doesNotMatch(manifest, /^\[\[?startup\]?\]/m);
  assert.doesNotMatch(manifest, /^\[\[build\]\]/m);
  assert.match(manifest, /width = "90%"/);
  assert.match(manifest, /height = "80%"/);
  assert.deepEqual(
    [...manifest.matchAll(/^on = "([^"]+)"/gm)].map((m) => m[1]),
    ["pane.agent_detected", "pane.agent_status_changed"],
  );
  assert.match(manifest, /contexts = \["workspace", "pane"\]/);
  assert.match(manifest, /command = \["node", "scripts\/run.cjs", "ui"\]/);
});
await test("bundled commands require plugin context, launch only the popup, and capture explicit event paths", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "agentlog-cli-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, "calls.jsonl");
  const bin = join(dir, "herdr.mjs");
  const pane = {
    pane_id: "w1:p1",
    workspace_id: "w1",
    tab_id: "w1:t1",
    cwd: dir,
    agent: "pi",
    agent_session: { agent: "pi", kind: "path", value: join(dir, "saved.jsonl") },
  };
  await writeFile(
    bin,
    `#!${process.execPath}\nimport{appendFileSync}from'node:fs';const args=process.argv.slice(2);appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');console.log(JSON.stringify({result:args[0]==='pane'?{pane:${JSON.stringify(pane)}}:{ok:true}}));\n`,
    { mode: 0o700 },
  );
  const env = {
    HOME: dir,
    PATH: dirname(process.execPath) + ":/usr/bin:/bin",
    HERDR_BIN_PATH: bin,
    HERDR_SOCKET_PATH: join(dir, "isolated.sock"),
    HERDR_PLUGIN_ID: "grepco.agentlog",
    HERDR_PLUGIN_STATE_DIR: join(dir, "state"),
  };
  const run = (command: string, variables: NodeJS.ProcessEnv = env) =>
    spawnSync(process.execPath, [join(root, "scripts/run.cjs"), command], {
      env: variables,
      cwd: dir,
      encoding: "utf8",
    });
  const help = run("--help", { HOME: dir, PATH: "/usr/bin:/bin" });
  assert.equal(help.status, 0, help.stderr);
  assert.equal(existsSync(log), false);
  assert.equal(existsSync(env.HERDR_PLUGIN_STATE_DIR), false);
  for (const command of ["sessions", "ui", "capture"]) {
    const result = run(command, { HOME: dir, PATH: "/usr/bin:/bin" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing plugin context/i);
  }
  const opened = run("sessions");
  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(existsSync(env.HERDR_PLUGIN_STATE_DIR), false);
  assert.deepEqual(JSON.parse((await readFile(log, "utf8")).trim()), [
    "plugin",
    "pane",
    "open",
    "--plugin",
    "grepco.agentlog",
    "--entrypoint",
    "registry",
    "--focus",
  ]);
  const captured = run("capture", {
    ...env,
    HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
      event: "pane.agent_detected",
      data: { pane_id: "w1:p1" },
    }),
  });
  assert.equal(captured.status, 0, captured.stderr);
  const store = openStore(env.HERDR_PLUGIN_STATE_DIR);
  try {
    assert.deepEqual(store.knownPaths(), [pane.agent_session.value]);
  } finally {
    store.close();
  }
  const ui = run("ui");
  assert.equal(ui.status, 1);
  assert.match(ui.stderr, /terminal|TTY/i);
  assert.deepEqual(
    (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
    [
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
