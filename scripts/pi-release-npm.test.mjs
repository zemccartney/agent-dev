import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { registryFixture, stageFixture } from "./test-helpers/npm-registry.mjs";

test("the mise-selected pnpm provides native staging without a second npm dependency", async () => {
  const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(root.devDependencies.npm, undefined);
  assert.equal(root.packageManager, "pnpm@12.15.0");
  const { resolvePnpm } = await import("./pi-release-npm.mjs");
  const cli = await resolvePnpm();
  assert.ok(cli.startsWith("/"));
  const result = spawnSync(cli, ["stage", "--help"], {
    env: { PATH: "/usr/bin:/bin", HOME: "/dev/null" },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Stage packages/);
});

test("registry fixtures ignore unrelated concurrent source canaries", async (t) => {
  const fixture = await stageFixture(t);
  const source = `${fixture.root}/producer/pi/pi-lence`;
  await mkdir(`${source}/src/quality-canary-test`);
  await writeFile(`${source}/src/quality-canary-test/canary.ts`, "untracked canary");
  // The source fixture has a regular reviewed inventory plus an unrelated quality-test directory.
  const copy = await stageFixture(t, source);
  assert.equal(copy.artifact.version, "0.1.0");
});

test("native staging submits the canonical archive unchanged and returns its receipt", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const fixture = await stageFixture(t);
  const registry = await registryFixture(t);
  const receipt = await stageTarball(fixture.artifact, process.env, registry.execute);
  assert.deepEqual(receipt, {
    stageId: registry.stageId,
    name: "@grepco/pi-lence",
    version: "0.1.0",
    integrity: fixture.artifact.integrity,
  });
  const posts = registry.requests.filter((request) => request.method !== "GET");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "/-/stage/package/@grepco%2fpi-lence");
  const attachment = posts[0].body._attachments["@grepco/pi-lence-0.1.0.tgz"];
  assert.deepEqual(Buffer.from(attachment.data, "base64"), fixture.bytes);
  assert.equal(posts[0].body.versions["0.1.0"].dist.integrity, fixture.artifact.integrity);
  assert.deepEqual(posts[0].body["dist-tags"], { latest: "0.1.0" });
  assert.deepEqual(await readFile(fixture.artifact.tarballPath), fixture.bytes);
});

test("staging strips credentials and routing, disables scripts and retries, and cleans private state", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const { artifact } = await stageFixture(t);
  const registry = await registryFixture(t);
  await stageTarball(
    artifact,
    {
      ...process.env,
      NPM_TOKEN: "outer-secret",
      NODE_AUTH_TOKEN: "outer-secret",
      NPM_ID_TOKEN: "outer-secret",
      NODE_OPTIONS: "--invalid-option",
      npm_config_registry: "https://invalid.example/",
      npm_config_force: "true",
      npm_config_provenance_file: "/outer-proof",
      GITHUB_TOKEN: "outer-gh",
    },
    registry.execute,
  );
  assert.equal(registry.calls.length, 1);
  const call = registry.calls[0];
  for (const key of [
    "NPM_TOKEN",
    "NODE_AUTH_TOKEN",
    "NPM_ID_TOKEN",
    "NODE_OPTIONS",
    "npm_config_registry",
    "npm_config_force",
    "npm_config_provenance_file",
    "GITHUB_TOKEN",
  ])
    assert.equal(call.env[key], undefined, key);
  assert.deepEqual(call.args.slice(0, 2), ["stage", "publish"]);
  assert.ok(call.args[2].startsWith(`${call.cwd}/`), "npm reads a private verified copy");
  for (const flag of ["--ignore-scripts", "--no-git-checks", "--access=public"])
    assert.ok(call.args.includes(flag), flag);
  assert.ok(call.env.npm_config_userconfig);
  await assert.rejects(readFile(call.env.npm_config_userconfig), { code: "ENOENT" });
});

test("private pnpm context preserves the hosted provenance identity and effective retry policy", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const { artifact } = await stageFixture(t);
  const registry = await registryFixture(t);
  await stageTarball(
    artifact,
    {
      ...process.env,
      GITHUB_ACTIONS: "true",
      RUNNER_ENVIRONMENT: "github-hosted",
      GITHUB_REPOSITORY: "zemccartney/agent-dev",
      GITHUB_SHA: "a".repeat(40),
      PNPM_CONFIG_FETCH_RETRIES: "10",
      PNPM_CONFIG_REGISTRY: "https://invalid.example",
      PNPM_HOME: "/untrusted",
      XDG_CONFIG_HOME: "/untrusted",
    },
    async (cli, args, options) => {
      // These are the actual env inputs consumed by pnpm12's native SLSA builder.
      // Signing remains a separately authorized live check, not a mocked success.
      assert.equal(options.env.RUNNER_ENVIRONMENT, "github-hosted");
      assert.equal(options.env.GITHUB_SHA, "a".repeat(40));
      assert.equal(options.env.GITHUB_REPOSITORY, "zemccartney/agent-dev");
      assert.equal(options.env.PNPM_CONFIG_REGISTRY, undefined);
      assert.equal(options.env.PNPM_CONFIG_FETCH_RETRIES, undefined);
      assert.ok(options.env.XDG_CONFIG_HOME?.startsWith(options.cwd));
      assert.ok(options.env.PNPM_HOME?.startsWith(options.cwd));
      for (const [setting, expected] of [
        ["fetchRetries", "0"],
        ["fetchTimeout", "30000"],
      ]) {
        const result = spawnSync(cli, ["config", "get", setting], { ...options, encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), expected);
      }
      return registry.execute(cli, args, options);
    },
  );
});

