# Repository Release Implementation Plan

> **For agentic workers:** Use `executing-plans` for the owner's chosen inline execution. Execute approved tasks individually with their verification gates; do not implement later release phases from outline bullets alone. Foundation tasks F0–F5 are complete; the approved current tasks are P1–P4 below.

**Goal:** Prepare independently publishable projects without disturbing working trials; the current wave verifies Pi-lence's packed payload and real-host behavior.

**Architecture:** Root configuration owns developer policy and task coordination. Packages retain their runtime contracts, builds, and tests; Pi consumes host-provided libraries while the Herdr plugins retain standalone dependencies.

**Tech Stack:** mise, pnpm, TypeScript, Oxlint/Oxfmt, Node's test runner, hk, GitHub Actions, zizmor, taplo. Pi-lence remains host-loaded TypeScript, not a compiled/bundled application. Changesets and publication workflows follow this readiness wave.

**Spec:** The approved release scope and sequence in this document, preceding the foundation tasks.

**Status:** the owner merged foundation PR #1 into `dev` on 2026-10-17 at `789db7ef39489e930751a36c3e85354ffbbdddec` and requested the next step. Hosted CI passed at PR head `a9fcc49`. The primary checkout is now on `feat/pi-lence-release-candidate`, based on that merge; its tree matched the reviewed foundation head and the branch switch preserved the complete local patch/status. The seven exact Pi SDK age exceptions and separate Undici trust exception remain the only approved exceptions. The owner approved P1–P4 for inline implementation. Before later release tooling is enabled or used, provide a hands-on tour of Changesets, npm trusted publishing and the chosen release workflow, with a no-publication rehearsal and space for the owner's preferences. This is the single working plan; `.superpowers/sdd/plan/progress.md` holds execution evidence. Publication, `main` promotion, real hooks and normal-host changes remain separately gated.

**Standing handoff requirement:** for this and future work, provide a concrete manual demo: commands to run, expected results and things to notice, plus cleanup/reversal where applicable. Record this convention in the repository protocol.

## Outcome

All three projects are published, installable through their hosts' normal public commands, and represented on a clean, release-aligned `main`. Each has a changelog and a short, human-readable README. Development and subsequent releases follow consistent, documented conventions.

This is one repo-wide effort. **The old Caffeinate-first strategy is superseded.** Publish packages sequentially, but establish the shared foundation and address every project. Publish before broad publicity so real public installations can be tested.

## Global constraints and agreed scope

| Project directory         | Public identity           | Distribution                                    |
| ------------------------- | ------------------------- | ----------------------------------------------- |
| `pi/pi-lence/`            | `@grepco/pi-lence`        | Public npm package                              |
| `herdr/auto-caffeinator/` | `grepco.auto-caffeinator` | Herdr GitHub install + prebuilt release payload |
| `herdr/agentlog/`         | `grepco.agentlog`         | Herdr GitHub install + prebuilt release payload |

- Freely improve names, layout, interfaces, and internals. No compatibility shims for unpublished trials. Do not silently delete trial data or alter live installations.
- Focus on existing capabilities. Native rewrites, new agent integrations, and new product features are separate work. Fix justified design problems, not merely cosmetic architecture differences.
- Pi-lence works independently of Herdr, in regular and fullscreen Pi. Noninteractive loading must be harmless. Select and test explicit released host versions; do not infer compatibility from wildcard peers.
- Herdr plugins retain an external Node prerequisite. Agentlog's release-candidate `node:sqlite` dependency is accepted and must be explained honestly. Exact supported versions/platforms follow verified capabilities, not aspirational ranges.
- **Every publication requires explicit human approval.** A merge, passing CI, or a Changeset is not approval.

## Existing human acceptance

The owner reports using **pi-lence and auto-caffeinator for the past week**, with both working well enough to ship for further testing. Their initial usability trial is accepted; do not require another trial period or exhaustive soak testing before publication. Agentlog's initial owner acceptance is not yet established.

This is evidence from real use, not proof of every safety case or of future renamed/repackaged builds. Keep targeted regression, safety, and public-install checks; document residual limitations and continue broader testing after release.

## Repository conventions

### Development

Keep project code, tests, manifests, and READMEs together. Centralize shared developer policy, not unrelated application logic:

- **mise:** pinned developer tools and tasks wrapping package-owned scripts.
- **pnpm:** one root workspace/lockfile; consistent engine checks, exact dependencies, seven-day cooldown, strict publication-date checks, blocked exotic subdependencies, no trust downgrades, and explicit dependency-build approval. No silent exceptions during migration.
- **TypeScript + Oxlint/Oxfmt:** shared defaults, independent compiler checks, intentional package overrides. Separate core runtime compatibility from development/test types. Keep generated checking metadata in disposable locations under `node_modules`.
- **hk + CI:** reuse check implementations; changed-file formatting/linting where valid, affected-project checks where necessary, and a full-repo verification path. Hooks are convenience, not the release gate.
- **Changesets:** independent package versions/changelogs and release intent. Release-affecting changes need entries; intentional non-release changes receive explicit review.
- **Infrastructure checks:** zizmor for workflows, taplo for TOML; evaluate actionlint and dependency/secret/artifact security scanning without silently treating unevaluated tools as safeguards.
- **Cooldown exceptions:** reviewed exact-version exceptions can accommodate urgent fixes; keep trust/build-script controls intact. pnpm 11.26 supports `minimumReleaseAgeExcludePrune` for entries absent from the lockfile, not age expiry. Proposed follow-up: enable native pruning and add a read-only stale-age CI check, with reasons recorded beside exceptions. The seven exact Pi 1.3.0 exceptions below were explicitly approved on 2026-10-17; no broader exceptions are authorized.

Developer Node/pnpm requirements must not leak into consumer installation. Retain error-only developer runtime checks, no automatic Node downloads. Test actual built code on the claimed consumer runtimes; compiler targets and version-string tests are insufficient.

### Distribution

**Pi:** publish TypeScript with an explicit extension manifest and payload allowlist; no unnecessary build step. Pi-provided libraries remain wildcard peers, never bundled runtime dependencies. Pin SDK versions separately for development/typechecking. Include the canonical root LICENSE in the npm archive.

**Herdr:** the standard command fetches the repository and selects the plugin directory. Its manifest build command runs a small installer that downloads a version-specific artifact, checks a repository-recorded checksum, and extracts compiled code plus required dependencies into a dedicated runtime directory. Source stays in the checkout but is not executed. The manifest is unchanged; its commands launch the prepared runtime. Local builds produce the same layout before linking.

Keep release metadata outside the payload it hashes. Include the root LICENSE and required third-party notices in every distribution. Prefer readable output, carrying forward `TODO.md`'s intent; the existing minified bundles are not a requirement to preserve. Exact module/dependency packaging is an implementation choice, subject to clean-runtime and licensing checks.

Herdr 0.9.3 updates by reinstalling. Verify replacement, running-process behavior, failure, and removal rather than assuming every operation is transactional. Config/state remain separate from managed code. Installers never install runtimes or edit shell profiles, integrations, keybindings, or unrelated host configuration.

### Documentation

- **Root README:** purpose, project table, terse development prerequisites/setup.
- **Project README:** problem solved; host prerequisites; exact install/update/remove commands; core usage and features with use-when guidance. Include actionable prerequisite failures and remedies a human or agent can follow. Link out only when needed.
- **Repository protocol:** try a concise `DEVELOPMENT.md` covering how tools, checks, projects, and releases fit together. Not generic contributor boilerplate. Review whether it earns its place.
- Collaboratively draft/review READMEs; the owner retains final wording. Put durable maintenance knowledge in canonical docs, not accumulated plans and review transcripts.
- Temporary planning/review artifacts may exist on work branches. A targeted CI check prevents their promotion to release-ready `main`; do not prohibit WIP commits or all design documentation.
- This plan and `thinking/pi-publishing-audit.md` are temporary too. Distill useful conventions, then remove them before final promotion. A reusable `/docs-consolidate` skill is a later experiment, not a release dependency.

