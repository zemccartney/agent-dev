import { appendFile, lstat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { githubClient } from "./pi-release-github.mjs";
import {
  assertStageContext,
  authorizeStage,
  prepareStageArtifact,
  verifyStageArtifact,
} from "./pi-release-stage.mjs";
import { stageTarball } from "./pi-release-npm.mjs";

/** @typedef {{cwd:string,context:import('./pi-release-stage.mjs').StageContext,event:any,api:import('./pi-release-github.mjs').Api,env:NodeJS.ProcessEnv,expectedDigest?:string,execute?:typeof import('./pi-release-npm.mjs').executePnpm}} Options */
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
  { cwd, context, event, api, env, expectedDigest = "", execute },
) {
  if (!["--prepare", "--verify", "--submit"].includes(mode))
    throw new Error("Unknown staging mode");
  const authorization = await authorizeStage(context, event, api);
  if (mode === "--prepare") {
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
- Release PR: https://github.com/zemccartney/agent-dev/pull/${record.pr}
- Accepted main commit: \`${record.commit}\`
- Archive SHA256: \`${record.sha256}\`
- Archive integrity: \`${record.integrity}\`
- Stage ID: \`${staged.stageId}\`
- Run: https://github.com/zemccartney/agent-dev/actions/runs/${record.runId} (attempt ${record.runAttempt})

Native submission requested npm provenance for this accepted source and archive.
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
    if (!directory || extra.length || !["--prepare", "--verify", "--submit"].includes(mode))
      throw new Error(
        "Usage: stage-pi-release.mjs --prepare|--verify|--submit DIRECTORY (accepted GitHub release merge only)",
      );
    const env = process.env;
    const context = contextFromEnvironment(env);
    assertStageContext(context);
    if (!env.GITHUB_EVENT_PATH) throw new Error("Missing GitHub event file");
    const stat = await lstat(env.GITHUB_EVENT_PATH);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("Invalid GitHub event file");
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
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
