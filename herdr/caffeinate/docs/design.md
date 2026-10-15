# Automatic agent caffeination — first-version design

Status: implemented trial; initial review and fresh repair review completed, reported defects corrected with regressions. Native/physical and minimum-runtime acceptance remain open. The policy sections retain the approved product design; the implementation notes and `validation.md` distinguish current code, historical evidence and unverified live behavior. No unattended-reliability claim is implied.

## Intent

Remove the need to manually start caffeinate or guess how long unattended agent work will last. Prevent idle system sleep during autonomous work while allowing the display to sleep. This controls sleep protection, not execution: expiration never cancels an agent, and cannot guarantee that an agent stops or resumes after machine sleep.

## Agreed scope and policy

- macOS; local Pi and Claude Code agents running inside Herdr. No remote-agent coverage.
- Protect autonomous work of any type, including planning, research, and implementation; no prompt or task classification.
- Each run has an independent wake lease, initially eight hours with an absolute wall-clock deadline. Progress, tools, retries, detaching, and power changes do not reset that deadline.
- Protection is AC-only (provisional policy for hands-on evaluation). Unplugging suspends protection, not its clock. Reconnecting restores protection only if the lease remains valid.
- The machine is protected while any eligible lease needs protection. Overlapping runs may collectively protect the machine for longer than eight hours.
- Protection continues when a Herdr client detaches while the server and agent remain running.
- Confirmed waiting for human input ends that run's lease. Resuming autonomous work begins a fresh lease.
- Users can explicitly extend or reapply protection for a chosen finite duration from now, including durations longer than eight hours, without changing future runs' defaults.
- Detached background commands are outside scope once the tracked agent run finishes.
- Uncertainty preserves an existing lease until its deadline; it does not manufacture or renew leases.
- On plugin startup/restart, an already-working agent with no remembered deadline remains uncaffeinated. The user can manually caffeinate it; otherwise automatic caffeination waits for a reliably observed new run. Do not invent a fresh eight-hour deadline for discovered work. Normal client detach does not restart the background monitor.

## Lifecycle interpretation

These are the approved semantic rules implemented by the evidence adapter and lease model; protocol/simulator tests do not establish complete real-harness coverage. Conversation messages are not run boundaries. A planning conversation can contain multiple short runs followed by a long implementation run.

| Observation                                                               | Lease behavior                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Agent starts autonomous work                                              | Schedule automatic caffeination after ten seconds; deadline is eight hours from run start       |
| Agent emits commentary, calls tools, or keeps working                     | Keep existing deadline                                                                          |
| User types or queues a message while it works                             | No change merely because the user interacted                                                    |
| Agent definitively finishes, is cancelled, or needs user input to proceed | End its lease                                                                                   |
| Agent resumes autonomous work after that boundary                         | Schedule fresh caffeination after ten seconds, with a fresh deadline anchored to that run start |
| Status becomes uncertain                                                  | Preserve existing lease, without extending it                                                   |
| Deadline expires while agent still works                                  | Release protection; do not automatically renew                                                  |

Human typing/queued input does not itself end a run. Only the agent's actual transition to waiting/completed should end a lease, not intermediate prose or keyboard activity.

A permission prompt indicates the agent cannot proceed unattended; it does not establish the user's intent or presence. Reliable lifecycle reports should be preferred to inference. Herdr's screen-derived idle fallback must not automatically be mistaken for confirmed completion.

## Feedback and controls — experimental

Use **caffeination** in user-facing language; retain **wake lease** as the technical domain term. Aim for a compact coffee indicator per agent and a Herdr control popup. Show the indicator only while that session is actually caffeinated. Expiration returns the sidebar to its ordinary uncaffeinated appearance; do not leave a persistent expired badge. The deadline should be prominent in the controls, with minimal explanatory copy. Render the absolute deadline as a monospace ISO 8601 timestamp in the user's machine timezone, including milliseconds and the numeric UTC offset (for example, `2026-10-11T14:00:00.000-04:00`); do not use friendly weekday/time formatting or convert it to UTC. Use the timezone offset applicable at the deadline, including daylight-saving changes. Move rules such as manual extensions exceeding eight hours and not changing defaults into help/documentation.