## What the inspection changes

This was a structural/documentation audit, not a complete independent correctness review. Herdr suites were not rerun during planning.

| Finding                                                                                                                                                                     | Consequence                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Implementations are on `dev`; the current `main` checkout has uncommitted planning work. Moved worktree metadata still references `~/proj/pi-ext`.                          | Preserve the dirty checkout; repair/inventory worktrees and use an isolated branch from `dev` for implementation.                      |
| Pi-lence's eight state tests and installed-host smoke check pass, but a strict check against Pi 1.3.0 reports obsolete event registrations and missing public type exports. | Establish real typechecking and host-lifecycle acceptance early. A manually emitted obsolete event is not host compatibility evidence. |
| Pi-lence's npm dry run includes tests and omits LICENSE.                                                                                                                    | Treat distribution contents as a tested contract, not whatever packing happens to include.                                             |
| Both Herdr projects duplicate tooling, but tests assert local config/lockfile layout; auto-caffeinator's license validator assumes a package-local dependency store.        | Migrate effective policy, tests, and license provenance together. Do not just move YAML files.                                         |
| Auto-caffeinator has a runtime packaging script; agentlog prepares its clean payload in a test helper.                                                                      | Make production packaging canonical; tests consume it rather than implement a second release recipe.                                   |
| Auto-caffeinator's spike has separate build/PTY tests and a legacy entrypoint.                                                                                              | Retain useful production coverage before deleting experiments, compatibility glue, and their configs.                                  |
| The plugins already have distinct application modules and different Herdr adapters.                                                                                         | Improve specific interfaces where justified; do not extract a shared runtime framework solely to eliminate similar-looking code.       |

Evidence and official host-documentation links are in `thinking/pi-publishing-audit.md` until distilled.

## Approved sequence

The phases below establish order, not a file-by-file execution plan. Begin agentlog's hands-on trial early and continue using the other two; do not wait for the entire toolchain or publishing pipeline.

### 0. Establish a safe baseline

- Preserve uncommitted work, repair stale worktree references without pruning live files, and identify any currently linked plugin paths.
- Start implementation from `dev` in isolation; reconcile `TODO.md` with these decisions instead of maintaining contradictory roadmaps.
- Record reproducible checks and known acceptance gaps for all three projects. Separate offline checks from live-host/native-power tests.
- Preserve the working pi-lence/auto-caffeinator trials. Prepare a stable, isolated agentlog trial and short checklist; use targeted follow-up checks for the other two. Keep trial builds stable while infrastructure changes elsewhere; normal-host installation still requires permission.
- Check npm `@grepco` publication access and GitHub release/approval capabilities early. Report any human-only setup without exposing credentials.

**Exit:** known source baseline, preserved working trials, reproducible checks, and agentlog ready for hands-on acceptance.

### 1. Establish identity and the shared foundation

- Rename the Herdr directories/IDs and set the scoped Pi package identity; update references atomically without retaining obsolete aliases.
- Add root mise/pnpm configuration, then move shared quality settings and add missing Pi-lence checks. Fix the public-API/type mismatches those checks expose rather than suppressing them; broader lifecycle acceptance follows in track A. Preserve effective security policy in each package.
- Adapt path-sensitive tests and license inventory to the workspace's dependency layout. Keep valuable negative compiler/linter/security canaries; stop asserting obsolete local-file placement.
- Separate core/runtime and tooling compatibility checks; select actual supported host/runtime versions from the audited requirements.
- Add the shared task surface, hk, and baseline CI. Validate workflow/TOML configuration as it is introduced.

**Exit:** one documented setup and full-repo check path; all projects participate with intentional exceptions rather than accidental drift.

### 2. Run three coordinated tracks

These tracks overlap after their prerequisites exist. Keep changes small enough to review; shared root configuration needs one coordinated owner.

**A — Product readiness and focused cleanup**

- Fix Pi-lence's public API/type drift and replace fabricated lifecycle coverage with real host transitions. Cover regular/fullscreen behavior, keyboard access, reload/new/resume/fork, and harmless noninteractive loading.
- Target auto-caffeinator's specific safety gaps: Pi and Claude exits during active protection, isolation from another agent's lease, power transitions, and shutdown/disable behavior. Credit the existing week of use; broader sustained-use testing continues after release rather than becoming another waiting period.
- Exercise agentlog discovery, durable organization, resumption/focus, failure/recovery, and preservation of transcripts and user state.
- Incorporate early human feedback before final polish. Remove obsolete experiments after preserving useful coverage; make justified interface improvements without widening product scope.

**B — Packaging and release plumbing**

- Define production payload builders and artifact checks for all projects. Reuse genuinely common packaging/verification machinery without forcing identical host formats.
- Add Pi tarball checks and clean loading. Add Herdr download/checksum/extraction installers and clean-runtime tests. Fail closed on missing licenses, unknown bundled dependencies, unsupported prerequisites, unsafe archive paths, or checksum mismatch.
- Wire independent Changesets versions/changelogs, including Herdr packages that remain private to npm; keep package/manifest/artifact versions synchronized. Use namespaced release tags/assets and a reviewable candidate identifying source revision, versions, and artifact digests.
- Rehearse local/staged installation, reinstall/update, removal, and failure without developer dependencies or changes to the normal user environment.
- Establish actionable dependency/secret/artifact security checks and reviewed exceptions; audit the release workflow before enabling publication.

**C — Human-readable documentation**

- Inventory docs as keep/distill/remove; extract real design constraints, maintenance instructions, and outstanding work before deleting historical artifacts.
- Review the root README and each project README together. Draft early; finalize commands and version claims against actual artifact behavior.
- Try the repository protocol document, including how to add a project to checks/versioning/releases. No scaffold generator required.
- Add the release-tree documentation guard. Avoid duplicating commands, compatibility tables, and policy across many files.

**Exit:** all projects have coherent code/docs, tested payloads, and a rehearsed release process. Human trial findings are resolved or explicitly accepted as documented limitations.

### 3. Review and approve release candidates

- Run the full verification path, actual supported-runtime tests, artifact/license checks, and the applicable isolated host suites.
- Obtain fresh-context independent code review of lifecycle/safety and packaging/install behavior. This planning audit is not that gate. Resolve findings and re-review material repairs.
- Present exact package versions, changelogs, source revision, artifact identity, supported environments, and remaining limitations for human approval.
- Do not publish if a critical acceptance gap remains. Do not turn every speculative future enhancement into a release blocker.

**Exit:** an explicitly approved, identifiable candidate. Changes after approval require renewed review/approval as appropriate; do not publish a moving branch tip.

### 4. Publish sequentially, verify, then promote

Start with **pi-lence**, then publish whichever Herdr plugin clears its release checks first. Auto-caffeinator already has positive owner trial evidence and need not wait for agentlog's initial trial. All three remain in scope; this does not change the shared-foundation-first approach.

- Human approval authorizes each publication, or an explicit named batch. Publish the approved artifacts, not an unreviewed rebuild.
- Verify npm installs and version/ref-specific Herdr installs from clean consumer environments. Then perform the owner's hands-on public-install acceptance.
- Publish and verify Herdr assets before advertising their checksums/install metadata on `main`. A failed publication must not advance public install pointers or remove the previous working release. Retry/recovery must not overwrite an already published version with different bytes.
- Keep `dev` as integration and `main` as public/default. Promotion reviews **all changes in the merge**; independent package versions do not selectively filter Git history. For this first repo-wide rollout, hold promotion until every included project is ready. Unfinished future work stays on feature branches.
- Finish the doc consolidation, promote reviewed release-ready contents, and verify the final default installation commands. Remove temporary planning artifacts through that consolidation, not by discarding unrecorded decisions.

**Exit:** published packages, correct changelogs, release-aligned `main`, and the owner using public installations rather than checkout links.

