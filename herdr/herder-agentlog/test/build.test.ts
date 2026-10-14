import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, cp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
await test("prepared help runs without source, node_modules or a Herdr connection", async (t) => {
  assert.ok(existsSync(join(root, "dist/cli.js")), "production bundle required");
  const dir = await mkdtemp(join(tmpdir(), "agentlog-consumer-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(root, "dist/cli.js"), join(dir, "cli.js"));
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  const result = spawnSync(process.execPath, [join(dir, "cli.js"), "--help"], {
    cwd: dir,
    env: { HOME: dir, PATH: "/usr/bin:/bin" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /herder-agentlog/);
  assert.deepEqual((await readdir(dir)).sort(), ["cli.js", "package.json"]);
});

await test("unit imports resolve to built test modules, not TypeScript source", () => {
  const resolved = import.meta.resolve("#agentlog/pi-session");
  assert.ok(resolved.endsWith("/.build/test/pi-session.js"), resolved);
  assert.ok(existsSync(fileURLToPath(resolved)), "built adapter required");
});
