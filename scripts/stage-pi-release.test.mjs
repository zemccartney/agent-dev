import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  stageContext,
  stageEvent,
  stagePullRequest,
  stageApi,
  sourceFixture,
} from "./test-helpers/pi-release-stage.mjs";
import { registryFixture } from "./test-helpers/npm-registry.mjs";
import { candidateGit } from "./pi-release-candidate.mjs";
import { recoveryEvent } from "./test-helpers/pi-release-stage.mjs";

/** @param {Awaited<ReturnType<typeof sourceFixture>>} fixture */
function options(fixture) {
  const event = stageEvent(fixture.authorization.commit);
  return {
    cwd: fixture.cwd,
    context: stageContext(fixture.authorization.commit),
    event,
    api: stageApi(stagePullRequest(fixture.authorization.commit)).api,
    registryFetch: async () => Response.json({ name: "@grepco/pi-lence", versions: {} }),
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
  let publicChecks = 0;
  opts.registryFetch = async () => {
    publicChecks++;
    return Response.json({ name: "@grepco/pi-lence", versions: {} });
  };
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
  assert.equal(publicChecks, 3, "prepare, verify and submit each consult current public state");
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
  for (const args of [["--approve", "/tmp/no"], ["--submit", "/tmp/no"], ["--select"]]) {
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

test("selection CLI validates clean source/version and public state without installed dependencies", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-select-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL("./", import.meta.url), join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "pi/pi-lence/scripts"), { recursive: true });
  await cp(
    new URL("../pi/pi-lence/scripts/pack.mjs", import.meta.url),
    join(root, "pi/pi-lence/scripts/pack.mjs"),
  );
  await writeFile(join(root, "package.json"), '{"type":"module","private":true}\n');
  await writeFile(
    join(root, "pi/pi-lence/package.json"),
    '{"name":"@grepco/pi-lence","version":"0.1.0"}\n',
  );
  candidateGit(root, "init", "-b", "main");
  candidateGit(root, "config", "user.name", "Fixture");
  candidateGit(root, "config", "user.email", "fixture@example.invalid");
  candidateGit(root, "config", "commit.gpgsign", "false");
  candidateGit(root, "add", ".");
  candidateGit(root, "commit", "-m", "main source");
  candidateGit(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  const state = join(root, ".git", "cli-state");
  await mkdir(state);
  const preload = join(state, "http-fixture.mjs");
  await writeFile(
    preload,
    `import { readFileSync } from "node:fs";
const responses = JSON.parse(readFileSync(process.env.FIXTURE_RESPONSES, "utf8"));
globalThis.fetch = async (url, options) => {
  if (options.method !== "GET" || !Object.hasOwn(responses, url)) throw Error("Unexpected fixture HTTP");
  const reply = responses[url];
  return new Response(JSON.stringify(reply.body), { status: reply.status });
};
`,
  );
  const sha = candidateGit(root, "rev-parse", "HEAD").trim();
  for (const kind of [
    "release",
    "manual",
    "docs",
    "API error",
    "published",
    "registry error",
    "wrong version",
  ]) {
    const context = stageContext(sha);
    const manual = ["manual", "wrong version"].includes(kind);
    if (manual) context.eventName = "workflow_dispatch";
    const eventFile = join(state, `${kind}.event.json`);
    await writeFile(
      eventFile,
      JSON.stringify(
        manual ? recoveryEvent(kind === "wrong version" ? "1.0.0" : "0.1.0") : stageEvent(sha),
      ),
    );
    const pr = stagePullRequest(sha);
    if (kind === "docs") pr.head.ref = "docs/maintenance";
    const prefix = "https://api.github.com/repos/zemccartney/agent-dev";
    const responses = {
      [prefix]: {
        status: 200,
        body: { full_name: "zemccartney/agent-dev", default_branch: "main", fork: false },
      },
      [`${prefix}/commits/${context.sha}/pulls?per_page=100&page=1`]: {
        status: kind === "API error" ? 503 : 200,
        body: [pr],
      },
      [`${prefix}/pulls/6`]: { status: 200, body: pr },
      [`${prefix}/collaborators/owner/permission`]: { status: 200, body: { permission: "admin" } },
      // A normal skipped push must NOT need a registry lookup.
      ...(!["docs", "wrong version"].includes(kind)
        ? {
            "https://registry.npmjs.org/@grepco%2fpi-lence": {
              status: kind === "registry error" ? 404 : 200,
              body: {
                name: "@grepco/pi-lence",
                versions:
                  kind === "published"
                    ? { "0.1.0": { name: "@grepco/pi-lence", version: "0.1.0" } }
                    : {},
              },
            },
          }
        : {}),
    };
    const responseFile = join(state, `${kind}.json`);
    const outputFile = join(state, `${kind}.outputs`);
    await writeFile(responseFile, JSON.stringify(responses));
    const result = spawnSync(
      process.execPath,
      ["--import", preload, join(root, "scripts/stage-pi-release.mjs"), "--select"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: state,
          FIXTURE_RESPONSES: responseFile,
          GITHUB_REPOSITORY: context.repository,
          GITHUB_EVENT_NAME: context.eventName,
          GITHUB_REF: context.ref,
          GITHUB_SHA: context.sha,
          GITHUB_WORKFLOW_SHA: context.workflowSha,
          GITHUB_WORKFLOW_REF: context.workflowRef,
          GITHUB_ACTOR: context.actor,
          GITHUB_TRIGGERING_ACTOR: context.triggeringActor,
          GITHUB_SERVER_URL: context.serverUrl,
          GITHUB_API_URL: context.apiUrl,
          GITHUB_RUN_ID: context.runId,
          GITHUB_RUN_ATTEMPT: context.runAttempt,
          GITHUB_TOKEN: "fixture-only",
          GITHUB_EVENT_PATH: eventFile,
          GITHUB_OUTPUT: outputFile,
        },
      },
    );
    const success = ["release", "manual", "docs"].includes(kind);
    assert.equal(result.status, success ? 0 : 1, result.stderr);
    if (!success) {
      await assert.rejects(readFile(outputFile), /ENOENT/);
      if (kind === "wrong version") assert.match(result.stderr, /version.*match/i);
      if (kind === "published") assert.match(result.stderr, /already published/);
      if (kind === "registry error") assert.match(result.stderr, /inconclusive/);
    } else {
      const staging = kind !== "docs";
      assert.equal((await readFile(outputFile, "utf8")).trim(), `stage=${staging}`);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.stage, staging);
      if (staging) {
        assert.equal(parsed.authorization.commit, context.sha);
        assert.equal(parsed.source.version, "0.1.0");
        if (manual) assert.equal(parsed.authorization.pr, null);
      } else assert.equal(parsed.authorization, null);
    }
  }
});

