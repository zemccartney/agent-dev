import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
function config(name: string): Record<string, unknown> {
  const path = new URL("../" + name, import.meta.url);
  assert.ok(existsSync(path), `Missing ${name}`);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}
void test("effective pnpm policy fails closed on fresh, undated, exotic, downgraded or unreviewed dependencies", () => {
  for (const [key, want] of Object.entries({
    engineStrict: "true",
    minimumReleaseAge: "10080",
    minimumReleaseAgeStrict: "true",
    minimumReleaseAgeIgnoreMissingTime: "false",
    blockExoticSubdeps: "true",
    trustPolicy: "no-downgrade",
    trustLockfile: "false",
    strictDepBuilds: "true",
  })) {
    const r = spawnSync("pnpm", ["config", "get", key], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), want, key);
  }
  const r = spawnSync("pnpm", ["config", "get", "allowBuilds", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {});
});
void test("linting retains built-in plugins and type awareness; TypeScript runs independently", () => {
  const lint = config(".oxlintrc.json");
  assert.deepEqual(lint.plugins, ["eslint", "typescript", "unicorn", "oxc", "import", "node"]);
  assert.equal((lint.options as { typeAware: boolean }).typeAware, true);
  const ts = config("tsconfig.json").compilerOptions as Record<string, unknown>;
  assert.equal(ts.strict, true);
  assert.equal(ts.noEmit, true);
  assert.equal(ts.module, "ESNext");
  assert.equal(ts.moduleResolution, "Bundler");
  assert.equal(config("tsconfig.json").references, undefined);
  const pkg = config("package.json");
  assert.deepEqual(pkg.devEngines, {
    runtime: { name: "node", version: "^24.11.0", onFail: "error" },
  });
  assert.equal((pkg.devDependencies as Record<string, string>)["@types/node"], "24.19.1");
  const lock = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");
  assert.deepEqual(
    [...new Set([...lock.matchAll(/@types\/node@(\d+\.\d+\.\d+)/g)].map((match) => match[1]))],
    ["24.19.1"],
  );
  const runtime = pkg.dependencies as Record<string, string>;
  assert.deepEqual(Object.keys(runtime), ["@earendil-works/pi-tui"]);
  assert.match(runtime["@earendil-works/pi-tui"], /^\d+\.\d+\.\d+$/);
  assert.match((pkg.scripts as Record<string, string>).typecheck, /\btsc\b.*--noEmit/);
});
