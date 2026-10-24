import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

await test("launcher explains experimental older APIs before importing the application", async (t) => {
  const launcher = fileURLToPath(new URL("../scripts/run.cjs", import.meta.url));
  assert.ok(existsSync(launcher), "version-aware launcher required");
  const dir = await mkdtemp(join(tmpdir(), "agentlog-launch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "scripts"));
  await mkdir(join(dir, "dist"));
  await cp(launcher, join(dir, "scripts/run.cjs"));
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await writeFile(
    join(dir, "dist/cli.js"),
    'console.log("APPLICATION_LOADED", process.argv[2]);\n',
  );
  for (const [version, supported, experimental] of [
    ["22.12.0", false, false],
    ["22.13.0", false, true],
    ["23.3.0", false, false],
    ["23.4.0", false, true],
    ["24.0.0", false, true],
    ["24.14.0", false, true],
    ["24.15.0", true, false],
    ["24.16.0", true, false],
    ["25.0.0", false, true],
    ["25.6.0", false, true],
    ["25.7.0", true, false],
    ["26.0.0", true, false],
  ] as const) {
    // Simulate only version selection, not an actual run on each Node engine.
    await writeFile(
      join(dir, "version.cjs"),
      `Object.defineProperty(process.versions, 'node', {value:${JSON.stringify(version)}});\n`,
    );
    const result = spawnSync(
      process.execPath,
      ["--require", join(dir, "version.cjs"), join(dir, "scripts/run.cjs"), "--help"],
      { cwd: dir, encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: dir } },
    );
    assert.equal(result.status, supported ? 0 : 1, `${version}: ${result.stderr}`);
    if (supported) assert.match(result.stdout, /APPLICATION_LOADED --help/);
    else {
      assert.doesNotMatch(result.stdout, /APPLICATION_LOADED/);
      assert.ok(result.stderr.includes(version));
      assert.match(result.stderr, /24\.15/);
      if (experimental) assert.match(result.stderr, /might work.*experimental.*not supported/is);
    }
  }
});