### 5. Make discovery intentional

- Verify Pi gallery discovery through the public npm package's `pi-package` keyword. Optional preview media can follow; indexing timing is not guaranteed by the package docs.
- Add the GitHub `herdr-plugin` topic once `main` has ready-to-install manifests; verify both plugins appear in Herdr's marketplace.
- Publicize only after the owner is comfortable with the README presentation and real installation experience.

## Acceptance checklist

- [ ] All three projects use the agreed names, shared developer policy, and repeatable verification.
- [ ] Host prerequisites and supported versions are accurate, tested, and actionable.
- [ ] Clean public install, update/reinstall, failure, and removal paths are verified; user data and unrelated configuration remain safe.
- [ ] Every distribution includes the canonical license and required dependency notices, without development debris.
- [ ] Human trials and independent review are complete; known limitations are explicit.
- [ ] Versions/changelogs and every publication were human-approved; public metadata identifies verified artifacts.
- [ ] `main` is release-ready, concise, and free of superseded planning/review artifacts.
- [ ] All three public installations work for the owner; discovery is verified before broader sharing.

## Implementation choices left to the builder

Choose exact script names, shared config layout, artifact filenames, safe extraction implementation, readable bundle/module layout, CI job structure, and npm/GitHub approval mechanics after checking current tool support. Respect the contracts above; surface any change in scope, supported behavior, security policy, or approval guarantees rather than silently deciding it.

Foundation tasks F0–F5 cover phases 0–1. Approved Pi-lence tasks P1–P4 cover its payload and real-host readiness within phase 2. Product redesign, Herdr installers, Changesets/release workflows, marketplace registration, and final repository documentation consolidation remain later work. No additional trial-period gate is introduced for pi-lence or auto-caffeinator.

## Approved Pi-lence readiness wave

**Scope:** satisfy the Pi-lence portion of phase 2's existing product/payload requirements before designing the publishing workflow. No new user features, host integration, compiler/bundler, publication, npm login, normal installation or additional soak period. Version `0.1.0` remains provisional; producing a test tarball is not choosing or approving its first public version.

**Builder choices for review:** stage a minimal consumer package before `npm pack`; exercise that tarball through the actual pinned Pi CLI in disposable homes; use deterministic test-only model responses instead of paid/live-provider traffic; run host tests at Node `22.19.0` and `24.16.0`. Keep fast state/SDK tests, but report them separately from real-host evidence. These are implementation choices, not new owner requirements.

### Readiness constraints and verified inputs

- Work in the primary checkout on `feat/pi-lence-release-candidate`, based on merged `dev` `789db7e`. Preserve `.gitignore`, the user-deleted `GLOSSARY.md`, untracked `CODE_REVIEW.md`, trial contents and all normal registrations; never stage indiscriminately.
- Host target: released **Pi 1.3.0**. Runtime floor: **Node `>=22.19.0`**; developer Node remains **24.16.0**. Runtime peers remain `"*"`, host-provided and unbundled; this is not a promise of compatibility with every Pi version.
- The installed/repo-pinned Pi docs distinguish invocation-only `-e` loading from persistent `pi install`. All persistent installation tests must run with disposable HOME, `PI_CODING_AGENT_DIR`, cwd, npm config/cache and settings. Resolve the CLI from the workspace SDK package's declared `bin`, never `~/.pi/agent/bin/pi`.
- Pi 1.3's package manager parses `npm:<name>@<spec>` and invokes npm with `--legacy-peer-deps`. Verify `npm:@grepco/pi-lence@file:<absolute-tarball>` end to end; source inspection alone is not acceptance. If unsupported, report the gap rather than calling unpacked-directory loading a normal npm install.
- Canonical license is root `LICENSE` (MIT). Payload: `package.json`, `README.md`, canonical `LICENSE`, and the seven existing `src/*.ts` files. No tests, planning files, configs, caches, dependencies, scripts or symlinks. New production files must deliberately update the inventory.
- The staged manifest copies consumer metadata (`name`, `version`, `description`, `keywords`, `license`, `repository`, `type`, `engines`, `peerDependencies`, `pi`) and a restrictive `files` allowlist. Preserve runtime engines verbatim; omit developer scripts, `devDependencies`, `devEngines` and package-manager policy rather than changing the consumer floor through a publishing override.
- Reuse existing dependency resolutions where tests need them: `@earendil-works/pi-ai@1.3.0` for a public test-provider stream and existing `@xterm/headless@5.5.0` for screen assertions. Add only direct development references if needed; no upgrades, native-build approvals, new age/trust exceptions or runtime dependencies. Re-run frozen-policy checks after lockfile edits.
- Test subprocesses receive an allowlisted environment, no copied auth or provider credentials, and disabled unrelated resources/telemetry/updates. Pi's `--offline` is not a network sandbox: the fixture provider itself must perform no network I/O. No natural-language input may accidentally select a real provider.
- Real-host suites target macOS ARM64 and Linux x64. A failure or unavailable required tool is a failing gate, not a successful skip. Do not claim Windows/Intel macOS acceptance from these results.
- Node release metadata confirms `22.19.0` (2025-08-28) and `24.16.0` (2026-05-21). For CI runtime selection, reviewed age-eligible `actions/setup-node` v7.1.0 (2026-10-08) resolves to `949feb2413d6458794dcd2491c4babbbce0c15c1`; inspect its action inputs/source before adding it. It must not provision consumer machines or alter developer pins.
- Seven Pi age exceptions expire October 22, the last at 19:14:02.843 UTC. If they expire during this wave, remove the aged-out age selectors and update their tests as a separately explained policy maintenance change; do not extend them. The Undici trust exception is separate.

### Readiness file map and interfaces

