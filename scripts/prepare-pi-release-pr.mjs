import { appendFile, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  candidateGit,
  prepareCandidate,
  verifyCandidate,
  verifyDigest,
} from "./pi-release-candidate.mjs";
import {
  assertTrustedContext,
  githubClient,
  inspectRemote,
  openReleasePr,
} from "./pi-release-github.mjs";

/** @typedef {{cwd:string,context:import('./pi-release-github.mjs').Context,api:import('./pi-release-github.mjs').Api,metadataPath?:string,expectedDigest?:string}} Options */
/** @param {string} cwd @param {string|undefined} path */
async function outsideCheckout(cwd, path) {
  if (!path || !isAbsolute(path))
    throw new Error("Candidate metadata requires an absolute outside-checkout path");
  const parent = await realpath(dirname(path));
  const location = relative(await realpath(cwd), parent);
  if (
    location === "" ||
    (!location.startsWith("../") && location !== ".." && !isAbsolute(location))
  )
    throw new Error("Candidate metadata must be outside the checkout");
  return path;
}
/** Workflow-only orchestration; exported to exercise real local generation against simulated HTTP.
 * @param {string} mode @param {Options} options */
export async function runReleaseCommand(
  mode,
  { cwd, context, api, metadataPath, expectedDigest = "" },
) {
  if (!["--preview", "--verify", "--open"].includes(mode))
    throw new Error("Unknown release command mode");
  assertTrustedContext(context);
  if (candidateGit(cwd, "rev-parse", "HEAD").trim() !== context.sha)
    throw new Error("Checkout HEAD differs from the selected workflow source");
  if (mode === "--verify") {
    const candidate = JSON.parse(await readFile(await outsideCheckout(cwd, metadataPath), "utf8"));
    verifyDigest(candidate, expectedDigest);
    await verifyCandidate(cwd, candidate);
    return { hasRelease: candidate.targetVersion !== null, digest: candidate.digest };
  }
  // In preview this token is read-only. Recheck in the fresh write job before any reservation.
  await inspectRemote(context, api);
  const path = mode === "--preview" ? await outsideCheckout(cwd, metadataPath) : undefined;
  const candidate = await prepareCandidate(cwd);
  if (mode === "--preview") {
    await writeFile(/** @type {string} */ (path), JSON.stringify(candidate, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return { hasRelease: candidate.targetVersion !== null, digest: candidate.digest };
  }
  await verifyCandidate(cwd, candidate);
  const pr = await openReleasePr(context, api, candidate, expectedDigest);
  return { hasRelease: true, digest: candidate.digest, ...pr };
}

if (import.meta.main) {
  try {
    const [mode, path, ...extra] = process.argv.slice(2);
    if (
      extra.length ||
      !["--preview", "--verify", "--open"].includes(mode) ||
      (mode === "--open" ? path !== undefined : !path)
    )
      throw new Error(
        "Usage: prepare-pi-release-pr.mjs --preview PATH | --verify PATH | --open (GitHub workflow only)",
      );
    const env = process.env;
    const context = {
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
    };
    assertTrustedContext(context);
    const result = await runReleaseCommand(mode, {
      cwd: process.cwd(),
      context,
      api: githubClient(env.GITHUB_TOKEN ?? ""),
      metadataPath: path,
      expectedDigest: env.EXPECTED_CANDIDATE_DIGEST,
    });
    if (env.GITHUB_OUTPUT)
      await appendFile(
        env.GITHUB_OUTPUT,
        `has-release=${result.hasRelease}\ndigest=${result.digest}\n`,
      );
    const message =
      "url" in result
        ? `Prepared draft release PR: ${result.url}. Stop at inspection; do not merge.\n`
        : result.hasRelease
          ? `Candidate ${mode === "--verify" ? "verified" : "generated"}: ${result.digest}\n`
          : "No Pi-lence release notes: no branch or PR will be created.\n";
    console.log(message.trim());
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
