# Remaining work

This is the shared backlog, not an execution plan. Checked-in implementation is not
proof of live acceptance. Package-specific Agentlog ideas stay in its
[follow-up list](../../herdr/agentlog/FOLLOW-UPS.md); compatibility and approval rules
remain in [maintenance policy](MAINTENANCE.md).

## Required before Pi-lence 0.2.0

Complete repository cleanup before the product release, in this order:

- [ ] **Shared checks and reporting.** Consolidate overlapping pnpm/hk/mise orchestration:
      mise owns versions/environment/setup/entrypoints, pnpm package commands/dependencies,
      hk shared check orchestration. Reuse definitions for staged versus full checks without
      recursive calls or losing dependency-closure checks and CI-only gates. Retain infrastructure
      validation (including existing `hk validate`). Choose consistent, concise human test output;
      keep TAP where a real machine consumer needs it.
- [ ] **Directory-entry setup.** Add trusted, repeatable mise enter setup without needless
      reinstalls or weakened locked/frozen policy. Decide with the owner whether it installs
      repository hooks or keeps them opt-in. Never register hosts or edit shell configuration.
- [ ] **Release-preparation refactor.** Move source-readiness policy from both workflow
      jobs into existing `scripts/prepare-pi-release-pr.mjs`, not a new caller-managed preflight
      or generalized Git abstraction. Actions still owns each fresh exact-commit checkout;
      install tools/dependencies before invoking preparation (later rejection is accepted).
      After workflow/checkout validation, establish local Changesets `dev` at the selected
      SHA and require fetched main ancestry before candidate generation or GitHub requests.
      Apply to preview/open, not read-only post-check verification. Refuse existing local dev;
      do not fetch moving branches, switch/reset, overwrite refs, roll back or add recovery.
      Keep the low-level generator unchanged and establish the ref before its ref snapshot.
      Preserve two fresh jobs, independent generation/digest comparison, permissions and draft PRs;
      staging/publication are untouched. Test the orchestration interface with real disposable Git
      repos and fixture GitHub responses: missing local dev, advancing remote dev, missing main
      ancestry, existing local dev, wrong checkout; rejected inputs must never reach remote writes.
      Retain byte/post-check verification and workflow safety tests; replace YAML-extracted
      behavioral tests. Update [release protocol](RELEASE-PROTOCOL.md) after the refactor.
- [ ] **Post-publication tags and GitHub Releases.** Choose package-qualified tag names
      and a finalization trigger after confirmed npm publication, not staging. Bind source
      revision to the published artifact; derive package-specific notes from its changelog
      with source/PR links. Rehearse retry/partial-failure recovery: no duplicate releases,
      silently moved tags or premature publication claims. Preserve human approvals and document
      npm-success/GitHub-failure recovery. Decide separately whether to backfill 0.1.0 after
      verifying source/artifact identity; backfill is not approved. Verify the mechanism before
      0.2.0, then exercise it during the separately approved release.
- [ ] **Codemode quieting.** Quiet calls/results without changing execution, stored history,
      model context or Raw inspection. Define and test actionable failure/interaction visibility.
- [ ] **Thinking-summary investigation.** Identify the actual category behind grey italic
      summaries; styling/examples alone are not classification. Separate thinking blocks from
      assistant progress prose and decide interaction with Pi's Ctrl+T setting. Preserve questions,
      decisions, warnings, permissions and final responses; keep hidden detail retrievable.
      Verified support or an explicit owner-reviewed safe-support limitation is required.
- [ ] **Release and verify 0.2.0 — separate approval.** Review version/changelog, source,
      artifact identity, evidence and limitations; publish only through the approved process.
      Verify public install, tag, GitHub Release and changelog links. Scope/demo/PR acceptance
      is not publication or main-promotion approval.

**Optional, independently deferrable:** evaluate a restrained activity animation
(water mill/waterfall are suggestions, not requirements). Check host API/lifecycle
feasibility, preserve working/staleness/error/completion/cancellation signals, and
judge the visual result separately. It is not a release gate.

## Herdr release readiness

These follow-ups remain real but are not prerequisites for Pi-lence 0.2.0 or for
including Herdr source on main. Do not implement them as incidental repository cleanup.

- [ ] **Production payloads and installers.** Auto-caffeinator already builds an allowlisted,
      licensed local payload. Agentlog's payload exists only in `test/helpers/runtime.ts` and
      currently omits the canonical LICENSE: make a production builder, reuse it in tests, and
      fail closed on missing licenses/unreviewed bundled code. Preserve complete third-party notices.
      Add version-specific GitHub archives and small inspectable manifest download/checksum/extraction
      commands, with checksums anchored in versioned repository metadata. Reject unsafe archive paths,
      unsupported/missing prerequisites and mismatches; never fetch mutable `latest`. Keep source/manifest
      intact and execute a separate runtime directory; local builds must produce that same layout.
