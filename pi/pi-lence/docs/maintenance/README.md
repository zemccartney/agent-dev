# Pi-lence development and maintenance

See the repository's [development guide](../../../../DEVELOPMENT.md) for setup and
[maintenance policy](../../../../MAINTENANCE.md) for compatibility commitments.

## Test local changes

For an isolated trial, follow the [disposable hands-on demo](../../../../DEVELOPMENT.md#pi-lence-disposable-hands-on-demo).
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