A run losing caffeination does not imply the entire machine can sleep: other runs or applications may still hold assertions. How battery suspension appears in the detailed controls remains experimental.

### Start delay

Wait ten seconds after autonomous work starts before automatically granting a lease, to avoid indicator flicker during quick back-and-forth. The eight-hour deadline is anchored to the original run start, not the delayed grant. A confirmed finish or wait for input during that interval cancels the pending grant. Commentary, tool calls, and progress do not reset the delay. Confirmed completion removes caffeination immediately, without an end delay.

Explicit manual caffeination bypasses the start delay and sets a deadline for the chosen duration from now. It still obeys the plugged-in requirement. Recommended detail: uncertainty during the initial delay does not reset the timer, but actual caffeination waits for positive working evidence. On that evidence, grant only the remaining original lease duration, and only if the ten-second delay has elapsed. Do not manufacture a later deadline.

Expiration should remain tracked internally for the ongoing run, even though it has no distinct sidebar appearance, so continuing activity cannot automatically grant a replacement lease. Cleanup of that bookkeeping follows reliable run-end/identity handling; implementation details remain unresolved.

Implemented controls:

- Protect for a custom duration from now, including renewing an expired lease.
- Release protection for this run without cancelling the run or automatically reacquiring protection.
- Configurable default duration (settings UI remains experimental).
- One global automatic versus opt-in setting, with automatic as the initial default.
- No per-session automatic/manual policy overrides in the first version. Per-run duration changes and release actions do not change the global policy.
- Manually caffeinating an idle session or an agent confirmed to be waiting for human input arms its next autonomous run instead of immediately preventing sleep. The selected duration starts when work begins or resumes, bypassing the ten-second delay. This is one-shot; subsequent runs follow the global policy.

The armed-next-run state uses plain text in the popup, distinct from actual caffeination; no second sidebar icon is shown. Arming is cancellable, one-shot, and entirely ephemeral: it survives client detach while the agent session remains live, but is discarded when the agent exits or the Herdr server restarts. Do not persist or restore armed requests.

Coffee-cup metadata, opt-in sidebar placement and persistent popup tabs are implemented. Native sidebar right-click integration is not available in Herdr 0.9.3 and is not promised. No per-session policy machinery is introduced.

## Known platform facts

Checked against local caffeinate manual and Herdr 0.9.3 documentation:

- `caffeinate -i` prevents idle system sleep without preventing display sleep.
- `caffeinate -w PID` tracks process lifetime, not autonomous run lifetime.
- `caffeinate -t` is ignored when caffeinate wraps a utility.
- Preventing idle sleep is not a guarantee against explicit Sleep, lid closure, or low-battery sleep.
- Herdr client detach keeps panes and agents running; server stop stops its session and panes.
- Herdr plugins support commands, events, and terminal popups. Native non-terminal plugin UI is not part of plugin v1.
- Herdr can use screen-derived status or integration reports. Screen inference can fall back to idle without positively establishing completion.

Sources: https://herdr.dev/llms.txt and its versioned plugins, agents, and persistence documentation.

## Integration feasibility findings

Verified against versioned Herdr 0.9.3 integrations and socket API documentation (documentation-level verification, not a live plugin test):

