# Release flows — quick reference

Pi-lence uses npm staging. Herdr releases/installers are separate work.
Details: [development procedures](DEVELOPMENT.md) · [supply-chain checks](SUPPLY_CHAIN.md).

## 1. Everyday work

```text
feature / fix / docs branch
           │ reviewed PR
           ▼
          dev
           │ waits for an explicit release decision
           ▼
    next release preparation
```

Ordinary development merges do not prepare, stage or publish releases.

## 2. Cut a release branch

```text
Ready work + Changeset notes committed on dev
                      │
                      ▼
GitHub Actions → Prepare Pi-lence release (choose dev)
               → Run workflow → select dev
                      │
           snapshot that exact commit
           version + changelog + checks
                      │
                      ▼
       draft PR: changeset-release/main → main
```

The workflow creates the release branch; you do not cut it by hand. No release
intent means no release PR. Existing release branch/PR means stop and inspect:
preparation never refreshes, resets or force-updates it from newer dev.

## 3. Accept, stage, then publish — separate decisions

```text
Review release PR + required checks + npm readiness
                      │ owner marks ready and merges
                      ▼
                 push to main
                      │ read-only GitHub API gate
                      ▼
Exact pushed commit is a merged release PR's merge commit?
           no ──► skip staging
           yes
            │
            ▼
Pack once → test THAT archive → reverify → CI stages it
                                               │
                         owner inspects/downloads/hashes
                                               │
                         owner approves on npm with 2FA
                                               ▼
                                  public release
                                               │
                         verify public bytes; back-sync
                         release metadata/fixes/main ancestry
                         to dev through a disposable PR
```

The gate requires the same repository, head `changeset-release/main`, base `main`,
a merged/non-draft PR and the exact merge SHA. API errors/ambiguity stop; they do not
permit staging. A branch name alone is not sufficient release authorization.

**Merge approves staging, not publication.** CI cannot approve/reject a stage or
manage dist-tags. Keep the inert bootstrap pending until real-release inspection;
never approve the bootstrap. Preserve newer dev work/notes during back-sync.

## 4. Docs-only or maintenance update

```text
Can wait for the next release?
    yes → docs branch → PR to dev → next release branch → main
    no  → docs branch from main → docs-only PR to main
                                      │
                           normal CI; staging gate skips
                                      │
                           back-sync change to dev by PR
```

Do not merge `dev` wholesale into `main` just to deliver docs. Do not use the
reserved release branch for an ordinary docs PR. Main remains protected; direct
pushes are not the normal path.

## 5. Diagnose or recover staging

```text
Failed staging run
       │ inspect job boundary; inspect npm if submission could have started
       ▼
Needs a workflow fix? → reviewed correction PR into main
       │                (ordinary fix PR does not stage)
       ▼
Actions → Stage accepted Pi-lence release → Run workflow → select main
       │
       ├─ check-environment (default)
       │     main-only environment admission + safe context output
       │     NO checkout, OIDC, npm or upload
       │
       └─ stage-main (explicit owner authorization)
             expected version + npm-inspection acknowledgement
             pin main commit; require matching manifest and unpublished version
             fresh checks/archive → one stage submission → owner review
```

Recovery means **stage main, expecting version X**. Select branch **main**, choose
**stage-main**, enter **expected_version** (for example `0.1.0`, without a `v`), and
check the inspection acknowledgement only after completing section6 below. No PR
number or commit input is needed. The version is a confirmation, not an override:
the workflow will not edit package.json to match it.

The dispatch pins main's exact commit; later main changes cannot enter that run.
Reviewed product, documentation, license and release-tooling corrections may be
included under the same still-unpublished version. Schema3 records bind the actual
source/workflow commit, authorization mode, expected version, invoking/rerun actors,
run/attempt and archive digests. Normal automatic runs also record the release PR;
manual runs do not invent an original PR. Provenance describes the actual source.
Old bundles cannot be reused, even if their package version matches.

Selection, preparation, post-test verification and submission each check npm's
public package metadata. A published target version stops the run regardless of
`latest`; lookup errors,404 or malformed/incomplete metadata are inconclusive and
also stop it. This is a snapshot, not an atomic reservation or pending-stage check;
npm remains authoritative, including for versions previously published and removed.
Tags/history provide audit context, not evidence of current registry state.
Recovery stays manual: an unpublished version alone never makes a docs/fix push
submit a candidate automatically.

An unchanged rerun uses the old workflow/source. Only after owner inspection finds
retry safe, use **Re-run all jobs**, not only failed jobs: artifacts bind run and
attempt. After a workflow correction, use a new main-scoped recovery dispatch.
Never weaken the environment rule, grant direct-publish permission or approve a
placeholder to get past an error/expiry deadline.

