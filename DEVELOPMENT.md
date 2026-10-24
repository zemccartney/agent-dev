# Repository protocol

[MAINTENANCE.md](MAINTENANCE.md) records the personal-first maintenance policy,
compatibility limits and the distinction between host runtimes and user setup.

## Setup and checks

Install [mise](https://mise.jdx.dev/) separately, then review and trust this checkout:

```sh
mise trust
mise run setup
mise run check
```

`mise.toml` pins developer tools; `mise.lock` binds their download URLs/checksums.
The verified toolchain targets macOS ARM64 and Linux x64. Developer Node is
24.16.0; that is not a replacement for each project's consumer prerequisites.
Setup installs locked tools and frozen workspace dependencies. It does not edit
shell configuration, install Git hooks, register Pi/Herdr packages, or publish.
There is no directory-entry hook, and checks do not auto-install missing tools.

| Command                              | Effect                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `mise run check`                     | Root formatting/lint/types/tests, every package's checks, infrastructure validation and exception audit; same command as full CI |
| `mise run test`                      | Repository and package unit/regression tests                                                                                     |
| `mise run format`                    | Format root/package files and TOML                                                                                               |
| `mise run fix`                       | Apply the shared hk formatters, then run shared checks                                                                           |
| `mise run audit:exceptions`          | Read-only registry audit; requires network access                                                                                |
| `mise exec -- hk check --all --plan` | Inspect shared steps without executing them                                                                                      |

Direct `pnpm check` expects the mise-provided tools on PATH. Package `check`
includes formatting; `check:project` is types, lint and tests without formatting.
Pi's check also runs its isolated pinned-SDK smoke and packed real-host suites.
The latter take about two minutes because warning tests wait sixty real seconds.
`pnpm --filter @grepco/pi-lence check:contracts` is a fast feedback subset, not the
full acceptance gate. Core declarations are generated under ignored
`node_modules/.cache/agent-dev/` before tooling consumes them.

## Changed files and optional hooks

```sh
mise exec -- node scripts/check-projects.mjs --staged
mise exec -- node scripts/check-projects.mjs -- pi/pi-lence/src/quiet-mode.ts
```

The runner discovers workspace manifests and checks whole affected projects plus
transitive dependents. Root/shared/unknown paths select every project. Explicit
file lists also recover staged deletions (which hk omits) and matching rename
sources from Git; no paths and no staged deletions select nothing. Git paths are
NUL-delimited, and filenames are never concatenated into shell commands.

Hook installation is a separate, explicit choice, from a primary checkout:

```sh
mise run hooks:install
```

The installer refuses existing hook configuration, existing pre-commit files,
and linked worktrees (whose hooks are shared with their primary checkout).
It never overwrites hooks or installs globally. Do not remove someone else's hook
to make it pass; review the existing setup first.

`hk.pkl` defines one shared step mapping for check, fix and pre-commit. Pre-commit
stashes unstaged edits, formats only selected files, and checks affected projects.
Structured argument lists preserve spaces/newlines/metacharacters. Missing tools
fail the hook. Root canary tests and project checks are ordered to avoid races.
Temporary plans are allowed on work branches: pre-commit is not a release-tree gate.

## Dependency changes

Use the single root pnpm workspace and lockfile; install frozen from the root.
The shared policy rejects too-young/missing-date dependencies, trust downgrades,
unreviewed build scripts and exotic transitive sources. Peers are not auto-installed.
Pi runtime peers stay wildcard host-provided libraries; its exact SDK and declaration
pins are development-only, not bundled into its npm payload.

New age/trust/build exceptions require explicit review of exact versions and a
reason. Do not disable policy, change installers to bypass it, or broadly approve
build scripts. `allowBuilds: false` entries are reviewed denials, not execution grants.

Active exceptions must match `dependency-exceptions.json`. The read-only audit
uses official registry publication times and fails on expired or unavailable data.
Remove each age exclusion when eligible, updating the review record and policy tests
together. There are currently no age exclusions: the seven Pi 1.3.0 exceptions
expired on October 22, 2026 and were removed on October 24.
`minimumReleaseAgeExcludePrune` removes selectors absent from the graph, not expired
ones. The separate Undici trust exception does not age out and needs its own
replacement/removal review.

For mise tool updates, review publication dates explicitly before changing exact
pins: mise's seven-day setting filters fuzzy selections, not exact versions.
Regenerate `mise.lock` for the supported platforms and review checksums/URLs before
installing. A checksum binds bytes; it is not a substitute for source/release trust.

## Branches and releases

Integrate through `dev`; promote only release-ready contents to `main`. Projects
version and publish independently, with Pi-lence first. Every publication needs
explicit human approval of an identifiable artifact; ordinary check/setup tasks
never publish or alter normal host registrations.

CI uses read-only permissions, immutable action commits, no persisted checkout
credentials or release credentials. Full checks on `macos-15` (ARM64) include Pi
on developer Node 24.16.0. Additional packed-host jobs cover macOS/22.19.0 and
Ubuntu 24.04 x64/22.19.0/24.16.0; Linux also runs the fast contracts. Linux results
are advisory compatibility evidence, not an unconditional release gate or a distro
support promise. Failures stay visible for maintainer triage; do not configure those
jobs as mandatory merge checks. Runtime jobs capture
the requested Node's absolute path before restoring the developer toolchain;
pnpm still runs on Node 24. Main-bound PRs and pushes additionally reject tracked `plan.md`,
`thinking/`, and `.superpowers/` scratch artifacts. This targeted gate does not ban
ordinary documentation or work-branch plans.

Local Changesets version/changelog tooling and a manual release-PR workflow are
implemented. GitHub activation, native npm staging and final Herdr artifact
installers still require separate setup. The selected release flow
is on-demand release-PR preparation, human review/merge authorizing native npm
**staging only** through stage-only trusted publishing/OIDC, then owner approval
on npm's website with 2FA. No extra GitHub environment approval is selected.
The intended npm security settings require 2FA and disallow traditional publishing
tokens; CI must not receive direct-publication or dist-tag-management authority.
This setup does not configure that trust, change account settings or enable a
publishing workflow. First-package bootstrap (potentially a public
`0.0.0-stage` placeholder) and default-branch workflow registration still need
review and explicit authorization. Ordinary development merges must not initiate
release preparation or staging.

Pi's real-host suites now test the packaged extension independently of the SDK smoke.
The smoke still uses private components and manually dispatched events; neither
suite establishes untested platform support or public-registry installation.

## Release notes with Changesets

The root pins Changesets CLI **3.0.3**. After normal setup, create a note:

```sh
mise exec -- pnpm exec changeset add
```

Choose the affected package(s), a semantic-version bump (`patch` for fixes,
`minor` for added functionality, `major` for breaking changes), and a short
consumer-facing summary. Projects version independently. Private Herdr projects
can receive notes and versions without becoming public npm packages; their
installation/distribution path remains separate from npm publication.

For the **first Pi-lence release**, select only `@grepco/pi-lence`, choose **minor**,
and write the initial-release summary yourself. Its deliberately unpublished
`0.0.0` baseline lets that note prepare the owner-selected public **0.1.0** later;
this is not a public downgrade or permission to publish `0.0.0`.

The command creates `.changeset/<generated-name>.md`, formats it with Oxfmt, and
does not commit, change package versions, or publish. Inspect the new file
separately because ordinary `git diff` does not show untracked file contents:

```sh
git status --short .changeset
less .changeset/<generated-name>.md
mise exec -- pnpm exec changeset status
mise exec -- pnpm format:check:root
```

Expect frontmatter selecting only `@grepco/pi-lence` with `minor`, your summary,
and a status plan for Pi-lence `0.1.0` with no sibling releases. Commit the note
with the relevant change after review. To undo it before committing, unstage it
if necessary and remove only that generated note, not `config.json` or `README.md`.
Maintenance-doc edits and other changes with no release impact need **no changeset
and no empty placeholder**. Future PR reminders will be visible and non-blocking;
that integration is not installed yet. `changeset status` is an inspection tool,
not a required check: it can exit 1 when changed packages lack notes. Its suggestion
to add an empty note does not override the no-release policy above.

Do **not** run `changeset version` in the primary checkout: it consumes notes and
writes manifests/changelogs. After activation, use the manually requested release-PR
workflow below, which versions a disposable copy of committed intent. With no
pending notes, the pinned CLI's `version` exits 1 without changes. Do not run
`changeset publish`, npm staging or npm publication here. Current Changesets
publishing does not support npm staging; version preparation is intentionally
separate from the future native staging/approval flow.

The existing Pi-lence packer remains authoritative: ten consumer files, with no
CHANGELOG included. Shipping the generated changelog is an optional future decision,
not part of this setup. Exercise the real CLI safely in disposable fixtures with:

```sh
mise exec -- pnpm exec node --test scripts/changesets.test.mjs
```

These tests use installed tools, private homes and an allowlisted environment,
never install dependencies or create a real pending note, and remove their owned
fixtures. They are not a network-enforced or VM sandbox.

### Disposable Pi-lence preparation

`scripts/prepare-pi-release.mjs` is the local version-generation component for the
on-demand release workflow. This helper does not create a release branch or PR,
commit, tag, stage on npm, or publish. The surrounding workflow explicitly creates
a GitHub commit; Changesets' `commit: false` does not disable that operation.

In an explicitly selected **disposable, clean release checkout**, with the pinned
developer toolchain and dependencies already installed:

```sh
mise exec -- node scripts/prepare-pi-release.mjs --check
mise exec -- node scripts/prepare-pi-release.mjs --apply
```

Both print JSON containing `sourceCommit`, `targetVersion`, and `changesetIds`.
Check is read-only. Apply writes only Pi's manifest/changelog and consumes its
selected notes; separate Herdr notes and versions remain unchanged. No Pi intent
returns a null target without versioning. Mixed Pi/Herdr notes must be split.
The initial `0.0.0` baseline must propose `0.1.0`. Unsupported configuration,
prereleases, dirty checkouts and unexpected output changes fail closed.

The caller must select the source commit **before** preparation. Later development
must not replace that snapshot. These functions do not choose a branch, fetch dev,
or guard remote writes. The surrounding workflow implements that separate boundary
with create-only branch reservation and an expected-head GitHub commit. The intended candidate PR targets main, with accepted
versions, changelogs, note deletions and release fixes synchronized back to dev.

Do not apply this to the primary checkout or the owner's real note for this
handoff. On failure, partial CLI writes may remain: discard only the owned disposable
checkout and recreate it at the same selected commit. There is no automatic
rollback or Git reset. Temporary command homes/configs are removed on success and
failure. Subprocesses use installed tools, an allowlisted environment and bounded
execution; pnpm's implicit dependency repair is disabled only in those processes,
not in workspace policy. This is not a network-enforced security sandbox.

A safe demonstration uses synthetic notes, including a moving-dev regression,
and automatically removes its owned fixtures:

```sh
mise exec -- pnpm exec node --test scripts/changesets.test.mjs scripts/prepare-pi-release.test.mjs
```

### On-demand release PR: activation and walkthrough

The workflow is **preparation only**, with no npm credentials, OIDC authority,
staging, publishing, approval or merge step. Ordinary development pushes/PRs run
checks but never prepare a release. Use the GitHub interface rather than running
`scripts/prepare-pi-release-pr.mjs` locally; it requires trusted workflow context.
The workflow and setup below are not activated merely by a local commit.

**One-time setup, only after explicit owner authorization:**

1. In [Actions settings](https://github.com/zemccartney/agent-dev/settings/actions),
   keep the default **Read repository contents and packages permissions** and
   enable **Allow GitHub Actions to create and approve pull requests**. GitHub
   combines those capabilities in one setting; this workflow never approves PRs.
   No PAT, custom App, npm token or extra environment approval is needed.
2. Integrate the reviewed tooling and the owner's unchanged, committed Pi note
   into `dev`. Do not version the note in the primary checkout.
3. Register the workflow on **published main**, not divergent local main: place
   `.github/workflow-templates/prepare-pi-release.registration.yml` at
   `.github/workflows/prepare-pi-release.yml` in a minimal main-target setup PR.
   That PR must contain only this registration file, not development source.
   The stub has no permissions or checkout/install steps; running it explains
   that you must select dev and exits without preparing anything.
4. Integrate that main registration commit back into dev, keeping the **full dev
   workflow**, not the stub, when resolving the same-file addition. Both jobs
   refuse a source that does not contain published main. This avoids an add/add
   conflict in the first real release PR. Do not rewrite either shared branch.

**First behavioral walkthrough:**

1. Open Actions → **Prepare Pi-lence release (choose dev)** → **Run workflow**.
   Select **dev**. The dispatch captures that source commit; later dev commits
   do not enter or invalidate it. The selected source must already contain main.
2. Expect a read-only job to generate and fully check the candidate. No Pi note
   means a successful no-op and no PR. Herdr-only notes do not release Pi.
3. A separate fresh job regenerates the same payload and compares its digest,
   rechecks permissions and active candidates, then creates
   **changeset-release/main → main** as a **draft PR**. The run summary links it.
   Only tracked `plan.md`, `thinking/` and `.superpowers/` scratch is omitted;
   Herdr code stays included. The payload digest is not an npm tarball digest.
4. Review the full source diff, Pi version/changelog, note deletions, and checks.
   If GitHub displays **Approve workflows to run**, that starts read-only PR CI;
   it is not release approval. PR CI checks the merge tree, unlike the earlier
   candidate-source checks. Linux compatibility results remain advisory.
5. **Stop at inspection. Do not mark ready or merge for this walkthrough.**
   Staging is not implemented. The eventual flow remains reviewed main merge →
   native npm staging only → owner approval on npm's website with 2FA.

**Retry, abandon and recovery:** another request refuses an existing branch or
open PR, including a branch left after partial failure. It never refreshes,
force-updates, deletes, approves or merges that candidate. A collision during
creation fails atomically; a concurrent edit before the version commit fails its
expected-head check. Inspect the failed run and any retained branch/PR first.
A failure before any remote branch exists can be rerun; a partial candidate needs
an explicit owner decision to finish manually or abandon it. To abandon, first
preserve any wanted fixes, close its PR if present, and delete only
`changeset-release/main`; then request a fresh preparation. No automated cleanup
silently discards stabilization work. Do not create/edit the reserved branch
while preparation is running.

After eventual acceptance, back-sync versions/changelog, consumed-note deletions
and release fixes selectively to dev—not scratch omissions or a reset of newer
work. Main/candidate changes require renewed merge-tree validation before release.
Live registration, first bot PR/CI behavior and future npm staging must be verified
on GitHub/npm; local tests do not establish those hosted outcomes.

## Manual verification and cleanup

From a prepared checkout:

```sh
mise exec -- node --test scripts/check-projects.test.mjs scripts/check-exceptions.test.mjs scripts/hooks.test.mjs
mise exec -- pnpm --filter @grepco/pi-lence test:integration
mise run check
git status --short
```

Expect passing selection/policy tests and disposable Git-fixture hook checks,
including internally asserted type/test failures and preservation of partial staging.
The Pi smoke prints a `PASS` summary for discovery, warning rendering and cleanup.
Fixtures and isolated homes remove themselves; only ignored build/type caches remain.
These commands must not change tracked files or your real Git hooks/host registrations.
Use `git diff` to distinguish pre-existing edits from unexpected changes.

Do not reload or relink a normal host merely to run these checks. Interactive host
trials and registrations need separate approval; use the package-specific demos
only in the intended trial environment.

## Pi-lence: disposable hands-on demo

This installs the **local candidate only into a temporary Pi home** and opens the
repo-pinned Pi 1.3.0 CLI, not your normal launcher. No provider credentials or network
model calls are needed. From the prepared repository root, paste the whole block
into a POSIX shell. It opens regular mode, then fullscreen after you exit the first.
The printed temporary directory is removed on exit, including its package, npm cache
and synthetic sessions; your ordinary settings and pins are not used.

```sh
(
  set -eu
  node=$(mise which node)
  sdk="$PWD/pi/pi-lence/node_modules/@earendil-works/pi-coding-agent"
  cli="$sdk/$("$node" -p 'require(process.argv[1]).bin.pi' "$sdk/package.json")"
  demo=$(mktemp -d "${TMPDIR:-/tmp}/pi-lence-demo.XXXXXX")
  trap 'rm -rf -- "$demo"' EXIT
  printf 'Disposable demo: %s\n' "$demo"
  mkdir -p "$demo/home/.pi/agent" "$demo/project" "$demo/tmp"
  mise exec -- node pi/pi-lence/scripts/pack.mjs "$demo/artifacts"
  set -- "$demo"/artifacts/*.tgz
  archive=$1
  cp pi/pi-lence/test/fixtures/host-driver.ts "$demo/host-driver.ts"
  printf 'Fixture file contents\n' > "$demo/project/fixture.txt"
  printf '%s\n' '{"compaction":{"enabled":false},"retry":{"enabled":false}}' > "$demo/home/.pi/agent/settings.json"
  : > "$demo/user.npmrc"
  : > "$demo/global.npmrc"

  run_pi() (
    cd "$demo/project"
    env -i PATH="$(dirname "$node"):/usr/bin:/bin" HOME="$demo/home" \
      TMPDIR="$demo/tmp" TERM="${TERM:-xterm-256color}" LANG=en_US.UTF-8 \
      PI_CODING_AGENT_DIR="$demo/home/.pi/agent" PI_LENCE_TEST_ROOT="$demo" \
      PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 \
      npm_config_userconfig="$demo/user.npmrc" npm_config_globalconfig="$demo/global.npmrc" \
      npm_config_cache="$demo/npm-cache" npm_config_offline=true \
      npm_config_update_notifier=false npm_config_audit=false npm_config_fund=false \
      "$node" "$cli" "$@"
  )

  run_pi install "npm:@grepco/pi-lence@file:$archive"
  for mode in regular fullscreen; do
    printf '\nOpening %s mode; /fixture-quit exits.\n' "$mode"
    run_pi --tui-mode "$mode" --offline --no-mcp --no-skills \
      --no-prompt-templates --no-themes --no-context-files --no-approve \
      -e "$demo/host-driver.ts" --provider pi-lence-fixture --model fixture --thinking off
  done
  run_pi remove "npm:@grepco/pi-lence@file:$archive"
)
```

Try this in either mode:

1. Type `fixture-read`. Expect `Fixture answer: fixture-read`; the actual read result
   is hidden in Quiet. Ctrl+Alt+Q switches to Raw; Ctrl+O expands native tool output.
2. Ctrl+Alt+P names the latest response. Type a label and Enter, then send a second
   prompt. Ctrl+Alt+R opens Pins; Tab switches to All. Enter reads a response;
   `p` pins/unpins it, `b` returns to the list, Escape returns to your draft.
   Mouse buttons work in fullscreen; regular mode uses keyboard controls.
3. After two prompts, `/fixture-fork` forks before the second user message. The
   later response disappears from the browser; the earlier pin remains. Clear any
   restored draft before typing the next command.
4. `/fixture-new` saves the current session path and starts an empty session;
   `/fixture-resume` restores it. `/reload` should preserve pins and leave exactly
   one control row. `/fixture-dialog` opens a native confirmation to cancel.
5. Optionally send `fixture-error` to see a real missing-file error remain visible.
   `fixture-slow` waits 62 seconds without updates: expect the native warning after
   60 seconds, then normal idle state. Escape cancels it; subsequent input still works.
6. `/fixture-quit` exits. After exiting both modes, expect removal and automatic
   cleanup. If the shell is forcibly killed, remove only the exact printed demo
   directory after its Pi process has stopped.

All `/fixture-*` commands and the fake provider are test-only and excluded from the
tarball. For automated checks (including forced-failure cleanup), use:

```sh
mise exec -- pnpm --filter @grepco/pi-lence test:host
mise exec -- pnpm --filter @grepco/pi-lence test:host -- --node /absolute/path/to/node
```

The second form changes only the tested host/installer runtime, not pnpm or your
shell configuration. It never downloads Node. Keep candidate tarballs identified
by their printed SHA-256; deleting a local candidate directory has no registry effect.