- Pi's official integration reports lifecycle state. Claude Code's official integration reports session identity only; its activity remains screen-derived. A common Herdr host is feasible, but the two sources must not be assumed equally authoritative.
- `pane.agent_status_changed`, `pane.agent_detected`, `pane.exited`, and `pane.closed` are available subscription events. Exact payloads, run identity, and start/end signal quality still require inspection.
- `pane.report_metadata` supports arbitrary display-only tokens, renderable as `$name` in configured Agent sidebar rows. This provides a documented route for a coffee indicator without overwriting agent lifecycle status. Sidebar configuration and cleanup/TTL behavior need validation.
- Plugin terminal popups and keybound actions are documented. Custom right-click placement has not been verified; do not depend on it.
- Event history is not durable. On `events_lost`, subscribers must resubscribe and reconcile via authoritative snapshots; snapshots and events have no shared sequence boundary. Current state cannot reconstruct a missed run boundary or its original start time. Recovery must not silently reset deadlines.
- Plugin startup hooks are one-shot initialization, not supervised daemons. Ownership and lifetime of any monitor must be designed explicitly.
- Inspected bundled Claude detection manifest: it has explicit working, permission/blocker, and idle rules, including terminal-title and prompt-box matches. Treating every inferred state as mere absence of activity is inaccurate; positive matches exist, but remain heuristic. These are bundled rules, not verification of the live server's potentially updated manifest.
- Inspected the installed Herdr API schema: status-change events expose status but not its detection evidence. `AgentInfo` additionally exposes `screen_detection_skipped`, `state_change_seq`, and `completion_seq`. These are useful for reconciliation but do not supply an absolute run-start timestamp or prove that a heuristic completion was correct. Need an evidence read (such as agent explain) to distinguish fallback idle from a positive idle match; event status alone is insufficient.

Sources: versioned `integrations.mdx`, `socket-api.mdx`, and `plugins.mdx` linked from https://herdr.dev/llms.txt.

## Approved implementation architecture

### Package and runtime

Create a standalone Herdr plugin under `herdr/caffeinate/` (working name), with its own package metadata, tests, README, and shipped copy of this design. Use Node.js, matching the repository's existing tooling; no runtime model calls, no agent-prompt injection, and no changes to agent execution. Use Herdr's existing Pi integration rather than building a new Pi extension. Require the Pi integration for supported authoritative Pi tracking; use Herdr's evidence-backed heuristics for Claude Code.

One monitor per local Herdr server owns that server's in-memory run state, timers, and caffeinate children. A one-shot startup helper ensures a single detached monitor exists, then exits; plugin actions can also ensure it exists after first installation. This is explicitly plugin-owned lifecycle management, not an assumption that Herdr supervises a daemon. A server-specific lock and private IPC endpoint prevent duplicate monitors and cross-session actions. Startup must avoid PID-reuse mistakes. Multiple Herdr servers hold independent assertions; macOS naturally keeps the machine awake while any assertion remains.

Do not install a machine-wide login daemon for v1. Never auto-restart into fresh leases for ongoing work. Ephemeral runtime locks/endpoints are allowed; leases and armed requests are not restored from disk.

### Event adapter and run identity

Subscribe to lifecycle/status events and reconcile authoritative agent reads. Treat events as prompts to read current state rather than replaying stale payloads over newer snapshots. Use server instance, terminal/pane occupant, and native agent session identity where available to isolate replacement agents. Maintain an in-memory run generation; do not equate every status sequence increment with a new run.

For Pi, use Herdr's lifecycle authority and reported working/idle/blocked state. For Claude, inspect `agent explain` evidence when deciding transitions: positive working begins work; positive idle/blocked evidence can end it; fallback idle, skipped screen updates, conflicting observations, or failed evidence reads mean uncertainty. The CLI implementation exposes matched rule, fallback reason, screen-detection skip reason, and visible working/idle/blocker flags. Do not add a second screen-scraping rule set in this plugin. Exact field mapping is an integration-test gate.

A reliably observed idle/waiting-to-working transition begins a run. A newly detected agent already working is treated conservatively as discovered ongoing work unless its start was reliably observed. Repeated working reports do not create new runs. Actual terminal/agent exit ends leases and arming; viewing or detaching does not.

On event loss or transient connection failure, keep existing deadlines; reconcile without inventing missed transitions. Evidence invalidation is immediate, with a generation checked after awaited reads. Whole-refresh failure marks activity uncertain before it can grant protection. Manual grants/arming require a successfully revalidated occupant; verified identity with uncertain activity still permits explicit manual protection. Release/cancel can reduce protection using a matching cached guard. Known ongoing leases may continue until confirmed end or their original deadline. Uncertain identity must not transfer a lease to a replacement agent. On monitor restart, no deadline is remembered: discovered ongoing runs remain uncaffeinated. On confirmed server exit, disable/unlink, or intentional monitor shutdown, release owned assertions and clear indicators.

