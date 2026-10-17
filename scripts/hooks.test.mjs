import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { fixtureEnvironment } from "./test-helpers/environment.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
/** @param {import('node:test').TestContext} t */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "agent-dev-hooks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = {
    ...fixtureEnvironment(root),
    MISE_TRUSTED_CONFIG_PATHS: root,
    HK_FILE: join(root, "hk.pkl"),
    XDG_CONFIG_HOME: join(root, "config"),
  };
  /** @param {string} command @param {string[]} args @param {string} [cwd] */
  const run = (command, args, cwd = root) => {
    const result = spawnSync(command, args, {
      cwd,
      env: { ...env, PWD: cwd },
      encoding: "utf8",
      timeout: 60000,
    });
    assert.ifError(result.error);
    return result;
  };
  /** @param {string[]} args @param {boolean} [mustPass] */
  const git = (args, mustPass = true) => {
    const result = run("git", [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      ...args,
    ]);
    if (mustPass) assert.equal(result.status, 0, result.stdout + result.stderr);
    return result;
  };
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "node_modules/.bin"), { recursive: true });
  for (const name of ["oxfmt", "tsc"])
    await symlink(join(repo, "node_modules/.bin", name), join(root, "node_modules/.bin", name));
  for (const file of ["hk.pkl", "mise.toml", "mise.lock", ".oxfmtrc.json"])
    await copyFile(join(repo, file), join(root, file));
  for (const name of ["check-projects.mjs", "install-hooks.mjs"])
    await copyFile(join(repo, "scripts", name), join(root, "scripts", name));
  const manifest = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
  // Exercise the production check composition, selector, formatter, hk config and real compiler.
  // Repository-only checks get a tiny fixture suite; no recursion into this integration test.
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      type: "module",
      packageManager: manifest.packageManager,
      scripts: {
        ...manifest.scripts,
        "check:repo": "node --test scripts/canary.test.mjs",
        "check:repo:code": "node --test scripts/canary.test.mjs",
        "check:infra": "hk validate",
      },
    }),
  );
  await writeFile(
    join(root, "scripts/canary.test.mjs"),
    'import assert from "node:assert/strict"; assert.equal(1, 1);\n',
  );
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\nautoInstallPeers: false\n",
  );
  await writeFile(join(root, ".gitignore"), "node_modules/\nconfig/\n");
  await writeFile(join(root, "notes.txt"), "baseline\n");
  for (const name of ["one", "two"]) {
    const dir = join(root, "packages", name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: `@fixture/${name}`,
        version: "1.0.0",
        type: "module",
        scripts: {
          "check:project": `tsc -p tsconfig.json && node -e 'console.log("CHECKED:${name}")'`,
          "format:check": "oxfmt --check .",
        },
      }),
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { noEmit: true, strict: true, types: [], lib: ["ES2023"] },
        include: ["*.ts"],
      }),
    );
    await writeFile(join(dir, "fixture.ts"), "export const count = 1;\n// baseline\n");
  }
  const installed = run("pnpm", ["install", "--offline", "--ignore-scripts"]);
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  assert.equal(run("oxfmt", ["."]).status, 0);
  git(["init", "--quiet"]);
  // hk's libgit2 stash needs repository identity, not only Git CLI -c overrides.
  git(["config", "--local", "user.name", "Fixture"]);
  git(["config", "--local", "user.email", "fixture@example.invalid"]);
  git(["add", "."]);
  git(["commit", "--no-verify", "--quiet", "-m", "fixture"]);
  return { root, run, git, install: () => run(process.execPath, ["scripts/install-hooks.mjs"]) };
}
await test("opt-in installer refuses existing hooks and custom hook paths without modifying them", async (t) => {
  const f = await fixture(t);
  const hook = join(f.root, ".git/hooks/pre-commit");
  await writeFile(hook, "owner hook\n");
  assert.notEqual(f.install().status, 0);
  assert.equal(await readFile(hook, "utf8"), "owner hook\n");
  await rm(hook);
  f.git(["config", "core.hooksPath", "owner-hooks"]);
  assert.notEqual(f.install().status, 0);
  assert.equal(f.git(["config", "--get", "core.hooksPath"]).stdout.trim(), "owner-hooks");
});
await test("opt-in installer cannot escape through a symlinked hooks directory", async (t) => {
  const f = await fixture(t);
  const target = join(f.root, "shared-hooks");
  await mkdir(target);
  await rm(join(f.root, ".git/hooks"), { recursive: true, force: true });
  await symlink(target, join(f.root, ".git/hooks"), "dir");
  assert.notEqual(f.install().status, 0);
  await assert.rejects(readFile(join(target, "pre-commit")), { code: "ENOENT" });
});

