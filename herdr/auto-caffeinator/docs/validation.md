# Auto-caffeinator validation and review limits

Implementation, simulated tests, native observations and owner acceptance are different
evidence. Use [development commands](../README.md#development), [product design](design.md)
and the [shared backlog](../../../docs/maintenance/BACKLOG.md#herdr-release-readiness).
Historical counts below identify their snapshots; rerun checks for a new candidate.

## Implemented and regression-tested

- Independent eight-hour absolute leases, ten-second delayed grant, no automatic renewal
  from uncertainty/progress, guarded occupant/run/revision commands and ephemeral arming.
- Evidence generations invalidate stale reads immediately; verified identity with uncertain
  activity still permits manual protection, while failed identity revalidation blocks grants.
- A coalesced one-second safety timer reconciles power/assertions independently of slow Herdr
  reads/sidebar writes. It never grants pending automatic protection from cached activity.
- Shutdown synchronously requests assertion closure before serialized cleanup; late spawn
  cannot reacquire. Confirmed-absent agents lose eligibility before metadata I/O. Active-agent
  disappearance tests preserve another agent's PID/deadline using ordinary child processes,
  **not native sleep assertions**.
- Typed source/tooling, minified production bundle versus modular tests, canonical LICENSE,
  exact-version bundle inventory/notices, path-safe workspace licensing and explicit runtime
  test environments. Production and focused-test outputs are distinct acceptance surfaces.

## Historical acceptance

| Evidence                                                         | What it established                                                                                                                                                       | What it did not establish                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Herdr 0.9.3/protocol 22, macOS/Node 24.16.0 native probe         | Finite `caffeinate -i -w OWNER -t SECONDS` expiry, owner SIGTERM/SIGKILL and explicit child termination; assertions observed absent afterward                             | Current repaired bundle's real-agent lifecycle or physical battery behavior                                 |
| Attended Pi five-minute tool loop and owner week of use          | Automatic protection, manual short expiry/reapply, controls/cup and useful daily behavior                                                                                 | Claude correctness, laptop transitions or unattended reliability; no new soak gate is required              |
| Relocated production bundle in isolated Herdr 0.9.3/Node 24.16.0 | Detached self-launch/deduplication, manifest action and captured target, popup keyboard/mouse/settings/resize/Escape, monitor survives popup close, explicit stop cleanup | No real agents or native assertions; active-target/Unicode-label races remain renderer evidence             |
| Final repaired `5d28824` pristine export                         | Frozen install, 126 unit/contract, 8 integration, 2 relocated-runtime tests and 4 original counterexamples passed; no skips; Node 24.16.0                                 | Actual minimum 24.11.0, real-agent/native/physical evidence or independent re-approval of the final repairs |

Earlier native Pi-shaped simulator checks also observed delayed acquisition, manual short
expiry, plugin-disable/server-stop cleanup and monitor-SIGKILL cleanup without restoring
leases on restart. Synthetic Claude screens established evidence classification, not real
Claude lifecycle acceptance. Those historical checks were not rerun on the repaired bundle.

The test-only pi-tui spike separately established required toolkit input/Unicode/resize
behavior inside isolated Herdr without optional native helpers. It is not production-popup
or current runtime acceptance. Normal builds never restart/relink the working trial.

## Independent review provenance

The original whole-package review of `e764321` accepted seven repairs: refresh uncertainty,
in-flight event loss, power scheduling, target revalidation, runtime-floor mismatch,
canonical test paths and inherited test environment. A fresh reviewer inspected `b8815ac`
and found three further interactions: manual deadlines overwritten by old boundaries,
shutdown spawning replacements, and delayed token cleanup prolonging exited-agent protection.
All were reproduced and corrected in `5d28824` with regressions and full checks.
**The final corrections were test-verified, not sent through a second independent review.**
Later root foundation work separated developer pins/core-tooling types and removed obsolete
trial glue; do not restore the older common developer/consumer floor or one-compiler recipe.

## Outstanding acceptance

- Execute the actual consumer minimum **Node 24.11.0** and maintained supported runtimes;
  simulated version boundaries and a successful newer binary are not that evidence.
- Agree a finite workload and permission for real **Pi and Claude** exits while caffeinated.
  Capture native PID/owner/deadline/cup and verify the independent active survivor. The
  `CAFFEINATE_RUN_AGENT_EXIT_TESTS=1` path currently refuses; it is not implemented acceptance.
- Track remaining short-response/cancellation/permission-wait/detach/multiple-agent cases,
  physical laptop battery/AC and display-off/sleep-resume behavior, terminal/font/theme limits
  and later-host compatibility separately. Overnight reliability remains unestablished, not
  an imposed repeat trial. Never infer physical behavior from held fake ports or PTYs.
- Public installers/releases and clean install/update/failure/removal remain unimplemented.
  Obtain refreshed independent lifecycle/packaging review before publication and disclose
  remaining limits. No normal-trial restart/relink, native probe or publication is authorized
  merely by these records. The [attended demo](demo.md) requires its own permission.
