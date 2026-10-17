import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const policy = {
  engineStrict: "true",
  saveExact: "true",
  autoInstallPeers: "false",
  minimumReleaseAge: "10080",
  minimumReleaseAgeStrict: "true",
  minimumReleaseAgeIgnoreMissingTime: "false",
  blockExoticSubdeps: "true",
  trustPolicy: "no-downgrade",
  trustLockfile: "false",
  strictDepBuilds: "true",
};

await test("package policy fails closed rather than inheriting weaker global defaults", () => {
  assert.ok(existsSync(join(root, "../../pnpm-workspace.yaml")), "workspace policy is required");
  assert.equal(existsSync(join(root, "pnpm-workspace.yaml")), false);
  for (const [key, expected] of Object.entries(policy)) {
    const result = spawnSync("pnpm", ["config", "get", key], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected, key);
  }
  const result = spawnSync("pnpm", ["config", "get", "allowBuilds", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

await test("quality configuration retains all plugins and covers source, tests and build config through symlinks", async (t) => {
  assert.ok(existsSync(join(root, ".oxlintrc.json")), "lint configuration is required");
  const printed = spawnSync(join(root, "../../node_modules/.bin/oxlint"), ["--print-config"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(printed.status, 0, printed.stderr);
  const config: { plugins: string[]; rules: Record<string, string> } = JSON.parse(printed.stdout);
  assert.deepEqual(config.plugins.sort(), ["import", "node", "oxc", "typescript", "unicorn"]);
  assert.equal(config.rules["constructor-super"], "deny");
  const dir = await mkdtemp(join(tmpdir(), "agentlog-coverage-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const alias = join(dir, "checkout");
  await symlink(root, alias, "dir");
  for (const cwd of [root, alias]) {
    for (const project of ["core", "tools"]) {
      const result = spawnSync(
        join(root, "../../node_modules/.bin/tsc"),
        ["-p", join(root, `tsconfig.${project}.json`), "--listFilesOnly"],
        {
          cwd,
          env: { ...process.env, PWD: cwd },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const files = new Set(
        result.stdout
          .trim()
          .split(/\r?\n/u)
          .map((path) => realpathSync(path)),
      );
      for (const path of project === "core"
        ? ["src/cli.ts"]
        : ["test/tooling.test.ts", "tsdown.config.ts"]) {
        assert.ok(files.has(realpathSync(join(root, path))), path);
      }
    }
  }
});

await test("independent compiler and type-aware lint reject bad code, accept repaired code", async (t) => {
  assert.ok(existsSync(join(root, "tsconfig.json")), "strict compiler configuration is required");
  const dir = await mkdtemp(join(tmpdir(), "agentlog-canary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(root, "tsconfig.tools.json"),
      references: [{ path: join(root, "tsconfig.core.json") }],
      include: ["probe.ts"],
      compilerOptions: {
        types: [],
        rootDir: dir,
        composite: false,
        incremental: true,
        tsBuildInfoFile: join(dir, "cache.tsbuildinfo"),
      },
    }),
  );
  const probe = join(dir, "probe.ts");
  const tsc = () =>
    spawnSync(join(root, "../../node_modules/.bin/tsc"), ["--noEmit", "-p", dir], {
      cwd: dir,
      encoding: "utf8",
    });
  await writeFile(probe, 'const n: number = "bad"; void n; export {};\n');
  const badTypes = tsc();
  assert.notEqual(badTypes.status, 0);
  assert.match(badTypes.stdout, /not assignable/);
  await writeFile(probe, "const n: number = 1; void n; export {};\n");
  assert.equal(tsc().status, 0);
  const lint = () =>
    spawnSync(
      join(root, "../../node_modules/.bin/oxlint"),
      ["--type-aware", "--deny-warnings", "--config", join(root, ".oxlintrc.json"), probe],
      { cwd: dir, encoding: "utf8" },
    );
  await writeFile(probe, "Promise.resolve(1);\n");
  const badPromise = lint();
  assert.notEqual(badPromise.status, 0);
  assert.match(badPromise.stdout + badPromise.stderr, /no-floating-promises/);
  await writeFile(probe, "void Promise.resolve(1);\n");
  const good = lint();
  assert.equal(good.status, 0, good.stdout + good.stderr);
});
