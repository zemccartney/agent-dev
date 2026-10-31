import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { selectProjects } from "./check-projects.mjs";
import { fixtureEnvironment, seedPackageManagerLock } from "./test-helpers/environment.mjs";

const projects = [
  { name: "base", path: "pi/base", dependencies: [] },
  { name: "consumer", path: "herdr/consumer", dependencies: ["base"] },
  { name: "last", path: "herdr/last", dependencies: ["consumer"] },
  { name: "other", path: "pi/with spaces", dependencies: [] },
];
const all = ["base", "consumer", "last", "other"];
await test("selection includes transitive dependents, not dependencies or prefix siblings", () => {
  assert.deepEqual(selectProjects(["pi/base/src/deleted.ts"], projects), [
    "base",
    "consumer",
    "last",
  ]);
  assert.deepEqual(selectProjects(["herdr/consumer/src/file.ts"], projects), ["consumer", "last"]);
  assert.deepEqual(selectProjects(["pi/with spaces/a ; $(bad).ts"], projects), ["other"]);
  assert.deepEqual(selectProjects(["pi/basement/a.ts"], projects), all);
  assert.deepEqual(selectProjects([], projects), []);
});
await test("root, shared, unknown, deleted-package and escaping paths select everything", () => {
  for (const path of [
    "pnpm-lock.yaml",
    "scripts/check.mjs",
    "new.txt",
    "herdr/deleted/src/a.ts",
    "../outside",
  ]) {
    assert.deepEqual(selectProjects([path], projects), all, path);
  }
});
await test("both sides of a rename select their owners and cycles terminate", () => {
  assert.deepEqual(selectProjects(["pi/with spaces/old.ts", "herdr/consumer/new.ts"], projects), [
    "consumer",
    "last",
    "other",
  ]);
  assert.deepEqual(
    selectProjects(["pi/base/a.ts"], [{ ...projects[0], dependencies: ["consumer"] }, projects[1]]),
    ["base", "consumer"],
  );
});

const runner = fileURLToPath(new URL("./check-projects.mjs", import.meta.url));
/** @param {string} command @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} [env] */
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env: fixtureEnvironment(cwd, env),
    encoding: "utf8",
    timeout: 30000,
  });
  assert.ifError(result.error);
  return result;
}
/** @param {import('node:test').TestContext} t */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "agent-dev-selector-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (/** @type {string[]} */ args) => {
    const r = run(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      root,
    );
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", private: true, packageManager: "pnpm@12.15.0" }),
  );
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\nautoInstallPeers: false\n",
  );
  await writeFile(join(root, ".gitignore"), "node_modules/\n");
  for (const name of ["base", "consumer", "other"]) {
    const dir = join(root, "packages", name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: `@fixture/${name}`,
        version: "1.0.0",
        type: "module",
        scripts: { "check:project": "node check.mjs" },
        dependencies: name === "consumer" ? { "@fixture/base": "workspace:*" } : {},
      }),
    );
    await writeFile(
      join(dir, "check.mjs"),
      `console.log("CHECKED:${name}"); if (process.env.FAIL_PROJECT === "${name}") process.exit(17);\n`,
    );
  }
  await writeFile(join(root, "packages/base/old name.ts"), "export const old = 1;\n");
  await seedPackageManagerLock(root);
  const installed = run("pnpm", ["install", "--offline", "--ignore-scripts"], root);
  assert.equal(installed.status, 0, installed.stderr + installed.stdout);
  git(["init", "--quiet"]);
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "fixture"]);
  return {
    root,
    git,
    check: (/** @type {string[]} */ args, env = process.env) =>
      run(process.execPath, [runner, ...args], root, env),
  };
}
/** @param {ReturnType<typeof run>} result */
function checked(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return [...result.stdout.matchAll(/^CHECKED:(\w+)$/gm)].map((match) => match[1]);
}
await test("real CLI discovers workspace dependencies, preserves argv, and propagates failure", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    checked(f.check(["--", "packages/base/file with spaces;$(touch INJECTED).ts"])),
    ["base", "consumer"],
  );
  await assert.rejects(access(join(f.root, "INJECTED")));
  assert.deepEqual(checked(f.check(["--"])), []);
  assert.deepEqual(checked(f.check(["--all"])), ["base", "consumer", "other"]);
  assert.notEqual(f.check(["--all"], { ...process.env, FAIL_PROJECT: "consumer" }).status, 0);
  assert.notEqual(f.check(["--unknown"]).status, 0);
});
await test("release-tree gate rejects only tracked scratch artifacts, not ordinary docs or untracked work", async (t) => {
  const f = await fixture(t);
  const guard = fileURLToPath(new URL("./check-release-tree.mjs", import.meta.url));
  const check = () => run(process.execPath, [guard], f.root);
  await writeFile(join(f.root, "plan.md"), "work branch plan\n");
  assert.equal(check().status, 0, "untracked work is not part of the promoted tree");
  f.git(["add", "plan.md"]);
  const blocked = check();
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /plan\.md/);
  f.git(["mv", "plan.md", "README.md"]);
  assert.equal(check().status, 0, "ordinary Markdown documentation is allowed");
});

await test("real staged rename/delete and root change cannot omit the old owning package", async (t) => {
  const f = await fixture(t);
  f.git(["mv", "packages/base/old name.ts", "packages/other/new\nname.ts"]);
  assert.deepEqual(checked(f.check(["--staged"])), ["base", "consumer", "other"]);
  assert.deepEqual(checked(f.check(["--", "packages/other/new\nname.ts"])), [
    "base",
    "consumer",
    "other",
  ]);
  f.git(["commit", "--quiet", "-m", "rename"]);
  f.git(["rm", "packages/other/new\nname.ts"]);
  assert.deepEqual(checked(f.check(["--staged"])), ["other"]);
  // hk omits deleted paths from its formatter-oriented file list, even for deletion-only commits.
  assert.deepEqual(checked(f.check(["--"])), ["other"]);
  assert.deepEqual(checked(f.check(["--", "packages/base/changed.ts"])), [
    "base",
    "consumer",
    "other",
  ]);
  await writeFile(join(f.root, "shared.json"), "{}\n");
  f.git(["add", "shared.json"]);
  assert.deepEqual(checked(f.check(["--staged"])), ["base", "consumer", "other"]);
});
