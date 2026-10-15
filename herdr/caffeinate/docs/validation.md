# Validation record

## Current review handoff

Production is now the Node-24-only minified bundle with standalone pi-tui, separate modular test output and a licensed source-free payload. **Independent review has not occurred**; use `review-request.md` for the user-coordinated fresh-context review.

Final non-live verification (`task-6-final.log`): frozen install, formatting, strict TypeScript, type-aware lint, **107/107 TAP**, **8/8 integration**, **1/1 actual relocated-runtime check**, zero skips, and clean `git diff --check`. Actual runtime: Node **24.16.0**. Payload: **225,321 raw bytes**, **69,776 summed per-file gzip bytes** (not an archive size). The latest permitted isolated bundled-Herdr and toolkit runs passed in Task 5; no runtime code changed afterward.

Open gates: independent review; actual Node 24.0.0; real Pi/Claude exits under active caffeination and native survivor evidence; physical battery/display behavior and overnight reliability. No normal-trial restart/relink, real-agent run, sleep-assertion probe, release, merge or publication was performed during this refactor.

The dated sections below are historical checkpoint records, not claims that earlier build layouts or counts remain current.

## Platform gates — 2026-10-12

- macOS; Node 24.16.0; Herdr 0.9.3, protocol 22.
- `npm test`: 2 probe tests passed after missing-module RED.
- `npm run probe:assertions -- --allow-system-assertion`: PASS timeout, owner SIGTERM, owner SIGKILL, explicit child SIGTERM. Each assertion was observed via `pmset -g assertions` and absent after exit. Validated argv: `caffeinate -i -w OWNER_PID -t WHOLE_SECONDS`, no wrapped utility. Probe max 15 seconds.
- Actual `pmset -g batt` on this machine: `Now drawing from 'AC Power'` (desktop/no battery listing). Battery parsing must also handle the documented `Battery Power` heading; physical unplug testing remains pending.
- Disposable Herdr server under isolated XDG config/state `/tmp/caffeine-herdr-test`, named `caffeine-validation`; normal server/config untouched.
- `agent.get` exposes terminal_id, agent_session, state_change_seq, screen_detection_skipped. `agent.explain` exposes authoritative skip reason or positive matched_rule/visible flags and fallback_reason. Live Pi-shaped simulator authority confirmed after session-start anchoring; acknowledgement of a report before anchoring had no effect. This is not a real Pi model run.
- Claude positive working/idle/blocked evidence confirmed using installed `agent explain --file` on synthetic screens; fallback produces no matched rule. No private transcript contents committed.
- Server identity can use owned local socket device/inode/birth time. `lsof -n -Fpc SOCKET` identifies a local `herdr` server PID; plugin.list supplies enabled state. Local foreground agent PIDs can be checked against OS process identity; remote/SSH foreground commands are not eligible.
- Versioned source and installed schema confirm subscription events and plugin registry reads. Lifecycle restart/loss/replacement, disable, popup, and real agent scenarios remain downstream validation tasks.

## Implemented-path validation

- Final review verification: `npm test` **53/53 passing**; existing Pi project baseline **8/8 passing**; `git diff --check` clean.
- `npm run test:integration`: fake Herdr Unix socket -> production evidence adapter -> production model/monitor -> real child processes (substituted for OS assertions); **5/5 passing** including runtime singleton and split-UTF-8 IPC tests. No paid model calls.
- Actual disposable Herdr plugin link accepted the manifest. Controls action initially exposed a real API constraint: popup placement rejects `target_pane_id`. Fixed with a RED/GREEN regression by passing captured target only in popup environment. Repeated action succeeded.
- Real Herdr client attached in a pseudoterminal: popup rendered, Escape closed it, client detach exercised. No normal Herdr config was changed.
- Native Pi-shaped simulator, with proper session-start anchor: idle -> working -> ten-second delay acquired a real `PreventUserIdleSystemSleep` assertion and coffee metadata; deadline remained anchored to start.
- Plugin disable: monitor and its caffeinate child exited, coffee token cleared, simulator stayed working.
- Actual production monitor SIGKILL: its macOS assertion disappeared. Verified-dead disposable runtime directory removed explicitly, then restart showed no restored lease and no automatic adoption of ongoing work.
- Manual three-second lease on production monitor expired, without ending simulated work.
- Confirmed Herdr server stop with active caffeine: assertion released and monitor exited. Regression distinguishes missing server ownership from transient read failure.
- Production assertion helper independently passed a real short native timeout. Unrelated existing caffeinate assertions were observed but never modified.
- Stale UI guard fired once during the monitor's initial discovery (snapshot before first observation completed); retry after discovery succeeded. Treat this as a usability wrinkle, not a reason to remove identity/revision guards.

