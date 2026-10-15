import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";

void test("actual selected Node binary executes the relocated prepared payload", async (t) => {
  const node = process.env.CAFFEINATE_TEST_NODE ?? process.execPath;
  assert.ok(isAbsolute(node), "CAFFEINATE_TEST_NODE must be an explicit absolute binary path");
  const version = spawnSync(node, ["--version"], { encoding: "utf8", timeout: 5000 });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^v24\.\d+\.\d+$/);
  assert.ok(Number(version.stdout.trim().split(".")[1]) >= 11, "Node 24.11.0 minimum");
  t.diagnostic(`Actual runtime binary: ${node}; version: ${version.stdout.trim()}`);
  const root = await mkdtemp(join(tmpdir(), "cf-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL("../.build/runtime/", import.meta.url), join(root, "payload"), {
    recursive: true,
  });
  await mkdir(join(root, "bin"));
  await symlink(node, join(root, "bin/node"));
  const result = spawnSync("/bin/sh", [join(root, "payload/scripts/launch.sh"), "--help"], {
    cwd: tmpdir(),
    env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}` },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ensure.*monitor.*controls.*popup.*stop/s);
});
