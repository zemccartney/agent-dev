# Trial review and decisions

Author self-review; no independent reviewer was available. Review covered the approved spec, platform evidence, model, monitor/IPC, UI, failure cleanup and tests.

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
- Runtime launch checks Node >=24.0.0, macOS, built output and Herdr CLI >=0.9.3 before application loading; build preflight checks only Node. The tiny checked CommonJS bootstrap intentionally uses old syntax for useful unsupported-runtime errors. Version boundaries were simulated, not exercised with historical Node binaries.
- Node 24 is the user's revised baseline, so Node 22 support is intentionally removed. Optional unsupported `import/no-unresolved` was not enabled in this Oxlint version; the import plugin remains enabled and TypeScript independently checks resolution.
- Runtime Herdr validation adds a bounded read-only version subprocess per launch and can reject an unrecognized/custom version string. It does not contact/restart the live server or modify its configuration.
- No new Critical/Important findings remain from this pass. Existing deferred polish above is unchanged; actual release packaging/installer validation and real-Claude/laptop/overnight acceptance are explicitly not supplied by these tests.

Assessment: the scoped tooling work is ready for human/independent review, not a release or unattended-reliability sign-off. Work remains uncommitted, unmerged and unpublished; the linked worktree and execution ledger are retained.
