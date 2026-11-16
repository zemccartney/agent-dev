# Pi-lence release protocol

Use [release flows](RELEASING.md) for the operator walkthrough and recovery decisions.
This guide records the implemented safeguards, not authority to run live operations.
All code paths below are repository-root-relative. Herdr publication is separate.

## Source and approval boundaries

Preparation is requested explicitly on **dev**; ordinary development merges do not
prepare or stage releases. The owner reviews the full `changeset-release/main → main`
PR and current merge-tree checks. Manual merge authorizes **staging only**; npm
website approval with 2FA is the separate publication decision. Main-only manual
recovery also requires explicit authorization and inspection, not just an unpublished version.

Keep auto-merge off, strict main freshness and maintained macOS checks. Read-only
CI uses immutable action revisions, no persisted checkout credentials and no release
credentials. Pi host jobs cover macOS ARM64/Node 24.22.1 and 22.23.4, plus advisory
Ubuntu 24.04 x64/Node 22.23.4 and 24.22.1. Runtime jobs capture the host Node path before
restoring developer Node for pnpm. Linux failures remain visible for triage; do not
make them mandatory merely because they exist. General product/safety defects still matter.

Main-bound checks reject tracked `plan.md`, `thinking/` and `.superpowers/` scratch.
This targeted rule does not ban ordinary design docs or work-branch plans. Retain the
candidate projection/guard tests for old scratch paths even after current docs are removed.

Release jobs restore no dependency/build caches: mise `cache: false`, setup-node
`package-manager-cache: false` and no explicit cache input or equivalent restore action.
A fresh job-local package-manager cache and deliberately transferred, digest-verified
candidate artifact are allowed; untrusted build output is not.

## Version preparation

Changesets CLI 3.0.3 coordinates independent versions and changelogs, not publication
or selective source promotion. Herdr remains private to npm. Intentional no-release
changes need no empty note; missing-note reminders must be non-blocking.

The low-level `scripts/prepare-pi-release.mjs` is only for an explicitly selected,
clean **disposable** checkout with pinned tools/dependencies already installed:

```sh
mise exec -- node scripts/prepare-pi-release.mjs --check
mise exec -- node scripts/prepare-pi-release.mjs --apply
```

Both return `sourceCommit`, `targetVersion`, `changesetIds`. Check is read-only;
apply changes only Pi manifest/changelog and consumed Pi notes. Separate Herdr
notes/versions remain unchanged; mixed Pi/Herdr notes must be split. No Pi intent
returns a null target without versioning. The initial 0.0.0 guard still requires 0.1.0
in fixtures/new-source validation; the real package is already published at 0.1.0.
Unknown workspace identities/configuration, prereleases, dirty trees or unexpected
output changes fail closed. No local commit/tag/branch/remote operation is performed
by this generator. Changesets `commit: false` does not disable the surrounding
workflow's deliberate GitHub commit.

Current workflow source setup: both fresh jobs check out the exact dispatch SHA,
create local Changesets `dev` at that SHA and require fetched `origin/main` ancestry.
They refuse an existing local dev rather than overwriting it. Later remote dev
commits do not enter or invalidate the selected snapshot. The generator itself
does not select/fetch branches or protect remote writes. Moving these source rules
into the orchestration module is [outstanding refactoring](BACKLOG.md), not current behavior.

On failure, partial CLI writes may remain in the owned disposable checkout; discard
and recreate that checkout at the same source after inspection. There is no automatic
rollback/reset. Temporary command homes/configs are removed on either outcome.
Subprocesses use installed tools, bounded execution and allowlisted environments;
implicit pnpm dependency repair is disabled only inside preparation, not workspace policy.
This is process isolation, not a VM/network sandbox.

Safe local regression exercise (synthetic notes, no real release preparation):

```sh
mise exec -- node --test scripts/changesets.test.mjs scripts/prepare-pi-release.test.mjs scripts/pi-release-pr.test.mjs
```

## On-demand release PR

Use Actions → **Prepare Pi-lence release (choose dev)** → select **dev**.
GitHub's selector chooses the workflow/source revision; it is not ignored. Only dev
is eligible. The orchestration CLI requires trusted workflow context and is not a
general local PR creation tool.

1. A read-only job generates and fully checks a candidate. Empty/Herdr-only intent
   is a successful no-op. The selected source must already contain main ancestry.
2. A separate fresh write job regenerates the same selected source and compares
   its version-payload digest. It rechecks repository/ref/workflow/actor permissions
   and existing branch/PR state before writing. No npm/OIDC authority exists here.
3. Atomic create-only ref reservation and a GitHub commit with expected source head
   protect `changeset-release/main`; no force-update fallback. The resulting main-target
   PR is a draft. Herdr source stays included; separate notes and versions remain unchanged.
   Only tracked scratch paths named above are omitted. This digest is **not** the npm archive hash.
4. Review the whole diff against main, not only generated version files. GitHub's
   **Approve workflows to run** button starts bot-PR CI, not release approval. PR CI
   checks the merge tree, unlike prepared-source checks. Deliberate candidate fixes
   are allowed with renewed checks; changes to main also require renewed validation.

Preparation never refreshes from moving dev, overwrites an existing candidate, merges,
closes or deletes a PR. A ref collision or concurrent candidate edit fails; partial
remote state is deliberately left for inspection. Before any branch exists a failed
run can be rerun. After partial creation, stop for an owner decision to finish or abandon.
To abandon, preserve wanted fixes, close its PR, delete only the reserved release branch,
then request fresh preparation. Do not edit that branch while preparation runs.

## Native staging and exact archive identity