/** @type {Array<[string, {status?:number,reply?:unknown,hang?:boolean}]>} */
const failures = [
  ["duplicate version", { status: 409, reply: { error: "Version already staged" } }],
  ["registry failure", { status: 500, reply: { error: "Uncertain outcome" } }],
  ["missing receipt", { reply: {} }],
  ["invalid receipt", { reply: { stageId: "../untrusted" } }],
  ["lost response", { hang: true }],
];
for (const [name, behavior] of failures) {
  test(`${name} stops for owner inspection without resubmitting`, async (t) => {
    const { stageTarball } = await import("./pi-release-npm.mjs");
    const { artifact } = await stageFixture(t);
    const registry = await registryFixture(t, behavior);
    await assert.rejects(
      stageTarball(artifact, process.env, registry.execute),
      /inspect npm.*retry/i,
    );
    assert.equal(registry.requests.filter((request) => request.method === "POST").length, 1);
    assert.equal(registry.calls.length, 1);
    const config = registry.calls[0].env.npm_config_userconfig;
    assert.ok(config);
    await assert.rejects(readFile(config), { code: "ENOENT" });
  });
}

test("changing the caller archive after validation cannot change submitted bytes", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const fixture = await stageFixture(t);
  const registry = await registryFixture(t);
  await stageTarball(fixture.artifact, process.env, async (...args) => {
    await writeFile(fixture.artifact.tarballPath, "changed after validation");
    return registry.execute(...args);
  });
  const post = registry.requests.find((request) => request.method === "POST");
  assert.ok(post);
  assert.deepEqual(
    Buffer.from(post.body._attachments["@grepco/pi-lence-0.1.0.tgz"].data, "base64"),
    fixture.bytes,
  );
});

test("npm cannot inherit project configuration from a temporary-directory ancestor", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const fixture = await stageFixture(t);
  const registry = await registryFixture(t);
  await writeFile(`${fixture.root}/package.json`, '{"name":"hostile-parent","private":true}');
  await writeFile(
    `${fixture.root}/.npmrc`,
    "tag=unreviewed-tag\n//registry.npmjs.org/:_authToken=outer-secret\n",
  );
  await writeFile(
    `${fixture.root}/pnpm-workspace.yaml`,
    "packages: []\ntag: unreviewed-workspace-tag\nregistry: https://invalid.example\nfetchRetries: 10\n",
  );
  await writeFile(
    `${fixture.root}/.pnpmfile.cjs`,
    'throw new Error("ancestor hook must not run");\n',
  );
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = fixture.root;
  try {
    await stageTarball(fixture.artifact, process.env, registry.execute);
    const post = registry.requests.find((request) => request.method === "POST");
    assert.ok(post);
    assert.deepEqual(post.body["dist-tags"], { latest: "0.1.0" });
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
});

test("explicit provenance fails closed in the real CLI without a supported signing context", async (t) => {
  const { stageTarball, executePnpm } = await import("./pi-release-npm.mjs");
  const { artifact } = await stageFixture(t);
  const registry = await registryFixture(t);
  let signingRefused = false;
  await assert.rejects(
    stageTarball(artifact, {}, async (cli, args, options) => {
      assert.ok(options.env.npm_config_userconfig);
      await writeFile(
        options.env.npm_config_userconfig,
        `//${new URL(registry.registry).host}/:_authToken=fixture-only\n`,
      );
      try {
        return await executePnpm(
          cli,
          args.map((arg) =>
            arg.startsWith("--registry=") ? `--registry=${registry.registry}` : arg,
          ),
          options,
        );
      } catch (error) {
        signingRefused = /ERR_PNPM_PROVENANCE_UNSUPPORTED_PROVIDER/.test(
          String(/** @type {any} */ (error).stderr),
        );
        throw error;
      }
    }),
    /Inspect npm/,
  );
  assert.equal(signingRefused, true);
  assert.equal(registry.requests.filter((r) => r.method === "POST").length, 0);
});

test("PATH pnpm and npm shims cannot replace the selected staging client", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const { artifact, root } = await stageFixture(t);
  const registry = await registryFixture(t);
  for (const bin of ["pnpm", "npm"]) {
    await writeFile(`${root}/${bin}`, "#!/bin/sh\nexit 93\n");
    await chmod(`${root}/${bin}`, 0o700);
  }
  const previous = process.env.PATH;
  process.env.PATH = `${root}:${previous}`;
  try {
    const receipt = await stageTarball(artifact, process.env, registry.execute);
    assert.equal(receipt.stageId, registry.stageId);
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
});

test("a wrong mise-selected pnpm version is refused before submission", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const { artifact, root } = await stageFixture(t);
  await writeFile(`${root}/wrong-pnpm`, "#!/bin/sh\nprintf '11.26.0\\n'\n");
  await writeFile(`${root}/mise`, `#!/bin/sh\nprintf '%s\\n' '${root}/wrong-pnpm'\n`);
  await chmod(`${root}/wrong-pnpm`, 0o700);
  await chmod(`${root}/mise`, 0o700);
  const previous = process.env.PATH;
  process.env.PATH = `${root}:${previous}`;
  let submitted = false;
  try {
    await assert.rejects(
      stageTarball(artifact, process.env, async () => {
        submitted = true;
        throw new Error("must not submit");
      }),
      /Reviewed pnpm12\.15\.0/,
    );
    assert.equal(submitted, false);
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
});

test("archive changed since verification is refused before invoking npm", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const { artifact } = await stageFixture(t);
  let called = false;
  await assert.rejects(
    stageTarball({ ...artifact, integrity: "sha512-wrong" }, process.env, async () => {
      called = true;
      throw new Error("must not run");
    }),
    /integrity/i,
  );
  assert.equal(called, false);
});
