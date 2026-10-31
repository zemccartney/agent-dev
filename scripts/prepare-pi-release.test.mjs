import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createChangesetFixture, readJson, succeeds } from "./test-helpers/changesets.mjs";

const script = fileURLToPath(new URL("./prepare-pi-release.mjs", import.meta.url));
const piManifest = "pi/pi-lence/package.json";
/** @param {import('node:test').TestContext} t @param {{includeHerdr?: boolean}} [options] */
async function fixture(t, options) {
  assert.ok(existsSync(script), "Missing snapshot-safe preparation implementation");
  return createChangesetFixture(t, options);
}
/** @typedef {Awaited<ReturnType<typeof createChangesetFixture>>} Fixture */
/** @param {Fixture} f @param {string} name @param {Record<string, string>} releases */
async function note(f, name, releases) {
  await writeFile(
    join(f.cwd, `.changeset/${name}.md`),
    `---\n${Object.entries(releases)
      .map(([pkg, type]) => `${JSON.stringify(pkg)}: ${type}`)
      .join("\n")}\n---\n\nRelease fixture summary.\n`,
  );
}
/** @param {Fixture} f */
async function commit(f) {
  succeeds(await f.git("add", "."));
  succeeds(await f.git("commit", "-m", "Synthetic release inputs"));
}
/** @param {Fixture} f @param {string} path @param {Record<string, unknown>} fields */
async function update(f, path, fields) {
  await writeFile(
    join(f.cwd, path),
    `${JSON.stringify({ ...(await readJson(join(f.cwd, path))), ...fields }, null, 2)}\n`,
  );
}
/** Include all fixture-owned files, not borrowed tools or Git's implementation details.
 * @param {string} cwd */
async function files(cwd) {
  /** @type {Record<string, string>} */
  const result = {};
  /** @param {string} relative */
  async function visit(relative) {
    for (const entry of await readdir(join(cwd, relative), { withFileTypes: true })) {
      if ([".git", "node_modules"].includes(entry.name)) continue;
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (!entry.isSymbolicLink()) result[path] = await readFile(join(cwd, path), "utf8");
    }
  }
  await visit("");
  return result;
}
/** @param {Fixture} f */
async function gitState(f) {
  return {
    head: succeeds(await f.git("rev-parse", "HEAD")).trim(),
    refs: succeeds(await f.git("show-ref")),
    status: succeeds(await f.git("status", "--porcelain=v1", "--untracked-files=all")),
  };
}
/** @param {Fixture} f @param {string} mode @param {string} [pathPrefix] */
async function invoke(f, mode, pathPrefix) {
  const result = await f.run(process.execPath, [script, mode], { pathPrefix });
  assert.deepEqual(
    await readdir(join(dirname(f.cwd), "tmp")),
    [],
    "Preparation scratch must be removed on success and failure",
  );
  return result;
}

// Wrong ignores, wrong bump, premature mutation or an accidental commit break these assertions.
for (const scenario of [
  { title: "full workspace", includeHerdr: true, from: "0.0.0", bump: "minor", to: "0.1.0" },
  { title: "Pi-only workspace", includeHerdr: false, from: "0.0.0", bump: "minor", to: "0.1.0" },
  { title: "later patch", includeHerdr: true, from: "1.2.3", bump: "patch", to: "1.2.4" },
]) {
  test(`preparation preserves unrelated intent and versions only Pi: ${scenario.title}`, async (t) => {
    const f = await fixture(t, scenario);
    await update(f, piManifest, { version: scenario.from });
    await note(f, "pi-release", { "@grepco/pi-lence": scenario.bump });
    if (scenario.includeHerdr) await note(f, "herdr-later", { "@grepco/agentlog": "patch" });
    await commit(f);
    const before = await files(f.cwd);
    const state = await gitState(f);
    const want = {
      sourceCommit: state.head,
      targetVersion: scenario.to,
      changesetIds: ["pi-release"],
    };
    assert.deepEqual(JSON.parse(succeeds(await invoke(f, "--check"))), want);
    assert.deepEqual(await files(f.cwd), before, "Inspection is read-only");
    assert.deepEqual(await gitState(f), state);
    assert.deepEqual(JSON.parse(succeeds(await invoke(f, "--apply"))), want);
    const after = await files(f.cwd);
    assert.deepEqual(await readJson(join(f.cwd, piManifest)), {
      ...JSON.parse(before[piManifest]),
      version: scenario.to,
    });
    assert.ok(after["pi/pi-lence/CHANGELOG.md"].includes(`## ${scenario.to}`));
    assert.ok(after["pi/pi-lence/CHANGELOG.md"].includes("Release fixture summary."));
    assert.equal(after[".changeset/pi-release.md"], undefined);
    for (const path of [piManifest, "pi/pi-lence/CHANGELOG.md", ".changeset/pi-release.md"]) {
      delete before[path];
      delete after[path];
    }
    assert.deepEqual(after, before);
    const finalState = await gitState(f);
    assert.equal(finalState.head, state.head);
    assert.equal(finalState.refs, state.refs);
    assert.equal(succeeds(await f.git("diff", "--cached", "--name-only")), "");
    succeeds(
      await f.run("pnpm", ["exec", "oxfmt", "--check", piManifest, "pi/pi-lence/CHANGELOG.md"]),
    );
  });
}

