# herder-agentlog — discussion notes

Status: product requirements settled; technical choices delegated to the assistant. The proposed [compact design](DESIGN.md) awaits approval. No implementation plan or product code yet.

Herdr plugin project. Follow-ups and deliberately deferred ideas are tracked in [FOLLOW-UPS.md](FOLLOW-UPS.md).

## Purpose

Make it comfortable to close agent processes and panes: saved conversations should be easy to find and resume later, including after a computer restart. Recovery after unexpected shutdown and ordinary rediscovery use the same registry.

## Agreed scope

- Reopen the same saved agent conversation in its original working directory. Exact pane layout, shell environment, development servers, and original process restoration are not initial promises.
- Closing an agent process or Herdr pane does not retire its registry record. Archive / Unarchive are explicit actions; no separate Completed status in v1. Archived records remain searchable through an explicit archived view/filter.
- First release: local Pi sessions.
- **Fast-follow: Claude Code**, which the user frequently uses at work while transitioning to Pi. Remote-machine support is deferred.
- Minimal UI initially. Let native Herdr restoration happen. For v0, show one silent, nonblocking “Session registry ready” cue once a new server's registry is usable and a client can see it; not on each ordinary detach/reattach. No focus change, automatic popup, extra agent launches, or mandatory startup housekeeping. This deliberately replaces the earlier missing-session alert idea with an availability cue until reliable recovery expectations are defined. The user accepts it provisionally and will judge it in real use; later it may become subtler inline readiness state or more informative recovery messaging.
- **Registry surface: on-demand Herdr popup**, selected over a dedicated tab. Escape returns to the previous work; no registry tab to manage. The browser mockup is illustrative, not a functioning registry.
- Discovery initially uses session names, project/directory, and meaningful conversation recency. Transcript-content search is deferred. Merely restarting a process should not make its conversation newly recent.
- Manual pin/unpin controls return priority. Pinned sessions sort first, with human-interaction recency within each group. No inferred importance or reuse of Herdr's runtime attention ranking in v1.
- **Recency is the latest submitted user-message timestamp only.** Registry Open / Go to pane, ordinary viewing, tab switching, import, automatic restoration, and background output do not change it. This supersedes the earlier broader human-engagement proposal. Execution duration may inform ranking later, but not in v0.
- Discover existing local Pi sessions, including ones created outside Herdr, from known Pi storage locations and session paths reported by Herdr. No whole-filesystem crawl. Arbitrary undiscovered custom locations are not implicitly covered.
- External-process detection and cross-terminal duplicate prevention are out of scope; users are responsible for avoiding concurrent use outside Herdr. Do not imply that lack of a known Herdr process proves a session is globally inactive.
- If a selected conversation is already running in the current Herdr server namespace, navigate to its existing pane instead of launching another process. The saved-conversation catalog is machine-wide, but running-session detection/navigation covers only the current namespace. The user uses the default Herdr session and has no intended multi-namespace workflow. Describe runtime visibility as “open here,” not globally running/inactive.
- If multiple existing panes in the current namespace report the same conversation, offer those destinations rather than launching another process. Do not close, merge, or select an authoritative copy automatically. Keep this a small handling path using already-available information, not a general duplicate-management subsystem.
- **Design constraint: avoid elaborate defensive handling of unsupported usage.** A clear limitation/error is preferable to expanding the plugin to accommodate every pathological configuration.
- Retain registry records indefinitely: no automatic age-based pruning and no transcript-deletion action in v0. Missing conversation files leave unavailable records rather than silently removing history.
- Archiving hides a record from the everyday list without stopping its process or forgetting its pin. Explicitly reopening an archived conversation unarchives it, restoring its previous pinned placement if applicable.
- If the original working directory is missing, refuse to launch, preserve the record, and explain the missing path. Do not guess a replacement directory or fall back to home. Directory relocation is deferred.
- Resume a conversation not open here in a new tab in an unambiguously matching project workspace; create a workspace if no unambiguous match exists. Focus the resumed agent. Never automatically split or replace an occupied pane.
- Display the native session name by default, with an optional registry-only label override. The label editor must explain that the override is not synced to Pi's native name or usable as its session identifier.
- **Fast-follow: resolve naming divergence**, investigating native-name updates/synchronization rather than treating the v1 label disclaimer as the permanent solution. The synchronization policy itself is not yet designed.

## Future direction requested by the user

A morning workflow that can reopen a selected subset of prior work: e.g. ten sessions open at shutdown, three relevant sessions reopened the next morning, with an indication of the others. Manual pinning is the agreed starting point for registry sorting. Pinning does not yet imply automatic reopening. Inferred priority and automatic selection are deferred.

## Facts checked

- Herdr detach leaves agent processes running. Server stop terminates them.
- User verified that detaching, stopping Herdr from outside, and reopening Herdr restored their Pi conversations.
- Herdr 0.9.3 native agent references can disappear if agents terminate while Herdr remains alive; isolated SIGTERM/SIGKILL-first tests reproduced shell-only restoration. Stopping Herdr first preserved references and restored a test Pi conversation. The exact source of process termination during the original macOS shutdown is not known.
- Herdr plugins have event and startup hooks and own their durable storage under HERDR_PLUGIN_STATE_DIR.
- Plugin startup occurs after layout restoration but is not a barrier proving native agent launches have finished. Native agent restoration waits for client size/theme context.
- Herdr's built-in priority ordering is an attention queue based on runtime status and state-transition sequence, not a durable ranking of user work importance. Custom agent views can use other sorting fields/tokens; that does not supply a ready-made historical relevance algorithm.
- Herdr already supports Claude session identity reporting and `claude --resume <id>`. Its official hook reports the ID and, when available, transcript path. This supports the feasibility of a Claude adapter; metadata extraction, historical discovery, and end-to-end plugin recovery remain to be investigated/tested.

## Technical recommendations awaiting approval

The user delegated storage, runtime, capture mechanism, and invocation wiring, requesting a compact design with trade-offs and alternatives. [DESIGN.md](DESIGN.md) proposes Python/curses, SQLite, disk refresh plus best-effort lifecycle capture, and a plugin action with an optional conflict-checked shortcut.

Two material qualifications are called out for approval: startup notification delivery is best-effort without a client-attached hook or permanent observer; arbitrary custom session paths outside known roots require prior observation. No existing conversation data or Herdr configuration was changed to implement this design. Follow-up implementation choices do not block v0.
