import assert from "node:assert/strict";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
/** @param {string} name @param {string[]} args @param {string} [cwd] */
function tool(name, args, cwd = root) {
  const result = spawnSync(join(root, "node_modules/.bin", name), args, {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, null, `Terminated: ${result.signal}`);
  return { status: result.status, output: result.stdout + result.stderr };
}
/** @param {ReturnType<typeof tool>} result */
function succeeds(result) {
  assert.equal(result.status, 0, result.output);
}
/** @param {string} project @param {string} cwd */
function checkedFiles(project, cwd) {
  const result = tool("tsc", ["-p", project, "--listFilesOnly"], cwd);
  succeeds(result);
  return new Set(
    result.output
      .trim()
      .split(/\r?\n/)
      .map((path) => realpathSync(path)),
  );
}
/** @param {string} cwd */
async function ownedFiles(cwd) {
  /** @type {string[]} */
  const files = [];
  for (const directory of ["src", "scripts", "test"]) {
    if (!existsSync(join(cwd, directory))) continue;
    for (const path of await readdir(join(cwd, directory), { recursive: true })) {
      if (/\.[cm]?[jt]s$/.test(path)) files.push(join(directory, path));
    }
  }
  files.push(...(await readdir(cwd)).filter((path) => /^tsdown.*\.config\.ts$/.test(path)));
  return files.sort();
}

test("shared quality defaults exist and root tooling independently typechecks", () => {
  for (const file of [
    ".oxlintrc.json",
    ".oxfmtrc.json",
    "tsconfig.base.json",
    "tsconfig.tools.json",
  ]) {
    assert.ok(existsSync(join(root, file)), file);
  }
  succeeds(tool("tsc", ["-p", "tsconfig.tools.json"]));
});

for (const relative of ["herdr/auto-caffeinator", "herdr/agentlog", "pi/pi-lence"]) {
  const name = basename(relative);
  const cwd = join(root, relative);
  test(`${name}: effective projects cover owned files without rechecking source as tooling`, async () => {
    assert.ok(existsSync(join(cwd, "tsconfig.core.json")), "separate source project required");
    assert.ok(existsSync(join(cwd, "tsconfig.tools.json")), "separate tooling project required");
    const before = await ownedFiles(cwd);
    succeeds(tool("tsc", ["--build"], cwd));
    const core = checkedFiles("tsconfig.core.json", cwd);
    const tools = checkedFiles("tsconfig.tools.json", cwd);
    const sourceRoot = realpathSync(join(cwd, "src")) + "/";
    assert.equal(
      [...tools].some((path) => path.startsWith(sourceRoot)),
      false,
      "tooling must consume declarations, not source",
    );
    assert.ok(
      [...tools].some(
        (path) => path.includes("/node_modules/.cache/agent-dev/core/") && path.endsWith(".d.ts"),
      ),
      "tooling consumes generated core declarations",
    );
    for (const path of before) {
      const files = path.startsWith("src/") ? core : tools;
      assert.ok(files.has(realpathSync(join(cwd, path))), `Unchecked file: ${path}`);
    }
    assert.deepEqual(await ownedFiles(cwd), before, "no source-adjacent emitted files");
  });

  test(`${name}: real compiler/linter canaries reject bad code and isolate tooling globals`, async (t) => {
    assert.ok(existsSync(join(cwd, "tsconfig.core.json")), "separate source project required");
    const sourceDir = await mkdtemp(join(cwd, "src/quality-canary-"));
    const toolsDir = await mkdtemp(join(cwd, "test/quality-canary-"));
    t.after(async () => {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(toolsDir, { recursive: true, force: true });
      succeeds(tool("tsc", ["--build"], cwd));
    });
    const source = join(sourceDir, "canary.ts");
    const compile = () => tool("tsc", ["--build", "tsconfig.core.json"], cwd);
    await writeFile(source, 'export const value: number = "wrong";\n');
    const bad = compile();
    assert.notEqual(bad.status, 0);
    assert.match(bad.output, /TS2322/);
    await writeFile(source, "export const value: number = 1;\n");
    succeeds(compile());
    const lint = () =>
      tool(
        "oxlint",
        [
          "--type-aware",
          "--deny-warnings",
          "--config",
          join(cwd, ".oxlintrc.json"),
          "--tsconfig",
          join(cwd, "tsconfig.core.json"),
          source,
        ],
        cwd,
      );
    await writeFile(source, "export async function work(): Promise<void> {}\nwork();\n");
    const floating = lint();
    assert.notEqual(floating.status, 0);
    assert.match(floating.output, /no-floating-promises/);
    await writeFile(source, "export async function work(): Promise<void> {}\nawait work();\n");
    succeeds(lint());
    succeeds(compile());
    await writeFile(
      join(toolsDir, "globals.d.ts"),
      "declare global { type AgentDevToolingOnly = number; }\nexport {};\n",
    );
    await writeFile(
      join(toolsDir, "consumer.ts"),
      "export const allowed: AgentDevToolingOnly = 1;\n",
    );
    succeeds(tool("tsc", ["-p", "tsconfig.tools.json"], cwd));
    await writeFile(source, "export const forbidden: AgentDevToolingOnly = 1;\n");
    const leaked = compile();
    assert.notEqual(leaked.status, 0);
    assert.match(leaked.output, /TS2304.*AgentDevToolingOnly/);
    await writeFile(source, "export const allowed: number = 1;\n");
    succeeds(compile());
    succeeds(tool("tsc", ["-p", "tsconfig.tools.json"], cwd));
  });
}
