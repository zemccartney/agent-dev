import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixtureEnvironment } from "./test-helpers/environment.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const projects = ["pi/pi-lence", "herdr/agentlog", "herdr/auto-caffeinator"];
/** @param {string} path */
async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

// Losing these settings can couple versions, skip private projects, or auto-commit.
test("root Changesets configuration preserves manual independent release preparation", async () => {
  const manifest = await json(join(root, "package.json"));
  assert.equal(manifest.devDependencies["@changesets/cli"], "3.0.3");
  assert.equal(manifest.packageManager, "pnpm@11.26.0");
  assert.equal(manifest.engines.node, "24.16.0");
  assert.deepEqual(await json(join(root, ".changeset/config.json")), {
    changelog: "@changesets/cli/changelog",
    commit: false,
    fixed: [],
    linked: [],
    access: "public",
    baseBranch: "dev",
    format: "oxfmt",
    privatePackages: { version: true, tag: false },
    updateInternalDependencies: "patch",
    ignore: [],
  });
  for (const name of ["format:root", "format:check:root"])
    assert.ok(manifest.scripts[name].split(/\s+/).includes(".changeset"), name);
  for (const name of [
    "prepublish",
    "prepublishOnly",
    "publish",
    "postpublish",
    "preversion",
    "version",
    "postversion",
  ])
    assert.equal(manifest.scripts[name], undefined, `No implicit ${name} hook`);
  for (const project of projects.slice(1))
    assert.equal((await json(join(root, project, "package.json"))).private, true);
});

/** Capture real inputs, including any owner-authored notes, without requiring one. */
async function primaryInputs() {
  const paths = [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ...projects.map((p) => `${p}/package.json`),
  ];
  for (const name of (await readdir(join(root, ".changeset"))).sort())
    paths.push(`.changeset/${name}`);
  return Promise.all(paths.map(async (p) => [p, await readFile(join(root, p), "utf8")]));
}

