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
function effective(tool: string, args: string[]): Record<string, unknown> {
  const result = spawnSync("pnpm", ["exec", tool, ...args], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
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
    saveExact: "true",
    autoInstallPeers: "false",
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
  assert.deepEqual(JSON.parse(r.stdout), {
    "@google/genai@2.21.0": false,
    "protobufjs@7.6.6": false,
  });
});
void test("linting retains built-in plugins and type awareness; TypeScript runs independently", () => {
  const lint = effective("oxlint", ["--print-config"]);
  assert.deepEqual((lint.plugins as string[]).sort(), [
    "import",
    "node",
    "oxc",
    "typescript",
    "unicorn",
  ]);
  assert.equal((lint.rules as Record<string, string>)["constructor-super"], "deny");
  assert.equal((lint.options as { typeAware: boolean }).typeAware, true);
  const ts = effective("tsc", ["--showConfig", "-p", "tsconfig.core.json"])
    .compilerOptions as Record<string, unknown>;
  assert.equal(ts.strict, true);
  assert.equal(ts.emitDeclarationOnly, true);
  assert.match(String(ts.outDir), /node_modules\/\.cache\/agent-dev\/core/);
  assert.equal(ts.module, "esnext");
  assert.equal(ts.moduleResolution, "bundler");
  const tools = effective("tsc", ["--showConfig", "-p", "tsconfig.tools.json"])
    .compilerOptions as Record<string, unknown>;
  assert.equal(tools.noEmit, true);
  assert.equal(tools.disableSourceOfProjectReferenceRedirect, true);
  const pkg = config("package.json");
  assert.deepEqual(pkg.devEngines, {
    runtime: { name: "node", version: "24.16.0", onFail: "error" },
  });
  assert.equal((pkg.devDependencies as Record<string, string>)["@types/node"], "24.19.1");
  const installedTypes = config("node_modules/@types/node/package.json");
  assert.equal(installedTypes.version, "24.19.1");
  const runtime = pkg.dependencies as Record<string, string>;
  assert.deepEqual(Object.keys(runtime), ["@earendil-works/pi-tui"]);
  assert.match(runtime["@earendil-works/pi-tui"], /^\d+\.\d+\.\d+$/);
  assert.match((pkg.scripts as Record<string, string>).typecheck, /\btsc\b.*--build/);
});