## Review

Author self-review only: no subagent reviewer was available. Found and fixed split UTF-8 decoding across socket chunks (Herdr identity and private IPC), with RED→GREEN regressions. Added consumer coverage for shared settings propagation and release/cancel controls. See `review.md` for deferred polish and scope rulings.

## Real Pi demo — 2026-10-13

A real foreground Node tool loop ran in Pi for five minutes (03:12:52–03:17:52 UTC), emitting 30 timestamps without network requests or file writes. The user exercised automatic caffeination, a manual 36-second expiry, reapplication, and the controls, and confirmed everything worked as expected. The sidebar cup and normal-Herdr shortcut/configuration were also confirmed. This does not validate Claude, laptop battery transitions, or overnight reliability.

## Popup UX iteration 1

- Regression verification: `npm test` **66/66**, integration subset **5/5**, existing Pi package **8/8**; `git diff --check` clean.
- Focused-agent first; explicit Tab/clickable agent picker, Herdr workspace/tab labels, list rules, separate contextual/global actions, editable hours/cursor, `↵` primary buttons, and mouse hit-testing.
- Added read-only label/theme discovery in the popup process. No monitor/model/assertion changes and no running-monitor restart needed.
- Live read-only Herdr metadata query returned human labels for all five currently visible agents; current static Gruvbox tokens resolved correctly.
- Actual 80 × 20 pseudoterminal probe exercised the production popup with a fake monitor: Tab, mouse selection/open/apply/settings/close, guarded fractional-hour command, and mouse/cursor/raw-mode cleanup passed. It acquired no OS assertion. This is not an end-to-end Herdr mouse-forwarding test.
- Theme support is deliberately partial: static Gruvbox dark/light and simple hex-token overrides, otherwise ANSI fallback. Native right-click integration needs a Herdr extension point.
- User reports a “huge improvement”; subsequent navigation feedback is addressed below. Author review only; independent review and lint/typecheck/format tooling remain deferred.

## Popup UX iteration 2 — persistent navigation

- Reproduced Settings → Help → Settings creating cyclic back destinations. Keyboard reproduction rules out mouse hit-testing as the cause.
- Removed history-based navigation. Persistent Agents / Settings / About tabs use accent-color selection; Agents restores its last detail/list view. Active-tab clicks are idempotent, and unsaved settings survive tab changes.
- Removed interior padding in shortcut parentheses. The additional navigation row raises the minimum inner size to 56 × 18 cells.
- RED→GREEN navigation and rendering regressions; `npm test` **69/69**, integration subset **5/5**, `git diff --check` clean.
- Actual 80 × 20 PTY with the production popup and a fake monitor: mouse Settings/About/Settings/Agents sequence restored picker selection and preserved unsaved settings; apply and close passed. No OS assertions acquired. End-to-end Herdr visual acceptance remains for the user.

## TypeScript/build and package-local tooling — 2026-10-13

