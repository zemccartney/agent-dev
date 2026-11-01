import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { packCandidate } from "../pi/pi-lence/scripts/pack.mjs";
import { candidateGit } from "./pi-release-candidate.mjs";

const repository = "zemccartney/agent-dev";
const prefix = `/repos/${repository}`;
const shaPattern = /^[a-f0-9]{40}$/;
/** @typedef {import('./pi-release-github.mjs').Context & {runId:string,runAttempt:string}} StageContext */
/** @typedef {{pr:number,commit:string,releaseCommit:string,head:string,runId:string,runAttempt:string}} Authorization */
/** @typedef {Authorization & {schema:2,name:string,version:string,filename:string,sha256:string,integrity:string}} StageRecord */
/** @param {StageContext} context */
export function assertStageContext(context) {
  if (
    context.repository !== repository ||
    !["push", "workflow_dispatch"].includes(context.eventName) ||
    context.ref !== "refs/heads/main" ||
    !shaPattern.test(context.sha) ||
    context.workflowSha !== context.sha ||
    context.workflowRef !==
      `${repository}/.github/workflows/stage-pi-release.yml@refs/heads/main` ||
    context.serverUrl !== "https://github.com" ||
    context.apiUrl !== "https://api.github.com" ||
    !/^[1-9]\d*$/.test(context.runId) ||
    !/^[1-9]\d*$/.test(context.runAttempt) ||
    ![context.actor, context.triggeringActor].every((actor) =>
      /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(actor),
    )
  )
    throw new Error("Untrusted staging context: use an authorized main push or recovery dispatch");
}

/** @param {any} pr */
function releaseBranch(pr) {
  return (
    pr?.head?.ref === "changeset-release/main" &&
    pr.head.repo?.full_name === repository &&
    pr.base?.ref === "main" &&
    pr.base.repo?.full_name === repository
  );
}

/** Read-only gate: an ordinary main push returns null; uncertainty never authorizes staging.
 * @param {StageContext} context @param {any} event @param {import('./pi-release-github.mjs').Api} api
 * @returns {Promise<Authorization|null>} */
export async function selectStageRelease(context, event, api) {
  assertStageContext(context);
  if (event.repository?.full_name !== repository)
    throw new Error("Invalid release event repository identity");
  const push = context.eventName === "push";
  let number;
  let releaseCommit = context.sha;
  if (push) {
    if (
      event.ref !== context.ref ||
      event.after !== context.sha ||
      event.created !== false ||
      event.deleted !== false ||
      event.forced !== false
    )
      throw new Error("Invalid main push identity/state");
  } else {
    const inputs = event.inputs;
    if (
      inputs?.mode !== "stage-accepted-release" ||
      typeof inputs.release_pr !== "string" ||
      !/^[1-9][0-9]*$/.test(inputs.release_pr) ||
      !Number.isSafeInteger(Number(inputs.release_pr)) ||
      typeof inputs.release_commit !== "string" ||
      !shaPattern.test(inputs.release_commit) ||
      ![true, "true"].includes(inputs.inspected_npm)
    )
      throw new Error(
        "Invalid recovery request: accepted PR/SHA and owner npm inspection required",
      );
    number = Number(inputs.release_pr);
    releaseCommit = inputs.release_commit;
  }
  const repo = await api("GET", prefix);
  if (repo.full_name !== repository || repo.default_branch !== "main" || repo.fork !== false)
    throw new Error("Unexpected staging repository identity/default branch");

  let selectedHead;
  if (push) {
    const associated = await api(
      "GET",
      `${prefix}/commits/${context.sha}/pulls?per_page=100&page=1`,
    );
    // A full page may conceal additional matches. Refuse instead of guessing/truncating.
    if (
      !Array.isArray(associated) ||
      associated.length >= 100 ||
      associated.some(
        (pr) =>
          !Number.isSafeInteger(pr?.number) ||
          pr.number <= 0 ||
          typeof pr.head?.ref !== "string" ||
          typeof pr.base?.ref !== "string" ||
          !shaPattern.test(pr.head?.sha ?? ""),
      )
    )
      throw new Error("Invalid or incomplete release PR association response");
    const matches = associated.filter(
      (pr) => releaseBranch(pr) && pr.merge_commit_sha === context.sha,
    );
    if (matches.length === 0) return null;
    if (matches.length !== 1) throw new Error("Ambiguous release PR association");
    number = matches[0].number;
    selectedHead = matches[0].head.sha;
  }
  const pr = await api("GET", `${prefix}/pulls/${number}`);
  if (
    pr?.number !== number ||
    pr.state !== "closed" ||
    pr.merged !== true ||
    pr.draft !== false ||
    pr.merge_commit_sha !== releaseCommit ||
    !releaseBranch(pr) ||
    !shaPattern.test(pr.head?.sha ?? "") ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(pr.merged_by?.login ?? "") ||
    (push && (pr.merged_by.login !== context.actor || pr.head.sha !== selectedHead))
  )
    throw new Error("GitHub PR does not match the accepted release source");
  for (const actor of new Set([context.actor, context.triggeringActor, pr.merged_by.login])) {
    const access = await api(
      "GET",
      `${prefix}/collaborators/${encodeURIComponent(actor)}/permission`,
    );
    if (!["admin", "maintain", "write"].includes(access.permission))
      throw new Error("Release actor permission required");
  }
  return {
    pr: number,
    commit: context.sha,
    releaseCommit,
    head: pr.head.sha,
    runId: context.runId,
    runAttempt: context.runAttempt,
  };
}

