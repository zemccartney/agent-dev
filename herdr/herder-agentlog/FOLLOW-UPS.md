# herder-agentlog — follow-ups

Living record of ideas raised during design. Nothing here silently expands v0. “Fast-follow” records intent, not a delivery date or an approved implementation.

Current decisions: [DISCUSSION.md](DISCUSSION.md).

## Requested fast-follows

### Claude Code support

- Motivation: frequent work use while transitioning to Pi.
- Herdr already reports Claude session identity and supports `claude --resume <id>`.
- Investigate historical discovery, native names, meaningful human recency, and adapter-specific restoration tests.
- Preserve the same registry behavior rather than building a second catalog.

### Resolve native-name / registry-label divergence

- V0 uses native names by default and supports an optional registry-only label override, with explicit explanatory UI text.
- Motivation: users may expect their registry label to appear in Pi's `/resume` picker or work in a native resume command.
- Investigate native-name updates/synchronization and conflict ownership. Do not assume bidirectional synchronization is the solution before testing it.
- Pi currently documents `--session` as accepting a path or ID, not a friendly name. Name synchronization alone does not create CLI name aliases.

## Cross-plugin TUI reuse requested during review

### Evaluate pi-tui for Caffeinate

- Motivation: avoid maintaining handwritten terminal rendering/input/layout machinery in multiple Herdr plugins; the user would welcome simplifying Caffeinate's view layer.
- Use Agentlog to establish bundled pi-tui behavior inside Herdr, including mouse, Unicode, resize, cleanup, and measured payload size.
- Then evaluate a focused Caffeinate UI migration: replace low-level terminal plumbing while preserving controls, domain behavior, and its existing tests. This is not approval to rewrite its active worktree during the Agentlog plan review.
- Reusing a dependency shares knowledge and review effort; it does not make its bytes free in separately shipped, self-contained plugin bundles.
- Keep plugin-specific state/actions separate. Extract a shared helper only when concrete repeated code warrants it; do not build a generalized UI framework first.

## Revisit after day-to-day use

### Morning work-set recovery

- Desired scenario: shut down with ten agent conversations open; next morning reopen the three relevant ones and show a note about the others.
- V0 pins only influence catalog ordering; they do not request automatic launch.
- Later decisions: explicit restore sets vs inferred choices, startup consent, duplicate prevention, and reliable coordination with native Herdr restoration.

### Richer prioritization

- Start with manual pins and recency measured only by submitted user messages. Opening or viewing a conversation does not update recency. Avoid inferred importance in v0.
- Consider whether long-running tasks should influence ranking once finished or when the user returns.
- Herdr's built-in priority is runtime attention ranking, not durable work importance; it is not an off-the-shelf morning-selection algorithm.

### Startup cue and readiness presentation

- **Agreed v0:** no startup toast or attachment polling. Show Loading / Refreshing / errors inside the on-demand popup. This supersedes both the startup-cue and bounded-retry proposals.
- If notifications are added later, respect Herdr's configured notification policy and consider a plugin-specific opt-out; never force them through globally disabled toasts.
- Evaluate both directions after actual use: a louder or more informative recovery note, or subtler inline readiness/disabled-until-ready behavior for the registry entry point.
- More specific missing-session alerts require a reliable expected-open model; an intentionally closed conversation is not a restoration failure.
- Do not treat startup hook execution as proof that native agent restoration has completed.

### Optional housekeeping

- User explicitly prefers no automation initially.
- If the archive grows unwieldy, consider opt-in aging suggestions or retention controls—not silent pruning or transcript deletion.
- No separate Completed status unless experience demonstrates a meaningful distinction from Archive.

### Upstream Herdr report / contribution

- Share the reproducible shutdown-ordering failure and evaluate whether a core fix or optional persistence policy is appropriate.
- Plugin adoption and personal usage can inform an upstream proposal; building a plugin does not rule out reporting the underlying issue sooner.
- Existing diagnostic evidence and harness are currently in temporary directories referenced by the original investigation; preserve/redact them durably before relying on them for a future report.

## Reassess built-in SQLite stability

The user accepts Node's release-candidate SQLite API for v0, with a 24.15 / 25.7 minimum. Track its graduation to Stable (2) and any compatibility issues on the user's Node 24/26 machines or coworkers' installations. Keep README honest about the current experimental classification. Reconsider a mature binding or native implementation only if actual needs justify it; do not build older-Node compatibility machinery now.

## Distribution goal: no separately installed runtime

The user raised concern that requiring Node 24.15+ is friction for end users. Herdr itself does not require Node; it is a dependency of the proposed plugin implementation.

- **Agreed v0:** TypeScript/Node with a separately installed Node 24.15+ runtime (25.x: 25.7+). The package README must acknowledge that prerequisite as a limitation and note investigation of Rust/native alternatives.
- Before broader distribution, evaluate a self-contained executable, including SQLite facilities.
- Rust with bundled SQLite is one candidate: no Node/Python runtime for end users, but it adds another toolchain, native UI implementation, platform builds, and release distribution.
- **Hard constraint: do not bundle a JavaScript runtime.** The user explicitly rejected shipping that additional runtime payload; it is not an alternative to revisit without a change in direction.
- Ordinary JavaScript bundling alone does not remove the Node runtime requirement. Rust/native distribution is the preferred direction to investigate, but no rewrite is required or scheduled for v0.

## Repository direction (separate scope)

The user prefers TypeScript throughout this tooling repo, with an eventual root pnpm workspace and shared quality configuration. The Crit review explicitly requested mirroring Caffeinate's package-local direction now: pnpm and its dependency-security policy, tsdown, independent TypeScript checks, type-aware Oxlint, Oxfmt, and Node's test runner against built output. Vitest/bats-core were earlier candidates, not requirements for this implementation.

The expanded [root TODO.md](../../TODO.md) records mise, shared workspace/configuration, hk/CI, Changesets, security checks, and the prebuilt GitHub artifact/install direction. Keep these as separate infrastructure/packaging work; do not make a root migration a prerequisite or silently change Caffeinate. The user explicitly requested a small bundled/minified Agentlog payload. Include reachable pi-tui/transitive JS in that bundle; consumers must not install pi-tui separately. Validate the clean production popup without node_modules and only include a native helper asset if the required behavior actually needs it. Measure the complete compressed/uncompressed payload and preserve license notices. Node itself must remain separately installed.

## Deliberately out of v0; not promised roadmap items

- Detecting agent processes outside the current Herdr namespace, including ordinary terminals.
- Multi-namespace or remote-machine navigation and cross-machine registry synchronization.
- Transcript-content search.
- Directory relocation / repository move repair.
- Exact tab/split layout, shell environment, development-server, or original-process restoration.
- A general cross-harness metadata protocol before concrete Pi and Claude needs establish one.

Keep this file updated as decisions change; move an item into active scope only with explicit agreement.
