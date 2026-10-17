import assert from "node:assert/strict";
import test from "node:test";
import { auditExceptions } from "./check-exceptions.mjs";

const policy = {
  age: ["@fixture/sdk@1.3.0"],
  trust: ["declarations@6.21.0"],
  minimumReleaseAge: 10080,
};
const approvals = {
  releaseAge: [
    {
      packages: ["@fixture/sdk@1.3.0"],
      reason: "Reproduce the reviewed host",
      approvedOn: "2026-01-02",
    },
  ],
  trust: [
    {
      packages: ["declarations@6.21.0"],
      reason: "Reviewed historical provenance gap",
      approvedOn: "2026-01-02",
    },
  ],
};
const publication = async () => ({ "1.3.0": "2026-01-01T00:00:00Z" });
await test("only active, reviewed exact selectors pass; trust exemptions never age out implicitly", async () => {
  const report = await auditExceptions(
    policy,
    approvals,
    publication,
    Date.parse("2026-01-07T23:59:59Z"),
  );
  assert.deepEqual(report, [
    { selector: "@fixture/sdk@1.3.0", expiresAt: "2026-01-08T00:00:00.000Z" },
  ]);
  assert.deepEqual(
    await auditExceptions(
      { ...policy, age: [] },
      approvals,
      publication,
      Date.parse("2030-01-01T00:00:00Z"),
    ),
    [],
  );
});
await test("age eligibility is an inclusive boundary, not graph-pruning or a grace period", async () => {
  await assert.rejects(
    auditExceptions(policy, approvals, publication, Date.parse("2026-01-08T00:00:00Z")),
    /expired.*@fixture\/sdk@1\.3\.0/i,
  );
});
await test("wildcards, ranges, unreviewed selectors and empty reasons fail closed", async () => {
  for (const selector of ["@fixture/*", "@fixture/sdk@^1.3.0", "@fixture/sdk@1.3.1"]) {
    await assert.rejects(
      auditExceptions({ ...policy, age: [selector] }, approvals, publication),
      /exact|reviewed/i,
    );
  }
  await assert.rejects(
    auditExceptions({ ...policy, trust: ["declarations@*"] }, approvals, publication),
    /exact/i,
  );
  await assert.rejects(
    auditExceptions(
      policy,
      { ...approvals, releaseAge: [{ ...approvals.releaseAge[0], reason: " " }] },
      publication,
    ),
    /reason/i,
  );
  await assert.rejects(
    auditExceptions({ ...policy, minimumReleaseAge: 0 }, approvals, publication),
    /release age/i,
  );
});
await test("unavailable, missing, invalid and future publication metadata cannot pass", async () => {
  const now = Date.parse("2026-01-03T00:00:00Z");
  for (const metadata of [
    {},
    { "1.3.0": "not a date" },
    { "1.3.0": "2026-02-31T00:00:00Z" },
    { "1.3.0": "2026-01-04T00:00:00Z" },
  ]) {
    await assert.rejects(
      auditExceptions(policy, approvals, async () => metadata, now),
      /publication/i,
    );
  }
  await assert.rejects(
    auditExceptions(
      policy,
      approvals,
      async () => {
        throw new Error("registry unavailable");
      },
      now,
    ),
    /registry unavailable/,
  );
});
