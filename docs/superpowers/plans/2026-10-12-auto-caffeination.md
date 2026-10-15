# Automatic Agent Caffeination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically caffeinate local Pi and Claude Code runs in Herdr, without keeping idle sessions awake or imposing execution limits.

**Architecture:** A standalone Herdr plugin launches one ephemeral monitor per local server. An evidence adapter translates Herdr observations into a pure run/lease state machine; an assertion adapter owns finite macOS `caffeinate` children. A terminal popup and sidebar token expose current caffeination and minimal controls.

**Tech Stack:** Node.js >=22.18.0, ESM JavaScript with JSDoc, built-in `node:test`, Unix sockets, macOS `caffeinate`/`pmset`, Herdr >=0.9.3. No runtime npm dependencies or model calls.

**Spec:** `docs/superpowers/specs/2026-10-11-auto-caffeination-design.md` (approved). Read `GLOSSARY.md` and root `README.md` as well.

## Global Constraints

- macOS; local Pi and Claude Code agents running inside Herdr. No remote-agent coverage.
- Each run has an independent wake lease, initially eight hours with an absolute wall-clock deadline. Progress, tools, retries, detaching, and power changes do not reset that deadline.
- Wait ten seconds after autonomous work starts before automatically granting a lease, to avoid indicator flicker during quick back-and-forth.
- Protection is AC-only (provisional policy for hands-on evaluation). Unplugging suspends protection, not its clock.
- Expiration ends caffeination, never the agent's work. Display sleep remains allowed.
- Uncertainty preserves an existing lease until its deadline; it does not manufacture or renew leases.
- Discovered ongoing work without a remembered deadline gets no automatic lease.
- Arming is cancellable, one-shot, and entirely ephemeral; client detach preserves it, agent exit/server restart does not.
- No per-session automatic/manual policy overrides in the first version.
- Use **caffeination** in user-facing language; retain **wake lease** as the technical domain term.
- Show the coffee indicator only while that session is actually caffeinated. No persistent expired badge.
- Deadlines are local ISO 8601 timestamps with milliseconds and numeric UTC offset, evaluated at the deadline, not converted to UTC.
- Persist only global default duration and automatic/opt-in preference. No root npm package. Do not alter the existing Pi project.
- No production installation, Herdr configuration mutation, actual sleep tests, or agent hooks installed without explicit user permission. Gate tests use isolated temporary fixtures/sessions where possible.
- Work in an isolated workspace at execution time. Preserve unrelated changes; never use `git add .`. The design and glossary may be untracked at handoff: bring them into the execution workspace explicitly without losing them.

## Review Focus

1. A pane ID reused by a different agent must not inherit a lease, manual release, or next-run request (Tasks 2, 3, 5).
2. Missed events, stalled evidence reads, or conflicting observations must not renew eight hours or end healthy work on fallback idle (Tasks 2, 3, 5).
3. Clock jumps, DST changes, and fractional/huge custom durations must not silently overflow or round expiry later (Tasks 2, 4, 6).
4. Duplicate startup, monitor crash/hang, or plugin disable must not leave a permanent coffee cup or unbounded assertion (Tasks 1, 4, 5, 7).
5. Unsupported agents/remote targets and stale popup actions must not modify another run or claim successful caffeination (Tasks 3, 5, 6).

---

## File map and conventions

Create `herdr/caffeinate/` as an independent package named `herdr-caffeinate`; plugin ID `agent-dev.caffeinate`. Use `.mjs` so there is no compilation step. Production modules live in `src/`, tests in `test/`, permission-gated probes in `scripts/`, fixture evidence in `test/fixtures/`, and shipped documentation in `docs/`.

