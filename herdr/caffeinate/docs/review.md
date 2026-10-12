# Trial review and decisions

Author self-review; no independent reviewer was available. Review covered the approved spec, platform evidence, model, monitor/IPC, UI, failure cleanup and tests.

## Fixed

- Split multibyte UTF-8 socket chunks could corrupt session paths/identity. Herdr and private IPC now use streaming UTF-8 decoding. Two regressions failed before the fix and passed after it.
- Added explicit consumer coverage for global settings across monitors and popup release/cancel-arming actions.
- Earlier live validation found popup targeting restrictions and a server-exit/transient-failure distinction; both received regression tests and live checks.

Final deterministic suite: 53/53. Integration subset: 5/5. Existing Pi package: 8/8. No independent review or real model-backed overnight test is implied.

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
- Expand compact source formatting for readability when revisiting modules.

Recommendation: suitable for the documented attended demo; not yet validated as an unattended reliability tool. Branch remains unmerged and unpublished.
