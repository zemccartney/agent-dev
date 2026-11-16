# Agentlog maintenance

Use the [shared development guide](../../../../docs/maintenance/DEVELOPMENT.md) for
pinned setup/dependency/check policy, [product design](../../DESIGN.md) for behavior,
and [shared backlog](../../../../docs/maintenance/BACKLOG.md#herdr-release-readiness)
for release work. Product explorations stay in [FOLLOW-UPS](../../FOLLOW-UPS.md).

## Build and verify

From the prepared repository root:

```sh
mise exec -- pnpm --filter @grepco/agentlog check
# Separate consent for a real isolated Herdr/Pi sandbox:
AGENTLOG_RUN_HERDR_TESTS=1 mise exec -- pnpm --filter @grepco/agentlog test:integration
```

Normal tests do not connect to live Herdr. The opt-in suite uses private HOME/XDG/Pi
state and a uniquely named server; a server name alone does not isolate Herdr's shared
plugin registry. It starts no model workload and must leave normal registrations,
configuration and socket identity unchanged. Never link into the owner's normal namespace
without permission. See [usage and trial checklist](../../README.md#verification).

Production `dist/cli.js` is minified/bundled, including reachable pi-tui/transitive JS;
Node built-ins remain external. Focused tests use separate `.build/test` modules.
Test helpers currently construct the clean runtime; this is **not** a production release
builder. The helper omits the canonical root LICENSE. Production packaging, license
validation, immutable archives and public installers remain outstanding—not hidden by a
passing local build. Consumers must not install pi-tui, pnpm or a compiler separately.
Keep full exact-version third-party copyright/license/notice text with bundled code.
No bundled JavaScript runtime is approved.

pi-tui owns terminal/input/layout machinery; the plugin owns registry state/actions.
When rows change, recreate SelectList while preserving SessionKey; initialize it before
input and move a prefilled Input cursor to the end. Compare Input values around forwarded
input rather than relying on a nonexistent onChange API. Do not extract a shared UI framework
without concrete repeated needs. Required UI behavior was exercised without optional native
helpers; adding one would require platform/lookup/license verification, not consumer compilation.

## Recorded evidence and limits

- The October 2026 source-build milestone recorded 65 package tests and real isolated
  Herdr 0.9.3/Pi 1.2.0 acceptance on macOS/Node 24.16.0. It covered clean bundled UI,
  organization, mouse/keys/Unicode/resize/draft preservation, durable edits after popup
  termination, existing-pane focus and Herdr-first/Pi-SIGTERM-first/Pi-SIGKILL-first recovery.
- Independent-review repairs AL01/AL02/AL03 implemented serial loading/refresh interaction,
  readability rechecks on cached metadata, and canonical compiler file identities.
  Follow-up review inspected `e98c58b`; the path-normalization regression was mutation-verified.
  This historical review is not a current release approval or a claim of a new host run.
- Developer Node is now root-pinned separately from consumer Node 24.15+/25.7+ and intended
  Node 26 support. Version-boundary tests are not actual minimum/all-line runtime evidence.
  SQLite remains an explicitly accepted release-candidate risk, not Stable (2).
- Human daily-use acceptance, clean public install/update/failure/removal and refreshed
  lifecycle/packaging review remain open. Full Mac reboot and physical-terminal/IME behavior
  are not established by the scripted suite. No automatic trial/relink is authorized.