for (const withHerdr of [false, true]) {
  test(`no Pi intent is a read-only no-op: ${withHerdr ? "Herdr-only note" : "empty queue with changed package"}`, async (t) => {
    const f = await fixture(t);
    succeeds(await f.git("checkout", "-b", "release-source"));
    await update(f, piManifest, { description: "A change without a release note" });
    if (withHerdr) await note(f, "herdr-only", { "@grepco/auto-caffeinator": "minor" });
    await commit(f);
    const before = await files(f.cwd);
    const state = await gitState(f);
    for (const mode of ["--check", "--apply"]) {
      assert.deepEqual(JSON.parse(succeeds(await invoke(f, mode))), {
        sourceCommit: state.head,
        targetVersion: null,
        changesetIds: [],
      });
      assert.deepEqual(await files(f.cwd), before);
      assert.deepEqual(await gitState(f), state);
    }
  });
}

test("advancing dev does not change the frozen release source", async (t) => {
  const f = await fixture(t);
  await note(f, "pi-release", { "@grepco/pi-lence": "minor" });
  await commit(f);
  const source = succeeds(await f.git("rev-parse", "HEAD")).trim();
  succeeds(await f.git("branch", "release-source"));
  await writeFile(join(f.cwd, "pi/pi-lence/future-feature.txt"), "Not part of this release\n");
  await commit(f);
  const dev = succeeds(await f.git("rev-parse", "dev"));
  succeeds(await f.git("checkout", "release-source"));
  const result = JSON.parse(succeeds(await invoke(f, "--apply")));
  assert.equal(result.sourceCommit, source);
  assert.equal(result.targetVersion, "0.1.0");
  assert.equal(existsSync(join(f.cwd, "pi/pi-lence/future-feature.txt")), false);
  assert.equal(succeeds(await f.git("rev-parse", "dev")), dev);
});

