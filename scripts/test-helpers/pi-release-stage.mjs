import assert from "node:assert/strict";
import { join } from "node:path";
import { stageFixture } from "./npm-registry.mjs";
import { candidateGit } from "../pi-release-candidate.mjs";

const repository = "zemccartney/agent-dev";
const commit = "a".repeat(40);
const head = "b".repeat(40);
/** @param {string} [sha] */
export function stageContext(sha = commit) {
  return {
    repository,
    eventName: "push",
    ref: "refs/heads/main",
    sha,
    workflowSha: sha,
    workflowRef: `${repository}/.github/workflows/stage-pi-release.yml@refs/heads/main`,
    actor: "owner",
    triggeringActor: "owner",
    serverUrl: "https://github.com",
    apiUrl: "https://api.github.com",
    runId: "123",
    runAttempt: "1",
  };
}
/** @param {string} [sha] */
export function stageEvent(sha = commit) {
  return {
    ref: "refs/heads/main",
    after: sha,
    before: "c".repeat(40),
    created: false,
    deleted: false,
    forced: false,
    repository: { full_name: repository },
  };
}
/** @param {string} [sha] */
export function stagePullRequest(sha = commit) {
  return {
    number: 6,
    state: "closed",
    merged: true,
    draft: false,
    merge_commit_sha: sha,
    merged_by: { login: "owner" },
    head: { sha: head, ref: "changeset-release/main", repo: { full_name: repository } },
    base: { ref: "main", repo: { full_name: repository } },
  };
}
/** @param {string} [version] */
export function recoveryEvent(version = "0.1.0") {
  return {
    repository: { full_name: repository },
    inputs: {
      mode: "stage-main",
      expected_version: version,
      inspected_npm: "true",
    },
  };
}
/** @param {ReturnType<typeof stagePullRequest>} [pr] @param {string} [permission]
 * @param {ReturnType<typeof stagePullRequest>[]} [associated] */
export function stageApi(pr = stagePullRequest(), permission = "admin", associated = [pr]) {
  /** @type {string[]} */
  const calls = [];
  /** @type {import('../pi-release-github.mjs').Api} */
  const api = async (method, path) => {
    assert.equal(method, "GET", "Staging authorization has no GitHub write authority");
    calls.push(path);
    if (path === `/repos/${repository}`)
      return { full_name: repository, default_branch: "main", fork: false };
    if (/\/commits\/[a-f0-9]{40}\/pulls\?per_page=100&page=1$/.test(path))
      return structuredClone(associated);
    if (path === `/repos/${repository}/pulls/6`) return structuredClone(pr);
    if (/\/collaborators\/[^/]+\/permission$/.test(path)) return { permission };
    throw new Error(`Unexpected API operation ${path}`);
  };
  return { api, calls };
}

/** @param {import('node:test').TestContext} t */
export async function sourceFixture(t) {
  const f = await stageFixture(t);
  const cwd = join(f.root, "producer");
  /** @param {...string} args */
  const git = (...args) => candidateGit(cwd, ...args).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Stage fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("add", ".");
  git("commit", "-m", "accepted release source");
  const sha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", sha);
  /** @type {import("../pi-release-stage.mjs").Authorization} */
  const authorization = {
    mode: "release-merge",
    expectedVersion: null,
    actor: "owner",
    triggeringActor: "owner",
    pr: 6,
    commit: sha,
    head,
    runId: "123",
    runAttempt: "1",
  };
  return { ...f, cwd, git, authorization, bundle: join(f.root, "bundle") };
}