| File | Responsibility |
| --- | --- |
| `package.json`, `herdr-plugin.toml` | Runtime/test commands and Herdr entrypoints |
| `src/model.mjs` | Pure per-agent run, lease, and arming transitions |
| `src/config.mjs` | Validated global settings with atomic writes |
| `src/herdr.mjs` | CLI/socket transport, observations, event reconciliation |
| `src/power.mjs` | Parse/query external power without changing power settings |
| `src/assertions.mjs` | Finite caffeinate children and their cleanup |
| `src/monitor.mjs` | Serialized coordination of adapters/model |
| `src/runtime.mjs` | Server-scoped ownership, lock, local IPC, lifecycle |
| `src/main.mjs` | `ensure`, `monitor`, `controls`, `popup`, `stop` entrypoints |
| `src/presentation.mjs` | User-facing projection and local ISO formatting |
| `src/popup.mjs` | Keyboard-driven terminal popup and settings/help view |
| `scripts/probe-herdr.mjs`, `scripts/probe-assertions.mjs` | Explicit opt-in feasibility checks |
| `test/*.test.mjs`, `test/fixtures/*` | Pure, subprocess, transport tests and sanitized fixtures |
| `README.md`, `docs/design.md`, `docs/validation.md` | Setup, shipped design, evidence/limitations |

All test commands below run from `herdr/caffeinate/` unless stated otherwise. `npm test` runs deterministic tests only. Real Herdr/OS checks are separate explicit commands. Each task ends with focused tests and a commit of only that task's files; do not commit the user's other work.

## Shared interfaces

Define these JSDoc types in `src/model.mjs`; other modules import their types rather than inventing variants:

- `Config = { automatic: boolean, defaultDurationMs: number }`; defaults `true`, `28_800_000`.
- `Observation = { occupant: string, phase: 'working'|'idle'|'blocked'|'unknown'|'gone', evidence: 'authoritative'|'positive'|'uncertain' }`. The adapter's occupant identity includes server instance, terminal identity, and available agent/session identity. Never use pane ID alone.
- `AgentState = { occupant: string, runId: number, revision: number, phase: Observation['phase'], boundaryKnown: boolean, pending: null|{ startAt: number, readyAt: number, deadlineAt: number }, lease: null|{ deadlineAt: number, origin: 'automatic'|'manual' }, armedDurationMs: number|null, suppressed: boolean }`.
- `Event` is one of `{type:'observe', observation}`, `{type:'tick'}`, `{type:'manual', durationMs}`, `{type:'release'}`, `{type:'cancel-arm'}`. All reductions receive time explicitly; no model I/O or `Date.now()`.
- `initialState(occupant: string): AgentState` and `reduce(state: AgentState, event: Event, now: number, config: Config): AgentState`.
- `Command = { type:'set-duration', occupant:string, runId:number, revision:number, durationMs:number } | { type:'release'|'cancel-arm', occupant:string, runId:number, revision:number } | { type:'set-config', config:Config }`. Occupant/run generation/revision form an optimistic guard, not a session policy. `revision` starts at zero and increments on meaningful model changes, not no-op ticks or repeated identical observations. This rejects actions from a popup opened before a run ended even when no new run has begun.

An adapter may enrich its private records with pane IDs, agent kind, transport revisions, and explain evidence, but those are not model domain state. A manual action on uncertain ongoing work is allowed; idle/blocked arms the next run. An expired lease may remain internally until a real boundary so ticks cannot create another.

### Task 1: Prove the platform contracts before building on them

**Files:** Create `herdr/caffeinate/package.json`, `scripts/probe-herdr.mjs`, `scripts/probe-assertions.mjs`, `test/probe.test.mjs`, `test/fixtures/README.md`, `docs/validation.md`.

**Interfaces:** Produce a validation record with supported Herdr version, exact event/evidence paths, plugin enabled/server liveness reads, identity fields, and verified native assertion argv. Probe exports `assertCompatible(evidence): void`; evidence is `{ occupantIdentity:boolean, detectionProvenance:boolean, serverIdentity:boolean, pluginEnabledRead:boolean, localTargetGuard:boolean, finiteTimeout:boolean, ownerExitCleanup:boolean }`, and the function throws unless every field is true. Probes have no install behavior.

