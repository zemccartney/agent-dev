# herder-agentlog — compact v0 design

**Status: design and [implementation plan](PLAN.md) approved; no product implementation yet.**

**Refinements agreed:** TypeScript/Node for v0 with an explicit external Node prerequisite; no bundled JavaScript runtime. No startup toast or attachment polling: readiness is shown inside the on-demand popup. Rust/native distribution is a follow-up.

A local Herdr plugin that makes saved Pi conversations easy to close, find, and reopen. It is a recovery catalog, not a process supervisor, transcript backup, or replacement agent session manager.

Agreed behavior is recorded in [DISCUSSION.md](DISCUSSION.md); deferred work is in [FOLLOW-UPS.md](FOLLOW-UPS.md). Technical choices below are the assistant's recommendations under the user's delegation.

## 1. The experience

Invoke **Sessions** to open a temporary Herdr popup. Search by display/native name or project path. Rows show a pin, title, original directory, last user submission, and current availability. The default list excludes archived records; an Archived view makes those equally searchable.

- **Ordering:** pinned first, then latest submitted user-message timestamp. Opening, focusing, imports, agent output, and automatic restoration never update recency. Sessions with no user submission sort last within their pin group and say “No submissions.”
- **Open:** navigate to an existing matching agent in the current Herdr namespace; otherwise resume in a new tab in an unambiguously matching project workspace, or create a workspace if necessary. Focus the destination. Never overwrite a pane or create a split automatically.
- **Multiple matches:** show the existing destinations to choose from; never launch another copy. No broader duplicate-management system.
- **Pin / Unpin:** changes ordering only, not startup behavior.
- **Label:** an optional registry-only override; show “Registry only — does not rename the Pi session.” Clearing it exposes the native name again. For unnamed sessions, use a short first-user-text excerpt, falling back to the short session ID. This excerpt is display metadata, not transcript search.
- **Archive:** hides the record without stopping Pi or forgetting its pin. Successfully opening an archived session unarchives it. Nothing expires automatically; v0 has no transcript-delete action.
- **Escape:** close the popup without changing any agent or its draft. Support mouse selection/buttons and ordinary keyboard search/navigation; no bespoke interaction framework.

Use the public plugin action `herder-agentlog.sessions`. Recommend an optional `prefix+a` binding (Ctrl+B, then A with default prefix); it is unbound in the defaults and current config inspected here. Installation must check conflicts and ask before editing user bindings. The action is usable without that binding.

## 2. Small architecture

```text
Pi JSONL files ── scan on popup open / Refresh ────────────┐
                                                       ├─ SQLite catalog
Herdr lifecycle hooks ── remember observed paths ────────┘   + pins/labels/archive
                                                               │
Herdr live pane list ───────────────────────────────────────────┤
                                                               ▼
                                                       terminal popup
                                                               │
                                               focus or resume through Herdr
```

**Agreed v0 runtime direction:** TypeScript on Node 24 LTS, using built-in `node:sqlite` and standalone `@earendil-works/pi-tui`, selected in [PLAN.md](PLAN.md). Target macOS first, Herdr 0.9.3 and Pi 1.1.0. Node v24.16.0 and `node:sqlite` were verified locally with an in-memory database. **V0 requires separately installed Node 24+; Herdr itself does not require Node. Bundling a JavaScript runtime is explicitly rejected.** The package README must acknowledge this prerequisite as a distribution limitation and point to the Rust/native-binary follow-up. No rewrite is required for v0. Herdr launches ordinary commands; it does not privilege Python, Node, or Rust as its plugin language.

The user prefers a TypeScript repository, eventually with a root pnpm workspace and shared lint/format/test tooling. Keep this package workspace-ready and align with the other Herdr plugin's Node direction. Do not create or migrate root tooling as part of this plugin without separate agreement. No daemon, Pi extension, plugin-initiated model calls, or network service. Python/curses was initially recommended for standard-library convenience, but cross-repository consistency now outweighs that local convenience.

Modules stay small: Pi-file adapter, SQLite store, Herdr API wrapper, popup, and hook/action entrypoints. Keep only the Pi-specific discovery/parsing/resume operations behind an adapter boundary; do not build a generalized adapter framework before the Claude fast-follow.

Use `HERDR_BIN_PATH` and argument arrays for CLI operations. Use the documented local socket API where the CLI is insufficient. In particular, declare the pane's **`placement = "popup"` in the manifest**: the installed CLI help does not advertise a popup placement override, although the manifest/API support it. Native process commands and IDs come from Herdr responses; labels are never executable text.

## 3. Durable catalog, not a mirror of live panes

