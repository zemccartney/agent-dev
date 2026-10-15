# Fresh-context whole-package review request

**Status: awaiting user-coordinated independent reviewer.** This is a request, not a review result. Review the current complete package, not just the latest UI diff or the author's historical checks.

## Checkout and scope

- Worktree: `/Users/enlow/proj/pi-ext/.worktrees/caffeination`
- Branch: `feat/herdr-caffeination`
- Whole-branch comparison base: `c81693a2b4b96551ca0d4db6b8bef4a74742ca2d`
- Latest implementation checkpoint: `4e1788598029f7a959fa6701276b90416a5b81a9`; documentation handoff follows it. Use current HEAD and inspect any pending/staged changes too.
- Primary scope: all of `herdr/caffeinate/`, including bootstrap, source, tests, build configurations, dependency/lockfile policy, licensing inputs, runtime payload preparation and documentation. Include the checkpointed TypeScript migration and original lease/transport/assertion implementation, not only the final refactor commits.
- Execution was approved after planning commit `a958e01`; the plan's original pre-authorization statements are historical. The latest user instruction is to proceed until review, then stop for their coordination.
- Product authority: `herdr/caffeinate/docs/design.md`; approved execution plan: `docs/superpowers/plans/2026-10-13-caffeinate-prepublication-refactor.md`. Latest decisions are Node **24.x only**, one types/compiler environment, bundled/minified production ESM and standalone pi-tui, with no Pi agent SDK.
- Read canonical repository `LICENSE`; do not edit other projects, the main checkout's shared TODO, or the agentlog plan.

```sh
git status --short
git diff c81693a2b4b96551ca0d4db6b8bef4a74742ca2d..HEAD -- herdr/caffeinate
git diff -- herdr/caffeinate
git diff --cached -- herdr/caffeinate
```

## Non-negotiable behavior

Prevent idle **system** sleep, not display sleep. Never send input/cancel/stop to agents. Independent eight-hour absolute per-run defaults, ten-second delay anchored to run start, AC-only eligibility, no renewal from uncertainty or progress, no cold-discovery adoption, no persisted leases or arming. Preferences are global; monitor/IPC ownership is per verified local Herdr server. Native assertions are finite and monitor-owned. Preserve captured occupant/run/revision targeting, navigation/drafts, numeric editing and the 56×18 minimum.

## Review focus

1. **Lifecycle/evidence:** Pi authority versus positive Claude evidence; uncertainty and observation gaps; run/occupant replacement; independent deadlines; assertion timeout/owner cleanup; stale-lock/PID safety; disable/server disappearance versus transient failures.
2. **Popup:** exact selected identity after reorder/remove/replace; stale guards and repeated actions; refresh/draft isolation; safe labels and width handling; mouse selection across refresh/resize; application focus versus widget focus; startup before `runPopup` as well as closing during its initialization, labels, refresh and commands; terminal/client cleanup and late rejection/render suppression.
3. **Build/runtime:** matching Node-24-major guards and metadata, error-only developer runtime policy, one strict project/types version, extensionless build boundary, independent tsc/type-aware lint, modular tests versus actual bundle execution, no undeclared runtime imports or generated-code checking leak.
4. **Distribution/licensing:** actual included-package inventory including injected rolldown helpers, exact-version policy, full upstream text/notice retention, safe `vendor:` resolution and provenance for pi-tui's omitted LICENSE/OpenTUI copy, complete Marked terms, canonical root LICENSE and source-free payload allowlist. No optional native helper or consumer compiler requirement.
5. **Tests/evidence:** negative canaries and real failure oracles, independent terminal widths, genuine relocated-bundle startup, deduplication and popup acceptance, safe sandbox isolation/cleanup. Distinguish historical native evidence, deterministic subprocess substitutions, renderer tests, no-agent real-host acceptance and missing real-agent/physical checks.

## Reproduction and evidence

Safe default verification from `herdr/caffeinate`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
pnpm test:runtime
git diff --check
```

`test:runtime` consumes the prepared payload, reports the actual binary version, and does not install a runtime. `CAFFEINATE_TEST_NODE=/absolute/path/to/node` selects an already installed Node 24 binary. Actual minimum 24.0.0 is not available here.

Recorded environment: macOS, Node 24.16.0, pnpm 11.26.0, Herdr 0.9.3. Latest default aggregate before this documentation handoff: 107/107 TAP, integration 8/8, actual relocated runtime 1/1. The permissioned relocated real-Herdr test and toolkit spike also passed, without agents or native assertions. The final handoff reruns the default gates rather than treating historical counts as fresh evidence.

Local execution evidence: `.superpowers/sdd/2026-10-13-caffeinate-prepublication-refactor/` (`progress.md`, task briefs, RED logs, `task-3-final.log`, `task-4-final.log`, `task-5-final.log`, and final Task 6 verification). This directory is ignored scratch; committed `docs/validation.md` records the distinctions. Generated `.build/runtime/` and `.build/bundle-inventory.json` are reproducible, not committed release assets.

## Permissions and unresolved gates

Do not start agents, acquire sleep assertions, run native probes/demos, restart/relink the normal trial, change global configuration, merge, push or publish. Ask before rerunning any live sandbox command in the review session; default verification needs none.

- Real Pi and Claude exits **while actively caffeinated**, assertion/owner/deadline/cup evidence and an independently protected survivor remain unverified. No finite real-agent workload has been agreed. The additional native/agent flag currently rejects explicitly; those scenarios are not implemented or passed.
- Node 24.0.0 runtime compatibility remains unverified, despite simulated boundary checks and declared `^24.0.0` support.
- Physical battery transitions, display sleep while work continues and overnight behavior remain unverified.
- Independent review itself is the current gate. Author checks are not a substitute.
- Main-checkout `TODO.md` still has superseded Node-22/undici and unbundled-build notes; flag these for coordinated reconciliation, do not silently edit them.

## Requested result

Return prioritized findings (Critical/Important/Minor) with file/line references, concrete failure scenarios and reproducible tests where possible. Assess safety, correctness, maintainability, licensing and missing validation separately. Identify which issues block this refactor versus release/unattended use. Do not treat acknowledged missing acceptance as passed, and do not provide a release sign-off merely because default tests pass. The user will coordinate any fixes and subsequent acceptance work.