| Files                                                                   | Responsibility                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pi/pi-lence/scripts/pack.mjs`, `test/packaging.test.ts`                | Canonical staged tarball producer and exact payload/license/reproducibility tests                    |
| `pi/pi-lence/test/helpers/host-sandbox.mjs`, `test/host-modes.test.mjs` | Disposable install/update/removal and real print/JSON/RPC subprocesses                               |
| `pi/pi-lence/test/fixtures/host-driver.ts`                              | Test-only deterministic provider and public extension commands; never shipped                        |
| `pi/pi-lence/test/helpers/terminal.mjs`, `test/host-tui.test.mjs`       | PTY lifecycle, terminal snapshots/input, actual regular/fullscreen acceptance                        |
| `pi/pi-lence/test/run-host.mjs`                                         | Bounded host-test entry point; chooses requested host Node without changing the test-runner runtime  |
| `pi/pi-lence/package.json`, `tsconfig.tools.json`, root lockfile        | Script surface, checking all new tools/fixtures, exact test-only dependencies                        |
| `.github/workflows/ci.yml`, `pi/pi-lence/README.md`, `DEVELOPMENT.md`   | Required runtime/OS gates, truthful consumer instructions, one reproducible disposable demo          |
| `pi/pi-lence/src/*` and existing tests                                  | Change only for reproduced acceptance defects; retain existing behavior and fast regression coverage |

Interfaces shared by the tasks (JSDoc-checked `.mjs`; no framework extraction):

```ts
declare function packCandidate(
  packageRoot: string,
  outputDir: string,
): Promise<{ tarballPath: string; sha256: string }>;
declare function createHostSandbox(
  tarballPath: string,
  options?: { nodePath?: string },
): Promise<HostSandbox>;
// HostSandbox has readonly string paths: root, home, agentDir, cwd, nodePath, cliPath.
// run(args: string[], input?: string): Promise<{ code: number; stdout: string; stderr: string }> runs Pi.
// spawn(command: string, args: string[], limits?: {timeoutMs?: number}): ChildProcessWithoutNullStreams uses the same private environment.
// sessionArgs: string[] selects the fixture and disables unrelated resources; run() adds these automatically.
// dispose(): Promise<void> terminates/reaps every owned child and removes private state.
declare function startTui(
  sandbox: HostSandbox,
  options: { mode: "regular" | "fullscreen"; columns: number; rows: number },
): Promise<TuiDriver>;
// TuiDriver: send(input: string): void; screen(): Promise<string[]>;
// waitFor(text: string, timeoutMs?: number): Promise<void>; close(): Promise<void>.
```

`run-host.mjs` accepts `--modes`, `--tui` or neither (both), and optional `--node <absolute executable>`. Its own runner stays on developer Node; only the actual host/consumer install uses the requested Node. Validate the child version, put its directory first on the child's PATH, and report host, runtime and OS identities with results.

### Readiness review focus

1. **Checkout-dependent artifacts:** P1 rejects missing license/entry points, extra files and escaping symlinks; P2 packs a disposable source snapshot, removes that snapshot, then loads only the artifact. Never rename/hide the primary checkout's source to test isolation.
2. **False noninteractive success:** P2 requires completed model/tool work, valid JSON/RPC and orderly exit—not merely a process that fails early because credentials are missing.
3. **Stale state across real transitions:** P3 drives new/resume/fork/reload through Pi, checks branch-specific references/pins and verifies that input/rendering still work afterward.
4. **Terminal ownership and accessibility:** P3 covers keyboard-only regular mode, fullscreen input, narrow/Unicode rendering, dialogs and restoring the editor after dismissal/cancellation.
5. **Leaked environment/processes:** P2/P3 deliberately inject hostile inherited settings/credentials, force a test failure, and assert normal-state sentinels survive and owned children/temp directories are removed.

### Task 6 (P1): Produce and verify the consumer tarball

**Files:** create `scripts/pack.mjs` and `test/packaging.test.ts` inside Pi-lence; update its `package.json`/`tsconfig.tools.json`. Consume root `LICENSE`; produce `packCandidate` above and package command `pack:candidate -- <output-dir>`.

- [x] Write `packs only the consumer contract` and `identical inputs produce identical tarballs`: pack to temporary directories and assert the exact ten-file payload, `pi.extensions === ["./src/reference-ui.ts"]`, `engines.node === ">=22.19.0"`, both wildcard host peers, byte-equal canonical license, no install scripts/developer metadata/bundled dependencies, and SHA-256 of the actual tarball. Assert two identical source packs have equal digests, and input files remain unchanged.
- [x] Add negative fixtures: absent canonical license, missing entry module, unlisted source file, and source symlink outside the package must reject before producing a usable artifact. Paths containing spaces must succeed; an existing output artifact must not be silently overwritten.
- [x] Run `mise exec -- pnpm --filter @grepco/pi-lence exec node --test test/packaging.test.ts`; capture the specific RED failures before adding the producer.
- [x] Implement `packCandidate` with an explicit production inventory, temporary staging, consumer-manifest projection and `npm pack --ignore-scripts --json`. Do not build/import production modules or install anything while packing. Validate the produced archive inventory; remove staging on success/failure and return the actual tarball path/digest. Expose the CLI via a main guard, not import-time execution.
- [x] Include `scripts/**/*.mjs` and new tests in the existing tooling project/lint contract. Add the `pack:candidate` script without a publish hook. Run the focused tests, `mise exec -- pnpm --filter @grepco/pi-lence check`, and root quality/policy tests; expect all GREEN with no omitted script files. Commit only named task files: `build(pi-lence): produce a minimal verified consumer tarball`.

### Task 7 (P2): Install that artifact and prove noninteractive host behavior

**Files:** create `test/helpers/host-sandbox.mjs`, `test/fixtures/host-driver.ts`, `test/host-modes.test.mjs`, `test/run-host.mjs`; update package scripts/types and lockfile only as needed. Consume `packCandidate`; produce `HostSandbox` and the `test:host` command.

- [x] Write sandbox safety tests with fake outer HOME/settings/auth sentinels and hostile inherited `PI_*`, npm, Git and test-runner variables. Assert all child state remains beneath the sandbox; no outer credentials/resources appear; forced child failure cleans up. Strip inherited `NODE_TEST_CONTEXT` before launching another test runner, as established by F5.
- [x] Write `packed installation survives removal of its source snapshot`: pack a disposable copy of the producer inputs, remove that copy (not primary source), then verify the actual pinned Pi CLI installs `npm:@grepco/pi-lence@file:<tarball>`, discovers exactly the packaged extension, and loads with no package-local SDK/node_modules or producer-source fallback. Reinstall the same artifact; remove it using Pi's package command; assert only its package/settings entry changes and unrelated sandbox settings/session data survive. Do not use `--no-extensions` to bypass managed-package discovery: the empty sandbox excludes unrelated extensions while the explicit fixture is the only extra one. This proves local-artifact installation, not public registry access.
- [x] Write real-host cases for print, JSON and RPC with a deterministic test provider and finite fixture-only tool calls. Require print to contain only the expected final answer; parse every JSON/RPC line, check successful completion/tool results and no Pi-lence terminal escapes/UI requests. Pi-lence has Ctrl+Alt+R/P shortcuts, not slash commands; verify harmless noninteractive loading without inventing commands. Prove managed discovery with a sentinel failure in the disposable installed entry, then restore it. Contrast enabled versus absent Pi-lence where appropriate.
- [x] Run `mise exec -- pnpm --filter @grepco/pi-lence exec node --test test/host-modes.test.mjs`; capture meaningful RED assertions. Implement the sandbox, runner and test-only provider using public Pi 1.3 contracts, not manual calls to Pi-lence's event handlers or private interactive components. Read the complete RPC/JSON/provider references and matching checked examples before writing their protocol fixtures.
- [x] Every process gets a deadline and owned cleanup. Confirm a timed-out process is terminated and reaped; do not make `--offline` a claim that all networking is impossible. Keep fixture provider/commands outside the artifact. If a product defect appears, reproduce it in a focused failing regression before repairing source.
- [x] Run `mise exec -- pnpm --filter @grepco/pi-lence test:host -- --modes` and the package check; expect successful installation, execution, reinstall/removal, no leaked state, and no skips. Record exact versions and exit/output assertions. Commit: `test(pi-lence): verify packed installs and noninteractive Pi modes`.

### Task 8 (P3): Exercise real regular/fullscreen sessions

**Files:** create `test/helpers/terminal.mjs`, `test/host-tui.test.mjs`; extend the test fixture/runner from P2. Modify production modules only for reproduced defects. Consume `HostSandbox`; produce `startTui`/`TuiDriver` above.

- [x] Write PTY driver tests for bounded startup/exit, literal arguments containing spaces/metacharacters, input delivery, screen output and failure cleanup. Reuse the proven approach in `herdr/auto-caffeinator/test/helpers/pty.ts` without importing a Herdr test module or moving its existing spike coverage. Use the platform's `script`/`stty` facilities with explicit macOS/Linux argument handling; no new native addon/build permission. Assert missing required tools fail clearly.
- [x] Add direct test-only `@xterm/headless@5.5.0` if needed for terminal-buffer assertions; do not equate raw ANSI substring matches with the current screen. Run the driver tests RED, implement the driver, then establish GREEN before testing product behavior.
- [x] Write both-mode host cases with deterministic responses/tool history: compact quiet output; complete answer/tool detail in the Ctrl+Alt+R reference browser; named pin creation/navigation; keyboard-only tab/select/open/close; narrow output with wide/combining characters; fullscreen mouse input without removing keyboard access. Check restored editor input after browser dismissal and host dialogs. Render from the installed tarball, not the source extension.
- [x] Write host-driven startup/reload/new/resume/fork cases with distinct session/branch content. Assert new sessions clear stale visible state; resume restores the correct branch/pins; fork excludes abandoned-branch references; repeated reload does not duplicate widgets/handlers or revive closed views. Use host commands/public command-context transitions and persisted fixture sessions, not fabricated lifecycle events. Add a terminal resize case using bounded fixture-side `stty` to change the actual PTY dimensions.
- [x] Exercise an actual prolonged deterministic operation across the existing **60 seconds without updates** warning threshold, completion and cancellation; assert `Working · no updates for …` uses native warning behavior and subsequent idle restoration. Keep threshold arithmetic/timer cardinality in fast tests; do not fake the host clock and call that real elapsed-time evidence. Give slow cases explicit bounded deadlines instead of timing-dependent sleeps throughout the suite.
- [x] Run `mise exec -- pnpm --filter @grepco/pi-lence test:host -- --tui`; capture RED for each reproduced product defect, add its smallest fast regression and repair only that behavior. Expect GREEN in both regular/fullscreen modes, successful subsequent input and complete child/temp cleanup. Retain the existing SDK smoke as a distinct lower-level check. Commit driver/acceptance work and any justified repairs in reviewable increments.

### Task 9 (P4): Require runtime evidence and document the disposable demo

**Files:** update `.github/workflows/ci.yml`, Pi-lence `package.json`/`README.md`, `DEVELOPMENT.md`; add `test/host-contract.test.ts` for required scripts/matrix contracts. Consume `test:host`, its runtime selector and `pack:candidate`.

- [x] Add a failing contract test requiring package-owned `test:host` in the full Pi check path, checked new tooling files, and required CI coverage of Node `22.19.0`/`24.16.0` on macOS ARM64/Linux x64. Runtime tests must execute the actual host at each version, not merely typecheck against Node-22 declarations.
- [x] Extend read-only CI with an explicit OS/runtime matrix: frozen setup on developer Node first, then reviewed SHA-pinned setup-node for the host runtime. Capture its absolute Node path before `mise exec` restores developer tools; pass that path to `test:host -- --node <path>`. Disable action package-manager caching unless deliberately configured. Do not run pnpm under Node 22 or give jobs credentials/write permissions. Avoid redundant default-runtime host runs where full checks already cover them.
- [x] Wire complete `test:host` into `check:project`; all required host cases fail rather than skip. Keep isolated SDK smoke separately named. Run the focused contract test RED → GREEN, `mise run check`, `mise exec -- hk validate`, and the infrastructure validators. Frozen install must preserve the lockfile; inspect any new resolution/exception before proceeding.
- [x] Update the README with consumer Node floor, tested Pi/runtime/platform matrix, local candidate command clearly labeled prerelease, normal eventual `pi install npm:@grepco/pi-lence` command clearly not yet available, package limitations and no pnpm requirement for consumers. Do not claim public installation, all-host compatibility, or reviewed release security yet.
- [x] Put one disposable hands-on demo in `DEVELOPMENT.md`: create/print a temp root, pack there, create private HOME/agent/cwd/npm state, install using the pinned host CLI and exact tarball, open regular/fullscreen Pi with the test fixture, try references/pins/new/resume/fork/reload, exit and remove only that printed temp root. Show expected screens/state restoration and cleanup. Never use or relink the normal installation; do not require a new soak period.
- [ ] Obtain a fresh-context whole-branch review covering P1–P4 and the inherited deletion-selection repair, reproduce findings before fixing, and re-review material fixes. Run fresh verification after fixes; preserve existing edits/trials/registrations. Push/open a `dev` PR and obtain hosted results only when authorized. Commit named files: `ci(pi-lence): gate packed host behavior across supported runtimes`.

**Local execution checkpoint (2026-10-17):** P1–P3 and P4 implementation are committed through `0c4c1bb`. Fresh clean-HOME frozen setup/full checks passed: 273 tests plus SDK smoke; actual packed-host suites passed 12/12 on macOS ARM64 with both Node 22.19.0 and 24.16.0. Read-only fresh-context review covered this branch through `a011558` plus inherited hook repair; its Important RPC false-green finding was reproduced and repaired test-first in `0c4c1bb`, then all suites rerun. Two Minor test-harness follow-ups remain: earlier cleanup registration for failed TUI setup, and permanent coverage of cleanup after private allocation (manually verified). Linux jobs are configured but unexecuted. Task 9 remains open pending authorization to push/open a dev PR and capture hosted evidence. This is not publication readiness or permission.

### Readiness handoff and remaining release gates

- Present source revision, candidate tarball path/SHA-256, exact successful test matrix, independent review findings/limits, and runnable demo/cleanup commands. An unexecuted matrix cell or untested install route is a gap, not inferred success.
- The owner approved this plan for inline execution. Planning-only inspection was: `git diff -- plan.md` and `git status --short`; expected changes are this plan plus the preserved user-owned files. No demo processes, installations or dependencies were created during planning, so there is no host cleanup to perform.
- After readiness integrates, elaborate Changesets/version/changelog and human-approved release automation as the next bounded plan. The owner is new to Changesets and npm trusted publishing: explain the concepts and concrete configuration, walk through a safe rehearsal, distinguish versioning from publishing/approval, and invite preferences before enabling or using the release path. Still required before publication: npm `@grepco` access, dependency/source/secret review, immutable release candidate and explicit approval. Public registry install/update/removal can only be verified after an approved publication; local tarball tests do not substitute for it.
- Herdr acceptance/builders/installers and agentlog's human trial remain in the approved repo-wide scope, not silently dropped by the Pi-first ordering. `main` stays unpromoted until all content in its proposed merge is release-ready.

## Foundation review focus

1. **Moved or dirty checkouts:** preserve tracked, untracked, and ignored work and existing linked installations; never prune the old worktree merely because its metadata is stale. Task F0 checks this.
2. **Policy inheritance:** every package must get the same effective supply-chain settings from the root, even through a symlink or when run from a package directory. Task F2 checks this.
3. **Workspace symlinks:** a legitimate pnpm dependency may resolve into root `node_modules`; unrelated paths and forged license inventory must still be rejected. Task F2 checks this.
4. **False-green verification:** source must not inherit tooling-only types; tests must not fabricate obsolete host events; a hook must not skip a deleted file or root configuration change. Tasks F3–F5 check this.
5. **Developer/consumer leakage:** setup and tests must not relink plugins, start normal Herdr sessions, install consumer runtimes, or publish; CI must not depend on a developer's private Pi installation. Tasks F0, F4, and F5 check this.

## Foundation file map

| Files                                                                                          | Responsibility                                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `mise.toml`, root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`                      | Tool pins, workspace membership, dependency policy, shared commands           |
| `.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig.base.json`, `tsconfig.tools.json`                 | Shared quality policy and checking repository scripts                         |
| Each package's `package.json`, `tsconfig.json`, `tsconfig.core.json`, `tsconfig.tools.json`    | Runtime metadata, package scripts, separately checked source/tooling projects |
| `scripts/identities.test.mjs`, `scripts/workspace-policy.test.mjs`, `scripts/quality.test.mjs` | Repository-level identity, effective-policy, and negative quality canaries    |
| `scripts/check-projects.mjs`, `scripts/check-projects.test.mjs`, `hk.pkl`                      | Safe whole-project selection and hook coordination                            |
| `.github/workflows/ci.yml`, `taplo.toml`, `DEVELOPMENT.md`                                     | Read-only CI, infrastructure checks, concise repository protocol              |
| Existing package tests/build scripts and `.gitignore`                                          | Adapt assumptions; exclude generated output without discarding useful tests   |

