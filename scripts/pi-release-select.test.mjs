import assert from "node:assert/strict";
import { test } from "node:test";
import {
  stageContext,
  stageEvent,
  stagePullRequest,
  stageApi,
  recoveryEvent,
} from "./test-helpers/pi-release-stage.mjs";

const commit = "a".repeat(40);
const head = "b".repeat(40);

test("main push selects the exact accepted release merge without resolving a deleted head branch", async () => {
  const { authorizeStage } = await import("./pi-release-stage.mjs");
  const { api, calls } = stageApi();
  assert.deepEqual(await authorizeStage(stageContext(), stageEvent(), api), {
    pr: 6,
    commit,
    releaseCommit: commit,
    head,
    runId: "123",
    runAttempt: "1",
  });
  assert.ok(
    calls.includes(`/repos/zemccartney/agent-dev/commits/${commit}/pulls?per_page=100&page=1`),
  );
  assert.ok(calls.every((path) => !path.includes("git/ref")));
});

for (const kind of ["direct push", "docs PR", "dev PR", "older release merge", "fork PR"]) {
  test(`ordinary main ${kind} skips selection and cannot authorize artifact submission`, async () => {
    const { selectStageRelease, authorizeStage } = await import("./pi-release-stage.mjs");
    assert.equal(typeof selectStageRelease, "function");
    const pr = stagePullRequest();
    if (kind === "docs PR") pr.head.ref = "docs/maintenance";
    if (kind === "dev PR") pr.head.ref = "dev";
    if (kind === "older release merge") pr.merge_commit_sha = "c".repeat(40);
    if (kind === "fork PR") pr.head.repo.full_name = "outsider/agent-dev";
    const { api, calls } = stageApi(pr, "write", kind === "direct push" ? [] : [pr]);
    assert.equal(await selectStageRelease(stageContext(), stageEvent(), api), null);
    assert.ok(!calls.some((path) => path.endsWith("/pulls/6")));
    await assert.rejects(authorizeStage(stageContext(), stageEvent(), api), /release/i);
  });
}

for (const [field, value] of Object.entries({
  repository: "other/repo",
  eventName: "pull_request",
  ref: "refs/pull/6/merge",
  sha: "c".repeat(40),
  workflowSha: "c".repeat(40),
  workflowRef: "other.yml",
  actor: "github-actions[bot]",
  apiUrl: "https://invalid.example",
  runId: "0",
  runAttempt: "0",
})) {
  test(`untrusted staging context ${field} is rejected before HTTP`, async () => {
    const { authorizeStage } = await import("./pi-release-stage.mjs");
    let calls = 0;
    await assert.rejects(
      authorizeStage({ ...stageContext(), [field]: value }, stageEvent(), async () => {
        calls++;
        throw new Error("must not reach HTTP");
      }),
      /context|source|identity|actor|push/i,
    );
    assert.equal(calls, 0);
  });
}

for (const [field, value] of Object.entries({
  ref: "refs/heads/dev",
  after: "c".repeat(40),
  created: true,
  deleted: true,
  forced: true,
})) {
  test(`push payload ${field} mismatch cannot stage`, async () => {
    const { authorizeStage } = await import("./pi-release-stage.mjs");
    await assert.rejects(
      authorizeStage(stageContext(), { ...stageEvent(), [field]: value }, async () => {
        assert.fail("invalid push must be rejected before HTTP");
      }),
      /push/i,
    );
  });
}

for (const condition of [
  "unmerged",
  "draft",
  "wrong merger",
  "API mismatch",
  "read-only actor",
  "rerun actor",
  "API unavailable",
  "wrong repository",
  "malformed associations",
  "ambiguous associations",
  "full association page",
]) {
  test(`release selection fails closed for ${condition}`, async () => {
    const { authorizeStage } = await import("./pi-release-stage.mjs");
    const pr = stagePullRequest();
    const associations = [structuredClone(pr)];
    if (condition === "unmerged") pr.merged = false;
    if (condition === "draft") pr.draft = true;
    if (condition === "wrong merger") pr.merged_by.login = "other";
    if (condition === "API mismatch") pr.head.sha = "c".repeat(40);
    const context = stageContext();
    if (condition === "rerun actor") context.triggeringActor = "reader";
    const { api } = stageApi(pr, condition === "read-only actor" ? "read" : "write", associations);
    /** @type {import('./pi-release-github.mjs').Api} */
    const transport = async (method, path) => {
      if (condition === "API unavailable") throw new Error("API unavailable");
      if (condition === "wrong repository" && path === "/repos/zemccartney/agent-dev")
        return { full_name: "other/repo", default_branch: "main", fork: false };
      if (path.includes("/reader/")) return { permission: "read" };
      if (path.includes("/commits/")) {
        if (condition === "malformed associations") return [null];
        if (condition === "ambiguous associations")
          return [associations[0], { ...associations[0], number: 7 }];
        if (condition === "full association page")
          return Array.from({ length: 100 }, () => associations[0]);
      }
      return api(method, path);
    };
    await assert.rejects(authorizeStage(context, stageEvent(), transport));
  });
}

test("explicit recovery identifies accepted release separately from corrected main workflow", async () => {
  const { authorizeStage } = await import("./pi-release-stage.mjs");
  const current = "c".repeat(40);
  const context = { ...stageContext(current), eventName: "workflow_dispatch", actor: "maintainer" };
  const { api, calls } = stageApi();
  assert.deepEqual(await authorizeStage(context, recoveryEvent(), api), {
    pr: 6,
    commit: current,
    releaseCommit: commit,
    head,
    runId: "123",
    runAttempt: "1",
  });
  assert.ok(calls.some((path) => path.includes("/maintainer/")));
  assert.ok(calls.some((path) => path.includes("/owner/")));
  assert.ok(!calls.some((path) => path.includes("/commits/")));
});

for (const [field, value] of Object.entries({
  mode: "check-environment",
  release_pr: "6;echo unsafe",
  release_commit: "main",
  inspected_npm: "false",
})) {
  test(`recovery refuses invalid ${field} before HTTP`, async () => {
    const { authorizeStage } = await import("./pi-release-stage.mjs");
    const event = recoveryEvent();
    event.inputs = { ...event.inputs, [field]: value };
    await assert.rejects(
      authorizeStage({ ...stageContext(), eventName: "workflow_dispatch" }, event, async () => {
        assert.fail("invalid recovery must not reach HTTP");
      }),
      /recovery/i,
    );
  });
}

for (const kind of [
  "wrong merge SHA",
  "ordinary PR",
  "fork PR",
  "wrong base",
  "unmerged",
  "lost merger access",
]) {
  test(`recovery refuses ${kind}`, async () => {
    const { authorizeStage } = await import("./pi-release-stage.mjs");
    const pr = stagePullRequest();
    if (kind === "wrong merge SHA") pr.merge_commit_sha = "c".repeat(40);
    if (kind === "ordinary PR") pr.head.ref = "docs/maintenance";
    if (kind === "fork PR") pr.head.repo.full_name = "other/repo";
    if (kind === "wrong base") pr.base.ref = "dev";
    if (kind === "unmerged") pr.merged = false;
    const { api } = stageApi(pr);
    const context = {
      ...stageContext(),
      eventName: "workflow_dispatch",
      actor: "maintainer",
      triggeringActor: "maintainer",
    };
    await assert.rejects(
      authorizeStage(context, recoveryEvent(), async (method, path) =>
        kind === "lost merger access" && path.includes("/owner/")
          ? { permission: "read" }
          : api(method, path),
      ),
    );
  });
}