## 6. What to inspect in npm before a recovery attempt

The recovery acknowledgement means: **I checked for an earlier upload of this
package/version and resolved whether another staging attempt is appropriate.** It
is a human attestation, not an automated registry check or permission to publish.

Open npm's Staged Packages view for the intended package, and inspect that package's
published version history too. Check the exact target version, not just the version
pointed to by the `latest` dist-tag. For the first real release, the target is
`@grepco/pi-lence@0.1.0`.

| What you find                                                          | What to do                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| No pending target version, and that version is not published           | A new staging attempt is appropriate, subject to the source, permission and validation checks.                                                        |
| A pending target version                                               | Stop. Identify its stage ID, compare it with any CI receipt, and inspect its archive before deciding what to do. Do not automatically submit another. |
| Several pending entries for the target version, or an unfamiliar entry | Stop and reconcile them first. Do not automatically replace, reject or approve anything.                                                              |
| The target version is already published                                | Do not retry staging that version. Inspect the published release instead.                                                                             |
| Inspection is unavailable or inconclusive                              | Stop. A failed lookup or unavailable page is not evidence that no upload exists.                                                                      |

The usual single-release flow is:

```text
No pending candidate for this release
    → stage one candidate
    → inspect/download/verify that candidate
    → separately approve publication
```

This is about the intended package/version, not a blanket requirement that the
entire staging list be empty. An upload can succeed even if CI later fails to
receive or save its receipt; a failed workflow does not necessarily mean that
nothing was staged. An existing stage is something to investigate, not a reason to
blindly retry or automatically discard it.

**First-release exception:** the inert `0.0.0-bootstrap.0` stage is deliberately
pending. We expect **bootstrap only → bootstrap plus real `0.1.0`**, rather than
zero total stages → one. The public `0.0.0-stage` placeholder is not publication of
`0.1.0`. Never approve the bootstrap; rejecting it remains a separately authorized
step during real-release inspection.

The acknowledgement defaults to false and is required for recovery, not for the
harmless diagnostic. It does not verify your inspection or act as a one-use token:
a rerun retains the original inputs, so inspect again before any retry that could
repeat an upload. It grants no authority to publish, reject or replace a stage.

## 7. Last-minute change without an unnecessary version bump

Suppose `1.0.0` has been staged but **not published**, and you remember a change you
want included. Publication commits the version; staging creates a reviewable
candidate. You need a new candidate, not an automatic bump to `1.0.1`.

1. **Settle any active attempt first.** Let it finish, or deliberately cancel it
   and inspect the outcome. Cancellation can happen after an upload; it is not
   proof that no stage exists. Do not race a replacement against an older upload.
2. **Inspect npm using section6.** If an unwanted `1.0.0` candidate exists, record
   its ID/receipt and explicitly reject it using owner authentication/2FA. Verify
   the outcome before continuing. CI never rejects, replaces or approves it for you.
   If `1.0.0` is already published, stop: a code change needs a different version.
3. **Review and merge the correction into main through a PR**, keeping package.json
   at `1.0.0`. Update that version's changelog and reconcile any Changeset note for
   this included change so it is not accidentally queued again for the next release.
   Do not pull unrelated moving dev work into main or rerun release preparation.
4. **Dispatch Stage accepted Pi-lence release on main**, mode **stage-main**, with
   **expected_version: `1.0.0`** and the renewed inspection acknowledgement. If main
   now contains a different version, the workflow refuses instead of staging it.
5. **Wait for fresh validation and staging.** The replacement has its own tested
   archive/digest, source commit, run/attempt and stage ID. Never relabel an old
   artifact, transfer an old candidate's test approval, or reuse its receipt.
6. **Inspect/download/verify the replacement**, then separately approve that exact
   stage for publication. Verify public bytes afterward and back-sync final release
   metadata, corrections and main ancestry to dev, preserving newer unrelated work.

The invariant is **publish the exact candidate we tested and reviewed**, not
**the first candidate permanently owns an unpublished version**. Rejected candidates
remain historical evidence, not interchangeable artifacts. This exceptional manual
path does not grant CI direct publishing, dist-tag, rejection or replacement powers.

## Appendix: resources used during release planning

- https://docs.npmjs.com/staged-publishing
- https://docs.npmjs.com/viewing-package-provenance
- https://docs.npmjs.com/trusted-publishers
- https://changesets.dev/guide/automating
- https://changesets.dev/guide/versioning-and-publishing
