# herder-agentlog

A planned Herdr plugin for finding and reopening saved agent conversations, with pins, registry-only labels, and archival.

**Implementation planned; not implemented or ready to install yet.** The first version targets local Pi sessions on macOS; Claude Code is a requested fast-follow.

## Runtime and distribution

V0 will require **a separately installed Node.js 24+** runtime. This is a requirement of this plugin's TypeScript/Node implementation, **not of Herdr itself**.

We recognize that this prerequisite adds installation friction. It is accepted for the first personal-use version while we evaluate native distribution, with **Rust and bundled SQLite** as the preferred direction to investigate. A native rewrite is not scheduled or required for v0.

**We will not bundle a JavaScript runtime.** Ordinary application bundling would not remove the external Node prerequisite.

## Intended behavior

- An on-demand popup searches saved Pi sessions by name and project path.
- Pins sort first, then the latest submitted user message.
- Open a session in its original working directory, or visit its existing pane in the current Herdr namespace.
- Closing Pi or its pane does not remove its registry record.
- Archive hides a record without deleting its conversation or stopping its process.
- Loading, refresh progress, and errors appear inside the popup; no startup toast or attachment polling.

Pi's session files remain the conversation source. The registry is not a transcript backup and cannot recover deleted or unpersisted conversations. External-process detection and navigation across Herdr namespaces are outside v0.

## Design and implementation plan

- [Implementation plan — ready for review](PLAN.md)
- [Compact design and trade-offs](DESIGN.md)
- [Agreed requirements and discussion](DISCUSSION.md)
- [Follow-ups and distribution direction](FOLLOW-UPS.md)
