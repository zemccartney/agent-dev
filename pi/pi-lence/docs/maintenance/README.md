# Pi-lence development and maintenance

See the repository's [maintenance index](../../../../docs/maintenance/README.md),
[development guide](../../../../docs/maintenance/DEVELOPMENT.md) for setup and
[maintenance policy](../../../../docs/maintenance/MAINTENANCE.md) for compatibility commitments.

## Test local changes

For an isolated trial, follow the [disposable hands-on demo](#disposable-hands-on-demo).
It uses a packed candidate, temporary Pi home and test provider without touching
normal settings or credentials.

For source iteration in an explicitly chosen Pi environment:

```sh
pi -e /absolute/path/to/agent-dev/pi/pi-lence/src/reference-ui.ts
```

Run `/reload` after source edits. Do not also load an installed npm or checkout copy.
For persistent checkout registration in that environment:

```sh
pi install /absolute/path/to/agent-dev/pi/pi-lence
```

Keep the checkout at that path; update it through Git, then `/reload` or restart Pi.
Pi does not update local-path packages. Use `pi list` to inspect registrations;
remove the old source before switching between npm and a checkout or moving it:

```sh
pi remove /absolute/path/to/agent-dev/pi/pi-lence
```

Use `--local` when removing a project-scoped registration. Removal unregisters the
checkout without deleting it or saved pins. See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
for package-management details.

## Checks and packaging

From a prepared repository root:

```sh
mise exec -- pnpm --filter @grepco/pi-lence check
mise exec -- pnpm --filter @grepco/pi-lence pack:candidate -- /tmp/pi-lence-candidate
```

Packing requires a fresh output directory and prints the artifact path and SHA-256.
It stages consumer-only metadata and source with the root license, without
publishing or modifying source.

The full check includes formatting/types/lint, fast regressions, a pinned-SDK smoke,
and real-host tests against the packed artifact. Warning tests take about two
minutes. `check:contracts` is a faster subset, not the complete acceptance gate.

## Verification evidence

### Packed-host behavior

| Target                                     | Recorded result                                                  |
| ------------------------------------------ | ---------------------------------------------------------------- |
| macOS ARM64, Node 22.19.0 and 24.16.0      | Previously recorded Pi 1.3.0 packed-host suites passed           |
| Ubuntu 24.04 x64, Node 22.19.0 and 24.16.0 | Previously recorded Pi 1.3.0 packed-host suites passed; advisory |
| macOS ARM64, Node 24.22.1                  | Pi 1.3.0 packed-host suite passed on 2026-11-16                  |

[CI results](https://github.com/zemccartney/agent-dev/actions/workflows/ci.yml) identify
tested revisions; these results are not a promise of broader platform support.

Real-host tests cover managed tarball install/reinstall/removal, print/JSON/RPC,
regular/fullscreen UI, keyboard and fullscreen mouse access, saved pins,
new/resume/fork/reload, dialogs, errors, draft preservation, resize/Unicode,
and actual warning completion/cancellation. They use private homes and a
network-free test provider, not personal credentials or a normal installation.

The SDK smoke uses private host components and controlled events; it does not
replace CLI tests. Live-provider retries, actual computer sleep and a comprehensive
release security review remain outside these suites. The initial owner daily-use
trial was accepted; no new soak period is required.

### Public npm package management

Verified on **2026-11-16** against the [public registry](https://registry.npmjs.org/@grepco%2fpi-lence):
`@grepco/pi-lence@0.1.0` was `latest`. Public install, list, targeted update and removal
passed on Pi **1.3.0 and 1.5.2**, macOS ARM64 / Node 24.22.1, using disposable homes
with separate settings and npm caches. Installed identity and removal were checked.

This verifies package management, not Pi's installer or UI compatibility on Pi 1.5.2.
Only 0.1.0 was available, so an upgrade between releases was not exercised.

## Disposable hands-on demo

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