New paths/config splits here are implementation recommendations, not user-imposed names. Keep this file as the single working plan.

## Historical foundation inputs and reviewed dependency approvals

- Foundation base was local `dev` at `5bfc63fad553a75eb0c1a2c05c81742b7c18a150`, with a dirty primary checkout. The current readiness-wave base is `789db7e`, recorded above; do not reset to the historical base.
- Existing tools: Node **24.16.0**, pnpm **11.26.0**, mise **2026.9.1**. Start with these rather than gratuitously upgrading them.
- Reuse existing JS tooling pins: TypeScript **7.0.2**, Oxlint **1.87.0**, oxlint-tsgolint **7.0.2003**, Oxfmt **0.72.0**, tsdown **0.23.0**. Preserve package-specific runtime dependencies.
- Selected additional tool pins: hk **2.5.0**, zizmor **1.30.1**, taplo **0.10.0**. The proposed hk 2.7.0/zizmor 1.31.1 releases were too young; selected releases are age-eligible (October 4, September 9, May 23 respectively). hk 2.5 supports structured argv and embedded Pkl evaluation; no Pkl CLI is needed. mise's release-age setting filters fuzzy selection, not exact pins, so publication dates were explicitly reviewed. Lockfiles cover macOS ARM64 and Linux x64; upstream hk/pnpm do not provide Intel macOS assets at these versions. Actionlint remains optional.
- GitHub repo is public, current credentials have admin permission, and no release environments are configured. These are observations, not permission to change settings. npm scope access still needs checking.
- **Approved Pi SDK target: 1.3.0**, matching the installed/current released host. Registry timestamps are 2026-10-15 19:13:30Z for coding-agent and 19:14:02Z for pi-tui. They become seven days old on **2026-10-22 after 19:14:03Z**; transitive dependencies need their own eligibility checks. Both declare Node `>=22.19.0`.
- **F4 approval gate satisfied:** the owner's “approve both, proceed” authorizes only the seven exact age selectors below and `undici-types@6.21.0`'s trust exception. Stop on additional policy failures; do not add broad scope exemptions, disable trust checks, authorize dependency scripts, or switch installers to evade policy.

