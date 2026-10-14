import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, stat, rm, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { prepareRuntime, runtimeFiles } from "./helpers/runtime.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
await test("prepared help runs without source, node_modules or a Herdr connection", async (t) => {
  assert.ok(existsSync(join(root, "dist/cli.js")), "production bundle required");
  assert.ok(
    existsSync(join(root, "THIRD_PARTY_NOTICES.txt")),
    "Redistribution license notices required",
  );
  const dir = await mkdtemp(join(tmpdir(), "agentlog-consumer-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const payload = join(dir, "payload");
  await prepareRuntime(payload);
  const result = spawnSync(process.execPath, [join(payload, "scripts/run.cjs"), "--help"], {
    cwd: dir,
    env: { HOME: dir, PATH: "/usr/bin:/bin" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /herder-agentlog/);
  assert.deepEqual((await readdir(payload)).sort(), [
    "THIRD_PARTY_NOTICES.txt",
    "dist",
    "herdr-plugin.toml",
    "package.json",
    "scripts",
  ]);
  assert.deepEqual(await readdir(join(payload, "dist")), ["cli.js"]);
  assert.deepEqual(await readdir(join(payload, "scripts")), ["run.cjs"]);
  const notices = await readFile(join(payload, "THIRD_PARTY_NOTICES.txt"), "utf8");
  for (const required of [
    "@earendil-works/pi-tui 1.0.4",
    "get-east-asian-width 1.6.0",
    "marked 18.0.11",
    "Mario Zechner",
    "Sindre Sorhus",
    "Christopher Jeffrey",
    "John Gruber",
    "THE SOFTWARE IS PROVIDED",
  ])
    assert.ok(notices.includes(required), required);
  const bundle = await readFile(join(payload, "dist/cli.js"));
  const sizes = await Promise.all(
    runtimeFiles.map(async (file) => (await stat(join(payload, file))).size),
  );
  const archive = join(dir, "runtime.tgz");
  const tar = spawnSync("/usr/bin/tar", ["-czf", archive, "-C", payload, "."], {
    encoding: "utf8",
  });
  assert.equal(tar.status, 0, tar.stderr);
  t.diagnostic(
    `bundle=${bundle.length} bytes; bundle.gzip=${gzipSync(bundle).length}; runtime=${sizes.reduce((a, b) => a + b, 0)} bytes; runtime.tgz=${(await stat(archive)).size}`,
  );
});

await test("unit imports resolve to built test modules, not TypeScript source", () => {
  const resolved = import.meta.resolve("#agentlog/pi-session");
  assert.ok(resolved.endsWith("/.build/test/pi-session.js"), resolved);
  assert.ok(existsSync(fileURLToPath(resolved)), "built adapter required");
});