`stage-pi-release.yml` uses **push to main**, not PR-derived deployment identity.
The read-only selection gate requires the exact pushed SHA to be a merged/non-draft,
same-repository `changeset-release/main → main` PR's merge commit, with eligible
actors/merger. Ordinary maintenance/direct/dev pushes skip before builds/npm authority;
API errors or ambiguous records fail closed. Deleting the merged source branch is harmless.

Manual **stage-main** instead binds current invoking/rerun permissions, main event/workflow
SHA, clean exact checkout, main ancestry and a matching canonical stable nonzero
`expected_version` without `v`. No original PR is invented. The input never edits a version.

- The validation job independently authorizes, uses a fresh frozen setup, runs full
  checks, packs once and exercises **that archive** on maintained Node 24/22 hosts.
  The canonical packer supplies ten consumer files; CHANGELOG is not shipped.
- Schema3 `release.json` binds name/version, authorization mode, expected manual version,
  actual validation/workflow source, actors, run/attempt, archive filename, SHA256 and
  SHA512. Automatic runs also bind PR/head; manual records leave those null. Reverify
  source and bundle after tests; reject old schemas, unexpected files and changed bytes.
- A fresh submission job downloads the explicit same-run artifact ID, independently
  verifies its record digest/source binding, and alone receives `id-token: write`
  in `npm-staging`. There is no rebuild/repack between tests and submission.
- Selection, preparation, post-test verification and submission each perform a bounded
  unauthenticated public-metadata GET. Published targets, non200 (including404), lookup
  errors or malformed/incomplete identities stop. No redirects/retries/credentials.
  This is neither pending-stage inspection nor an atomic reservation; registry state
  may change and a removed published version is not promised reusable.
- The adapter resolves and version-checks mise-locked **pnpm 12.15.0** via an absolute
  executable, never an ambient npm/pnpm shim. It stages a private copy of the existing
  absolute tarball, not a package directory, with fixed npm registry/public access,
  ignored scripts and explicit provenance. Private workspace/HOME/XDG/config/cache and
  an environment allowlist exclude inherited tokens/routing. `fetchRetries: 0`,
  `fetchTimeout: 30000`; no submission retry. Upstream signing may retry before upload
  within the two-minute child deadline.
- A validated response produces `pi-stage-receipt.json` and a summary with stage ID
  and hashes. Bundle/receipt retention is 30 days: retain them locally during review.
  **Green means a stage receipt, not publication.** CI cannot list/view/download/reject/
  approve pending stages, change dist-tags or back-sync branches.

Safe byte-level regression exercise uses a loopback registry, not npm auth/OIDC:

```sh
mise exec -- node --test scripts/pi-release-registry.test.mjs scripts/pi-release-select.test.mjs scripts/pi-release-npm.test.mjs scripts/pi-release-stage.test.mjs scripts/stage-pi-release.test.mjs
```

A timeout, interruption, malformed/missing response or lost receipt after submission
may mean a pending stage exists. Inspect npm before retrying; never add a token or
broaden authority to recover. [Recovery flow and inspection table](RELEASING.md#5-diagnose-or-recover-staging)
cover same-version corrections and run/attempt-bound retries.

## Owner-controlled setup and inspection

These settings require explicit owner consent to change. Existing 0.1.0 publication
is not permission to bootstrap again or assume current remote settings are unchanged.

- GitHub default branch stays main. Keep default workflow permissions read-only;
  **Allow GitHub Actions to create and approve pull requests** enables bot PR creation,
  but this workflow never approves. No PAT/custom App credential is required.
- `workflow_dispatch` must be registered on default main. For a genuinely new setup,
  use the inert registration template in a minimal main PR, then integrate main into
  dev while retaining the full dev workflow. Do not replace an already active workflow
  with the stub or promote all development source just to register it.
- `npm-staging` permits explicit **branch main only**, not all protected branches;
  no reviewers/wait timer, administrator bypass disabled, no npm secret. This is an
  identity restriction, not another per-release approval prompt.
- npm trusted publisher: GitHub `zemccartney/agent-dev`, filename `stage-pi-release.yml`,
  environment `npm-staging`, **stage only**, no direct publication/dist-tag authority.
  Require account/package 2FA, enforce organization2FA, and disallow traditional
  publishing tokens. Newly configured trust needs timely first-use validation (npm
  documents two days); saved settings are not proof of authorization. Verify actual
  status after staging; stop rather than broaden permissions if rejected.
- First-package bootstrap is a separately approved public registry write, not a dry run:
  an inert `0.0.0-bootstrap.0` archive, no extension/scripts, `bootstrap-never-approve`
  tag creates a public `0.0.0-stage` placeholder. Never approve it. Its pending state
  need not prevent a distinct real-version stage; rejection is a separate owner action.
  For this package the owner reports it was rejected after 0.1.0; no bootstrap action remains.

Before publication, inspect the exact stage ID/name/version against the receipt.
With explicitly authorized private owner authentication, `pnpm stage view <stage-id>`
and `pnpm stage download <stage-id>` retrieve registry evidence; compare SHA256 of
those downloaded bytes to the tested archive. Verify provenance/trust status and
resolve uncertainty before website 2FA approval. A client receipt alone is insufficient.
After publication, download public bytes and compare again; record version, stage,
source/run/attempt, authorization mode, digests and trust outcome. Provenance can be
public while a stage is pending. [Supply-chain limits](SUPPLY_CHAIN.md) still apply.

Back-sync accepted versions/changelog, consumed-note deletions, release fixes and main
ancestry through a disposable PR head into dev. Preserve newer work/notes; do not
propagate release-only scratch omissions or use permanent main/dev as an auto-deletable
PR head. Use a merge preserving main ancestry, not a reset/re-version of already consumed
intent. No automatic tags/GitHub Releases/finalization exist yet; see [backlog](BACKLOG.md).