- [ ] **Version/install lifecycle.** Coordinate independent Changesets versions, changelogs,
      manifest/artifact versions and namespaced tags/assets; Herdr packages stay private to npm.
      Keep hash metadata outside its payload. Publish and verify artifacts before advancing public
      install pointers on main; failure must preserve the previous release. Test clean public install,
      reinstall/update (including running processes), partial failure and removal without developer
      tools, transcript loss or unrelated configuration changes. Do not overwrite published bytes.
- [ ] **Auto-caffeinator active exit acceptance.** Agree finite isolated workloads and permission,
      then cover Pi and Claude independently: close/exit while a native assertion is active; verify its
      PID/owner/deadline/cup cleanup while a second active agent's assertion/deadline remains unchanged.
      Deterministic active-disappearance coverage exists; the live agent-exit flag is still a refusal,
      not an implemented acceptance scenario. See [validation](../../herdr/auto-caffeinator/docs/validation.md).
- [ ] **Runtime and physical evidence.** Execute Herdr payloads on claimed minimum runtimes
      (auto-caffeinator Node 24.11.0, Agentlog 24.15+) and other claimed supported lines, then add
      appropriate CI coverage. Version-string checks do not prove this. Track real Claude/Pi lifecycle,
      detach, cancel/permission/short-work cases and physical battery/display/sleep-resume limits
      separately; no overnight soak is imposed as a new gate on the accepted owner trial.
- [ ] **Agentlog owner trial.** With separate installation consent, exercise disposable-session
      discovery, pin/label/archive persistence, resume/focus and failure recovery while preserving cwd,
      transcripts, existing panes and drafts. Scripted isolated Herdr acceptance is not human acceptance.
- [ ] **Release review and discovery.** Fresh independent lifecycle/safety and packaging/install
      review before publication, resolve findings and disclose acceptance limits. Verify both Herdr
      marketplace entries after ready-to-install manifests exist; add `herdr-plugin` topic only then.
      Publicize only after owner acceptance of actual installation and concise usage docs.

## Other maintenance and verification

- [ ] **Non-blocking changeset reminders.** Visible PR guidance using the actual base (normally
      dev), accounting for release PRs. No CI failure or empty note for no-release changes. Review
      permissions before enabling an App/action; never run untrusted PR code with write/OIDC credentials
      or silently change branch protection. Monitor Changesets' staging support during tool reviews;
      adopt supported integration only if approval and exact-artifact guarantees are preserved.
- [ ] **Dependency and security review.** Reassess the exact `undici-types@6.21.0` trust exception
      independently of age exclusions. Evaluate actionlint and dependency/vulnerability, suspicious
      install-script/package, secret and artifact scanners (Trivy/Socket are candidates, not selected
      controls). Define actionable CI/release gates, reviewed exceptions and ongoing rescanning;
      pnpm cooldown/trust and zizmor do not replace this or human review.
- [ ] **Pi host harness.** Register TUI fixture cleanup before allocations/setup can fail, and
      add a failure-after-private-allocation cleanup regression (the existing invalid-runtime case
      fails before allocation). Investigate the historically intermittent advisory Linux Node 22
      reload/search interaction; an unchanged successful rerun did not establish its cause or fix.
- [ ] **Auto-caffeinator cleanup.** Preserve useful production coverage before retiring the
      test-only pi-tui spike/probe and obsolete experimental build surface. Avoid removing a needed
      acceptance test merely to reduce files.
- [ ] **Pi discovery.** Verify gallery indexing of the existing `pi-package` npm keyword;
      metadata alone does not prove discovery. Preview media is optional.

## Exploratory — not approved feature work

- **Standalone Herdr distribution:** compare current prebuilt JS + user-installed Node with
  Rust/native and Node SEA/tsdown `exe`. Recheck current tool/runtime requirements and stability;
  no runtime installation or migration is authorized by research. SEA embeds Node; it is not
  native compilation. Agentlog's no-bundled-JavaScript-runtime decision still applies; adopting
  SEA would require an explicit change of direction. Compare size/startup/memory/security updates,
  macOS arm64/x64, signing/notarization, licenses, assets/dynamic imports and detached self-launch.
  Existing production bundles are minified; no separate bundling/minification optimization or
  unbundled rewrite is planned.
- **Pi presentation:** clearer, restrained assistant/user boundaries; feedback on recovered
  versus unresolved tool errors before changing visibility. Current errors remain visible and
  details must remain retrievable; no decision to hide errors or new trial waiting period.
- **Auto-caffeinator polish:** initial discovery can stale a fast popup command (refresh/retry
  remains safe); measure polling overhead with many agents before optimizing.
- **Optional artifact changelog:** Pi's current ten-file npm payload excludes CHANGELOG; shipping
  it is a separate decision, not required merely because the repository has release notes.
- **Documentation-consolidation skill:** possible later experiment, not a release dependency
  or justification for a permanent agent-plan hierarchy.