### OS assertions and cleanup

Use child `caffeinate` processes with idle-system-sleep assertions only (`-i`), never display-wake flags. Enforce AC-only eligibility explicitly; `-i` itself is not AC-only. Check current external-power status before acquiring assertions and monitor power changes. Unknown power status must not acquire protection. A periodic fallback check should bound unplug detection latency, targeting at most two seconds in normal operation; this is not hard-real-time behavior. The monitor owns a coalesced one-second safety timer and a separate serialized assertion/power path, independent of Herdr reads and token publication. That path can expire or suspend existing entitlement but never grant pending automatic protection from cached activity. Shutdown immediately stops polling and synchronously cancels in-flight assertion acquisition before serialized cleanup, without waiting for Herdr observation work. A confirmed absent occupant loses eligibility before subsequent observation or sidebar I/O. A current manual grant consumes an older idle boundary/one-shot arm so later working evidence cannot overwrite the chosen deadline.

Each assertion must have a finite timeout no longer than its lease's remaining wall-clock duration and an owner-lifetime safeguard. Investigate and verify combining `-w <monitor-pid>` and `-t <remaining-seconds>` without wrapping a utility. Do not assume combined semantics solely from the manual. If that mechanism cannot meet cleanup requirements, choose an equivalent watchdog/native assertion implementation and document it before shipping. No assertion may outlive a monitor crash unboundedly.

Reevaluate absolute deadlines after resume and periodically while running; a suspended JavaScript timer must not renew an expired lease. Stop children on run completion, manual release, unplugging, deadline, server exit, or shutdown. Manual extension replaces the deadline, including shortening it; reject nonpositive, nonfinite, or unrepresentable durations rather than silently clamping. Subsecond deadlines may be tracked in the model; do not round native timeouts upward past the requested deadline.

### Controls and settings

Use a plugin action/keybinding to open a terminal popup for the targeted agent. The popup displays the full local ISO deadline prominently, a numeric hours field with fractional values, Set from now / Set next run, and Stop caffeinating / Cancel next run as applicable. Offer a short settings/help view, not permanent explanatory paragraphs. Idle and permission-waiting use the same one-shot arm operation. Uncertain ongoing work may be manually caffeinated explicitly.

Publish a namespaced display token containing a coffee cup only after an assertion is successfully active. Configure a sidebar row to include that token without renaming agents or overriding semantic statuses. Provide opt-in setup instructions rather than silently rewriting unrelated sidebar configuration. Refresh tokens with a short TTL so a crashed monitor cannot leave a permanent cup; brief stale display during crash detection is an acknowledged limitation. Show armed-next-run and on-battery explanations in the popup, with no extra sidebar icons initially. No custom right-click integration for v1.

Persist only global default duration and automatic/opt-in preference in the plugin configuration directory. Recommended settings behavior: changes apply to future runs; existing leases, pending runs' captured defaults, and explicit one-shot requests remain unchanged. No per-session policy. No routine notifications; surface assertion failures and monitor unavailability in controls/logs, never show a successful coffee indicator on failed acquisition. Errors must not alter agent work.

### Verification gates

Use deterministic state-machine tests with an injected clock and fake OS/Herdr adapters. Cover short runs, the ten-second delay, cancellation/waiting, intermediate messages, uncertainty during/after delay, overlapping agents, repeated events, expired/released runs not renewing, manual overrides/arming, power changes, clock jumps/resume, and server/monitor restarts. Test fractional/invalid durations and local ISO formatting across timezone offsets and DST boundaries.

Integration tests must verify current Herdr event/read/evidence shapes, occupant replacement, event-loss reconciliation, deduplication, plugin disable/unlink, popup actions, and token cleanup. Use fresh subprocesses to test monitor crash, child cleanup, locking, and shutdown. Separate pure tests from tests that actually acquire sleep assertions.