- [ ] Write `probe.test.mjs` with executable assertions: `assert.throws(() => assertCompatible({}), /missing/i)`; reject evidence without occupant identity, detection provenance, or finite assertion lifetime; accept a complete fixture. Require `--allow-system-assertion` before a probe spawns caffeinate.
- [ ] Run `node --test test/probe.test.mjs`; confirm failure because the probe contract is not implemented, not an unrelated syntax error.
- [ ] Implement probes and package scripts (`test: node --test test/*.test.mjs`, `probe:herdr`, `probe:assertions`), with Node >=22.18.0 and no dependencies. Commands print a concise result and exit nonzero on failed gates.
- [ ] Run the pure tests; require PASS.
- [ ] Obtain permission for live probes. Inspect installed schema and versioned source, then capture sanitized fixture outputs for authoritative Pi, positive Claude working/idle/blocked, fallback idle, unknown/skip, agent exit, and occupant replacement. Confirm how to distinguish local from remote targets and how the monitor reads server identity plus plugin enabled state. If a required scenario cannot be produced, record it as unverified, not passing. Do not copy prompt/transcript content into fixtures.
- [ ] With permission, verify `caffeinate -i -w <owner-pid> -t <seconds>` without a wrapped utility: timeout while owner survives; owner termination before timeout; SIGKILL owner; explicit child termination. Use short-lived probe owners, cap probes at 15 seconds, clean up in `finally`, and inspect `pmset -g assertions`. Test positive and negative AC status parsing from real samples; no automatic unplug/sleep commands.
- [ ] Record exact evidence and commands in `docs/validation.md`. If combined flags, lifecycle provenance, ownership/disable checks, or local-target identification cannot meet the spec, STOP and revise the design with the user rather than continuing with guessed semantics.
- [ ] Commit only Task 1 files: `git commit -m "test: establish caffeination platform contracts"` after explicitly staging their paths.

### Task 2: Implement the pure run and wake-lease model

**Files:** Create `src/model.mjs`, `test/model.test.mjs`.

**Interfaces:** Produce all Shared interfaces above, plus `validateDuration(durationMs:number, now:number): void` (throw `RangeError` for invalid/nonpositive/unrepresentable deadlines). Time is integer epoch milliseconds; reject durations that round to zero milliseconds.

- [ ] Write table-driven tests with fixed `t = 1_800_000_000_000`. Establish positive idle, observe working at `t`, tick at `t+9_999`, then `t+10_000`: assert no lease before the latter and `lease.deadlineAt === t+28_800_000` after it. Assert initially discovered working never schedules an automatic lease.
- [ ] Add tests asserting: authoritative/positive idle or blocked clears pending/lease; resume begins a fresh generation; repeat working/tool-equivalent observations preserve the deadline; uncertain/fallback observations preserve existing leases. Uncertainty during the start delay defers grant until positive working returns, without moving `deadlineAt`.
- [ ] Add assertions for deadline expiry/release suppression until the next real boundary; manual two hours gives exactly `now+7_200_000` immediately; idle/blocked manual action sets only `armedDurationMs`; the next run consumes it with no start delay. Explicit manual action may reapply an expired/released lease. Switching occupant resets all state; cancel-arm clears only arming.
- [ ] Pin defaults/config behavior: automatic false creates no automatic pending grant; explicit arming still works; changing defaults during pending/active work preserves captured deadline. Test zero, NaN, Infinity, negative and date-overflow durations; backward/forward clock jumps cannot move an existing deadline. Tick over eight hours never renews. Two independently reduced agents cannot affect each other's deadlines.
- [ ] Run `node --test test/model.test.mjs`; require expected missing-export failure.
- [ ] Implement the pure functions and types with immutable reductions. `runId` increments only on a known new autonomous interval; boundary uncertainty cannot create a new run. Finishing a run disposes of its suppression/expired bookkeeping, not the occupant's identity.
- [ ] Run model tests, then `npm test`; require PASS. Commit the two files as `feat: model ephemeral caffeination leases`.

### Task 3: Adapt Herdr evidence and reconcile observations

**Files:** Create `src/herdr.mjs`, `test/herdr.test.mjs`, sanitized `test/fixtures/herdr-*.json`.

