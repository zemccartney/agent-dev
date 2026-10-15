import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, symlink, writeFile, access, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

void test("actual selected Node binary executes the relocated prepared payload", async (t) => {
  const node = process.env.CAFFEINATE_TEST_NODE ?? process.execPath;
  assert.ok(isAbsolute(node), "CAFFEINATE_TEST_NODE must be an explicit absolute binary path");
  const root = await realpath(await mkdtemp(join(tmpdir(), "cf-runtime-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const found = spawnSync("/usr/bin/which", ["herdr"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    encoding: "utf8",
    timeout: 5000,
  });
  const herdr = await realpath(process.env.HERDR_BIN_PATH ?? found.stdout.trim());
  for (const directory of ["bin", "home", "tmp"]) await mkdir(join(root, directory));
  const env = {
    HOME: join(root, "home"),
    TMPDIR: join(root, "tmp"),
    PATH: `${join(root, "bin")}:/usr/bin:/bin`,
    HERDR_BIN_PATH: herdr,
    LANG: "en_US.UTF-8",
    TERM: "xterm-256color",
  };
  const version = spawnSync(node, ["--version"], { env, encoding: "utf8", timeout: 5000 });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^v24\.\d+\.\d+$/);
  assert.ok(Number(version.stdout.trim().split(".")[1]) >= 11, "Node 24.11.0 minimum");
  t.diagnostic(`Actual runtime binary: ${node}; version: ${version.stdout.trim()}`);
  await cp(new URL("../.build/runtime/", import.meta.url), join(root, "payload"), {
    recursive: true,
  });
  await symlink(await realpath(node), join(root, "bin/node"));
  const result = spawnSync("/bin/sh", [join(root, "payload/scripts/launch.sh"), "--help"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ensure.*monitor.*controls.*popup.*stop/s);
});

void test("relocated runtime does not inherit a developer preload from its parent test process", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cf-runtime-poison-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const preload = join(dir, "preload.cjs"),
    marker = join(dir, "leaked");
  await writeFile(
    preload,
    `if (process.env.CF_PARENT_READY) { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'leaked'); throw new Error('developer preload leaked'); } process.env.CF_PARENT_READY = '1';`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-isolation=none",
      "--test-reporter=tap",
      "--test-name-pattern=^actual selected Node",
      fileURLToPath(import.meta.url),
    ],
    {
      env: {
        ...process.env,
        NODE_TEST_CONTEXT: undefined,
        CF_PARENT_READY: undefined,
        NODE_OPTIONS: `--require ${JSON.stringify(preload)}`,
        CAFFEINATE_TEST_NODE: process.execPath,
      },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Actual runtime binary:.*v24\./);
  assert.match(result.stdout, /# tests 1\b/);
  await assert.rejects(access(marker), { code: "ENOENT" });
});