for (const mode of ["--prepare", "--verify", "--submit"]) {
  test(`${mode} refuses a version now published, before packing or invoking npm`, async (t) => {
    const { runStageCommand } = await import("./stage-pi-release.mjs");
    const f = await sourceFixture(t);
    const opts = options(f);
    const prepared =
      mode === "--prepare" ? null : await runStageCommand("--prepare", f.bundle, opts);
    let submitted = false;
    await assert.rejects(
      runStageCommand(mode, f.bundle, {
        ...opts,
        expectedDigest: prepared?.digest,
        registryFetch: async () =>
          Response.json({
            name: "@grepco/pi-lence",
            versions: {
              "0.1.0": { name: "@grepco/pi-lence", version: "0.1.0" },
            },
          }),
        execute: async () => {
          submitted = true;
          throw new Error("must not submit");
        },
      }),
      /already published/,
    );
    assert.equal(submitted, false);
    if (mode === "--prepare")
      await assert.rejects(readFile(join(f.bundle, "release.json")), /ENOENT/);
  });
}

test("inconclusive registry lookup before submission does not invoke native client", async (t) => {
  const { runStageCommand } = await import("./stage-pi-release.mjs");
  const f = await sourceFixture(t);
  const opts = options(f);
  const prepared = await runStageCommand("--prepare", f.bundle, opts);
  let submitted = false;
  await assert.rejects(
    runStageCommand("--submit", f.bundle, {
      ...opts,
      expectedDigest: prepared.digest,
      registryFetch: async () => {
        throw new Error("registry unavailable");
      },
      execute: async () => {
        submitted = true;
        throw new Error("must not submit");
      },
    }),
    /inconclusive/,
  );
  assert.equal(submitted, false);
});

