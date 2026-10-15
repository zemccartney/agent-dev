# Caffeinate repair review and final verification — 2026-10-15

**All seven accepted findings and three additional independent-review findings have been addressed.** This is not release or unattended-reliability approval. The branch remains unmerged and unpublished.

## Scope and independent assessment

- Whole-package base: `c81693a2b4b96551ca0d4db6b8bef4a74742ca2d`.
- Original reviewed head: `e764321b39b2e78fc549f676619dae35b341ef7f`.
- Repair review snapshot: `b8815ac2d1f8fcef25427dd7ed7dfb11b773de81`, exported before review.
- Subsequent corrective implementation: `5d28824`.
- User-approved plan: `docs/superpowers/plans/2026-10-15-caffeinate-review-repairs.md`.
- Initial report and human decisions: `thinking/code-review-20261015T001624Z.md`.

One fresh Codex CLI reviewer, explicitly using **gpt-6-astra / high**, inspected the entire package, both relevant diffs, plan/specification and supplied verification evidence. It had no implementation conversation and used a read-only sandbox. It reported **no Critical issues, three Important issues, and no Minor issues**. Its verdict on `b8815ac` was **“Mergeability: With fixes.”**

The reviewer credited the evidence-generation checks, preserved manual protection for verified/uncertain activity, independent safety cadence, coherent Node/toolchain/licensing policy and UI regression coverage. It did not independently run tests or native workloads.

The implementer accepted all three Important findings and performed the approved single RED→GREEN fix pass. There was **no second reviewer pass on the corrections**; do not describe them as an independently re-approved snapshot. Their verification is the new regressions and fresh complete suites below.

## Original findings: outcomes

| Finding | User/developer effect corrected | Implementation |
| --- | --- | --- |
| R1 | A failed status refresh could begin automatic protection after work might already have ended. Whole-refresh failures now mark uncertainty before a grant can occur. | `3b51c6f` |
| R2 | A gap arriving during a status read could invent a new run allowance. Invalidation is immediate and awaited observations must retain the same evidence generation. | `3b51c6f` |
| R3 | Slow Herdr/sidebar work could delay battery suspension. A separate coalesced one-second safety cadence reconciles existing entitlement without granting from cached activity. | `b06c953`, strengthened by `5d28824` |
| R4 | A duration action could extend an unverified remembered run. Grants require successful current target validation; verified identity with uncertain activity remains manually protectable. | `3b51c6f` |
| R5 | Clean development installation failed against incompatible promised/toolchain minima. Both developer and consumer minimum are now **24.11.0**, Node24.x only; dependency pins/security policy are unchanged. | `eecafa0` |
| R6 | An aliased checkout could falsely fail source-coverage checks. Canonical file identities are compared, while genuinely omitted source still fails. | `d45fdc7` |
| R7 | A developer preload could enter a supposedly isolated payload test. Node/version and launcher children now receive explicit environment and private directories. | `d45fdc7` |

## Additional independent findings and adjudication

### F1 — A manual one-minute choice could become eight hours

**Important; fixed.** After an idle/blocked agent became uncertain, a valid “Set from now” action could leave its old idle boundary or earlier armed request intact. Later working evidence could overwrite the user's manual deadline with an automatic or older armed duration.

**Observed RED:** a requested deadline `1800000060000` became `1800028800000`. The regression exercises idle and blocked baselines, with and without previous arming, and both 60-second and 20-hour manual choices.

**Correction:** a current manual grant consumes the prior boundary and one-shot arm. Subsequent working observations preserve that exact deadline. A genuinely subsequent confirmed idle-to-working transition still earns a new default run. Test: `manual uncertain-activity grants consume earlier idle boundaries and arming` in `herdr/caffeinate/test/monitor.test.ts`.

### F2 — Shutdown could create replacement children after it was requested

**Important; fixed.** Marking the monitor stopped did not tell a running assertion reconciliation to stop acquiring. Final cleanup was queued behind that reconciliation, so an old child's delayed exit could be followed by a new replacement spawn. A pending spawn event could also delay reaching cleanup.

**Observed RED:** shutdown created a third child instead of retaining the two already owned; a pending-start child had no termination signal until its spawn event was released. These tests combine the real monitor and real assertion manager with fake OS child handles, rather than testing only a mock close method.

