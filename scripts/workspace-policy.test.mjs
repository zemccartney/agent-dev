import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const directories = [".", "pi/pi-lence", "herdr/auto-caffeinator", "herdr/agentlog"];
const expected = {
  engineStrict: "true",
  minimumReleaseAge: "10080",
  minimumReleaseAgeStrict: "true",
  minimumReleaseAgeIgnoreMissingTime: "false",
  blockExoticSubdeps: "true",
  trustPolicy: "no-downgrade",
  trustLockfile: "false",
  strictDepBuilds: "true",
  saveExact: "true",
  autoInstallPeers: "false",
  minimumReleaseAgeExcludePrune: "true",
};

/** @param {string} cwd */
function verifyPolicy(cwd) {
  for (const [key, value] of Object.entries(expected)) {
    const result = spawnSync("pnpm", ["config", "get", key], { cwd, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), value, `${cwd}: ${key}`);
  }
  const reviewed = {
    allowBuilds: { "@google/genai@2.21.0": false, "protobufjs@7.6.6": false },
    minimumReleaseAgeExclude: [],
    trustPolicyExclude: ["undici-types@6.21.0"],
  };
  for (const [key, value] of Object.entries(reviewed)) {
    const result = spawnSync("pnpm", ["config", "get", key, "--json"], { cwd, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), value, `${cwd}: ${key}`);
  }
}

for (const directory of directories) {
  test(`${directory} inherits the fail-closed workspace policy`, () => {
    verifyPolicy(join(root, directory));
  });
}

test("policy follows a symlinked checkout", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "agent-dev-policy-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const alias = join(temporary, "checkout with spaces");
  await symlink(root, alias, "dir");
  for (const directory of directories) verifyPolicy(join(alias, directory));
});

test("one root lockfile and tool pin govern every package", () => {
  assert.ok(existsSync(join(root, "package.json")), "Root developer package required");
  const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(metadata.private, true);
  assert.equal(metadata.packageManager, "pnpm@12.15.0");
  assert.deepEqual(metadata.devEngines.runtime, {
    name: "node",
    version: "24.22.1",
    onFail: "error",
  });
  assert.ok(existsSync(join(root, "pnpm-lock.yaml")));
  for (const directory of directories.slice(1)) {
    for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      assert.equal(existsSync(join(root, directory, file)), false, `${directory}/${file}`);
    }
  }
  const result = spawnSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  /** @type {{ name: string }[]} */
  const projects = JSON.parse(result.stdout);
  const names = projects.map((project) => project.name).sort();
  assert.deepEqual(names, [
    "@grepco/agent-dev",
    "@grepco/agentlog",
    "@grepco/auto-caffeinator",
    "@grepco/pi-lence",
  ]);
});