**Interfaces:** Consume `Observation`. Produce `classifyAgent(agentRecord, explainRecord): Observation`, `connectHerdr({socketPath, binPath, onInvalidate, onUnavailable}): Promise<HerdrClient>`, where client has `list(): Promise<TrackedAgent[]>`, `observe(target): Promise<Observation>`, `publishToken(target,value,ttlMs): Promise<void>`, `hostStatus(): Promise<{instance:string, pluginEnabled:boolean, local:boolean}>`, `close(): void`. `TrackedAgent = { target:string, occupant:string, kind:'pi'|'claude' }`. Field extraction uses Task 1 evidence, not speculative property names.

- [ ] Write fixture assertions: `classifyAgent(claudeIdle, fallbackExplain).evidence === 'uncertain'`; positive idle stays idle/positive; authoritative Pi takes precedence over conflicting screen text; skipped/conflicting/failed explain yields unknown/uncertain, never positive completion. Reject unrelated agents and remote targets from `list()`.
- [ ] Write fake-socket tests for split JSON lines, failed requests, request timeout, subscription acknowledgement, `events_lost`, and two observations arriving during a snapshot read. Assert reconciliation serializes reads and requests another read if invalidated in flight; never replay stale status over a newer read.
- [ ] Test same pane/new terminal or new native session produces a different occupant; status sequence changes alone do not. Test non-authoritative Pi is reported unsupported rather than silently giving it authoritative semantics. Test unknown protocol fields are tolerated, missing required evidence is conservative.
- [ ] Run `node --test test/herdr.test.mjs`; confirm expected failures.
- [ ] Implement transport with bounded reads/timeouts (five seconds per request), bounded response size (1 MiB), `HERDR_BIN_PATH` for any explain CLI subprocess, and argv arrays without shell interpolation. Subscribe before initial snapshot; establish a cold baseline, never turn initial working into a synthetic start. Resubscribe/reconcile on `events_lost` as documented. On inconsistent identity/evidence, emit uncertainty and re-read, not guessed boundaries.
- [ ] Run tests and `npm test`; require PASS. Commit as `feat: observe Herdr activity with evidence-aware transitions`.

### Task 4: Own finite macOS assertions and power checks

**Files:** Create `src/power.mjs`, `src/assertions.mjs`, `test/power.test.mjs`, `test/assertions.test.mjs`.

**Interfaces:** `readPower({execFile}): Promise<'ac'|'battery'|'unknown'>`; `parsePower(text:string): 'ac'|'battery'|'unknown'`; `createAssertions({spawn,ownerPid,now,onExit}): { reconcile(desired:Map<string,number>):Promise<Map<string,{deadlineAt:number,pid:number}>>, close():Promise<void> }`. Map keys are occupant/run identifiers, values absolute deadlines; returned map contains successfully spawned/live assertions only.

- [ ] Write power parser tests from Task 1 fixtures, including malformed/empty output => unknown and AC-connected but not charging => ac. Failed queries return unknown, never default AC.
- [ ] Write fake-child tests: desired deadline `now+2_900` never requests more than two whole seconds if using integer native timeouts; `now+900` creates no assertion. Assert only validated Task 1 argv are used, with `-i`, finite timeout, owner PID, and no display-wake/utility arguments. No child spawn for expired deadlines.
- [ ] Test duplicate reconcile does not spawn duplicates, distinct agents own independent children, deadline extension/shortening replaces safely, one child failure leaves others intact, unexpected exit is observable, and `close()` reaps all children. Failed spawn never appears in the active map. Rechecks cannot extend absolute expiry.
- [ ] Run `node --test test/power.test.mjs test/assertions.test.mjs`; require expected failures.
- [ ] Implement against the validated OS contract. End an old child before replacing it, bound shutdown waits, and surface failures. Only the monitor decides power eligibility; assertion helper rejects invalid deadlines defensively. Native expiry is a backstop to wall-clock reconciliation, not a renewable duration budget.
- [ ] Run pure tests and `npm test`; require PASS. Re-run permission-gated Task 1 assertion probe against the production helper to verify owner death and timeout behavior, recording results. Commit as `feat: manage bounded macOS caffeination assertions`.