/** @type {{title: string, change: (f: Fixture) => Promise<unknown>, diagnostic: RegExp, dirty?: boolean}[]} */
const refusals = [
  {
    title: "dirty tracked file",
    change: (f) => update(f, piManifest, { description: "unstaged" }),
    diagnostic: /clean/i,
    dirty: true,
  },
  {
    title: "dirty untracked file",
    change: (f) => writeFile(join(f.cwd, "untracked.txt"), "keep me"),
    diagnostic: /clean/i,
    dirty: true,
  },
  {
    title: "missing Pi",
    change: (f) => rm(join(f.cwd, "pi/pi-lence"), { recursive: true }),
    diagnostic: /Pi-lence.*required/i,
  },
  {
    title: "private Pi",
    change: (f) => update(f, piManifest, { private: true }),
    diagnostic: /Pi-lence.*public/i,
  },
  {
    title: "misidentified Pi",
    change: (f) => update(f, piManifest, { name: "@fixture/wrong" }),
    diagnostic: /identity/i,
  },
  {
    title: "misplaced Pi",
    change: (f) => rename(join(f.cwd, "pi/pi-lence"), join(f.cwd, "pi/wrong")),
    diagnostic: /identity/i,
  },
  {
    title: "public Herdr",
    change: (f) => update(f, "herdr/agentlog/package.json", { private: false }),
    diagnostic: /Herdr.*private/i,
  },
  {
    title: "unknown member",
    change: async (f) => {
      await mkdir(join(f.cwd, "pi/unknown"));
      await writeFile(
        join(f.cwd, "pi/unknown/package.json"),
        '{"name":"@fixture/unknown","version":"1.0.0"}',
      );
    },
    diagnostic: /identity/i,
  },
  {
    title: "mixed note",
    change: (f) => note(f, "mixed", { "@grepco/pi-lence": "minor", "@grepco/agentlog": "patch" }),
    diagnostic: /mixed/i,
  },
  {
    title: "malformed note",
    change: (f) =>
      writeFile(join(f.cwd, ".changeset/pi-release.md"), "---\n[invalid yaml\n---\nbroken\n"),
    diagnostic: /status|parse|changeset/i,
  },
  {
    title: "unknown note package",
    change: (f) => note(f, "unknown", { "@fixture/missing": "patch" }),
    diagnostic: /status|not in the workspace/i,
  },
  {
    title: "wrong initial patch",
    change: (f) => note(f, "pi-release", { "@grepco/pi-lence": "patch" }),
    diagnostic: /0\.1\.0/,
  },
  {
    title: "wrong initial major",
    change: (f) => note(f, "pi-release", { "@grepco/pi-lence": "major" }),
    diagnostic: /0\.1\.0/,
  },
  {
    title: "prerelease state",
    change: (f) => writeFile(join(f.cwd, ".changeset/pre.json"), "{}\n"),
    diagnostic: /prerelease/i,
  },
  {
    title: "automatic commit config",
    change: (f) => update(f, ".changeset/config.json", { commit: true }),
    diagnostic: /configuration/i,
  },
  {
    title: "symlink note",
    change: (f) => symlink("../README.md", join(f.cwd, ".changeset/link.md")),
    diagnostic: /note layout/i,
  },
  {
    title: "nested note",
    change: async (f) => {
      await mkdir(join(f.cwd, ".changeset/nested"));
      await writeFile(join(f.cwd, ".changeset/nested/index.md"), "not supported");
    },
    diagnostic: /note layout/i,
  },
];
for (const scenario of refusals) {
  test(`preparation refuses ${scenario.title} without mutating inputs`, async (t) => {
    const f = await fixture(t);
    await note(f, "pi-release", { "@grepco/pi-lence": "minor" });
    await commit(f);
    await scenario.change(f);
    if (!scenario.dirty) await commit(f);
    const before = await files(f.cwd);
    const state = await gitState(f);
    const result = await invoke(f, "--apply");
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, scenario.diagnostic);
    assert.deepEqual(await files(f.cwd), before);
    assert.deepEqual(await gitState(f), state);
  });
}

/** Owned executable, not a replacement for Changesets. Only the formatter boundary is altered.
 * @param {Fixture} f @param {string} body */
async function pnpmProbe(f, body) {
  const directory = join(dirname(f.cwd), "probe-bin");
  await mkdir(directory);
  const pnpm = succeeds(
    await f.run(process.execPath, [
      "--input-type=module",
      "-e",
      'import {execFileSync} from "node:child_process"; console.log(execFileSync("/bin/sh", ["-c", "command -v pnpm"], {encoding:"utf8"}).trim())',
    ]),
  ).trim();
  const path = join(directory, "pnpm");
  await writeFile(
    path,
    `#!${process.execPath}\nimport {spawnSync} from "node:child_process";\nimport {writeFileSync, readFileSync} from "node:fs";\nconst args=process.argv.slice(2);\n${body}\nconst result=spawnSync(${JSON.stringify(pnpm)},args,{stdio:"inherit"});\nif(result.error) throw result.error;\nprocess.exit(result.status ?? 1);\n`,
  );
  // .mjs semantics for the extensionless executable, isolated outside the workspace.
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  await chmod(path, 0o700);
  return directory;
}

for (const fault of ["formatter failure", "unexpected file", "extra manifest edit"]) {
  test(`failed preparation does not report success or commit: ${fault}`, async (t) => {
    const f = await fixture(t);
    await note(f, "pi-release", { "@grepco/pi-lence": "minor" });
    await commit(f);
    const state = await gitState(f);
    const effect =
      fault === "formatter failure"
        ? 'process.stderr.write("fixture formatter failed\\n"); process.exit(23);'
        : fault === "unexpected file"
          ? 'writeFileSync("unexpected.txt", "must not ship");'
          : 'const p=JSON.parse(readFileSync("pi/pi-lence/package.json","utf8")); p.description="must not ship";writeFileSync("pi/pi-lence/package.json",JSON.stringify(p));';
    const prefix = await pnpmProbe(f, `if(args[0]==="exec" && args[1]==="oxfmt") { ${effect} }`);
    const result = await invoke(f, "--apply", prefix);
    assert.equal(result.code, 1, result.output);
    assert.match(
      result.output,
      fault === "formatter failure" ? /oxfmt.*non-zero status \(23\)/ : /unexpected|manifest/i,
    );
    const after = await gitState(f);
    assert.equal(after.head, state.head);
    assert.equal(after.refs, state.refs);
    assert.equal(succeeds(await f.git("diff", "--cached", "--name-only")), "");
  });
}

