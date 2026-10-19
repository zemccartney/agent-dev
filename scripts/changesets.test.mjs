import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createChangesetFixture as fixture,
  readJson as json,
  succeeds,
} from "./test-helpers/changesets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const projects = ["pi/pi-lence", "herdr/agentlog", "herdr/auto-caffeinator"];

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