### Task 5: Coordinate monitor lifecycle, private IPC, and settings

**Files:** Create `src/config.mjs`, `src/monitor.mjs`, `src/runtime.mjs`, `src/main.mjs`, `test/config.test.mjs`, `test/monitor.test.mjs`, `test/runtime.test.mjs`.

**Interfaces:** Consume Tasks 2–4. Produce `loadConfig(path):Promise<Config>`, `saveConfig(path,config):Promise<void>`; `createMonitor({herdr,assertions,readPower,now,config,persistConfig}): { refresh():Promise<void>, tick():Promise<void>, command(command:Command):Promise<void>, snapshot():MonitorSnapshot, close():Promise<void> }`; `ensureMonitor(context):Promise<RuntimeClient>`; `RuntimeClient.request(message: {type:'snapshot'}|{type:'command',command:Command}):Promise<{snapshot:MonitorSnapshot}>` and `.close():void`; invalid/stale requests reject with a structured error. `persistConfig(config:Config):Promise<void>` is injected into the monitor and must succeed before a settings change is acknowledged. IPC accepts only snapshot and guarded Command requests. `MonitorSnapshot = { now:number, power:'ac'|'battery'|'unknown', config:Config, agents:Array<{target:string,state:AgentState,active:boolean,error:string|null}> }`.

- [ ] Write tests for config defaults, invalid stored values surfaced without silently changing policy, atomic replacement, and no serialized run/lease/arm data. Test two monitors sharing the global config directory: updates propagate to the other's future runs without altering captured pending/active deadlines. A failed save reports an error, never false success.
- [ ] Write monitor tests using injected adapters: two agents, one finishes, the other's assertion remains; battery/unknown power clears assertions but preserves deadlines; AC before expiry restores, AC after expiry does not; asserted-active drives indicator state, not lease intent. A failed evidence read retains a known lease while its original deadline remains valid.
- [ ] Test cold working baseline, disconnect/reconnect, `events_lost`, server identity replacement, agent replacement, explicit plugin disable, delayed stale popup command, and a run finishing between popup snapshot and command. Stale occupant/run commands reject without changing a different run. On confirmed exit/disable, all owned children and tokens clear.
- [ ] Write subprocess tests for two simultaneous ensure calls => one monitor; stale lock plus reused/unrelated PID => no arbitrary process killed; client detach => monitor survives; monitor restart => no restored lease or arming. Invalid/oversize IPC requests fail without crashing. Endpoint/lock permissions are owner-only.
- [ ] Run the three new test files; require expected failures.
- [ ] Implement serialized monitor actions and refreshes. Use one-second reconciliation ticks, with power/server/plugin-enabled checks at least every two seconds under normal responsive conditions. Bound external operations so stale evidence cannot block processing indefinitely. Keep existing deadlines on transient transport failures; confirmed changed server identity ends old state. Unknown power suspends assertions.
- [ ] Implement a server-instance-scoped private runtime directory/Unix socket (0700 directory, 0600 files/socket where supported), single-owner startup handshake, bounded local messages, and a detached monitor with log file rather than inherited startup-hook pipes. Validate process identity before stale ownership recovery; never signal an arbitrary PID from an untrusted/stale file. `main.mjs ensure` exits after handshake. `stop` performs graceful shutdown. Persist configuration in `HERDR_PLUGIN_CONFIG_DIR`, not source checkout. Re-read the shared settings at most two seconds apart to apply other monitors' changes to future runs; compare values rather than writing unchanged configuration. Reject remote/nonlocal contexts.
- [ ] Run focused tests and `npm test`; require PASS. Commit as `feat: coordinate ephemeral Herdr caffeination monitors`.

### Task 6: Build the minimal terminal controls and presentation

**Files:** Create `src/presentation.mjs`, `src/popup.mjs`, `test/presentation.test.mjs`, `test/popup.test.mjs`; modify `src/main.mjs` to wire `popup`.