Pi owns the conversation history. Store a single private SQLite database under `HERDR_PLUGIN_STATE_DIR`, shared across this user's Herdr namespaces. Read running-pane associations from the current namespace when needed; they are not durable evidence that a conversation is still running. No startup-notification bookkeeping is needed.

Minimal durable record: harness, native session ID, canonical file path, original working directory, native name, short fallback excerpt, last user-submission timestamp, pin, archive flag, optional registry label, and scan fingerprint/error. For v0, identify file-backed records by `(harness, canonical path)` and retain native ID for matching ID-only Herdr references. Arbitrary file moves/copies are not automatically merged.

Keep source-derived metadata separate from user-owned fields so refresh never resets a label, archive, or pin. Use short transactions, SQLite's rollback journal with `synchronous=FULL`, a bounded busy timeout, and restrictive directory/file permissions. Do not hold database transactions while reading transcripts or calling Herdr. An acknowledged user edit means its transaction committed; a failed edit is reported, not optimistically treated as saved.

**Never remove a record because a process or pane disappeared.** There is no shutdown-save dependency. Metadata can be reconstructed from surviving Pi files; pins/labels/archive live in the database. This is not a backup: deleted or unpersisted transcripts cannot be recovered by this plugin.

## 4. Discovery and freshness

On popup open and explicit Refresh, scan Pi's normal session tree plus discoverable configured roots and previously recorded Herdr session paths. Include existing sessions created outside Herdr. In this installation there are currently 15 files totaling about 45 MiB: a streaming scan of changed files is a reasonable first implementation.

Known roots include the default agent directory, an explicitly inherited alternative agent directory, and absolute session-directory overrides visible in Pi's global settings/environment. Relative overrides must resolve against a known project cwd, not the plugin directory. Do not crawl the filesystem or execute project configuration.

“Observed” means that a scan found the session file or a Herdr API read supplied its path, which the plugin saved. Example outside coverage: run `pi --session-dir /some/one-off/folder` outside Herdr, then quit it; if that folder is absent from known settings and Herdr never reported its path, the plugin has no way to know where to look. In contrast, ordinary sessions in `~/.pi/agent/sessions/` are discoverable after exit even if the plugin never saw their processes running.

Read the session header for identity/original cwd, latest `session_info` for the native name, and user-message entries for recency. Recency is the maximum recorded user-message timestamp across the file, not mtime or active-branch selection. This is a deliberately simple saved-message signal, not an attempt to identify whether every user-role entry came from a human versus automation.

Cache size/mtime fingerprints; stream changed files and keep the popup responsive during refresh. Offer Refresh for newly created outside sessions while the popup is open. Ignore an incomplete trailing JSONL line until the next scan; report malformed files without rewriting them or erasing prior records.

Short `pane.agent_detected` and `pane.agent_status_changed` hooks query the affected pane and remember valid Pi references while it is running. They do not scan all transcripts or spawn any agents. They can run while clients are detached because the server and its panes remain alive; this does not imply that detaching creates new Pi conversations. Popup refresh also captures current pane references. ID-only references resolve against known files; nonexistent/unsaved sessions are not promised resumable.

**Important limitation:** Herdr's hook allowlist excludes `pane.updated`; hook commands can also be skipped at its concurrency limit. Hooks therefore help discover custom paths but are not the sole durable capture mechanism. Known on-disk session roots provide recovery even if shutdown events are lost. An unobserved, arbitrary custom session path remains outside the guarantee.

## 5. Safe, straightforward resume

Re-read the current namespace's panes immediately before acting; do not rely on yesterday's pane IDs. Match canonical paths and resolved native IDs. A matching saved reference may represent an agent still restoring: show it as opening/present, and do not launch a duplicate. If it is not yet focusable as an agent, leave the record available for refresh rather than declaring failure.

For a closed session, require the original directory and readable session file to exist. Create the destination without stealing focus, then use Herdr's managed `agent start` with Pi's `--session <absolute-path>` and a generated internal agent name. The registry label is not the Herdr agent identifier. Confirm the expected conversation reference and focus the destination; commit any unarchive change before exiting the popup. Apply the same successful-focus rule when visiting an already-open archived session. Resume loads a conversation; it does not submit a prompt or replay a command.

If startup fails or stops at an approval prompt, show the error/destination and leave any created tab available for inspection; do not blindly retry or answer prompts. Missing directories/files remain visible as unavailable records. No guessed cwd, environment reconstruction, process killing, or transcript repair. External terminals and other Herdr namespaces are outside duplicate prevention: say **“Open here / Not open here,”** never globally inactive.