- Tested on macOS with **Node 24.16.0**, pnpm **11.26.0**, and Herdr **0.9.3**. Supported Node floor is now **24.0.0**, per the user's Node 24 LTS baseline decision; Node 22 support was dropped. The actual minimum binary was not exercised: lower/boundary versions and Linux host rejection were simulated in isolated subprocesses.
- Pinned dev tools: TypeScript 7.0.2, tsdown 0.23.0, oxlint 1.87.0, oxlint-tsgolint 7.0.2003, oxfmt 0.72.0, and @types/node 24.19.1. Frozen pnpm install passed with the seven-day cooldown, no trust downgrade, no exotic subdependencies, and no approved dependency scripts. No security exception or dependency override was needed.
- `pnpm check`: formatting, independent strict TypeScript, type-aware Oxlint, and **83/83 TAP tests** passed. `pnpm test:integration`: **7/7** passed. Production modules execute from `dist/`; source-free/no-node_modules consumer smoke tests pass.
- File-list checks cover owned source, scripts, tests, fixtures and build configuration, and exclude generated output. Isolated projects inheriting the actual config demonstrate **TS2322 → clean** and **no-floating-promises → clean**. They never execute the deliberately broken code.
- Launcher RED→GREEN covers absent/unsupported Node, missing build, unsupported host, absent/old Herdr, argument preservation from an unrelated cwd, installer-command traps, and the cached-manifest shim. Runtime preflight performs a bounded read-only Herdr version query; build preflight needs only Node, not Herdr or a running server.
- A literal compatibility import initially pulled generated JS into source typechecking; a failing file-list regression demonstrated this, and restoring URL-based loading fixed it. The UTF-8 IPC regression also caught dropped passthrough fields during boundary typing; those fields were preserved.
- This tooling migration did not restart/relink the normal Herdr server, discard leases, or acquire native assertions. The earlier native/real-Pi evidence above remains historical; the TypeScript revision has not repeated overnight/laptop/real-Claude acceptance.

## Prepublication refactor — baseline and toolkit spike, 2026-10-13

- Checkpointed the accepted TypeScript/tooling/UX baseline after a fresh frozen install, **83/83** tests and **7/7** integration tests on Node 24.16.0 / pnpm 11.26.0.
- Added a separate active-agent disappearance regression through the actual socket adapter, model, monitor and assertion manager, substituting ordinary Node children for native assertions. Both agents begin protected; removing one stops its child and clears its cup while preserving the survivor's PID and absolute deadline. Withholding removal made the regression fail; restoring it passed. No product lifecycle change was necessary. The strengthened suite passed **84/84**, integration **8/8**.
- Installed exact `@earendil-works/pi-tui@1.0.4` and test-only `@xterm/headless@5.5.0` without supply-chain exceptions or approved scripts. pi-tui's declared Node >=22.19.0 floor is compatible with the chosen Node 24 policy; its transitive marked 18.0.11 and get-east-asian-width 1.6.0 declare Node >=20 and >=18 respectively. pnpm reported existing deprecated yuku build-tool subdependencies; those were not added or upgraded by this change.
- The standalone **test-only** spike covers retained numeric drafts across two tabs, caret/delete editing, bracketed paste, fragmented mouse input, wheel selection, reordered list identity, Unicode at 40/56/80/120 columns, resize, Escape/Ctrl+C, and parent-screen restoration. The helper parses real renderer output through xterm/headless and uses pi-tui's StdinBuffer at the input boundary.
- A minified **173,758-byte** spike bundle was copied outside the checkout with only ESM metadata, no node_modules and no optional native helpers. Actual macOS PTY input edited/submitted a duration and closed the popup, restoring the alternate screen. This is not a Herdr popup test and is not a licensed release payload.
- Harness findings: Node child-process stdin uses a socketpair that macOS `script` rejects; a fixed shell pipeline supplies an ordinary pipe without interpolating paths. The spike entry guard must canonicalize argv paths because macOS temporary paths resolve through `/private/var`. pi-tui `stop({preserveScreen:true})` restores the parent without printing the final document.
- Licensing finding for the forthcoming packaging task: pi-tui's npm tarball omits LICENSE. Registry metadata identifies source commit `7c10bd4337495ee613f2224843ecdf349b80d1df`; its repository-root MIT license was inspected (copyright 2025 Mario Zechner). Packaging must retain the exact upstream license and relevant copied-code notices, including the OpenTUI attribution in StdinBuffer, rather than treating package metadata as sufficient permission text. get-east-asian-width includes its MIT license. Marked's LICENSE includes both its MIT terms and John Gruber's Markdown redistribution conditions; preserve the complete file, not just the MIT section, if its code is bundled.
- Fresh non-live verification: `pnpm check` **92/92 TAP tests**, plus formatting, strict types and type-aware lint; `pnpm test:integration` **8/8**. Neither normal Herdr nor native assertions were touched.
- At this checkpoint the real isolated Herdr gate remained open; it was subsequently completed below. The production popup remains handwritten; Node-major restriction, extensionless application imports, production bundling/licensing, and popup migration are subsequent tasks. Independent review is still pending.