**Interfaces:** Consume `MonitorSnapshot`, `Command`, and RuntimeClient. Produce `formatLocalDeadline(epochMs:number):string`, `presentAgent(snapshotAgent,power): { cup:string, headline:string, primaryLabel:string, secondaryLabel:string|null }`, `runPopup({client,input,output,target}):Promise<void>`. Popup snapshots retain occupant/run/revision guards until a successful refresh.

- [ ] Write timezone-subprocess assertions: with `TZ=America/New_York`, `2026-10-11T18:00:00.123Z` => `2026-10-11T14:00:00.123-04:00`, winter => `-05:00`; include `Asia/Kolkata` => `+05:30` and UTC => `+00:00`. Invalid dates reject.
- [ ] Test active assertion => cup `☕`, inactive/expired/released/battery/armed => empty cup. Active headline is the timestamp; on battery is `Paused · on battery`; arming is `Next run · <duration> hours`; inactive working is `Not caffeinated`. No expired-specific label. Error state explains unavailable caffeination without a success cup.
- [ ] Write input/output tests for keyboard navigation, fractional duration validation, Set from now, Set next run, release, cancel arm, settings change, help toggle, Escape, resize, and stale-action rejection followed by refresh. Settings expose only automatic toggle and default duration. Error text is escaped/sanitized; an agent title cannot inject terminal controls.
- [ ] Run focused tests; require expected failures.
- [ ] Implement a small built-in terminal UI using readline/raw input and ANSI redraw, no UI dependency. Use a focusable duration field plus primary/secondary action and settings/help view. Restore raw mode/cursor on all exit/error paths; handle non-TTY invocation with a clear error. Show explanations only in help, no persistent paragraphs. Local timezone offset must be computed at the deadline. Clamp rendering to terminal width, not semantic duration values.
- [ ] Run tests and `npm test`; require PASS. Commit as `feat: add minimal caffeination terminal controls`.

### Task 7: Wire plugin entrypoints and sidebar metadata

**Files:** Create `herdr-plugin.toml`, `test/plugin.test.mjs`; modify `src/main.mjs`, `src/monitor.mjs`, `package.json` as needed for integration.

**Interfaces:** Manifest ID `agent-dev.caffeinate`, minimum Herdr `0.9.3`, platform `macos`; startup command `node src/main.mjs ensure`; one action `controls` runs `node src/main.mjs controls` to open declared popup `controls`. Popup command `node src/main.mjs popup`. Action resolves target through Herdr context and passes it explicitly, rather than consulting whichever pane happens to be focused later. Metadata token name `caffeination`, value `☕` or cleared/null.

- [ ] Write manifest/entrypoint tests using Task 1 validated schema: startup ensure exits; action opens the declared popup with target context; unsupported contexts show an error and never start assertions. Check all commands are argv arrays and no shell interpolation occurs.
- [ ] Test monitor publishes `caffeination` only for successful active assertions; clears on release/battery/end; uses 6,000 ms TTL with refresh every 2,000 ms. It must never write agent semantic status/name/title. Failed publishing is logged and retried without changing the agent or renewing the lease. Crash stops refresh so the cup expires.
- [ ] Run `node --test test/plugin.test.mjs`; require expected failures.
- [ ] Implement manifest and commands using validated Herdr action/popup interfaces. Ensure monitor launch works on startup and first user action after link. Do not rely on startup hooks firing at link time. Check plugin disabled/unlinked status through the supported read from Task 1; normal cleanup target is within two seconds, subject to responsive host. Do not add context-menu APIs that do not exist.
- [ ] Run `npm test`; require PASS. With permission, link in a disposable/local test Herdr setup, open/close popup, verify keybinding and sidebar token, detach/reconnect, disable/unlink, and inspect cleanup. Do not overwrite the user's existing sidebar rows or keybindings.
- [ ] Commit as `feat: integrate caffeination with Herdr plugin surfaces`.

### Task 8: Ship documentation and exercise failure/recovery end to end