test("source HEAD movement during inspection aborts before versioning", async (t) => {
  const f = await fixture(t);
  await note(f, "pi-release", { "@grepco/pi-lence": "minor" });
  await commit(f);
  const before = await files(f.cwd);
  const prefix = await pnpmProbe(
    f,
    'if(args[0]==="list") { const r=spawnSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","--allow-empty","-m","Concurrent source move"],{stdio:"ignore"}); if(r.status!==0) process.exit(24); }',
  );
  const result = await invoke(f, "--apply", prefix);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /source.*changed/i);
  assert.deepEqual(await files(f.cwd), before);
});

test("exported API strips credential/routing variables and prevents implicit repair", async (t) => {
  const f = await fixture(t);
  await note(f, "pi-release", { "@grepco/pi-lence": "minor" });
  await writeFile(
    join(f.cwd, "pnpm-workspace.yaml"),
    (await readFile(join(f.cwd, "pnpm-workspace.yaml"), "utf8")).replace(
      "\nverifyDepsBeforeRun: false\n",
      "\n",
    ),
  );
  await commit(f);
  const repair = await f.run("pnpm", ["exec", "oxfmt", "--check", piManifest]);
  // pnpm12 warns on a failed implicit frozen repair, then still runs the command.
  assert.equal(repair.code, 0, repair.output);
  assert.match(repair.output, /ERR_PNPM_OUTDATED_LOCKFILE/);
  const prefix = await pnpmProbe(
    f,
    'for(const name of ["GITHUB_TOKEN","NPM_TOKEN","NODE_OPTIONS","NODE_TEST_CONTEXT","HK_SKIP_HOOK"]) if(process.env[name]) { process.stderr.write("routing leaked: "+name); process.exit(25); }',
  );
  const code = `Object.assign(process.env,{GIT_DIR:"/not-a-repository",GITHUB_TOKEN:"synthetic-token",NPM_TOKEN:"synthetic-token",NODE_OPTIONS:"--invalid-fixture-option",NODE_TEST_CONTEXT:"synthetic",HK_SKIP_HOOK:"1"}); const api=await import(${JSON.stringify(new URL("./prepare-pi-release.mjs", import.meta.url).href)}); const a=await api.inspectPiRelease(process.cwd()); const b=await api.preparePiRelease(process.cwd()); console.log(JSON.stringify({a,b}));`;
  const result = JSON.parse(
    succeeds(
      await f.run(process.execPath, ["--input-type=module", "-e", code], { pathPrefix: prefix }),
    ),
  );
  assert.equal(result.a.targetVersion, "0.1.0");
  assert.deepEqual(result.b, result.a);
  assert.deepEqual(await readdir(join(dirname(f.cwd), "tmp")), []);
});

test("interrupted preparation terminates its command group and removes private state", async (t) => {
  const f = await fixture(t);
  const before = await files(f.cwd);
  const pidPath = join(dirname(f.cwd), "interrupted.pid");
  const prefix = await pnpmProbe(
    f,
    `if(args[0]==="list") { writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); process.kill(process.ppid, "SIGTERM"); setTimeout(()=>process.exit(42), 2000); await new Promise(()=>{}); }`,
  );
  const result = await invoke(f, "--check", prefix);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /interrupted/i);
  assert.deepEqual(await files(f.cwd), before);
  const pid = Number(await readFile(pidPath, "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("CLI rejects missing, unknown and extra modes without mutation", async (t) => {
  const f = await fixture(t);
  const before = await files(f.cwd);
  for (const args of [[], ["--publish"], ["--apply", "--check"]]) {
    const result = await f.run(process.execPath, [script, ...args]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /usage/i);
    assert.deepEqual(await files(f.cwd), before);
  }
});