## Isolated Herdr toolkit gate — 2026-10-13

- **GO for the planned toolkit migration.** With explicit permission, `CAFFEINATE_RUN_HERDR_TESTS=1 pnpm probe:tui` passed on macOS / Node 24.16.0 / Herdr 0.9.3. This is a test-only spike, not production-popup acceptance.
- The helper creates private HOME/XDG/Pi/config roots, strips inherited routing and credentials, verifies Herdr/plugin configuration and state paths before registration, and starts an explicitly named server. The relocated minified payload contains only the bundle, ESM metadata and fixture manifest: no node_modules, source, or native helpers. No dependency scripts were enabled.
- A real Herdr client in a macOS PTY exercised exact fractional editing/submission, mouse tab changes, retained drafts, list selection/reordering, Unicode labels, RGB theme color, actual popup-content resize, and Escape back to the sandbox shell. No agents or native assertions were started. Fixture unlink/server exit/root removal completed; normal config/registry hashes and socket identity were unchanged.
- The real-host gate caught weaknesses in the initial tests: substring assertions admitted trailing default digits; `Input.setValue` leaves the caret at the start, so the spike now moves it to the end through the public input API. Nested horizontal tabs need an explicit `VStack` layout root for mouse hit testing. `SelectList` applies `selectedText`, not its unused `selectedPrefix` theme hook. Each has a failing regression followed by a passing correction.
- Resize acceptance waits for the popup's own tab spacing to change, not merely Herdr's outer chrome. Temporary input tracing proved Herdr forwarded correct local mouse coordinates and was then removed.
- Oracle correction: xterm's default Unicode 6 treats the rocket emoji as one cell. A cursor-addressing regression failed (`🚀 X` instead of `🚀X`); both terminal helpers now use the official Unicode 11 addon. Exact development-only additions `@xterm/addon-unicode11@0.8.0` and its required peer `@xterm/xterm@5.5.0` passed unchanged supply-chain policy. These are test tools, not production bundle dependencies.
- Fresh frozen install, formatting, strict types, type-aware lint, **96/96 TAP tests**, **8/8 integration tests**, and the opted-in Herdr probe passed without skips. Evidence is recorded in the execution ledger's `task-2-final.log`. Physical font rendering, production popup acceptance, real-agent exits and native sleep behavior remain separate gates.

## Bundled Node 24 payload — Task 3

- One strict ESNext/Bundler compiler project and one Node 24 types version; extensionless application imports emit runnable modular test files under `.build/test`. Production is one minified `dist/main.js`, without chunks or source maps.
- Consumer engines and error-only developer runtime metadata both restrict Node to `^24.0.0`; simulated launcher boundaries reject 23.x/25.x and accept 24.0.0/later 24.x. Pinned pnpm rejected a deliberately mismatched developer runtime offline without creating install output or fetching a runtime.
- Graph-derived inventory includes the injected rolldown 1.2.12 helper. The payload retains its full MIT license plus the complete Rollup/esbuild third-party notices. The current production popup does not yet import pi-tui, so its upstream-license resolution remains mandatory when Task 4 first bundles it.
- Prepared payload allowlists the single entry, launcher/preflight, manifest, minimal package metadata, canonical root LICENSE and generated third-party notices. Negative tests reject absent canonical/upstream text and unreviewed included packages; exact required bundler text is compared with installed originals.
- Fresh check: **99/99 TAP tests**, strict types/lint/format; integration **8/8**. `pnpm test:runtime` ran the relocated prepared launcher with the actual Node **24.16.0** binary. `CAFFEINATE_TEST_NODE=/absolute/path/to/node` selects another preinstalled binary without rebuilding or provisioning it. **24.0.0 remains unverified** (not installed).
- Before toolkit migration: 44,535 raw payload bytes; 17,183 summed per-file gzip bytes, not an archive-size claim. These measurements will change with the UI migration.