## 6. Readiness inside the popup; no startup cue

On user invocation, open the popup immediately. Show cached rows with **Refreshing…**, or **Loading sessions…** on first use, then show the refreshed list or an actionable error. Keep the Sessions action available so it can explain its own state.

Invoking the action from the interactive Herdr UI already implies an attached client. Do not add client-attachment polling, a startup hook, startup toast, deferred notification state, or a permanent observer. Ordinary detach/reattach does not trigger registry UI. Lifecycle capture hooks may still run without a client, independently of the popup.

A saved conversation not currently open is not a restoration failure. The popup reports present state without inventing an expected-open set. If notifications are introduced later, respect Herdr's configured notification policy; v0 sends none.

## 7. Trade-offs and alternatives

| Choice | Why this first | Alternative / cost |
|---|---|---|
| SQLite | Atomic user edits, concurrent hooks, simple queries | JSON is easier to inspect but requires locking and atomic-write coordination; an event log adds replay/compaction work |
| TypeScript + Node | Matches the user's repo direction and other plugin; built-in SQLite is available; enables shared tooling | Requires a TUI dependency and separately installed Node. Python/curses creates a second ecosystem. Rust could remove the runtime prerequisite with a native binary and bundled SQLite, but adds Cargo, native UI work, and release builds; deferred rather than rejected. Bundled JavaScript runtimes are out of bounds |
| Disk scans + small hooks | Survives lost shutdown events; imports older conversations | Continuous event subscriber/daemon improves freshness but needs supervision and event-loss reconciliation; a Pi extension adds another installation surface |
| Snapshot-style popup refresh | Simple, responsive catalog at human-use boundaries | Continuous live sorting can be fresher but more distracting and operationally complex |
| On-demand readiness only | No toast, attach polling, startup hook, or pending-cue state | First open may wait for indexing; cached rows and explicit loading/errors make the delay visible. Proactive recovery notifications remain a future option |
| Registry-only labels | No transcript mutation or synchronization conflicts | Native naming is less confusing; explicitly tracked fast-follow |

## 8. Acceptance evidence before calling it usable

Test with synthetic Pi files and disposable named Herdr servers, never by stopping the user's active namespace:

1. Existing and externally created saved sessions appear; duplicate refreshes preserve pins/labels/archive.
2. Only new user-message timestamps change recency; no-submission sessions remain correctly ordered.
3. Archive, reopen/unarchive, pin retention, label fallback, and missing-path errors match the agreed behavior.
4. Herdr-first shutdown restores natively; Pi-first shutdown can lose Herdr's reference, but the registry still discovers the conversation and resumes it in the original cwd. Assert a real Pi process and a visible marker in that same conversation.
5. An already-open or restoring match does not create another Pi process. Multiple matches present destinations rather than spawning.
6. Interrupted indexing and process termination preserve committed user metadata; malformed files are not changed.
7. Popup mouse/keyboard operation, first-use Loading, cached Refreshing, errors, escape/draft preservation, and focus transfer receive an actual Herdr smoke test. Verify that server startup and detach/reattach do not display registry UI or send notifications.

## Review and evidence

Self-reviewed against the agreed decisions and as a builder preparing an implementation plan; no independent reviewer tool was available. The review clarified startup delivery, unreliable event-only capture, original-directory ownership, and unarchive ordering. After user feedback, TypeScript/Node with an external runtime prerequisite and popup-only readiness were agreed; runtime bundling and startup-toast machinery were removed. The implementation plan selects standalone pi-tui 1.1.0 after inspection of its published package and terminal/mouse APIs; actual Herdr popup behavior still requires the planned integration tests.

Checked the installed runtime, Pi's session format/manager, and Herdr v0.9.3's [plugin documentation](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.3/docs/next/website/src/content/docs/plugins.mdx), [plugin event allowlist](https://github.com/herdrdev/herdr/blob/v0.9.3/src/api/schema/events.rs), and [notification implementation](https://github.com/herdrdev/herdr/blob/v0.9.3/src/server/headless/notifications.rs). This is source-level feasibility evidence, not a claim that the proposed plugin has been built or end-to-end tested.

## Approval boundary

The user approved the [implementation plan](PLAN.md) through Crit. Confirm an execution approach before product implementation. The material constraints are **an external Node 24+ prerequisite with no bundled JavaScript runtime**, **no startup cue**, and **custom-path discovery depending on observation when outside known roots**. Exact colors, schema migrations, helper names, and test-fixture organization are left to the builder. Claude Code, naming synchronization, automatic morning recovery, and richer ranking remain follow-ups.