/** Artifact jobs must independently require a release; a skip is never submit authority.
 * @param {StageContext} context @param {any} event @param {import('./pi-release-github.mjs').Api} api
 * @returns {Promise<Authorization>} */
export async function authorizeStage(context, event, api) {
  const authorization = await selectStageRelease(context, event, api);
  if (!authorization) throw new Error("No accepted release merge for this main push");
  return authorization;
}

/** @param {string} cwd @param {Authorization} authorization */
async function sourceManifest(cwd, authorization) {
  if (candidateGit(cwd, "rev-parse", "HEAD").trim() !== authorization.commit)
    throw new Error("Checkout is not the accepted release source");
  candidateGit(
    cwd,
    "merge-base",
    "--is-ancestor",
    authorization.commit,
    "refs/remotes/origin/main",
  );
  candidateGit(
    cwd,
    "merge-base",
    "--is-ancestor",
    authorization.releaseCommit,
    authorization.commit,
  );
  // Recovery may correct workflow/tooling, but cannot quietly change the accepted product.
  if (
    candidateGit(
      cwd,
      "diff",
      "--name-only",
      authorization.releaseCommit,
      authorization.commit,
      "--",
      "pi/pi-lence",
      "LICENSE",
    ).trim()
  )
    throw new Error("Accepted release package or license changed; recovery is not authorized");
  if (candidateGit(cwd, "status", "--porcelain=v1", "--untracked-files=all").trim())
    throw new Error("Release source must remain clean");
  for (const path of [cwd, join(cwd, "pi"), join(cwd, "pi/pi-lence")])
    if (!(await lstat(path)).isDirectory())
      throw new Error("Release source directory must not be symlinked");
  const manifest = JSON.parse(
    (await regularBytes(join(cwd, "pi/pi-lence/package.json"), 65536)).toString(),
  );
  if (
    manifest.name !== "@grepco/pi-lence" ||
    manifest.private === true ||
    typeof manifest.version !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version) ||
    manifest.version === "0.0.0"
  )
    throw new Error("Expected public Pi-lence stable nonzero release identity");
  return { name: manifest.name, version: manifest.version };
}
/** @param {string} path @param {number} maximum */
async function regularBytes(path, maximum) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > maximum)
    throw new Error("Expected bounded regular release file");
  const bytes = await readFile(path);
  if (bytes.length > maximum) throw new Error("Release file exceeds size bound");
  return bytes;
}
/** Output/transfer directories cannot reside within the checkout, even through a parent symlink.
 * @param {string} cwd @param {string} directory */
async function outsideCheckout(cwd, directory) {
  if (!isAbsolute(directory)) throw new Error("Release artifact directory must be absolute");
  const destination = resolve(await realpath(dirname(directory)), basename(directory));
  const path = relative(await realpath(cwd), destination);
  if (path === "" || (!path.startsWith("../") && !isAbsolute(path)))
    throw new Error("Release artifacts must be outside the checkout");
}
/** @param {Uint8Array} bytes */
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** @param {Uint8Array} bytes */
const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/** @param {string} cwd @param {string} directory @param {Authorization} authorization @returns {Promise<StageRecord>} */
export async function prepareStageArtifact(cwd, directory, authorization) {
  const manifest = await sourceManifest(cwd, authorization);
  await outsideCheckout(cwd, directory);
  await mkdir(directory); // exclusive: never replace an existing artifact/receipt directory
  const packed = await packCandidate(join(cwd, "pi/pi-lence"), directory);
  const bytes = await regularBytes(packed.tarballPath, 10 * 1024 * 1024);
  /** @type {StageRecord} */
  const record = {
    schema: 2,
    ...authorization,
    ...manifest,
    filename: basename(packed.tarballPath),
    sha256: packed.sha256,
    integrity: integrity(bytes),
  };
  await sourceManifest(cwd, authorization);
  await writeFile(join(directory, "release.json"), `${JSON.stringify(record, null, 2)}\n`, {
    flag: "wx",
  });
  return record;
}

/** Digest comes from the validating job's output, not from this downloaded bundle itself.
 * @param {string} cwd @param {string} directory @param {Authorization} authorization
 * @param {string} expectedRecordDigest @returns {Promise<{record:StageRecord,tarballPath:string}>} */
export async function verifyStageArtifact(cwd, directory, authorization, expectedRecordDigest) {
  const manifest = await sourceManifest(cwd, authorization);
  await outsideCheckout(cwd, directory);
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Artifact directory must not be a symlink");
  const raw = await regularBytes(join(directory, "release.json"), 65536);
  if (!/^[a-f0-9]{64}$/.test(expectedRecordDigest) || sha256(raw) !== expectedRecordDigest)
    throw new Error("Release record digest mismatch");
  const record = JSON.parse(raw.toString());
  const filename = `grepco-pi-lence-${manifest.version}.tgz`;
  if (
    record?.schema !== 2 ||
    record.name !== manifest.name ||
    record.version !== manifest.version ||
    record.filename !== filename ||
    Object.entries(authorization).some(([key, value]) => record[key] !== value)
  )
    throw new Error("Release record source/identity mismatch");
  if (
    JSON.stringify((await readdir(directory)).sort()) !==
    JSON.stringify([filename, "release.json"].sort())
  )
    throw new Error("Unexpected artifact directory inventory");
  const tarballPath = join(directory, filename);
  const bytes = await regularBytes(tarballPath, 10 * 1024 * 1024);
  if (sha256(bytes) !== record.sha256 || integrity(bytes) !== record.integrity)
    throw new Error("Release archive digest mismatch");
  return { record, tarballPath };
}