**SDK audit, 2026-10-17 (subsequently approved):** a separate ignored, metadata-only pnpm resolution succeeded for the SDK graph: **118 resolved, zero downloaded/added**, with all other policy controls retained. It requires these seven exact release-age exclusions, solely to test against the installed 1.3.0 host before the cooldown expires—not as a CVE hotfix:

```yaml
minimumReleaseAgeExclude:
  - "@earendil-works/pi-coding-agent@1.3.0"
  - "@earendil-works/pi-tui@1.3.0"
  - "@earendil-works/pi-ai@1.3.0"
  - "@earendil-works/pi-agent-core@1.3.0"
  - "@earendil-works/pi-codemode@1.3.0"
  - "@earendil-works/pi-mcp@1.3.0"
  - "@earendil-works/pi-telemetry@1.3.0"
```

All seven age out by **2026-10-22 19:14:03 UTC**. The workspace now contains exactly those approved exclusions; F5 adds their read-only age-expiry audit.

**Separately approved trust exception:** the SDK's Node typing pin `@types/node@22.19.19` depends on `undici-types@6.21.0`, which fails `trustPolicy: no-downgrade`. npm records it as a declaration package from November 2024 with no provenance attestation, while earlier releases had provenance. The newest eligible Node 22 typings (`22.20.5`) request the same Undici range. Waiting for the Pi cooldown does not solve this trust issue. The owner separately approved exact `trustPolicyExclude: ['undici-types@6.21.0']`; it does not age out and still needs replacement/removal review. Do not silently use Node 24 source types or raise the consumer floor instead. No trust exception, package installation, or script execution occurred in the audit. Full sourced evidence and registry integrity are in `.superpowers/sdd/plan/sdk-proposal.md`; metadata inspection is not an independent tarball/source security audit.