await test("opt-in installer refuses a linked worktree's shared hooks", async (t) => {
  const f = await fixture(t);
  const linked = join(f.root, "linked");
  f.git(["worktree", "add", "--detach", linked]);
  const result = f.run(process.execPath, [join(f.root, "scripts/install-hooks.mjs")], linked);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /shared hooks/);
  await assert.rejects(readFile(join(f.root, ".git/hooks/pre-commit")), { code: "ENOENT" });
});

await test("real installed pre-commit preserves partial staging and unrelated unstaged edits", async (t) => {
  const f = await fixture(t);
  const installed = f.install();
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const path = join(f.root, "packages/one/fixture.ts");
  await writeFile(path, "export const count=2;\n// baseline\n");
  f.git(["add", "packages/one/fixture.ts"]);
  await writeFile(path, "export const count=2;\n// baseline\n// unstaged tail\n");
  await writeFile(join(f.root, "notes.txt"), "unrelated unstaged\n");
  const unusual = "packages/one/space ; $(touch INJECTED)\nfile.ts";
  await writeFile(join(f.root, unusual), "export const extra=3;\n");
  f.git(["add", unusual]);
  f.git(["commit", "--quiet", "-m", "formatted staged change"]);
  assert.match(f.git(["show", "HEAD:packages/one/fixture.ts"]).stdout, /export const count = 2;/);
  assert.doesNotMatch(f.git(["show", "HEAD:packages/one/fixture.ts"]).stdout, /unstaged tail/);
  assert.match(await readFile(path, "utf8"), /unstaged tail/);
  assert.equal(await readFile(join(f.root, "notes.txt"), "utf8"), "unrelated unstaged\n");
  assert.match(f.git(["show", `HEAD:${unusual}`]).stdout, /export const extra = 3;/);
  await assert.rejects(readFile(join(f.root, "INJECTED")));
});
await test("root changes check every project; real type/test failures block hook and CI composition", async (t) => {
  const f = await fixture(t);
  const installed = f.install();
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  await writeFile(join(f.root, "shared.json"), "{}\n");
  f.git(["add", "shared.json"]);
  const hook = f.run("hk", ["run", "pre-commit"]);
  assert.equal(hook.status, 0, hook.stdout + hook.stderr);
  assert.match(hook.stdout + hook.stderr, /CHECKED:one/);
  assert.match(hook.stdout + hook.stderr, /CHECKED:two/);
  const baseline = f.run("pnpm", ["check"]);
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  await writeFile(
    join(f.root, "packages/one/fixture.ts"),
    'export const broken: number = "wrong";\n',
  );
  f.git(["add", "packages/one/fixture.ts"]);
  const failed = f.git(["commit", "--quiet", "-m", "must fail"], false);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /TS2322/);
  const ci = f.run("pnpm", ["check"]);
  assert.notEqual(ci.status, 0, ci.stdout + ci.stderr);
  assert.match(ci.stdout + ci.stderr, /TS2322/);
  await writeFile(join(f.root, "packages/one/fixture.ts"), "export const count = 1;\n");
  f.git(["add", "packages/one/fixture.ts"]);
  await writeFile(
    join(f.root, "scripts/canary.test.mjs"),
    'import assert from "node:assert/strict"; assert.equal(1, 2);\n',
  );
  f.git(["add", "scripts/canary.test.mjs"]);
  const failedTest = f.git(["commit", "--quiet", "-m", "must also fail"], false);
  assert.notEqual(failedTest.status, 0, failedTest.stdout + failedTest.stderr);
  assert.match(failedTest.stdout + failedTest.stderr, /ERR_ASSERTION/);
  assert.notEqual(f.run("pnpm", ["check"]).status, 0);
});
