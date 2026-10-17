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
credentials or release credentials. Full checks on `macos-15` (ARM64) include Pi
on developer Node 24.16.0. Additional packed-host jobs cover macOS/22.19.0 and
Linux x64/22.19.0/24.16.0; Linux also runs the fast contracts. Runtime jobs capture
the requested Node's absolute path before restoring the developer toolchain;
pnpm still runs on Node 24. Main-bound PRs and pushes additionally reject tracked `plan.md`,
`thinking/`, and `.superpowers/` scratch artifacts. This targeted gate does not ban
ordinary documentation or work-branch plans.

Release automation, Changesets and final Herdr artifact installers are not yet
implemented. Before configuring/enabling the release path, walk the owner through
Changesets (release intent, version changes and changelogs), npm trusted publishing
(identity, permissions and its distinction from approval), and the proposed workflow.
Rehearse without publishing and invite preferences; do not present an already-enabled
workflow as a done deal. Every real publication still needs separate approval.

Pi's real-host suites now test the packaged extension independently of the SDK smoke.
The smoke still uses private components and manually dispatched events; neither
suite establishes untested platform support or public-registry installation.

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
