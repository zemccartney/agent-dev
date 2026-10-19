import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { preparePiRelease } from "./prepare-pi-release.mjs";

/** @typedef {{sourceCommit:string,targetVersion:string|null,changesetIds:string[],fileChanges:{additions:{path:string,contents:string}[],deletions:{path:string}[]},digest:string}} Candidate */
/** @param {string} cwd @param {string[]} args */
export function candidateGit(cwd, ...args) {
  const result = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_LITERAL_PATHSPECS: "1",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Candidate git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}
/** @param {string} path */
const scratch = (path) =>
  path === "plan.md" || path.startsWith("thinking/") || path.startsWith(".superpowers/");
/** @param {Omit<Candidate,'digest'>} candidate */
export function candidateDigest(candidate) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceCommit: candidate.sourceCommit,
        targetVersion: candidate.targetVersion,
        changesetIds: candidate.changesetIds,
        fileChanges: candidate.fileChanges,
      }),
    )
    .digest("hex");
}
/** @param {Candidate} candidate @param {string} expected */
export function verifyDigest(candidate, expected) {
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    candidate.digest !== expected ||
    candidateDigest(candidate) !== expected
  )
    throw new Error("Candidate digest mismatch; do not use or refresh this candidate");
}
/** @param {string} cwd @param {Candidate} candidate */
export async function verifyCandidate(cwd, candidate) {
  verifyDigest(candidate, candidate.digest);
  if (candidateGit(cwd, "rev-parse", "HEAD").trim() !== candidate.sourceCommit)
    throw new Error("Candidate source HEAD changed");
  const expected = new Map();
  for (const { path } of candidate.fileChanges.additions) expected.set(path, "addition");
  for (const { path } of candidate.fileChanges.deletions) expected.set(path, "deletion");
  const records = candidateGit(cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    .split("\0")
    .filter(Boolean);
  const actual = new Map();
  for (const record of records) {
    const state = record.slice(0, 2);
    const path = record.slice(3);
    const kind = [" D", "D "].includes(state)
      ? "deletion"
      : [" M", "M ", "??"].includes(state)
        ? "addition"
        : "unsupported";
    actual.set(path, kind);
  }
  if (!isDeepStrictEqual(actual, expected))
    throw new Error("Unexpected candidate paths or change types");
  for (const addition of candidate.fileChanges.additions) {
    const path = join(cwd, addition.path);
    if (
      !(await lstat(path)).isFile() ||
      (await readFile(path)).toString("base64") !== addition.contents
    )
      throw new Error(`Candidate output changed: ${addition.path}`);
  }
}
/** Version in the caller's disposable checkout, then omit only the existing main-gate scratch set.
 * @param {string} cwd @returns {Promise<Candidate>} */
export async function prepareCandidate(cwd) {
  const result = await preparePiRelease(cwd);
  /** @type {Candidate['fileChanges']} */
  const fileChanges = { additions: [], deletions: [] };
  if (result.targetVersion !== null) {
    const omit = candidateGit(cwd, "ls-files", "-z").split("\0").filter(scratch);
    if (omit.length) candidateGit(cwd, "rm", "--", ...omit);
    for (const path of ["pi/pi-lence/CHANGELOG.md", "pi/pi-lence/package.json"])
      fileChanges.additions.push({
        path,
        contents: (await readFile(join(cwd, path))).toString("base64"),
      });
    fileChanges.deletions = [...omit, ...result.changesetIds.map((id) => `.changeset/${id}.md`)]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((path) => ({ path }));
  }
  const data = { ...result, fileChanges };
  const candidate = { ...data, digest: candidateDigest(data) };
  await verifyCandidate(cwd, candidate);
  return candidate;
}