Before calling the feature usable, manually exercise Pi and Claude Code inside Herdr: a short response, a silent long-running tool, a permission wait where available, cancellation, completion, detach/reattach, battery/AC transitions, and manual extension. Verify actual assertions with `pmset -g assertions`, including that display sleep remains allowed. Run a shortened real deadline and kill the monitor to verify expiry and crash cleanup. Do not claim reliable unattended operation based only on simulated events.

### Known limitations and implementation stop conditions

Claude Code detection remains heuristic and can change with UI updates; false completion/start detection can produce incorrect leases even with evidence filtering. Remote agents, arbitrary detached jobs, lid-closed operation, forced sleep, execution/spending limits, and agent cancellation are out of scope.

If Herdr's exposed evidence cannot distinguish lifecycle authority/fallback reliably, or agent identity cannot be isolated, stop and report the limitation rather than silently weakening the rules. If startup/disable lifecycle or assertion cleanup cannot be implemented as described, revise the design before deployment. Exact event field mappings, sidebar configuration, monitor ownership checks, and OS timeout behavior are implementation validation tasks, not facts established by the mockup.

## First-trial implementation notes

The approved design below/above remains the product baseline. Implementation choices made during execution:

- Platform contracts verified on Herdr 0.9.3/protocol 22; see `validation.md` for simulator versus actual OS evidence.
- Raw `agent.explain` API replaces spawning its CLI wrapper. Local socket ownership and foreground process identity are checked; SSH/tmux wrappers are not supported.
- Herdr rejects `target_pane_id` for popup placement. The popup uses the active UI surface but receives its captured target through `CAFFEINATE_TARGET`.
- Runtime singleton directories fail closed after ungraceful monitor death. No automatic PID-based stale-lock takeover; manual cleanup is required after verifying the original owner is gone. This is a deliberate safety/convenience tradeoff, not persisted lease recovery.
- Native assertion timeouts are rounded down to whole seconds. Arbitrarily large finite deadlines are retained in the domain; native assertions are capped at the signed-int timeout limit and can be reacquired only against the unchanged absolute deadline.
- The monitor also exposes an explicit private stop command. It never sends stop/input/cancellation commands to agents.
- OS cleanup and protocol simulations passed; actual agent, physical battery/display behavior and daily usability remain manual acceptance checks. Do not infer unattended reliability from the mockup or simulated reports.

## Current build and UI boundary

- Node 24.x only, minimum 24.11.0 for developers and consumers, with one strict compiler project and one Node types environment. Application imports are extensionless under ESNext/Bundler and require the build; developer-run files retain Node-resolvable imports.
- Production is one minified ESM `dist/main.js`; focused tests execute separate `.build/test` modules. Artifact and isolated Herdr tests exercise the actual bundle. The prepared `.build/runtime` payload is allowlisted, source-free and independent of consumer npm installs.
- Standalone pi-tui owns terminal rendering, input/caret handling, mouse dispatch and width/layout primitives. Application adapters own numeric validation/first-edit behavior, persistent tabs/drafts and occupant selection. No agent SDK or shared UI framework is introduced.
- `runPopup` installs closure handling before its asynchronous snapshot/label initialization; requests remain serialized, late work is ignored after closure, and leaving the popup never stops its monitor or sends agent input.
- Required upstream texts are generated into notices from the bundle inventory and exact reviewed policy. pi-tui 1.0.4's missing npm LICENSE is supplied as a version-bound, provenance-recorded upstream copy; OpenTUI attribution and Marked's full redistribution terms are retained.
- The real bundled monitor/popup passed isolated no-agent Herdr acceptance. Real Pi/Claude exits during active protection, actual minimum Node 24.11.0, physical power/display behavior and overnight reliability remain separate gates. Independent review findings were corrected with tests; the final corrective pass was not sent to a second reviewer. See `review-request.md` before promotion.

## Historical mockup

The browser-only simulation explored lifecycle and controls without invoking caffeinate, changing power settings or communicating with agents. It is not evidence of current runtime acceptance.
