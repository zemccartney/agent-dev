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
24.22.1; that is not a replacement for each project's consumer prerequisites.
Setup installs locked tools and frozen workspace dependencies. It does not edit
shell configuration, install Git hooks, register Pi/Herdr packages, or publish.
There is no directory-entry hook, and checks do not auto-install missing tools.

pnpm **12.15.0** and Node **24.22.1 / 22.23.4** were selected after the seven-day
cooldown; the Node pins include the October 2026 security fixes without changing
consumer engine ranges. Updating this checkout does not patch Pi's own runtime or
Herdr users' external Node installations. pnpm 12 adds a bootstrap YAML document to
the shared lockfile for its package-manager pin; application dependencies remain
in the second document. mise still selects the executable. The bootstrap policy
inherits the workspace age/trust settings; there are no config dependencies.

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

## Changesets and releases

Follow [branch policy](BRANCHING.md) for reviewed PRs to dev and
[release flows](RELEASING.md) for preparation, staging and separate publication approval.
[Release protocol](RELEASE-PROTOCOL.md) records the safeguards and owner setup.
Herdr source can be promoted before its release machinery is complete; its publication
and public installer metadata remain separately gated.

Create a release note from the prepared repository root:

```sh
mise exec -- pnpm exec changeset add
```

Choose affected packages, a semantic-version bump (patch for fixes, minor for features,
major for breaking changes), and a consumer-facing summary. Projects version independently;
private Herdr packages can receive notes without becoming public npm packages.
Inspect the generated `.changeset/<name>.md` before committing it with the change:
ordinary `git diff` does not display untracked contents.

```sh
git status --short .changeset
mise exec -- pnpm exec changeset status
mise exec -- pnpm format:check:root
```

Maintenance-only changes need neither a release note nor an empty placeholder.
Reviewers decide release impact. Missing-note reminders are planned, non-blocking,
and not installed; `changeset status` is not a required gate (it can exit 1).
Do not run `changeset version` in the primary checkout: it consumes notes and
writes manifests/changelogs. Use the on-demand release workflow on committed intent.
Do not use Changesets' publisher as a substitute for the native stage-only flow.

## Adding a project

- Keep source, tests, runtime metadata, manifest and usage together under `pi/*`
  or `herdr/*`; shared developer policy stays at root.
- Expose package-owned format/check/type/lint/test commands. The project selector
  discovers workspace members and transitive dependents; root identity/quality
  contracts must deliberately include the new project.
- Separate consumer runtime prerequisites from pinned developer tools. Independently
  check source APIs against supported runtimes; a syntax target is not runtime evidence.
  Keep generated declarations/build metadata under ignored `node_modules/.cache/`.
- Define its actual payload, clean-consumer tests, canonical LICENSE and third-party
  notice checks before distribution. Installers never provision runtimes/package
  managers or edit shell/host configuration. See [maintenance policy](MAINTENANCE.md).
- Choose independent version/changelog and approval boundaries. The current Pi release
  preparation explicitly recognizes only existing project identities; extending the
  workspace does not silently make a new project publishable.
- Link its usage from root README. Add it alphabetically to root CHANGELOG only once
  it has a changelog. Record real unfinished work in [BACKLOG.md](BACKLOG.md).

## Verification and handoff

```sh
mise exec -- node --test scripts/check-projects.test.mjs scripts/check-exceptions.test.mjs scripts/hooks.test.mjs
mise exec -- pnpm --filter @grepco/pi-lence test:integration
mise run check
git status --short
```

Selection/policy/hook tests use disposable fixtures (including expected negative
cases); the SDK smoke prints a PASS summary. Full checks include the packed Pi host
suite. Only ignored build/type caches should remain. Inspect the diff for unexpected
changes; never reload/relink normal hosts just to run checks. The
[Pi-lence maintainer guide](../../pi/pi-lence/docs/maintenance/README.md) owns its
disposable hands-on demo.

For handoff, show commands/actions, expected results, what they establish, and
cleanup/reversal. Distinguish automated evidence, independent review, human acceptance
and unverified cases. Obtain fresh-context lifecycle/safety and packaging/install
review before first publication; author self-review is not that gate. Every publication,
main promotion and normal-host installation requires its own authorization.