test("manual main staging submits a new same-version candidate and records actual source, not a fictional release PR", async (t) => {
  const { runStageCommand } = await import("./stage-pi-release.mjs");
  const f = await sourceFixture(t);
  await writeFile(join(f.cwd, "pi/pi-lence/README.md"), "Reviewed last-minute change\n");
  f.git("add", ".");
  f.git("commit", "-m", "correct unpublished candidate");
  const sha = f.git("rev-parse", "HEAD");
  f.git("update-ref", "refs/remotes/origin/main", sha);
  const opts = {
    ...options(f),
    context: { ...stageContext(sha), eventName: "workflow_dispatch" },
    event: recoveryEvent(),
  };
  const prepared = await runStageCommand("--prepare", f.bundle, opts);
  const registry = await registryFixture(t);
  const receipt = await runStageCommand("--submit", f.bundle, {
    ...opts,
    expectedDigest: prepared.digest,
    execute: registry.execute,
  });
  assert.equal(receipt.commit, sha);
  assert.equal(receipt.mode, "stage-main");
  assert.equal(receipt.version, "0.1.0");
  assert.equal(receipt.expectedVersion, "0.1.0");
  assert.equal(receipt.pr, null);
  assert.notEqual(receipt.sha256, f.artifact.sha256);
  const summary = await readFile(opts.env.GITHUB_STEP_SUMMARY, "utf8");
  assert.match(summary, /manual/i);
  assert.doesNotMatch(summary, /pull\/null|unchanged/);
  assert.match(summary, new RegExp(sha));
});

test("staging workflow gates accepted main merges and binds a fresh exact-archive handoff", async (t) => {
  const cli = createRequire(import.meta.resolve("@changesets/cli/bin.js"));
  const { parse } = createRequire(cli.resolve("@changesets/config"))("yaml");
  /** @type {{jobs:Record<string,{steps:any[],[key:string]:any}>,[key:string]:any}} */
  const workflow = parse(
    await readFile(new URL("../.github/workflows/stage-pi-release.yml", import.meta.url), "utf8"),
  );
  assert.deepEqual(workflow.on.push, { branches: ["main"] });
  assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.on.pull_request_target, undefined);
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.equal(inputs.mode.default, "check-environment");
  assert.deepEqual(inputs.mode.options, ["check-environment", "stage-main"]);
  assert.equal(inputs.inspected_npm.default, false);
  assert.equal(inputs.expected_version.type, "string");
  assert.equal(inputs.release_pr, undefined);
  assert.equal(inputs.release_commit, undefined);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const { diagnose, select, validate, stage } = workflow.jobs;
  assert.equal(diagnose.environment, "npm-staging");
  assert.deepEqual(diagnose.permissions, {});
  const diagnosticRoot = await mkdtemp(join(tmpdir(), "pi-diagnostic-"));
  t.after(() => rm(diagnosticRoot, { recursive: true, force: true }));
  for (const ref of ["refs/heads/main", "refs/pull/6/merge", "refs/heads/dev"]) {
    const result = spawnSync(
      "/bin/bash",
      ["--noprofile", "--norc", "-e", "-c", diagnose.steps[0].run],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: "/usr/bin:/bin",
          RUN_EVENT: "workflow_dispatch",
          RUN_REF: ref,
          RUN_SHA: "a".repeat(40),
          WORKFLOW_SHA: "a".repeat(40),
          WORKFLOW_REF:
            "zemccartney/agent-dev/.github/workflows/stage-pi-release.yml@refs/heads/main",
          GITHUB_STEP_SUMMARY: join(diagnosticRoot, "summary"),
        },
      },
    );
    assert.equal(result.status, ref === "refs/heads/main" ? 0 : 1, result.stderr);
    if (ref === "refs/heads/main") assert.match(result.stdout, /Ref: refs\/heads\/main/);
  }
  assert.ok(diagnose.steps.every((step) => !step.uses && !/npm|node|checkout|curl/.test(step.run)));
  assert.deepEqual(select.permissions, { contents: "read", "pull-requests": "read" });
  assert.equal(select.environment, undefined);
  assert.equal(
    select.steps.find((step) => step.uses?.startsWith("actions/checkout@")).with["fetch-depth"],
    0,
  );
  assert.ok(select.steps.some((step) => /--select/.test(step.run ?? "")));
  assert.ok(!select.steps.some((step) => step.run === "mise run setup"));
  assert.equal(select.outputs.stage, "${{ steps.select.outputs.stage }}");
  assert.equal(validate.needs, "select");
  // Assert the declarative job gates; only GitHub can prove hosted admission/evaluation.
  assert.equal(
    diagnose.if,
    "github.repository == 'zemccartney/agent-dev' && github.event_name == 'workflow_dispatch' && inputs.mode == 'check-environment'",
  );
  assert.equal(
    select.if,
    "github.repository == 'zemccartney/agent-dev' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.mode == 'stage-main'))",
  );
  assert.equal(validate.if, "needs.select.outputs.stage == 'true'");
  for (const [id, job] of Object.entries(workflow.jobs))
    if (id !== "stage") assert.equal(job.permissions?.["id-token"], undefined);
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
