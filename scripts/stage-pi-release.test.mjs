import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  stageContext,
  stageEvent,
  stageApi,
  sourceFixture,
} from "./test-helpers/pi-release-stage.mjs";
import { registryFixture } from "./test-helpers/npm-registry.mjs";

/** @param {Awaited<ReturnType<typeof sourceFixture>>} fixture */
function options(fixture) {
  const event = stageEvent(fixture.authorization.commit);
  return {
    cwd: fixture.cwd,
    context: stageContext(fixture.authorization.commit),
    event,
    api: stageApi(event).api,
    env: {
      ...process.env,
      RUNNER_TEMP: fixture.root,
      GITHUB_OUTPUT: join(fixture.root, "outputs"),
      GITHUB_STEP_SUMMARY: join(fixture.root, "summary"),
    },
  };
}

test("accepted merge produces a checked bundle and a stage-only receipt through the real CLI", async (t) => {
  const { runStageCommand } = await import("./stage-pi-release.mjs");
  const fixture = await sourceFixture(t);
  const opts = options(fixture);
  const prepared = await runStageCommand("--prepare", fixture.bundle, opts);
  assert.match(prepared.digest, /^[a-f0-9]{64}$/);
  const registry = await registryFixture(t);
  const verified = await runStageCommand("--verify", fixture.bundle, {
    ...opts,
    expectedDigest: prepared.digest,
  });
  assert.equal(verified.digest, prepared.digest);
  const receipt = await runStageCommand("--submit", fixture.bundle, {
    ...opts,
    expectedDigest: prepared.digest,
    execute: registry.execute,
  });
  assert.equal(receipt.stageId, registry.stageId);
  assert.equal(receipt.commit, fixture.authorization.commit);
  const persisted = JSON.parse(await readFile(join(fixture.root, "pi-stage-receipt.json"), "utf8"));
  assert.deepEqual(persisted, receipt);
  const summary = await readFile(opts.env.GITHUB_STEP_SUMMARY, "utf8");
  assert.match(summary, /pending|staged/i);
  assert.match(summary, /not.*published/i);
  assert.match(summary, /2FA/);
  assert.match(summary, new RegExp(receipt.sha256));
  assert.equal(registry.requests.filter((request) => request.method === "POST").length, 1);
});

for (const condition of [
  "wrong context",
  "tampered archive",
  "missing digest",
  "changed API",
  "existing receipt",
]) {
  test(`submission stops before npm for ${condition}`, async (t) => {
    const { runStageCommand } = await import("./stage-pi-release.mjs");
    const fixture = await sourceFixture(t);
    const opts = options(fixture);
    const prepared = await runStageCommand("--prepare", fixture.bundle, opts);
    let expectedDigest = prepared.digest;
    if (condition === "wrong context") opts.context.ref = "refs/heads/dev";
    if (condition === "missing digest") expectedDigest = "";
    if (condition === "tampered archive")
      await writeFile(join(fixture.bundle, prepared.filename), "tampered");
    if (condition === "changed API")
      opts.api = async () => {
        throw new Error("API changed");
      };
    if (condition === "existing receipt")
      await writeFile(join(fixture.root, "pi-stage-receipt.json"), "existing");
    let submitted = false;
    await assert.rejects(
      runStageCommand("--submit", fixture.bundle, {
        ...opts,
        expectedDigest,
        execute: async () => {
          submitted = true;
          throw new Error("must not run");
        },
      }),
    );
    assert.equal(submitted, false);
  });
}

test("failed submission records inspection-first instructions, not an absent or published stage", async (t) => {
  const { runStageCommand } = await import("./stage-pi-release.mjs");
  const fixture = await sourceFixture(t);
  const opts = options(fixture);
  const prepared = await runStageCommand("--prepare", fixture.bundle, opts);
  const registry = await registryFixture(t, { reply: {} });
  await assert.rejects(
    runStageCommand("--submit", fixture.bundle, {
      ...opts,
      expectedDigest: prepared.digest,
      execute: registry.execute,
    }),
    /inspect npm/i,
  );
  const summary = await readFile(opts.env.GITHUB_STEP_SUMMARY, "utf8");
  assert.match(summary, /may.*exist/i);
  assert.match(summary, /inspect npm/i);
  assert.doesNotMatch(summary, /successfully published|no pending stage/i);
});

test("workflow CLI refuses local or unsupported use before network access", () => {
  for (const args of [
    ["--approve", "/tmp/no"],
    ["--submit", "/tmp/no"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("stage-pi-release.mjs", import.meta.url)), ...args],
      { env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage|context/);
    assert.doesNotMatch(result.stderr, /ENOENT|Cannot find module/);
  }
});

test("staging workflow gates accepted main merges and binds a fresh exact-archive handoff", async () => {
  const cli = createRequire(import.meta.resolve("@changesets/cli/bin.js"));
  const { parse } = createRequire(cli.resolve("@changesets/config"))("yaml");
  /** @type {{jobs:Record<string,{steps:any[],[key:string]:any}>,[key:string]:any}} */
  const workflow = parse(
    await readFile(new URL("../.github/workflows/stage-pi-release.yml", import.meta.url), "utf8"),
  );
  assert.deepEqual(workflow.on, { pull_request: { types: ["closed"], branches: ["main"] } });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const { validate, stage } = workflow.jobs;
  assert.match(validate.if, /merged == true/);
  assert.match(validate.if, /changeset-release\/main/);
  assert.match(validate.if, /head.repo.full_name == github.repository/);
  assert.deepEqual(validate.permissions, { contents: "read", "pull-requests": "read" });
  assert.deepEqual(stage.permissions, {
    contents: "read",
    "pull-requests": "read",
    "id-token": "write",
  });
  assert.equal(stage.environment, "npm-staging");
  assert.equal(stage.needs, "validate");
  assert.equal(stage.env.EXPECTED_RECORD_DIGEST, "${{ needs.validate.outputs.digest }}");
  for (const job of [validate, stage]) {
    assert.equal(job["runs-on"], "macos-15");
    const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    assert.equal(checkout.with.ref, "${{ github.sha }}");
    assert.equal(checkout.with["fetch-depth"], 0);
    assert.equal(checkout.with["persist-credentials"], false);
    const mise = job.steps.find((step) => step.uses?.startsWith("jdx/mise-action@"));
    assert.equal(mise.with.cache, false);
    assert.ok(job.steps.some((step) => step.run === "mise run setup"));
    for (const step of job.steps) {
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
      assert.ok(!step.uses?.startsWith("actions/cache"));
      if (step.uses?.startsWith("actions/setup-node@")) {
        assert.equal(step.with["package-manager-cache"], false);
        assert.equal(step.with.cache, undefined);
      }
    }
  }
  assert.ok(validate.steps.some((step) => step.run === "mise run check"));
  for (const id of ["host24", "host22"]) {
    const host = validate.steps.find((step) => step.id === id);
    assert.match(host.run, /--tarball/);
    assert.match(host.run, /--sha256/);
  }
  const upload = validate.steps.find((step) => step.id === "artifact");
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.equal(upload.with.overwrite, false);
  const download = stage.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
  assert.equal(download.with["artifact-ids"], "${{ needs.validate.outputs.artifact-id }}");
  assert.equal(download.with["github-token"], undefined);
  assert.equal(download.with["digest-mismatch"], "error");
  assert.ok(
    validate.steps.findIndex((step) => step.id === "verified") >
      validate.steps.findIndex((step) => step.id === "host22"),
  );
  assert.match(stage.steps.find((step) => step.id === "submit").run, /--submit/);
});
