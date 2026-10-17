import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { object } from "#caffeinate/validation";

void test("pinned pnpm rejects a mismatched developer runtime instead of provisioning it", async (t) => {
  const pkg = object(
    JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")),
  );
  const runtime = object(object(pkg.devEngines).runtime);
  assert.equal(runtime.onFail, "error");
  const root = await mkdtemp(join(tmpdir(), "cf-dev-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "runtime-contract",
      private: true,
      devEngines: { runtime: { ...runtime, version: "^23.0.0" } },
    }),
  );
  const result = spawnSync("pnpm", ["install", "--offline", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
  t.diagnostic(result.stdout + result.stderr);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /This project requires Node\.js \^23\.0\.0/);
  assert.doesNotMatch(result.stdout + result.stderr, /Downloading|Fetching/);
  assert.deepEqual(await readdir(root), ["package.json"]);
});
