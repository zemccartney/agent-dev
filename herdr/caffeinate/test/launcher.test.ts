import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { object } from "#caffeinate/validation";
const root = fileURLToPath(new URL("../", import.meta.url));
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
interface FixtureOptions {
  node?: boolean;
  version?: string;
  platform?: string;
  herdr?: string | null;
  built?: boolean;
}
async function fixture(
  t: TestContext,
  { node = true, version, platform, herdr = "0.9.3", built = true }: FixtureOptions = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "caffeinate launch path-")),
    bin = join(dir, "bin");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(bin);
  const installMarker = join(dir, "unexpected-install");
  for (const command of ["npm", "pnpm", "corepack", "bun", "curl", "wget", "brew"]) {
    await writeFile(
      join(bin, command),
      `#!/bin/sh\nprintf 'unexpected' > ${quote(installMarker)}\nexit 99\n`,
      { mode: 0o755 },
    );
  }
  await mkdir(join(dir, "scripts"));
  await mkdir(join(dir, "dist"));
  await cp(join(root, "scripts", "launch.sh"), join(dir, "scripts", "launch.sh"));
  await cp(join(root, "scripts", "preflight.cjs"), join(dir, "scripts", "preflight.cjs"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  if (node) {
    if (version || platform) {
      const preload = join(dir, "simulate.cjs");
      await writeFile(
        preload,
        (version
          ? `Object.defineProperty(process.versions,'node',{value:${JSON.stringify(version)}});\n`
          : "") +
          (platform
            ? `Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});\n`
            : ""),
      );
      await writeFile(
        join(bin, "node"),
        `#!/bin/sh\nexec ${quote(process.execPath)} --require ${quote(preload)} "$@"\n`,
        { mode: 0o755 },
      );
    } else await symlink(process.execPath, join(bin, "node"));
  }
  if (herdr !== null)
    await writeFile(join(bin, "herdr"), `#!/bin/sh\nprintf '%s\\n' ${quote("herdr " + herdr)}\n`, {
      mode: 0o755,
    });
  const marker = join(dir, "application-loaded");
  if (built)
    await writeFile(
      join(dir, "dist", "main.js"),
      `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'loaded');\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`,
    );
  const env = {
    ...process.env,
    PATH: bin,
    HERDR_BIN_PATH: "",
    HERDR_SOCKET_PATH: "",
    HERDR_PLUGIN_CONFIG_DIR: "",
  };
  const launch = (args: string[] = []) =>
    spawnSync("/bin/sh", [join(dir, "scripts", "launch.sh"), ...args], {
      cwd: tmpdir(),
      env,
      encoding: "utf8",
      timeout: 10000,
    });
  return { dir, bin, env, marker, installMarker, launch };
}

void test("missing Node fails clearly before loading output or installing anything", async (t) => {
  const f = await fixture(t, { node: false });
  const result = f.launch(["monitor"]);
  assert.equal(result.status, 127, result.stderr);
  assert.match(result.stderr, /Node.*24\.0\.0.*PATH/i);
  assert.equal(existsSync(f.marker), false);
  assert.equal(existsSync(f.installMarker), false);
});
void test("unsupported Node versions fail before application parsing; version boundaries are shared by build and runtime", async (t) => {
  for (const version of [
    "18.20.8",
    "22.18.0",
    "23.11.0",
    "24.0.0-pre",
    "invalid",
    "24.0.0",
    "24.16.0",
    "25.0.0",
  ]) {
    const f = await fixture(t, { version });
    const supported = ["24.0.0", "24.16.0", "25.0.0"].includes(version);
    if (!supported)
      await writeFile(
        join(f.dir, "dist", "main.js"),
        "This is deliberately invalid JavaScript and must never be parsed.",
      );
    const result = f.launch(["monitor"]);
    assert.equal(existsSync(f.installMarker), false);
    assert.equal(result.status, supported ? 0 : 1, result.stderr);
    assert.equal(existsSync(f.marker), supported);
    if (!supported) {
      assert.match(result.stderr, /Node.*24\.0\.0/);
      assert.ok(result.stderr.includes(version));
    }
    const build = spawnSync(
      join(f.bin, "node"),
      [join(f.dir, "scripts", "preflight.cjs"), "build"],
      { env: f.env, encoding: "utf8" },
    );
    assert.equal(build.status, supported ? 0 : 1, build.stderr);
  }
});
void test("missing build, unsupported host, and missing or old Herdr fail without loading the application", async (t) => {
  for (const [options, expected] of [
    [{ built: false }, /build.*pnpm build/i],
    [{ platform: "linux" }, /macOS/],
    [{ herdr: null }, /Herdr.*0\.9\.3/],
    [{ herdr: "0.9.2" }, /Herdr.*0\.9\.3.*0\.9\.2/],
  ] satisfies [FixtureOptions, RegExp][]) {
    const f = await fixture(t, options),
      result = f.launch(["monitor"]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, expected);
    assert.equal(existsSync(f.marker), false);
    assert.equal(existsSync(f.installMarker), false);
  }
});
void test("build preflight needs only Node, not macOS, Herdr, a server, or existing output", async (t) => {
  const f = await fixture(t, { platform: "linux", herdr: null, built: false });
  const result = spawnSync(
    join(f.bin, "node"),
    [join(f.dir, "scripts", "preflight.cjs"), "build"],
    { cwd: tmpdir(), env: f.env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(f.marker), false);
});
void test("launcher resolves its location and preserves shell-looking arguments without evaluation", async (t) => {
  const f = await fixture(t);
  const injected = join(f.dir, "injected");
  const args = [
    "popup",
    "two words",
    `$(touch ${quote(injected)})`,
    `; touch ${quote(injected)}`,
    "",
    "a'b",
    "☕",
  ];
  const result = f.launch(args);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
  assert.equal(existsSync(injected), false);
});
void test("built consumer launcher and cached-manifest shim work without source TypeScript or developer dependencies", async (t) => {
  const f = await fixture(t);
  await cp(join(root, "dist"), join(f.dir, "dist"), { recursive: true });
  const result = f.launch(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ensure.*monitor.*controls/s);
  assert.equal(existsSync(join(f.dir, "node_modules")), false);
  assert.equal(existsSync(join(f.dir, "src")), false);
  await mkdir(join(f.dir, "src"));
  await cp(join(root, "src", "main.mjs"), join(f.dir, "src", "main.mjs"));
  const legacy = spawnSync(process.execPath, [join(f.dir, "src", "main.mjs"), "--help"], {
    cwd: tmpdir(),
    env: f.env,
    encoding: "utf8",
  });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.match(legacy.stdout, /ensure.*monitor.*controls/s);
});
void test("package build and all manifest entrypoints use the prerequisite guards", () => {
  const pkg = object(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  assert.equal(object(pkg.engines).node, ">=24.0.0");
  const build = object(pkg.scripts).build;
  assert.ok(typeof build === "string");
  assert.match(build, /node scripts\/preflight\.cjs build && tsdown/);
  const manifest = readFileSync(join(root, "herdr-plugin.toml"), "utf8");
  const commands = [...manifest.matchAll(/^command = (.+)$/gm)].map(
    (match) => JSON.parse(match[1]) as unknown,
  );
  assert.deepEqual(
    commands,
    ["ensure", "controls", "popup"].map((command) => ["/bin/sh", "scripts/launch.sh", command]),
  );
});