Sources: [npm coding-agent metadata](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent), [Pi package contracts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [hk 2.7 setup](https://github.com/jdx/hk/blob/v2.7.0/docs/getting_started.md), [hk/mise integration](https://github.com/jdx/hk/blob/v2.7.0/docs/mise_integration.md), [mise tasks](https://mise.jdx.dev/tasks/toml-tasks.html).

### Task 0: F0 — Preserve the working setup and establish an isolated baseline

**Files:** Git worktree metadata through Git commands only; carry this `plan.md` and the reviewed local `TODO.md` into `.worktrees/release-foundation/`. No product changes in the original checkout.

**Consumes:** approved scope and the current `dev` revision. **Produces:** branch `chore/release-foundation`, a verified clean implementation location, and a short baseline-results entry in this plan.

- [x] Capture `git status --short --untracked-files=all`, `git diff --binary`, worktree refs, and `herdr plugin list --json` / `pi list`. Record which paths are live; do not dump credentials or conversation contents. Keep backups outside the repository.
- [x] Confirm the stale worktree failure, then run `git worktree repair .worktrees/caffeination`. Verify `git -C .worktrees/caffeination status --short` works and its contents/HEAD were not changed. Do not prune, reset, stash, or clean other work.
- [x] Create the implementation worktree with `git worktree add -b chore/release-foundation .worktrees/release-foundation dev`. Copy only the agreed planning inputs; reconcile the Caffeinate-first/GitHub-only statements in `TODO.md`, preserving deferred work. Do not sweep `.pi/`, reviews, or other untracked files into a commit.
- [x] In isolation, run both Herdr packages' existing frozen install/check commands. Pi has no lockfile yet: run `node --test pi/pi-lence/*.test.ts` and the existing smoke check against the known installed host without attempting a wildcard-peer dependency install. Record pass/fail/skip and exact commands, distinguishing existing failures from later regressions. No live-agent or native-power probes. Provide agentlog trial instructions; do not install it into the normal host.
- [x] Run read-only `npm whoami` / scope-access checks and inspect GitHub approval capabilities. Record missing human setup without creating tokens or changing permissions. Recompare the original checkout and live registrations with the captured baseline. Commit only the reconciled planning inputs on the new branch: `docs: record release foundation baseline`.

**Gate:** original work and trial registrations are unchanged; all baseline outcomes are explicit. A failure is evidence to diagnose, not a reason to weaken checks.

### Task 1: F1 — Establish final project identities

**Files:** move `herdr/caffeinate/` → `herdr/auto-caffeinator/` and `herdr/herder-agentlog/` → `herdr/agentlog/`; modify their manifests, package metadata, ID/path references in source/tests/scripts and active docs; modify `pi/pi-lence/package.json`; create `scripts/identities.test.mjs`.

**Consumes:** F0's isolated checkout. **Produces:** private workspace names `@grepco/auto-caffeinator` and `@grepco/agentlog`, public npm name `@grepco/pi-lence`, and the agreed Herdr IDs. Internal names are not an invitation to npm-publish the Herdr packages.

- [x] Write `scripts/identities.test.mjs` asserting the three package names, Herdr `private: true`, manifest IDs `grepco.auto-caffeinator` / `grepco.agentlog`, existing version agreement, and absence of the old directories. Use filesystem paths relative to the test module, not the caller's cwd.
- [x] Run `node --test scripts/identities.test.mjs`; expect failure on the old layout/identities.
- [x] Move directories and update live identity references, including popup-opening commands and tests. Keep domain terms such as “caffeination”; do not blindly rewrite prose or stored transcript metadata. Remove obsolete trial-entrypoint glue only with its replacement tests passing; never relink or migrate the user's installed copies.
- [x] Rerun the identity test and both Herdr package checks from their new paths; rerun Pi state tests. Verify there are no active references to old plugin IDs or directories outside deliberately retained historical docs slated for consolidation.
- [x] Review the focused rename diff and commit: `refactor: establish public project identities`.

### Task 2: F2 — One workspace, one effective dependency policy

**Files:** create root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, initial `mise.toml`, and `scripts/workspace-policy.test.mjs`; modify all package manifests, both Herdr `test/tooling.test.ts`, auto-caffeinator's `scripts/prepare-runtime.ts` and `test/packaging.test.ts`; remove superseded nested lockfiles/workspace files after verification.

**Consumes:** F1 names. **Produces:** root workspace `pi/*` + `herdr/*`; Node 24.16.0/pnpm 11.26.0 pins; error-only developer runtime requirements; unchanged consumer floors at this step; root-owned common JS development tools. Keep `tsdown` and runtime-specific dependencies with packages that use them.

- [x] Add policy tests that invoke `pnpm config get` from root and each project, including a symlinked checkout. Assert the following effective values, exact package-manager pin, one root lockfile, and no nested workspace/lockfiles:

```js
const policy = {
  engineStrict: "true",
  minimumReleaseAge: "10080",
  minimumReleaseAgeStrict: "true",
  minimumReleaseAgeIgnoreMissingTime: "false",
  blockExoticSubdeps: "true",
  trustPolicy: "no-downgrade",
  trustLockfile: "false",
  strictDepBuilds: "true",
  saveExact: "true",
  autoInstallPeers: "false",
}; // Assert allowBuilds contains only reviewed false entries (initially {}).
```

- [x] Run `node --test scripts/workspace-policy.test.mjs`; expect failure before root configuration exists. Add packaging regressions: valid workspace-store dependencies are accepted; an outside-store symlink or mismatched inventory name/version is rejected.
- [x] Create the root workspace and mise pins; move common dev dependencies without opportunistic version upgrades. Use `autoInstallPeers: false` so Pi wildcard peers do not silently resolve/install an unreviewed SDK; F4 supplies explicit development SDK dependencies. Keep developer runtime checks error-only. Generate and review the root lockfile under the full policy, then verify `pnpm install --frozen-lockfile` from a fresh temporary store. Stop on policy failures and report the exact dependency; do not bypass them.
- [x] Adapt `prepareRuntime(packageRoot, outputDir)` to validate dependency realpaths within the canonical workspace dependency store, retaining version/provenance/path-escape checks. Replace obsolete local-file assertions in both tooling tests with effective-policy checks; don't weaken negative canaries. Run the root policy tests and both Herdr checks again, with no live-host access required.
- [x] Remove superseded nested configs/locks only after the new tests pass; confirm a second frozen install makes no lockfile changes. Commit: `build: consolidate workspace and dependency policy`.

### Task 3: F3 — Shared quality configuration with isolated source checks

**Files:** create root `.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig.base.json`, `tsconfig.tools.json`, `scripts/quality.test.mjs`; create/adjust each Herdr package's `tsconfig.json`, `tsconfig.core.json`, `tsconfig.tools.json`; update package scripts and existing quality/tooling tests; adjust `.gitignore` for generated caches. Pi adopts these defaults in F4.

**Consumes:** F2 tools and effective policy. **Produces:** package scripts `format`, `format:check`, `lint`, `typecheck`, `test`, `check:project`, `check`; `check:project` runs lint/typecheck/tests, while `check` also checks formatting. Source and tooling compile separately; generated declarations/build metadata live under `node_modules/.cache/agent-dev/`.

- [x] Add negative-canary tests: a source assignment of string to number fails TypeScript; an unhandled promise fails type-aware lint; repaired fixtures pass. Inject a declaration visible only to the tooling project and assert core source cannot reference it. Assert normal typechecking emits no source-adjacent JS/declarations and that declared source/tests/build configs appear in the intended effective projects.
- [x] Run `node --test scripts/quality.test.mjs`; expect failures for missing shared config/source-tooling isolation.
- [x] Centralize the existing strict lint/format settings. Let local configs extend shared defaults where required by tool resolution. Preserve intentional resolution differences: auto-caffeinator currently uses Bundler, agentlog NodeNext. Source checks use the package's runtime Node type line; tooling uses the pinned developer line. Use referenced core declarations for tooling checks instead of silently recompiling source under tooling types. Generate those declarations before dependent lint/type checks.
- [x] Update existing canaries to inspect effective configuration and behavior rather than duplicate flags/files. Run the root quality tests, `pnpm --filter @grepco/auto-caffeinator check`, and `pnpm --filter @grepco/agentlog check`. Re-run after deleting only the implementation checkout's generated type cache; regeneration must be automatic. Do not expand consumer support claims before actual runtime acceptance in the next wave.
- [x] Review shared configuration changes separately from formatting-only changes; commit: `build: share quality gates and isolate runtime types`.

### Task 4: F4 — Make Pi-lence a properly checked host extension

**Prerequisite satisfied:** the owner approved the seven exact age exceptions and separate Undici trust exception above. No additional security exceptions or dependency-script execution are authorized.

**Files:** `pi/pi-lence/package.json`, new package tsconfigs extending F3, `src/quiet-mode.ts`, `src/quiet-renderers.ts`, `src/reference-browser.ts`, `src/reference-ui.ts`, `test/quiet-label.smoke.mjs`, new `test/lifecycle.test.ts`; update root lockfile and quality tests.

**Layout follow-up:** production modules now live in `pi/pi-lence/src/`; state tests and the smoke check live in `test/`. Package discovery points only to `./src/reference-ui.ts`. That move preceded and was independent of SDK approval.

**Consumes:** F3 shared checks and a reviewed SDK target. **Produces:** the same package script contract as F3, reproducible development SDK resolution, and lifecycle tests that correspond to the selected host's documented events. Runtime Pi dependencies remain wildcard peers.

- [x] Add the selected exact SDK development dependencies alongside wildcard peers and configure checks. For the proposed 1.3.0 target, align pi-lence's consumer minimum with the host's `>=22.19.0`, not its old test-only 22.18 floor. Document that this is a host-alignment change, not proof of all older-runtime/mode combinations.
- [x] Run package typechecking and capture the current invalid `session_switch` registrations/missing type exports. Add typed lifecycle tests using `session_start` reasons `startup`, `reload`, `new`, `resume`, `fork`, with idempotent shutdown: one activity timer after start, none after shutdown, reset branch state, and no timer/custom-terminal UI for non-TUI contexts. A typed handler fake must reject unknown event names rather than accept arbitrary strings.
- [x] Use the current public interfaces: remove obsolete post-switch handlers; derive renderer context with `Parameters<NonNullable<ToolRenderers["renderCall"]>>[2]`; use `TuiMouseEventResult` instead of nonexistent `TuiMouseDispatchResult`. Do not replace missing exports with private deep imports or unchecked assertions. Keep tool execution and stored pin formats unchanged.
- [x] Make the existing smoke script default to resolving the pinned development SDK via package resolution, not an absolute personal installation path. Replace fabricated `session_switch` emission with the current shutdown/start lifecycle. Clearly retain its status as a focused, version-coupled smoke test, not full host-driven acceptance. Run package `check` and `test:integration` with the pinned SDK from an isolated HOME; the deeper real-host/mode suite remains phase 2.
- [x] Run `pnpm -r run check` plus root policy/quality tests; inspect npm dry-run output to ensure the new development SDK is not bundled. Commit: `fix(pi-lence): enforce public host contracts and checked development`.

### Task 5: F5 — One check path for local work, hooks, and CI

**Files:** finalize `mise.toml`, commit `mise.lock`, root scripts, `hk.pkl`, `taplo.toml`, `.github/workflows/ci.yml`; create `scripts/check-projects.mjs` and its test; add a short `DEVELOPMENT.md`; update only stale setup/project entries in root/package READMEs. Final prose review remains phase 2.

**Reference:** follow `/Users/enlow/proj/house/mise.toml` and `hk.pkl` for the owner's conventions: `[settings] pin = true`, `lockfile = true`, `minimum_release_age = "7d"`; pinned tools; descriptive tasks; one shared hk step mapping reused for check/fix/pre-commit; file-local formatting and whole-affected-project checks; fail on missing tools; partial-staging preservation. Keep the existing explicit setup/hooks-install policy unless the owner approves House's automatic `enter` installation behavior. Adapt tool versions and project commands, not House-specific Go/database tasks. Add `mise run fix` alongside the existing format task.

**Consumes:** F2–F4 package scripts. **Produces:** `mise run setup`, `mise run check`, `mise run test`, `mise run format`, and opt-in `mise run hooks:install`. Setup performs frozen dependency installation, not hook installation or plugin registration. CI runs `mise run check` too.

- [x] Implement selection tests before the runner. Export `selectProjects(files, projects)` where `files` is repository-relative paths and `projects` contains `{ name, path, dependencies }`; return sorted names including transitive workspace dependents. Root/shared/unknown/deleted-package paths conservatively select all projects; an empty changed-file list selects none. Example assertions:

```js
assert.deepEqual(selectProjects(["pi/pi-lence/src/quiet-mode.ts"], projects), ["@grepco/pi-lence"]);
assert.deepEqual(selectProjects(["pnpm-lock.yaml"], projects), allNames);
assert.deepEqual(selectProjects(["herdr/deleted-project/src/a.ts"], projects), allNames);
assert.deepEqual(selectProjects([], projects), []);
```

- [x] Run `node --test scripts/check-projects.test.mjs`; expect RED before implementation. Add fixtures for a dependent package, deleted/renamed files, and paths containing spaces. Implement the small runner using discovered workspace metadata and argv arrays, never shell-concatenated filenames. Its CLI accepts `--all`, `--staged`, or explicit paths after `--`, and runs each selected package's `check:project`; propagate failures. Use NUL-separated Git output, and account for both sides of renames.
- [x] Define root scripts: `test:repo` runs `node --test scripts/*.test.mjs`; `check:repo` runs root formatting/lint/type checks and `test:repo`; `check` runs `check:repo`, the project runner with `--all`, and infrastructure validation. Pin hk/zizmor/taplo via mise. Configure hk's changed-file formatting with the root Oxfmt configuration and whole-affected-project checks through the runner; pass hk's selected paths through structured argv. Reuse those commands for full checks; avoid `mise → hk → mise` recursion. Validate Pkl with `hk validate`, TOML with taplo plus tool-specific validation, and workflows with zizmor. Keep hook installation opt-in and repository-scoped; test installation/partial-staging behavior in a disposable Git fixture before touching real shared worktree hooks. Do not replace existing hooks without permission.
- [x] Add a read-only cooldown-exception audit: permit only reviewed exact-version exclusions with a reason; use registry publication timestamps and the configured release age to flag exclusions that have aged out. Keep `minimumReleaseAgeExcludePrune: true` for exclusions no longer in the resolved graph; it is not an age-expiry check. Fail clearly on unavailable/invalid age metadata rather than silently accepting an exception. This audit requirement does not authorize any further exclusions.
- [x] Add read-only CI for PRs and pushes to `dev`/`main`, with full checks on a pinned macOS runner and Pi checks on Linux. Pin actions by full reviewed commit SHA, set `contents: read`, disable checkout credential persistence, and provide no release credentials. Test normal checks with a clean HOME and live-host opt-in flags unset. Document developer setup/task/protocol conventions and the distinction from consumer prerequisites; do not claim every later release facility exists yet.
- [x] Verify `mise run setup`, `mise run check`, `mise exec -- hk validate`, and `mise exec -- hk check --all --plan`. In a disposable fixture, verify an unrelated unstaged edit survives pre-commit, root config changes select every project, and a deliberate type/test failure blocks the hook and CI command. Recompare normal host registrations with F0. Commit: `ci: share local hooks and repository verification`.

## Foundation completion and handoff

- All six tasks pass their stated checks. If any task remains blocked, report partial progress and its cause; do not call the foundation complete or relabel failures as passes.
- Original working trials and unrelated local changes remain untouched. Agentlog can be trialed separately with permission.
- A clean checkout can install the pinned development dependencies and run the shared check path without personal SDK paths or a live Herdr server.
- No plugin was published, no default-branch promotion occurred, and no new trial waiting period was imposed.
- Review the foundation changes before beginning phase 2. Independent release review remains mandatory later even if foundation work is implemented inline.

**Execution:** native/inline, as approved. A separate fresh-context Pi CLI reviewer completed the foundation review below; it is distinct from author self-review and does not replace later independent release review.

## Execution evidence

**F0 baseline:** both Herdr frozen installs and full checks passed (auto-caffeinator: 126 tests; agentlog: 65). Pi-lence's eight state tests and installed-Pi-1.3 smoke check passed. No live-agent or native-power probes ran. Git worktree metadata was repaired; hashes of 56 original-checkout files and 195 trial-worktree files, both original HEADs, and host package registrations were unchanged afterward. Evidence/backups: `/tmp/agent-dev-baseline.QTfz4l`; execution logs are in this worktree's ignored `.superpowers/sdd/plan/`.

**F4:** approved SDK/trust selectors are explicit; two nonessential install scripts are explicitly denied, not authorized. All original 144 package records and snapshots remain unchanged. Pi uses public host contracts and separate Node-22 source/developer-tooling types; full library checking required one age-eligible MCP SDK development peer. Typed lifecycle tests caught and fixed stale post-shutdown render callbacks. Checks passed: Pi 17 plus an isolated pinned-host smoke, auto-caffeinator 131, agentlog 65, root 17. npm dry-run bundles no dependencies; payload allowlist/LICENSE work and deeper real-host/mode acceptance remain phase 2. Original checkout/trial contents and registrations remain unchanged.

**F5:** shared runner, explicit mise setup, protected opt-in hooks, read-only CI, exception audit and `DEVELOPMENT.md` are implemented. Actual hook fixtures cover partial staging, special filenames, blocked type/test failures, existing/shared/symlinked-hook refusal and inherited Git-environment isolation. Full setup/check passed with a clean HOME and live-host opt-ins unset; fixtures set only their own local Git identity. hk validation/full-plan and offline zizmor checks passed. Hosted CI subsequently passed in run `39052492073`; no publication, promotion or normal-host registration occurred.

**Independent foundation review:** a fresh Pi 1.3.0 `--print` process reviewed `5bfc63f..8d143be` against F0–F5 using disposable base/head snapshots and the full 182-file change inventory. Only read/grep/find/ls were enabled; no inherited conversation, extensions, MCP, skills or context files. Verdict: ready for `dev` integration on static review, with no critical/important findings and one minor stale auto-caffeinator development-guide finding, verified and repaired in `e124add`. The reviewer did not execute tests; the coordinator reran clean-HOME setup/full checks afterward: root 33, agentlog 65, auto-caffeinator 131, Pi 17 plus smoke, all passing. Report/transcript: ignored `.superpowers/sdd/plan/cli-review-8d143be/`. Installed-hook follow-up exercised deletion-only and cross-package rename commits in disposable fixtures. It exposed hk dropping deleted paths from its file list: a broken deletion incorrectly committed. The selector now recovers staged deletions from Git; both that hook regression and a CLI regression were watched RED → GREEN. Source-side and destination-side rename failures block commits, while valid renames/deletions succeed. Fresh clean-HOME setup/full checks passed with root 38, agentlog 65, auto-caffeinator 131 and Pi 17 plus smoke. Both hosted CI jobs passed at `a9fcc49` in run `39052492073`: macOS ARM64 full checks and Linux x64 Pi contracts. The owner subsequently merged PR #1 into `dev`; the hook repair has coordinator/CI verification but no separate recorded independent re-review. Publication and broader host/runtime/security acceptance remain outside this foundation review.

**Existing setup warnings:** Pi and Herdr still register paths beneath the former `~/proj/pi-ext`; Herdr reports its trial manifest unavailable. Repairing Git metadata does not repair those registrations. Do not reload/restart expecting those old paths to resolve; relinking is a separate owner-approved action. npm authentication is absent, so `@grepco` publication access is unverified. No release environment exists in GitHub yet; none was created.

**Agentlog trial checklist (after the F1 rename):** build/check with `pnpm --dir herdr/agentlog check`. Its isolated scripted host demo is `AGENTLOG_RUN_HERDR_TESTS=1 pnpm --dir herdr/agentlog test:integration` (opt-in, uses synthetic sessions/private host state). An interactive normal-host trial requires separate approval before linking: search a disposable saved conversation, pin/label/archive it, reopen the popup to check persistence, and resume/focus it while checking that an existing live pane is reused and your draft/transcript stays intact. No normal-host link/unlink command has been executed.