**Files:** Create `README.md`, `docs/design.md`, `test/end-to-end.test.mjs`; update `docs/validation.md`, package scripts, and root `README.md` Projects section only after the feature is usable. Include root `LICENSE` in any distributable package.

**Interfaces:** `npm test` stays side-effect-free; `npm run test:integration` runs fake-server/real-subprocess tests without actual assertions; explicit permission-gated probes remain separate. The shipped `docs/design.md` is copied from the approved design, not a divergent redesign.

- [ ] Write an end-to-end fake Herdr server/OS harness: idle -> working -> ten-second delay -> active cup -> battery -> AC -> wait -> resume -> expiry -> manual reapply -> exit. Assert exact original deadlines, no renewal on repeat events, and no agent input/cancellation commands anywhere in the trace.
- [ ] Add subprocess scenarios: monitoring crash/restart during a long run (no automatic new lease); dropped event stream; blocked explain command; duplicate launch; disabled plugin; replacing agent in same pane; stale popup command. Assert no inherited arming or assertion, token TTL expiry, and no unbounded child lifetime. Run with shortened durations using injected clocks, not altered production defaults.
- [ ] Run integration tests; require failures where wiring is incomplete. Fix only missing wiring, then run `npm test` and `npm run test:integration`; require PASS.
- [ ] Write installation instructions for Node/Herdr/Pi integration requirements, explicit plugin link, starting monitor immediately after link, controls keybinding, adding `$caffeination` to an existing sidebar row, and safe disable/uninstall. Include the no-mid-run-auto-adoption caveat, AC-only behavior, display/lid limitations, expiry versus execution distinction, heuristic Claude limitations, and manual recovery. Do not claim a right-click menu exists.
- [ ] Copy the approved design to `docs/design.md`, retaining the lifecycle table; update it only for validated implementation details and clearly document any user-approved deviations. Record command transcripts/results without private prompt contents. Add the root README project link without rewriting unrelated sections.
- [ ] With user participation, complete the live matrix in `docs/validation.md`: Pi/Claude short work, silent tool, long work, completion, cancellation, permission wait where supported, detach, unplug/replug, short timeout, manual extension, monitor kill, plugin disable, two concurrent agents, display off while system remains awake. Check `pmset -g assertions` before/during/after. Mark unavailable tests pending; do not label the feature verified for unattended use while critical timeout/crash/agent-end checks remain pending.
- [ ] Final checks from repository root: `git diff --check`; from package: `npm test`, `npm run test:integration`; run existing Pi package tests if any shared/root integration change could affect them. Review that no secrets/recorded prompts, machine-specific runtime paths, dependencies, or unrelated files entered the diff.
- [ ] Commit intended package/docs/README changes as `docs: ship and validate Herdr caffeination trial`. Obtain whole-branch code review and report measured limitations, not just passing unit tests.

## Handoff and completion boundary

Implement sequentially: Tasks 1–5 establish the contracts on which UI/integration depend. Task 1 failures are design feedback, not permission to guess. No background worker deployment or automatic machine sleep testing until the user permits it.

The implementation is a trial only after deterministic tests, subprocess tests, and the critical real-OS checks pass. If manual scenarios remain pending, hand over explicitly as awaiting live validation, with exact commands and risks. Do not install, publish, merge, or push merely because task commits exist.

## Plan self-review

- Spec coverage: Tasks 2/5 own lifecycle, power and recovery; 4 owns native cleanup; 6/7 own accepted UI; 8 ships the design/table and validation evidence.
- Interface check: model uses only domain observations and injected time; adapter owns Herdr fields; monitor snapshots expose actual assertion activity; popup commands carry occupant/run guards.
- Review Focus: all five listed risks have explicit tests in their owning tasks.
- Validation honesty: source/documentation inspection is not represented as live proof. Assertion flag composition, live provenance, locality/identity, and disable handling are gated in Task 1.
- Scope: no standalone Pi extension, Claude hook installation, remote-agent support, per-session policies, or persistent lease recovery added.
