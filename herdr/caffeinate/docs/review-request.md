# Fresh-context review of the approved repairs

**Status: awaiting the repair-phase independent reviewer.** The initial review is complete, not a verdict on the new implementation. No release/merge approval is implied.

## Target and authority

- Worktree: `/Users/enlow/proj/pi-ext/.worktrees/caffeination`, branch `feat/herdr-caffeination`.
- Whole-package base: `c81693a2b4b96551ca0d4db6b8bef4a74742ca2d`.
- Original reviewed head / repair base: `e764321b39b2e78fc549f676619dae35b341ef7f`.
- Repair implementation through `d45fdc70a267d61bc8572dcb41dfbd6e059f64e5`; documentation follows. The coordinator supplies an exact exported final head to the reviewer, rather than a moving worktree.
- Scope: the entire `herdr/caffeinate` package and its contracts, with special attention to repair interactions. Include bootstrap, assertion ownership, transport, popup, build/licensing and tests—not just the diff.
- Product authority: `docs/design.md` in this package. Approved repairs: repository-root `thinking/code-review-20261015T001624Z.md` and `docs/superpowers/plans/2026-10-15-caffeinate-review-repairs.md`.
- User approved R1–R7 and native execution followed by one fresh independent review. Node **24.x only, minimum 24.11.0**, common to developers/consumers. No dependency-policy weakening, new runtime provisioning, split compiler environment or Pi agent SDK.

## Invariants and focused questions

Prevent idle **system** sleep, not display sleep. Never send input/cancel/stop to agents. Keep independent eight-hour absolute defaults, ten-second delay anchored to run start, AC-only eligibility, no automatic renewal from uncertainty or progress, no cold-discovery adoption and no persisted leases/arming. Preferences are global; monitor/IPC ownership is per verified local server. Assertions remain finite and monitor-owned. Preserve occupant/run/revision targeting, UI drafts/navigation and 56×18 minimum.

1. Event loss during host/list/observation awaits, including a second gap during recovery: no new authority from stale reads; preserve previously valid deadlines.
2. Identity mismatch versus activity uncertainty, including one invalid agent among valid peers: reject only grants lacking current target validation; manual unknown-activity protection still works.
3. Battery/unknown transitions while observation, token publication or shutdown is pending: safety progresses independently and late work cannot reacquire.
4. Multiple assertions and delayed child exit/spawn during shutdown: no concurrent assertion writers, orphan children or cross-agent lease changes.
5. Aliased paths and poisoned developer environment: genuine missing coverage still fails; selected Node/Herdr run without inherited preload effects.

The safety timer must never promote pending automatic work from cached working state. Release/cancel remain guarded operations that reduce protection, including during uncertainty. Evaluate whether these contracts are actually enforced rather than assuming the passing tests are adequate.

## Verification supplied to the reviewer

From `herdr/caffeinate`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
pnpm test:runtime
git diff --check
```

Fresh pristine-layout evidence through `d45fdc7`: frozen install and normal format/type/lint/build gates pass; **122/122 TAP**, **8/8 integration**, **2/2 relocated-runtime tests**, zero skips. Actual Node **24.16.0**, pnpm **11.26.0**. All four original monitor counterexamples now pass against the rebuilt code; they use fake ports, not native assertions. Evidence is in the repair plan's execution workspace; the coordinator provides it separately to the reviewer. Historical results remain in `validation.md`.

`CAFFEINATE_TEST_NODE=/absolute/path/to/node` selects an already installed binary. Actual minimum **24.11.0** is unavailable/unverified; no binary is downloaded. The runtime test runs with private directories and a deliberately limited child environment, including an explicit Herdr executable. Its hostile-parent test confirms that a developer preload does not leak into the payload.

## Permissions and known limits

Read-only review. Do not edit implementation, start live agents/Herdr instances, acquire native assertions, run native probes/demos, restart/relink the normal trial, change global configuration, merge, push, publish or install tooling. The coordinator runs mutating build/test commands in isolated verification copies.

Real Pi/Claude exits during active caffeination, native assertion/owner/deadline/cup/survivor evidence, physical battery/display transitions and overnight behavior remain unverified. The real-agent scenario is still unimplemented and explicitly refuses execution. Prior isolated bundled-Herdr/native results do not prove this repaired bundle's live acceptance.

Do not alter other projects, the main checkout's shared TODO or the Agentlog branch. Branch setup is owned by the Agentlog coordinator; this repair stays on its existing branch. Any eventual ordinary PR must explicitly target `dev`; promotion to `main` is separately approved work, not part of this review.

## Requested result

Report Critical/Important/Minor findings with exact file/line references, concrete conditions, evidence and uncertainty. Lead each finding with what a plugin user or developer would experience and why it matters; explain internals afterward. Distinguish demonstrated defects, code-path inference and missing acceptance. Address the whole package and repair interactions; do not provide a release sign-off merely because unit tests pass. Return any behaviors you declined to judge explicitly so the coordinator can adjudicate them. Do not spawn additional reviewers.
