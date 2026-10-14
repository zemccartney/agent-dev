# herder-agentlog

A planned Herdr plugin for finding and reopening saved agent conversations, with pins, registry-only labels, and archival.

**Implementation planned; not implemented or ready to install yet.** The first version targets local Pi sessions on macOS; Claude Code is a requested fast-follow.

## Runtime and distribution

V0 requires **a separately installed Node.js 24.15+** runtime (Node 25.x requires **25.7+**; current Node 26 is also an intended target). This is this plugin's prerequisite, **not Herdr's**. Development checks have run on Node 24.16.0; version-boundary tests do not constitute testing on every Node release.

**SQLite stability:** Node's built-in `node:sqlite` became **Stability 1.2 — Release candidate** in Node 24.15 and 25.7. This is still under Node's experimental classification, **not Stable (2)**: breaking API changes remain possible without the normal compatibility guarantee. That trade-off is accepted for this personal-use v0 and will be reassessed later. See [Node's SQLite version history](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html) and [stability definitions](https://nodejs.org/api/documentation.html#stability-index).

Older Node 22.13+, 23.4+, 24.0–24.14, and 25.0–25.6 already expose SQLite without an experimental flag. They **might work**, but use the earlier experimental API and are **not supported or validated** by this plugin. The launcher explains this and asks you to upgrade before loading the application. There are no older-runtime workarounds or automatic Node installations.

We recognize that this prerequisite adds installation friction. It is accepted for the first personal-use version while we evaluate native distribution, with **Rust and bundled SQLite** as the preferred direction to investigate. A native rewrite is not scheduled or required for v0.

**We will not bundle a JavaScript runtime.** The planned distribution bundles and minifies the plugin's JavaScript, including the pi-tui library used to draw its popup. **Consumers will not need to install pi-tui separately.** Application bundling does not remove the external Node prerequisite. Developer pnpm/compiler requirements are separate from consumer requirements; no release artifact is available yet.

## Intended behavior

- An on-demand popup searches saved Pi sessions by name and project path.
- Pins sort first, then the latest submitted user message.
- Open a session in its original working directory, or visit its existing pane in the current Herdr namespace.
- Closing Pi or its pane does not remove its registry record.
- Archive hides a record without deleting its conversation or stopping its process.
- Loading, refresh progress, and errors appear inside the popup; no startup toast or attachment polling.

Pi's session files remain the conversation source. The registry is not a transcript backup and cannot recover deleted or unpersisted conversations. External-process detection and navigation across Herdr namespaces are outside v0.

## Design and implementation plan

- [Implementation plan — approved in Crit](PLAN.md)
- [Compact design and trade-offs](DESIGN.md)
- [Agreed requirements and discussion](DISCUSSION.md)
- [Follow-ups and distribution direction](FOLLOW-UPS.md)
