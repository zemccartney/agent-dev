# Review status and historical decisions

**Independent whole-package review is open.** No fresh reviewer has been invoked or supplied findings. The user will coordinate that review using [review-request.md](review-request.md). Implementation and permitted validation are checkpointed; there is no release, merge, publication or normal-trial restart/relink authorization.

The sections below record historical author checks, not independent approval. They covered the approved spec, platform evidence, model, monitor/IPC, UI, failure cleanup and tests.

## Fixed

- Split multibyte UTF-8 socket chunks could corrupt session paths/identity. Herdr and private IPC now use streaming UTF-8 decoding. Two regressions failed before the fix and passed after it.
- Added explicit consumer coverage for global settings across monitors and popup release/cancel-arming actions.
- Earlier live validation found popup targeting restrictions and a server-exit/transient-failure distinction; both received regression tests and live checks.

Initial deterministic suite: 53/53. Integration subset: 5/5. Existing Pi package: 8/8. No independent review or real model-backed overnight test is implied.

## Rulings made during implementation

1. Approved isolation requirement was treated as worktree consent; only the ignore entry was committed on main, implementation stayed on `feat/herdr-caffeination`. Cost if unwanted: the unmerged worktree can be removed after unlinking the plugin.
2. Synthetic Pi-shaped process/reports and synthetic Claude screens establish protocol contracts, not real harness correctness. Actual agent behavior remains attended acceptance work; cost: the trial may expose compatibility gaps.
3. Use raw `agent.explain` rather than spawning its CLI wrapper. Serial refresh coordination lives in the monitor. Cost: changes to the API shape need compatibility checks.
4. Round native assertion timeouts down to whole seconds; cap the native timeout integer without moving the lease deadline. Cost: caffeination may end less than one second early, and subsecond leases cannot acquire assertions.
5. Fail closed on stale same-server runtime locks, with explicit manual cleanup instead of PID-based takeover. Cost: SIGKILL recovery may require checking/removing the reported owner directory. No leases are resurrected.
6. Add private `stop-monitor` IPC for graceful monitor shutdown; it never sends an agent stop command. Cost: same-user local callers can stop caffeination, not agent work.
7. Popup placement follows Herdr's active UI surface; captured agent target travels via environment because popup API rejects a target-pane argument. Cost: if focus changes mid-launch, controls can appear over a different pane, but still address the original agent.
8. Exclude unverified foreground ownership, SSH and tmux wrappers rather than guessing. Cost: some legitimate locally wrapped agents are not supported by v1.
9. Treat physical battery/display and real agent acceptance as unresolved, not infer them from simulated tests. Cost: don't trust the trial unattended until those checks pass for your workflow.

## Deferred polish

- Initial discovery can make a fast popup command stale; refresh/retry is safe but inelegant.
- Measure process/evidence polling overhead with many concurrent agents before optimizing.
- Compact source formatting was addressed by the TypeScript/Oxfmt migration below.

Recommendation: suitable for the documented attended demo; not yet validated as an unattended reliability tool. Branch remains unmerged and unpublished.

## TypeScript/build tooling review — 2026-10-13

Author self-review only; no independent reviewer tool was available. Reviewed the pending working-tree changes, not just the historical commit range: model/command invariants, JSON/IPC narrowing, assertion ownership/timeouts, popup ports and compatibility, stable build paths, runtime preflight, locked dependency policy, and test/consumer-layout coverage.

- Strict TypeScript, independent type-aware lint, Oxfmt and **83/83** built-output tests pass; integration subset **7/7** passed at the task gate. No blanket `any`, rule suppressions, or excluded tests were added.
- One Important type-safety finding: the assertion manager's empty return map inferred `Map<any, any>` and erased its result contract. A real compiler canary accepted an invalid string assignment before the fix; explicit map typing now produces TS2322 and accepts the correct result access. Also typed the internal occupant set. The full 83-test aggregate check passed after this fix.
- At this historical checkpoint, runtime launch checked Node >=24.0.0, macOS, built output and Herdr CLI >=0.9.3 before application loading; build preflight checked only Node. The later refactor restricts both paths to Node 24.x. The tiny checked CommonJS bootstrap intentionally uses old syntax for useful unsupported-runtime errors. Version boundaries were simulated, not exercised with historical Node binaries.
- Node 24 is the user's revised baseline, so Node 22 support is intentionally removed. Optional unsupported `import/no-unresolved` was not enabled in this Oxlint version; the import plugin remains enabled and TypeScript independently checks resolution.
- Runtime Herdr validation adds a bounded read-only version subprocess per launch and can reject an unrecognized/custom version string. It does not contact/restart the live server or modify its configuration.
- No new Critical/Important findings remain from this pass. Existing deferred polish above is unchanged; actual release packaging/installer validation and real-Claude/laptop/overnight acceptance are explicitly not supplied by these tests.

That tooling checkpoint has since been committed and superseded by the Node-24-only bundled runtime and toolkit popup. The branch remains unmerged/unpublished; the linked worktree and execution ledger are retained.

## Current prepublication handoff

- Implemented: single strict Node 24 project, separate modular test and minified production outputs, graph-derived dependency inventory, fail-closed notices/canonical LICENSE, allowlisted runtime payload, standalone pi-tui popup, and cancellation-safe popup lifecycle.
- Latest verification is recorded in `validation.md` and the execution ledger; historical counts above are not new evidence. Real bundled no-agent Herdr acceptance passed with Node 24.16.0 and Herdr 0.9.3.
- Still blocked: fresh independent review, actual Node 24.0.0 execution, actual Pi/Claude exit while caffeinated, independent active-survivor native evidence, physical power/display behavior and overnight reliability. The real-agent/native test flag fails explicitly because an agreed workload and permission remain prerequisites.
- The main checkout's shared TODO still contains superseded Node 22/undici override and unbundled-production notes. It was deliberately not edited; coordinate its update separately. The agentlog plan and other projects were not modified.

No current independent-review verdict or release-readiness approval exists.
