import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { packCandidate } from "../pi/pi-lence/scripts/pack.mjs";
import { candidateGit } from "./pi-release-candidate.mjs";

const repository = "zemccartney/agent-dev";
const prefix = `/repos/${repository}`;
const shaPattern = /^[a-f0-9]{40}$/;
/** @typedef {import('./pi-release-github.mjs').Context & {runId:string,runAttempt:string}} StageContext */
/** @typedef {{pr:number,commit:string,head:string,runId:string,runAttempt:string}} Authorization */
/** @typedef {Authorization & {schema:1,name:string,version:string,filename:string,sha256:string,integrity:string}} StageRecord */
/** @param {StageContext} context @param {any} event @param {import('./pi-release-github.mjs').Api} api @returns {Promise<Authorization>} */
export async function authorizeStage(context, event, api) {
  if (
    context.repository !== repository ||
    context.eventName !== "pull_request" ||
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
    throw new Error("Untrusted staging context: only an accepted main release merge may stage");
  const number = event.number;
  if (
    event.action !== "closed" ||
    event.repository?.full_name !== repository ||
    !Number.isSafeInteger(number) ||
    number <= 0
  )
    throw new Error("Invalid release event identity");
  /** @param {any} pr */
  const validPr = (pr) =>
    pr?.number === number &&
    pr.state === "closed" &&
    pr.merged === true &&
    pr.draft === false &&
    pr.merge_commit_sha === context.sha &&
    shaPattern.test(pr.head?.sha ?? "") &&
    pr.head?.ref === "changeset-release/main" &&
    pr.head.repo?.full_name === repository &&
    pr.base?.ref === "main" &&
    pr.base.repo?.full_name === repository &&
    pr.merged_by?.login === context.actor;
  if (!validPr(event.pull_request)) throw new Error("Event is not the accepted release source");
  const repo = await api("GET", prefix);
  if (repo.full_name !== repository || repo.default_branch !== "main" || repo.fork !== false)
    throw new Error("Unexpected staging repository identity/default branch");
  const pr = await api("GET", `${prefix}/pulls/${number}`);
  if (!validPr(pr) || pr.head.sha !== event.pull_request.head.sha)
    throw new Error("GitHub PR no longer matches the accepted release source");
  for (const actor of new Set([context.actor, context.triggeringActor])) {
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
    head: pr.head.sha,
    runId: context.runId,
    runAttempt: context.runAttempt,
  };
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
    schema: 1,
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
    record?.schema !== 1 ||
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
