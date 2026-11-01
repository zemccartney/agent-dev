import { appendFile, lstat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { githubClient } from "./pi-release-github.mjs";
import {
  assertStageContext,
  authorizeStage,
  selectStageRelease,
  inspectStageSource,
  prepareStageArtifact,
  verifyStageArtifact,
} from "./pi-release-stage.mjs";
import { stageTarball } from "./pi-release-npm.mjs";
import { assertUnpublishedVersion } from "./pi-release-registry.mjs";

/** @typedef {{cwd:string,context:import('./pi-release-stage.mjs').StageContext,event:any,api:import('./pi-release-github.mjs').Api,env:NodeJS.ProcessEnv,expectedDigest?:string,registryFetch?:typeof fetch,execute?:typeof import('./pi-release-npm.mjs').executePnpm}} Options */
/** @typedef {import('./pi-release-stage.mjs').StageRecord & {digest:string,stageId?:string}} Result */
/** @param {NodeJS.ProcessEnv} env @param {string} text */
async function summary(env, text) {
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}
/** Workflow-only composition; tests replace only GitHub HTTP and native process transport.
 * @param {string} mode @param {string} directory @param {Options} options @returns {Promise<Result>} */
export async function runStageCommand(
  mode,
  directory,
  { cwd, context, event, api, env, expectedDigest = "", registryFetch, execute },
) {
  if (!["--prepare", "--verify", "--submit"].includes(mode))
    throw new Error("Unknown staging mode");
  const authorization = await authorizeStage(context, event, api);
  if (mode === "--prepare") {
    const source = await inspectStageSource(cwd, authorization);
    await assertUnpublishedVersion(source.name, source.version, registryFetch);
    const record = await prepareStageArtifact(cwd, directory, authorization);
    const digest = createHash("sha256")
      .update(await readFile(join(directory, "release.json")))
      .digest("hex");
    return { ...record, digest };
  }
  const { record, tarballPath } = await verifyStageArtifact(
    cwd,
    directory,
    authorization,
    expectedDigest,
  );
  // Recheck public state after tests and again before the upload; never reuse an earlier answer.
  await assertUnpublishedVersion(record.name, record.version, registryFetch);
  if (mode === "--verify") return { ...record, digest: expectedDigest };
  const receiptPath = join(dirname(directory), "pi-stage-receipt.json");
  try {
    await lstat(receiptPath);
    throw new Error("Existing staging receipt; inspect npm rather than resubmitting");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error;
  }
  try {
    const staged = await stageTarball({ ...record, tarballPath }, env, execute);
    const receipt = { ...record, digest: expectedDigest, ...staged };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await summary(
      env,
      `## Pi-lence staged — not published by this workflow

- Package: \`${record.name}@${record.version}\`
- Authorization: ${record.mode === "stage-main" ? `manual main staging, expected version ${record.expectedVersion}` : `release PR https://github.com/zemccartney/agent-dev/pull/${record.pr}`}
- Actor: \`${record.actor}\`; triggering actor: \`${record.triggeringActor}\`
- Validation/workflow main commit: \`${record.commit}\`
- Archive SHA256: \`${record.sha256}\`
- Archive integrity: \`${record.integrity}\`
- Stage ID: \`${staged.stageId}\`
- Run: https://github.com/zemccartney/agent-dev/actions/runs/${record.runId} (attempt ${record.runAttempt})

Native submission requested npm provenance for the validation/workflow source and archive.
This candidate is bound to this run, attempt and source; the version may have earlier rejected candidates.
Published-version preflight is a snapshot, not an atomic lock or a pending-stage inspection.
Open npm's Staged Packages view and locate this stage. Before approval, compare the
owner-authenticated stage download with the archive digest above. Only you approve
publication on npm's website with 2FA. CI cannot inspect, approve or reject stages.
For the first release, reject the bootstrap entry; never approve it.`,
    );
    return receipt;
  } catch {
    const message =
      "Staging outcome is uncertain: a pending stage may already exist. Inspect npm before any retry. Do not replace/reject automatically or assume publication. Owner authentication is required for stage inspection and 2FA for rejection/approval.";
    await summary(env, `## Staging stopped\n\n${message}`);
    throw new Error(message);
  }
}

/** @param {NodeJS.ProcessEnv} env @returns {import('./pi-release-stage.mjs').StageContext} */
function contextFromEnvironment(env) {
  return {
    repository: env.GITHUB_REPOSITORY ?? "",
    eventName: env.GITHUB_EVENT_NAME ?? "",
    ref: env.GITHUB_REF ?? "",
    sha: env.GITHUB_SHA ?? "",
    workflowSha: env.GITHUB_WORKFLOW_SHA ?? "",
    workflowRef: env.GITHUB_WORKFLOW_REF ?? "",
    actor: env.GITHUB_ACTOR ?? "",
    triggeringActor: env.GITHUB_TRIGGERING_ACTOR ?? "",
    serverUrl: env.GITHUB_SERVER_URL ?? "",
    apiUrl: env.GITHUB_API_URL ?? "",
    runId: env.GITHUB_RUN_ID ?? "",
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? "",
  };
}

if (import.meta.main) {
  try {
    const [mode, directory, ...extra] = process.argv.slice(2);
    if (
      extra.length ||
      (mode === "--select"
        ? directory !== undefined
        : !directory || !["--prepare", "--verify", "--submit"].includes(mode))
    )
      throw new Error(
        "Usage: stage-pi-release.mjs --select OR --prepare|--verify|--submit DIRECTORY (authorized main workflow only)",
      );
    const env = process.env;
    const context = contextFromEnvironment(env);
    assertStageContext(context);
    if (!env.GITHUB_EVENT_PATH) throw new Error("Missing GitHub event file");
    const stat = await lstat(env.GITHUB_EVENT_PATH);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("Invalid GitHub event file");
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    if (mode === "--select") {
      const authorization = await selectStageRelease(
        context,
        event,
        githubClient(env.GITHUB_TOKEN ?? ""),
      );
      const source = authorization ? await inspectStageSource(process.cwd(), authorization) : null;
      if (source) await assertUnpublishedVersion(source.name, source.version);
      if (env.GITHUB_OUTPUT)
        await appendFile(env.GITHUB_OUTPUT, `stage=${authorization !== null}\n`);
      await summary(
        env,
        authorization && source
          ? `Authorized ${authorization.mode}: ${source.name}@${source.version}; pinned main commit ${authorization.commit}; actor ${authorization.actor}. Fresh validation required before staging; nothing submitted by selection.`
          : "No release PR merged at this exact main push. Staging skipped.",
      );
      console.log(JSON.stringify({ stage: authorization !== null, authorization, source }));
      process.exit(0);
    }
    const result = await runStageCommand(mode, directory, {
      cwd: process.cwd(),
      context,
      event,
      api: githubClient(env.GITHUB_TOKEN ?? ""),
      env,
      expectedDigest: env.EXPECTED_RECORD_DIGEST,
    });
    if (env.GITHUB_OUTPUT)
      await appendFile(
        env.GITHUB_OUTPUT,
        `digest=${result.digest}\nfilename=${result.filename}\nsha256=${result.sha256}\n`,
      );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging failed");
    process.exitCode = 1;
  }
}