/** @param {import("node:test").TestContext} t */
async function fixture(t) {
  assert.ok(existsSync(join(root, ".changeset/config.json")), "Changesets configuration required");
  const before = await primaryInputs();
  const temporary = await mkdtemp(join(tmpdir(), "agent-dev changesets-"));
  const cwd = join(temporary, "workspace");
  /** @type {Set<() => void>} */
  const stop = new Set();
  /** @type {Set<Promise<unknown>>} */
  const pending = new Set();
  t.after(async () => {
    try {
      for (const terminate of stop) terminate();
      await Promise.allSettled(pending);
    } finally {
      await rm(temporary, { recursive: true, force: true });
      assert.equal(existsSync(temporary), false);
      assert.deepEqual(await primaryInputs(), before, "Fixture must not change primary inputs");
    }
  });
  for (const p of [
    "home",
    "tmp",
    "cache",
    "config",
    "data",
    "hooks",
    "workspace/.changeset",
    "workspace/.github",
    "workspace/scripts",
    ...projects.map((p) => `workspace/${p}`),
  ])
    await mkdir(join(temporary, p), { recursive: true });
  for (const name of ["user.npmrc", "global.npmrc"]) await writeFile(join(temporary, name), "");
  const env = fixtureEnvironment(cwd, {
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    HOME: join(temporary, "home"),
    TMPDIR: join(temporary, "tmp"),
    XDG_CONFIG_HOME: join(temporary, "config"),
    XDG_CACHE_HOME: join(temporary, "cache"),
    XDG_DATA_HOME: join(temporary, "data"),
    npm_config_userconfig: join(temporary, "user.npmrc"),
    npm_config_globalconfig: join(temporary, "global.npmrc"),
    npm_config_cache: join(temporary, "cache"),
    npm_config_offline: "true",
    npm_config_update_notifier: "false",
    CI: "true",
  });
  assert.deepEqual(
    Object.keys(env).sort(),
    [
      "PATH",
      "HOME",
      "TMPDIR",
      "XDG_CONFIG_HOME",
      "XDG_CACHE_HOME",
      "XDG_DATA_HOME",
      "npm_config_userconfig",
      "npm_config_globalconfig",
      "npm_config_cache",
      "npm_config_offline",
      "npm_config_update_notifier",
      "CI",
      "PWD",
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_NOSYSTEM",
    ].sort(),
  );

  /** @param {string} command @param {string[]} args */
  function run(command, args) {
    /** @type {Promise<{code: number | null, output: string}>} */
    const result = new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      let timedOut = false;
      /** @param {NodeJS.Signals} signal */
      const kill = (signal) => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ESRCH") throw error;
        }
      };
      const terminate = () => kill("SIGKILL");
      stop.add(terminate);
      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, 30_000);
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        stop.delete(terminate);
        if (timedOut) reject(new Error(`Timed out: ${command}\n${output}`));
        else resolve({ code, output });
      });
    });
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      () => pending.delete(result),
    );
    return result;
  }
  /** @param {string[]} args */
  const git = (...args) => run("git", args);
  const metadata = await json(join(root, "package.json"));
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "@fixture/changesets",
      version: "0.0.0",
      private: true,
      packageManager: metadata.packageManager,
      scripts: {
        "format:root": metadata.scripts["format:root"],
        "format:check:root": metadata.scripts["format:check:root"],
      },
    }),
  );
  for (const path of [
    ".changeset/config.json",
    ".oxfmtrc.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
  ])
    await copyFile(join(root, path), join(cwd, path));
  // These deliberately minimal fixtures borrow installed tools, not installation state.
  // pnpm 11 otherwise tries to repair dependencies before run/exec; never install here.
  await writeFile(
    join(cwd, "pnpm-workspace.yaml"),
    `${await readFile(join(root, "pnpm-workspace.yaml"), "utf8")}\nverifyDepsBeforeRun: false\n`,
  );
  for (const name of ["README.md", "DEVELOPMENT.md"])
    await writeFile(join(cwd, name), "# Fixture\n");
  await writeFile(join(cwd, ".github/fixture.yml"), "name: Fixture\n");
  await writeFile(join(cwd, "scripts/fixture.mjs"), "export {};\n");
  await writeFile(join(cwd, ".gitignore"), "node_modules/\n");
  for (const [index, project] of projects.entries()) {
    const original = await json(join(root, project, "package.json"));
    await writeFile(
      join(cwd, project, "package.json"),
      JSON.stringify({
        name: original.name,
        version: ["0.0.0", "2.3.4", "4.5.6"][index],
        private: original.private === true,
      }),
    );
  }
  await symlink(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  succeeds(await run("pnpm", ["run", "format:root"]));
  succeeds(await run("pnpm", ["exec", "oxfmt", ...projects.map((p) => `${p}/package.json`)]));
  succeeds(await git("init", "-b", "dev"));
  for (const [key, value] of Object.entries({
    "user.name": "Changesets fixture",
    "user.email": "fixture@example.invalid",
    "commit.gpgsign": "false",
    "core.hooksPath": join(temporary, "hooks"),
  }))
    succeeds(await git("config", "--local", key, value));
  succeeds(await git("add", "."));
  succeeds(await git("commit", "-m", "Fixture baseline"));
  const cliPath = fileURLToPath(import.meta.resolve("@changesets/cli/bin.js"));
  /** @param {string[]} args */
  const cli = (...args) => run(process.execPath, [cliPath, ...args]);
  /** @param {string[]} paths */
  const contents = (paths) => Promise.all(paths.map((p) => readFile(join(cwd, p), "utf8")));
  return { cwd, run, git, cli, contents };
}

/** @param {{code: number | null, output: string}} result */
function succeeds(result) {
  assert.equal(result.code, 0, result.output);
  return result.output;
}

