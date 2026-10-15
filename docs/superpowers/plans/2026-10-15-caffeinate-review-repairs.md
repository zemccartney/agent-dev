# Caffeinate Review Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct all seven accepted findings without changing agent execution, weakening safety policy or expanding infrastructure scope.

**Architecture:** Keep run transitions and evidence validation in the monitor/model boundary. Give the monitor a separate serialized assertion/power path and an owned one-second safety timer, so Herdr reads and metadata publication cannot block battery removal. Preserve existing public monitor methods, bundled production/test separation and fail-closed packaging.

**Tech Stack:** TypeScript, Node 24.x, pnpm 11.26.0, existing standalone pi-tui and tsdown; no added dependencies.

**Spec:** `thinking/code-review-20261015T001624Z.md` (R1–R7, all approved for repair in chat), plus `herdr/caffeinate/docs/design.md`. The reviewed baseline is `e764321b39b2e78fc549f676619dae35b341ef7f`.

## Global Constraints

- Idle **system** sleep only; never send agent input/cancellation/stop commands.
- Default duration `28_800_000` milliseconds; automatic delay `10_000` milliseconds anchored to the observed run start; independent absolute deadlines.
- Uncertainty never automatically grants/renews. Preserve existing leases and valid pending timestamps. No cold-discovery adoption or persisted leases/arming.
- AC-only; unknown power cannot acquire protection. Periodic power response targets at most two seconds in normal operation, not a hard-real-time guarantee.
- Preserve manually protecting an identified agent whose activity is uncertain; reject grants/arming when identity revalidation failed.
- Common developer/runtime floor selected for this repair: **24.11.0**, restricted to Node **24.x**, matching every Node engine range currently recorded in the complete lockfile. Reconfirm against pristine installation; do not introduce split floors.
- One compiler/types environment; exact existing dependency pins, seven-day cooldown, strict provenance/date/engine/build-script policy, licensed bundled production payload.
- No runtime downloads/provisioning. Node 24.16.0 is available; actual 24.11.0 execution remains a separate unverified gate unless that binary is supplied.
- No live-agent/native-assertion workloads, normal-trial restart/relink, global configuration edits, mise/Docker project, merge, push or release.
- Use the existing isolated `.worktrees/caffeination` workspace. Preserve the review report and original evidence; do not rewrite old verification history into new results.

## Review Focus

1. Event loss during host/list/observation awaits, including a second gap during recovery: no new authority from stale reads; preserve previously valid deadlines (Task 2).
2. Identity mismatch versus activity uncertainty, including one invalid agent among valid peers: reject only grants lacking current target validation; manual unknown-activity protection still works (Task 2).
3. Battery/unknown transitions while observation, token publication or shutdown is pending: safety progresses independently and late work cannot reacquire (Task 3).
4. Multiple assertions and delayed child exit/spawn during shutdown: no concurrent assertion writers, orphan children or cross-agent lease changes (Task 3).
5. Aliased paths and poisoned developer environment: genuine missing coverage still fails; selected Node/Herdr run without inherited preload effects (Task 4).

## File responsibilities

- `src/model.ts`: pure entitlement transitions; existing rules should generally remain sufficient.
- `src/monitor.ts`: evidence generations, refresh validation outcome, guarded mutations, independent power/assertion serialization and timer ownership.
- `src/herdr.ts`: distinguish an identity mismatch from an uncertain activity observation; keep existing adapter contract shape.
- `src/main.ts`: status/event scheduling and shutdown wiring; do not duplicate the monitor's safety cadence.
- `src/assertions.ts`: owned child lifecycle; only change where concurrency/removal regressions require it.
- Package metadata, launcher/preflight and runtime preparation: one consistent minimum.
- Existing monitor/adapter/assertion/end-to-end tests: real module interfaces with fake ports/ordinary children, never native sleep assertions.
- Quality and relocated-runtime tests: path identity and explicit child environment. No new production abstraction for test-only configuration.

---

### Task 1: Restore clean installation with the approved higher common floor (R5)

**Files:** `herdr/caffeinate/{package.json,pnpm-lock.yaml,README.md}`, `scripts/{preflight.cjs,launch.sh,prepare-runtime.ts}`, `test/{launcher,tooling,packaging,developer-runtime}.test.ts`, `test/runtime-compatibility.test.mjs`, `test/helpers/herdr-sandbox.ts`.

**Interfaces:** Keep `check(mode: 'build' | 'runtime'): void` and `prepareRuntime(packageRoot: string, outputDir: string): Promise<void>`. Both metadata ranges become `^24.11.0`; preflight minimum becomes `[24, 11, 0]`. Selected-runtime test probes must enforce the same floor rather than accepting every 24.x version.

