# Repository protocol

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
Pi's check also runs its isolated, pinned-SDK smoke. Core declarations are generated
under ignored `node_modules/.cache/agent-dev/` before tooling consumes them.

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
Remove each age exclusion when eligible (all current Pi 1.3.0 exclusions expire by
**2026-10-22 19:14:03 UTC**), updating the review record and policy tests together.
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
credentials or release credentials, full checks on `macos-15` (ARM64), and Pi checks
on `ubuntu-24.04`. Main-bound PRs and pushes additionally reject tracked `plan.md`,
`thinking/`, and `.superpowers/` scratch artifacts. This targeted gate does not ban
ordinary documentation or work-branch plans.

This foundation does **not** yet provide release automation, Changesets publication,
final Herdr artifact installers, or complete real-host/mode acceptance. The Pi smoke
uses some private host components and manually dispatched typed events; it is not
proof of every lifecycle, platform, or runtime combination.

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