// A broken privatePackages setting, shared-version group, or commit option changes these results.
for (const scenario of [
  {
    title: "initial minor note proposes and versions only Pi-lence to 0.1.0",
    index: 0,
    bump: "minor",
    oldVersion: "0.0.0",
    newVersion: "0.1.0",
  },
  {
    title: "private Herdr note versions independently without changing npm visibility",
    index: 1,
    bump: "patch",
    oldVersion: "2.3.4",
    newVersion: "2.3.5",
  },
]) {
  test(scenario.title, async (t) => {
    const f = await fixture(t);
    const project = projects[scenario.index];
    const name = (await json(join(f.cwd, project, "package.json"))).name;
    const unchanged = [
      "pnpm-lock.yaml",
      ...projects.filter((p) => p !== project).map((p) => `${p}/package.json`),
    ];
    const before = await f.contents(unchanged);
    const head = succeeds(await f.git("rev-parse", "HEAD"));
    succeeds(await f.cli("add", `--${scenario.bump}`, name, "--message", "Initial release."));
    const notes = (await readdir(join(f.cwd, ".changeset"))).filter((p) => p.endsWith(".md"));
    assert.equal(notes.length, 1);
    const note = `.changeset/${notes[0]}`;
    succeeds(await f.run("pnpm", ["exec", "oxfmt", "--check", note]));
    assert.equal(succeeds(await f.git("rev-parse", "HEAD")), head, "add must not commit");
    const statusPath = join(f.cwd, "status.json");
    succeeds(await f.cli("status", "--output", statusPath));
    const status = await json(statusPath);
    assert.deepEqual(
      status.releases.map(
        (
          /** @type {{name: string, type: string, oldVersion: string, newVersion: string}} */ r,
        ) => ({ name: r.name, type: r.type, oldVersion: r.oldVersion, newVersion: r.newVersion }),
      ),
      [
        {
          name,
          type: scenario.bump,
          oldVersion: scenario.oldVersion,
          newVersion: scenario.newVersion,
        },
      ],
    );
    await rm(statusPath);
    succeeds(await f.cli("version"));
    const changed = await json(join(f.cwd, project, "package.json"));
    assert.equal(changed.version, scenario.newVersion);
    assert.equal(changed.private, scenario.index !== 0);
    const changelog = await readFile(join(f.cwd, project, "CHANGELOG.md"), "utf8");
    assert.ok(changelog.includes(`## ${scenario.newVersion}`));
    assert.ok(changelog.includes("Initial release."));
    assert.equal(existsSync(join(f.cwd, note)), false);
    assert.deepEqual(await f.contents(unchanged), before);
    assert.equal(succeeds(await f.git("rev-parse", "HEAD")), head, "version must not commit");
    assert.equal(succeeds(await f.git("tag", "--list")), "");
    assert.equal(succeeds(await f.git("remote")), "");
    succeeds(
      await f.run("pnpm", [
        "exec",
        "oxfmt",
        "--check",
        `${project}/package.json`,
        `${project}/CHANGELOG.md`,
      ]),
    );
  });
}

test("version without pending notes refuses without mutation", async (t) => {
  const f = await fixture(t);
  const head = succeeds(await f.git("rev-parse", "HEAD"));
  const result = await f.cli("version");
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /No unreleased changesets found/);
  assert.equal(succeeds(await f.git("status", "--porcelain", "--untracked-files=all")), "");
  assert.equal(succeeds(await f.git("rev-parse", "HEAD")), head);
  assert.equal(succeeds(await f.git("tag", "--list")), "");
  succeeds(await f.run("pnpm", ["run", "format:check:root"]));
});

test("root formatting checks reject and fix misformatted Changesets configuration and notes", async (t) => {
  const f = await fixture(t);
  await writeFile(
    join(f.cwd, ".changeset/config.json"),
    JSON.stringify(await json(join(f.cwd, ".changeset/config.json"))),
  );
  await writeFile(
    join(f.cwd, ".changeset/format-canary.md"),
    '---\n"@grepco/pi-lence": minor\n---\n\n#   Initial release\n',
  );
  const bad = await f.run("pnpm", ["run", "format:check:root"]);
  assert.notEqual(bad.code, 0, bad.output);
  assert.match(bad.output, /\.changeset\/config\.json/);
  assert.match(bad.output, /\.changeset\/format-canary\.md/);
  succeeds(await f.run("pnpm", ["run", "format:root"]));
  succeeds(await f.run("pnpm", ["run", "format:check:root"]));
});