- [ ] Add failing checks for rejected 24.0.0/24.10.x/24.11.0-pre/25.x and accepted 24.11.0/24.16.0 in both launcher modes; require `^24.11.0` in source and prepared metadata and error-only devEngines.
- [ ] Establish RED with the direct installed-tool build and focused tests while pnpm's normal installation is still blocked. Preserve the already reproduced pristine-install failure as baseline evidence.
- [ ] Update metadata, preflight, shell error text, runtime preparation and selected-binary validation consistently. Preserve every dependency version/security setting. Let pnpm update lock metadata only if necessary; inspect any diff.
- [ ] Run `pnpm install --frozen-lockfile` in a pristine temporary package/repository layout, then `pnpm check`. Require successful installation and correct minimum-boundary results; record unrelated still-open R6 failure separately if using an aliased temporary path.
- [ ] Update current README support text and record actual 24.16.0 versus unexecuted 24.11.0. Commit only this coherent R5 change, with verification evidence.

### Task 2: Make refresh authority explicit (R1, R2, R4)

**Files:** `herdr/caffeinate/src/{monitor,herdr}.ts`; `test/{monitor,herdr,end-to-end}.test.ts`; consult `src/model.ts` without duplicating its lease policy.

**Interfaces:** Existing public `refresh(): Promise<void>`, `tick(): Promise<void>`, `markGap(): Promise<void>`, `command(value: unknown): Promise<void>`, `snapshot(): MonitorSnapshot`, `close(): Promise<void>` stay compatible. Internally, refresh supplies `{ generation: number; verifiedOccupants: Set<string> }` for command authorization; public refresh/tick discard that result. `markGap` invalidates the evidence generation synchronously before returning its promise. `observe(target): Promise<Observation>` continues returning matching-occupant uncertainty for uncertain **activity**, but rejects identity mismatch.

- [ ] Port the review's R1/R2/R4 expected-contract reproductions into the existing monitor test fixture and run them RED: failed listing during pending delay yields zero new assertions; an in-flight gap cannot create a pending run; failed target reread rejects a captured duration mutation without changing its deadline.
- [ ] Add regression assertions for host/config failures; recovery retains the original pending deadline; an already-active lease survives uncertainty; repeated gaps during recovery never infer a fresh start; previously valid pending/active state is not discarded merely because a later gap occurs.
- [ ] Add adapter/monitor tests distinguishing matching identity with uncertain activity (manual protection allowed) from changed/missing identity (grant rejected), and a failing peer that must not corrupt another agent's deadline. Preserve rejection of stale occupant/run/revision guards.
- [ ] Implement a monitor-owned evidence generation. Check invalidation after awaited observations, before treating them as authority for new starts, and do not erase a newer gap at refresh completion. Whole-refresh failures apply the existing uncertain-observation transition before any tick can promote pending work.
- [ ] Track per-refresh identity validation, rejecting grant/extension/arming if the target is not verified or the generation has since changed. In `herdr.ts`, separate final occupant mismatch from same-identity activity-sequence uncertainty. Avoid a blanket ban on manual unknown-activity protection.
- [ ] Preserve release/cancel behavior under uncertainty when the current cached occupant/run/revision guard matches: these operations only reduce protection. This is a minimal-preservation implementation choice, not a new bypass for grants. Add a regression for that case.
- [ ] Run `pnpm build && node --test --test-reporter=tap test/monitor.test.ts test/herdr.test.ts test/end-to-end.test.ts`, then typecheck/lint. Require all new counterexamples green and unchanged original deadlines/surviving-agent identity. Commit the evidence-authority correction.

### Task 3: Decouple battery safety from Herdr latency (R3)

**Files:** `herdr/caffeinate/src/{monitor,main,assertions}.ts`; `test/{monitor,assertions,end-to-end}.test.ts`.

**Interfaces:** Keep the monitor's public API unchanged. Internally add `reconcileSafety(): Promise<void>` on a separate serialized chain and a monitor-owned, unref'ed 1,000 ms timer. Both status-driven reconciliation and timer work use this same assertion owner. The safety path reads power and reconciles already-established, unexpired leases; it must never promote pending automatic work from cached working status. Herdr token publication remains on the control path, outside the safety chain.

- [ ] Add RED tests using mocked timers/deferred ports: active protection is removed on battery/unknown while a Herdr observation remains unresolved, and while token publication remains unresolved. Verify safety progress without releasing either held promise.
- [ ] Add tests that a power-only timer cannot grant a pending lease, expiry cannot renew a deadline, valid AC restoration preserves the original deadline, repeated timer firings do not pile up overlapping safety operations, and two agents retain independent identities/deadlines.
- [ ] Implement the separate safety chain and coalesced one-second timer in the monitor. Serialize power reads and assertion writes, using current state when the operation executes rather than a stale desired-state map captured before another await. Update active flags without awaiting sidebar I/O.
- [ ] Make close mark shutdown/clear its timer immediately, before awaiting the Herdr control chain. Release assertions through the safety owner; prevent any late refresh/power/spawn completion from reacquiring. In `main.ts`, delegate to monitor shutdown when initialized; direct assertion cleanup remains only for startup before a monitor exists.
- [ ] Add delayed-child spawn/exit and multiple-removal regressions. Ensure removals are not needlessly serialized into N × 500 ms escalation waits; parallelize independent child removal if needed while retaining a single reconciliation owner. Never allow a completed close to leave a late-spawned entry active.
- [ ] Run focused monitor/assertion/end-to-end tests, then `pnpm check && pnpm test:integration`. Verify cleanup and non-overlap through actual module interfaces and ordinary subprocess fixtures, not native assertions or source-text assertions. Commit the bounded-safety change.