## Toolkit popup migration — Task 4

- Production now uses standalone pi-tui `TuiAltScreen`, explicit layout components, `Input`, `SelectList`, mouse regions and toolkit width handling. Removed the handwritten screen grid, caret editor, width tables and generic mouse decoder. Domain state, target propagation, command guards, monitor, IPC and leases remain separate.
- Accepted navigation/drafts/settings/actions/themes and 56×18 minimum are exercised through the real renderer. Added reordered/removed picker identities, Unicode mouse targeting after resize/scroll, bracketed paste, duplicate submission prevention, and shutdown during initial snapshot/label load/refresh/command. Late completions and failures cannot repaint or leak rejections; closing restores the terminal and closes the client once without sending a monitor command.
- Packaging first failed on newly included unreviewed pi-tui. Exact upstream MIT text omitted from its tarball is now retained under `scripts/licenses/pi-tui-1.0.4`, with the full OpenTUI MIT license and source-attribution/provenance NOTICE. An explicit `vendor:` policy namespace is path-bounded and fails on missing inputs. Marked's full license, including Markdown redistribution terms, and get-east-asian-width's MIT license are retained alongside bundler notices. Tests compare complete required texts.
- Fresh verification: **107/107 TAP**, **8/8 integration**, and actual relocated-runtime check **1/1**, plus frozen install and strict tooling. Current payload: 225,321 raw bytes; 69,776 summed per-file gzip bytes (not an archive size). Production-bundle Herdr acceptance follows separately; the normal trial has not been restarted or relinked.

## Relocated production bundle in Herdr — Task 5

- `CAFFEINATE_RUN_HERDR_TESTS=1 pnpm test:herdr` passed with a real isolated Herdr 0.9.3 server/client and the actual shipped bundle, without source, node_modules or native helpers. Only the sandbox's HOME/XDG/Pi/TMPDIR/config/registration paths were used; the normal configuration, registry and socket identity remained unchanged.
- Verified detached self-launch from the relocated `dist/main.js`, private socket readiness, concurrent ensure deduplication, manifest controls action, captured ordinary-pane target in popup environment, mouse/keyboard navigation, settings drafts/edit/save, resize, Escape back to the shell, monitor survival after popup close, and explicit monitor stop/process/IPC cleanup.
- The detached monitor's command identifies the selected actual Node executable and the relocated entrypoint. This run used **24.16.0**. `CAFFEINATE_TEST_NODE` is checked before creating a sandbox and bound to its `bin/node`; no runtime is downloaded. Minimum Node 24.0.0 remains unavailable/unverified.
- **No agents or native sleep assertions were started.** The live production popup therefore used its empty agent picker; Unicode agent-label and active-target races are renderer tests, not real-agent evidence. The earlier toolkit spike independently exercised Unicode in Herdr.
- **Blocked:** real Pi/Claude exit while actively caffeinated, native assertion/owner/deadline/cup evidence, and independent active-survivor observation require separately agreed finite workloads and explicit permission. The additional `CAFFEINATE_RUN_AGENT_EXIT_TESTS=1` flag currently fails clearly rather than pretending these scenarios are implemented or verified.

## Remaining live checks

Claude real-agent acceptance; further Pi short-response, cancel, permission-wait, multiple-agent and detach scenarios beyond the demo above. Physical laptop battery transitions, display dark with work continuing, overnight reliability, and the revised popup's feel. Record each separately; simulator/PTY tests do not satisfy these checks.