**Correction:** the assertion port now requires synchronous `requestClose()`. It marks the manager closed and aborts a pending spawn wait before final cleanup is queued. Ordinary assertion writes remain serialized; final cleanup stops owned children and cannot begin later desired acquisitions. Tests: `monitor shutdown cancels replacement before an old assertion exit completes` and `monitor shutdown interrupts a pending spawn before acquiring another desired child`.

### F3 — Sidebar cleanup could keep an exited agent protected

**Important; fixed.** Once a successful list omitted an agent, the monitor still awaited its cup-clearing request before removing its lease from eligible state. A slow sidebar request could therefore keep its assertion active on AC.

**Observed RED:** the departed child's termination signal remained null while token clearing was held.

**Correction:** all confirmed-absent occupants are removed from eligible state and assertions reconciled before further Herdr I/O. Metadata cleanup is separate and concurrent across removed rows. Test: `confirmed disappearance stops its real assertion before held token cleanup, leaving survivor unchanged`; it verifies the surviving child, identity and deadline remain unchanged.

## Final verification

A new **pristine git-archive export of `5d28824`**, without node_modules, passed:

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass; exact existing pins/lockfile, no policy relaxation |
| `pnpm check` | Format, strict types, type-aware lint, build, **126/126 TAP**, zero skips |
| `pnpm test:integration` | **8/8**, zero skips; ordinary subprocess substitutes, not native assertions |
| `pnpm test:runtime` | **2/2**, zero skips; actual selected Node **24.16.0**, including hostile-parent preload |
| Original four monitor counterexamples replayed | **4/4 pass**; original assertions preserved, fake port adapted only for the new required shutdown method |
| `git diff --check` | Pass |

The replay's held-Herdr power case remained held for approximately 2.3 seconds of real time and had zero active fake assertions during that wait. This is not physical unplug evidence.

Final payload: **227,024 raw bytes**, **70,234 summed per-file gzip bytes**; the latter is not archive size. Dependencies and license inventory policies were not changed.

Fresh-review resource report: 384.3 seconds; 1,920,867 input tokens, including 1,770,880 cached input; 10,638 output tokens. Input counts include repeated cached context, not unique source size. Monetary charge was not reported.

## Rulings and unresolved acceptance

The reviewer explicitly declined the following judgments; the coordinator retains them as limits, not silently passed gates:

1. **Actual Node24.11.0:** unavailable and provisioning prohibited. Cost: minimum-only incompatibility may remain undiscovered despite current-version execution.
2. **Native/physical/resume/overnight behavior:** no newly authorized workload. Cost: fake-port behavior may differ from hardware/OS behavior.
3. **Real Pi/Claude lifecycle acceptance:** no agreed finite agent workload. Cost: harness-specific tracking failures may remain.
4. **Later Herdr versions and scaling:** best-effort compatibility and unmeasured polling overhead, as documented. Cost: newer versions or many agents may expose failures/latency.
5. **Font/theme fidelity and native right-click integration:** retain documented renderer/platform limits. Cost: other terminals or unsupported integration paths can differ.
6. **Distribution/provisioning/broader infrastructure and other projects:** outside local repair authorization. Cost: later installation/archive/deployment checks may find gaps.
7. **Remote/wrapped agents, detached background work, forced/lid-close guarantees and execution controls:** remain explicit product exclusions. Cost: users expecting those capabilities receive no protection/control.

One implementation ruling: add required synchronous `requestClose()` at the assertion boundary, because shutdown must cancel a running spawn wait before serialized cleanup. Cost if wrong: a future caller could misuse an additional lifecycle method; the monitor/manager integration tests guard the intended ordering.

**Deferred minors:** none raised by the repair reviewer. Earlier documented product limitations and polish are not claimed resolved.

## Handoff

No runtime download, live-agent/native-assertion workload, normal-trial relink/restart, broader mise/Docker setup, merge or publication was performed. Agentlog owns the separately coordinated branch setup; Caffeinate remains on `feat/herdr-caffeination`. An eventual ordinary PR explicitly targets `dev`; release promotion to `main` remains separately approved work.

Next steps requiring separate coordination are minimum-runtime execution and finite real-agent/native/physical acceptance. Do not infer permission to run those, deploy, merge or publish from completion of these repairs.