### Task 4: Make verification portable and deliberately isolated (R6, R7)

**Files:** `herdr/caffeinate/test/quality-canaries.test.ts`, `test/runtime-compatibility.test.mjs`; add a test-only preload sentinel fixture under `test/fixtures/` if needed.

**Interfaces:** No application API changes. Canonicalize file identities for the coverage-set comparison and generated-output roots. The relocated-runtime test selects absolute preinstalled Node/Herdr paths, creates private HOME/TMPDIR/bin directories, and passes an explicit environment to both version/preflight probes and the launcher. Keep only intentional test selectors, locale/terminal values as needed, and a controlled system PATH; do not copy `process.env` wholesale.

- [ ] Capture the existing RED coverage test under `/tmp` versus `/private/tmp`; add a regression that equivalent canonical/symlink locations pass while a genuinely excluded owned file still fails. Preserve the negative type-error and floating-promise canaries.
- [ ] Implement canonical filesystem identity comparison without special-casing macOS path spellings or suppressing missing files. Apply the same normalization to generated-output exclusion checks.
- [ ] Add a poisoned-environment regression: a parent `NODE_OPTIONS` preload that would fail or leave a sentinel must not affect the selected Node version probe or relocated launcher. Test that intentional Node selection still works and the real Herdr executable is available without inheriting its entire surrounding PATH.
- [ ] Construct the minimal child environment inline in the existing test harness, resolving executables before sanitizing. No Docker/mise configuration or generalized sandbox framework is needed. Keep the payload source/dependency-free and remove all temporary directories in cleanup.
- [ ] Run quality canaries through both path spellings; run `pnpm test:runtime` and the negative-environment case. Require real selected Node version output, no sentinel execution, and no skips. Commit the test-isolation correction.

### Task 5: Reverify the repaired snapshot and obtain focused independent review

**Files:** current sections of `herdr/caffeinate/{README.md,docs/design.md,docs/review.md,docs/validation.md,docs/review-request.md,docs/demo.md}`; `thinking/code-review-20261015T001624Z.md` decision/outcome links; this plan's checkboxes. Preserve historical result/version text as history rather than replacing every occurrence of 24.0.0.

**Interfaces:** No new runtime interfaces. Handoff maps R1–R7 to the new commit(s), test evidence and remaining acceptance limits.

- [ ] Run pristine `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:integration`, `pnpm test:runtime`, and `git diff --check` on the repaired snapshot. Record exact counts, binary version and failures; do not substitute direct-tool diagnostics for successful normal commands.
- [ ] Re-run the original review counterexamples against the new build and require their expected-contract assertions to pass. Keep original RED evidence separately. Verify no tracked implementation or normal Herdr configuration outside the intended worktree changed.
- [ ] Update current support/validation/handoff documentation with the new common minimum, evidence-authority and power scheduling behavior, explicit approval history and precise remaining gates. Actual 24.11.0, live-agent/native, physical and overnight checks remain unverified unless separately authorized/provided.
- [ ] Request a fresh-context independent reviewer of the repaired areas and their interactions, supplying the original findings, exact old/new heads, approved contracts, fresh evidence and read-only/no-native constraints. Do not reuse old review approval as verification of the new snapshot. Use the authenticated supported runtime; do not repeat the unavailable Pi model attempt.
- [ ] Report any unresolved new issues or permission-dependent gates and stop for human direction before broader testing/release/merge. No automatic integration or publication.

## Plan self-review

- R1/R2/R4 share one evidence-authority task because their freshness and command checks must agree.
- R3 has its own testable safety/lifecycle change, using the monitor's existing ownership boundary rather than a new framework.
- R5 runs first to unblock normal installation and tests; no pin or dependency-policy relaxation is needed.
- R6/R7 are test-only repairs, not authorization for repository-wide infrastructure changes.
- Each Review Focus item has explicit regressions above. No public observation-shape expansion or second compiler project is required.
- Exact minimum runtime acceptance remains unavailable, not silently simulated. All original OS/agent permission boundaries remain intact.

## Execution choice

Recommended: **native execution in this session**, followed by fresh independent review. The evidence and power changes share monitor state/ownership, so parallel implementation would add coordination risk; separate commits and red/green regressions retain reviewable boundaries.
