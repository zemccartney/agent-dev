import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { registryFixture, stageFixture } from "./test-helpers/npm-registry.mjs";

test("the locked local npm provides the reviewed native staging command", async () => {
  const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(
    root.devDependencies.npm,
    "11.21.1",
    "A local reviewed staging-capable npm is required",
  );
  const metadata = JSON.parse(
    await readFile(new URL(import.meta.resolve("npm/package.json")), "utf8"),
  );
  assert.equal(metadata.version, "11.21.1");
  const cli = fileURLToPath(new URL("bin/npm-cli.js", import.meta.resolve("npm/package.json")));
  const result = spawnSync(process.execPath, [cli, "stage", "--help"], {
    env: { PATH: process.env.PATH, HOME: "/dev/null", npm_config_update_notifier: "false" },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /stage publish/);
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
  for (const flag of [
    "--ignore-scripts",
    "--fetch-retries=0",
    "--workspaces=false",
    "--access=public",
  ])
    assert.ok(call.args.includes(flag), flag);
  assert.ok(call.env.npm_config_userconfig);
  await assert.rejects(readFile(call.env.npm_config_userconfig), { code: "ENOENT" });
});

test("private npm context preserves the hosted provenance builder identity", async (t) => {
  const { stageTarball } = await import("./pi-release-npm.mjs");
  const { artifact } = await stageFixture(t);
  const registry = await registryFixture(t);
  const source = await readFile(
    new URL(
      "node_modules/libnpmpublish/lib/provenance.js",
      import.meta.resolve("npm/package.json"),
    ),
    "utf8",
  );
  /** @type {any} */
  let payload;
  await stageTarball(
    artifact,
    {
      ...process.env,
      GITHUB_ACTIONS: "true",
      RUNNER_ENVIRONMENT: "github-hosted",
      GITHUB_REPOSITORY: "zemccartney/agent-dev",
      GITHUB_SHA: "a".repeat(40),
    },
    async (cli, args, options) => {
      const module = { exports: /** @type {any} */ ({}) };
      // Execute the pinned provenance builder; replace only the remote signing boundary.
      runInNewContext(source, {
        module,
        Buffer,
        process: { env: options.env },
        require: (/** @type {string} */ name) => {
          if (name === "sigstore")
            return { attest: (/** @type {Buffer} */ bytes) => JSON.parse(bytes.toString()) };
          if (name === "ci-info") return { GITHUB_ACTIONS: true };
          if (name === "node:fs/promises") return {};
          throw new Error(`Unexpected provenance dependency: ${name}`);
        },
      });
      payload = await module.exports.generateProvenance([], {});
      return registry.execute(cli, args, options);
    },
  );
  assert.equal(
    payload.predicate.runDetails.builder.id,
    "https://github.com/actions/runner/github-hosted",
  );
  assert.equal(
    payload.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit,
    "a".repeat(40),
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
