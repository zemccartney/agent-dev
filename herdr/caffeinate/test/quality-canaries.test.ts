import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function tool(name: "tsc" | "oxlint", args: string[], cwd = root) {
  const result = spawnSync(join(root, "node_modules", ".bin", name), args, {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, null, `Tool terminated: ${result.signal}`);
  return { status: result.status, output: result.stdout + result.stderr };
}

void test("TypeScript covers every owned source, probe, test, fixture and build config", async () => {
  const result = tool("tsc", ["--listFilesOnly"]);
  assert.equal(result.status, 0, result.output);
  const checked = new Set(result.output.trim().split(/\r?\n/));
  for (const directory of ["src", "scripts", "test"]) {
    for (const path of await readdir(join(root, directory), { recursive: true })) {
      if (/\.[cm]?[jt]s$/.test(path))
        assert.ok(
          checked.has(resolve(root, directory, path)),
          `Unchecked file: ${directory}/${path}`,
        );
    }
  }
  for (const path of (await readdir(root)).filter((name) => /^tsdown.*\.config\.ts$/.test(name)))
    assert.ok(checked.has(join(root, path)), `Unchecked build config: ${path}`);
  assert.ok(
    ![...checked].some((path) =>
      ["dist", ".build"].some((directory) => path.startsWith(join(root, directory) + "/")),
    ),
    "Generated output must not enter the source typecheck",
  );
});

void test("real inherited tools reject type errors and floating promises, then accept corrected canaries", async (t) => {
  // Inside the package for dependency resolution, but outside its normal include globs.
  const dir = await mkdtemp(join(root, ".quality-canary-"));
  try {
    const config = join(dir, "tsconfig.json"),
      source = join(dir, "canary.ts");
    await writeFile(
      config,
      JSON.stringify({
        extends: join(root, "tsconfig.json"),
        files: ["canary.ts"],
        include: [],
        exclude: [],
      }),
    );
    const typeArgs = ["--project", config];
    await writeFile(source, 'export const value: number = "wrong";\n');
    const badType = tool("tsc", typeArgs, dir);
    assert.notEqual(badType.status, 0);
    assert.match(badType.output, /TS2322/);
    await writeFile(source, "export const value: number = 1;\n");
    const goodType = tool("tsc", typeArgs, dir);
    assert.equal(goodType.status, 0, goodType.output);
    t.diagnostic("TypeScript assignment canary: TS2322, then clean.");

    const lintArgs = [
      "--type-aware",
      "--deny-warnings",
      "--config",
      join(root, ".oxlintrc.json"),
      "--tsconfig",
      config,
      source,
    ];
    await writeFile(source, "export async function work(): Promise<void> {}\nwork();\n");
    const badPromise = tool("oxlint", lintArgs, dir);
    assert.notEqual(badPromise.status, 0);
    assert.match(badPromise.output, /no-floating-promises/);
    await writeFile(source, "export async function work(): Promise<void> {}\nawait work();\n");
    const goodPromise = tool("oxlint", lintArgs, dir);
    assert.equal(goodPromise.status, 0, goodPromise.output);
    t.diagnostic("Type-aware promise canary: no-floating-promises, then clean.");

    const assertionSetup =
      'import {createAssertions} from "#caffeinate/assertions";\nconst active=await createAssertions().reconcile(new Map<string,number>());\n';
    await writeFile(source, assertionSetup + 'export const invalid: string = active.get("a");\n');
    const badAssertion = tool("tsc", typeArgs, dir);
    assert.notEqual(badAssertion.status, 0, "Assertion result must not leak an inferred any");
    assert.match(badAssertion.output, /TS2322/);
    await writeFile(
      source,
      assertionSetup + 'export const deadline: number | undefined = active.get("a")?.deadlineAt;\n',
    );
    const goodAssertion = tool("tsc", typeArgs, dir);
    assert.equal(goodAssertion.status, 0, goodAssertion.output);
    t.diagnostic("Assertion return-type canary: TS2322, then clean.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
