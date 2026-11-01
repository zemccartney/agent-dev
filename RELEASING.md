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
       └─ stage-accepted-release (explicit owner authorization)
             release PR number + accepted merge SHA + npm-inspection acknowledgement
             verify accepted release ancestry and unchanged Pi package/LICENSE
             fresh checks/archive → one stage submission → owner review
```

Recovery runs corrected tooling at the selected main SHA, while recording the
original accepted release SHA separately. It refuses product/package/packer/license
changes since that acceptance. Provenance describes the actual validation/workflow
commit. Old run artifacts are not reused.

An unchanged rerun uses the old workflow/source. Only after owner inspection finds
retry safe, use **Re-run all jobs**, not only failed jobs: artifacts bind run and
attempt. After a workflow correction, use a new main-scoped recovery dispatch.
Never weaken the environment rule, grant direct-publish permission or approve a
placeholder to get past an error/expiry deadline.
