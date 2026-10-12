# herder-agentlog — compact v0 design

**Status: proposed, awaiting approval. No product implementation yet.**

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
Pi JSONL files ── scan on startup / popup open / Refresh ──┐
                                                       ├─ SQLite catalog
Herdr lifecycle hooks ── remember observed paths ────────┘   + pins/labels/archive
                                                               │
Herdr live pane list ───────────────────────────────────────────┤
                                                               ▼
                                                       terminal popup
                                                               │
                                               focus or resume through Herdr
```

**Recommended stack:** Python 3.9+ standard library: `sqlite3`, `curses`, JSON and subprocess/socket support. Target macOS first, Herdr 0.9.3 and Pi 1.1.0. Python, SQLite, and curses were verified available locally. No daemon, Pi extension, model calls, network service, or third-party runtime dependencies.

Modules stay small: Pi-file adapter, SQLite store, Herdr API wrapper, popup, and hook/action entrypoints. Keep only the Pi-specific discovery/parsing/resume operations behind an adapter boundary; do not build a generalized adapter framework before the Claude fast-follow.

Use `HERDR_BIN_PATH` and argument arrays for CLI operations. Use the documented local socket API where the CLI is insufficient. In particular, declare the pane's **`placement = "popup"` in the manifest**: the installed CLI help does not advertise a popup placement override, although the manifest/API support it. Native process commands and IDs come from Herdr responses; labels are never executable text.

## 3. Durable catalog, not a mirror of live panes

Pi owns the conversation history. Store a single private SQLite database under `HERDR_PLUGIN_STATE_DIR`, shared across this user's Herdr namespaces. Namespace-specific runtime/readiness bookkeeping is separate from machine-local conversation records.

Minimal durable record: harness, native session ID, canonical file path, original working directory, native name, short fallback excerpt, last user-submission timestamp, pin, archive flag, optional registry label, and scan fingerprint/error. For v0, identify file-backed records by `(harness, canonical path)` and retain native ID for matching ID-only Herdr references. Arbitrary file moves/copies are not automatically merged.

Keep source-derived metadata separate from user-owned fields so refresh never resets a label, archive, or pin. Use short transactions, SQLite's rollback journal with `synchronous=FULL`, a bounded busy timeout, and restrictive directory/file permissions. Do not hold database transactions while reading transcripts or calling Herdr. An acknowledged user edit means its transaction committed; a failed edit is reported, not optimistically treated as saved.

**Never remove a record because a process or pane disappeared.** There is no shutdown-save dependency. Metadata can be reconstructed from surviving Pi files; pins/labels/archive live in the database. This is not a backup: deleted or unpersisted transcripts cannot be recovered by this plugin.

## 4. Discovery and freshness

On startup and popup open, scan Pi's normal session tree plus discoverable configured roots and previously recorded Herdr session paths. Include existing sessions created outside Herdr. In this installation there are currently 15 files totaling about 45 MiB: a streaming scan of changed files is a reasonable first implementation.

Known roots include the default agent directory, an explicitly inherited alternative agent directory, and absolute session-directory overrides visible in Pi's global settings/environment. Relative overrides must resolve against a known project cwd, not the plugin directory. Per-process overrides that were never observed are not discoverable; do not crawl the filesystem or execute project configuration.

Read the session header for identity/original cwd, latest `session_info` for the native name, and user-message entries for recency. Recency is the maximum recorded user-message timestamp across the file, not mtime or active-branch selection. This is a deliberately simple saved-message signal, not an attempt to identify whether every user-role entry came from a human versus automation.

Cache size/mtime fingerprints; stream changed files and keep the popup responsive during refresh. Offer Refresh for newly created outside sessions while the popup is open. Ignore an incomplete trailing JSONL line until the next scan; report malformed files without rewriting them or erasing prior records.

Short `pane.agent_detected` and `pane.agent_status_changed` hooks query the affected pane and remember valid Pi references while it is running. They do not scan all transcripts. Startup and popup refresh also capture current pane references. ID-only references resolve against known files; nonexistent/unsaved sessions are not promised resumable.

**Important limitation:** Herdr's hook allowlist excludes `pane.updated`; hook commands can also be skipped at its concurrency limit. Hooks therefore help discover custom paths but are not the sole durable capture mechanism. Known on-disk session roots provide recovery even if shutdown events are lost. An unobserved, arbitrary custom session path remains outside the guarantee.

## 5. Safe, straightforward resume

Re-read the current namespace's panes immediately before acting; do not rely on yesterday's pane IDs. Match canonical paths and resolved native IDs. A matching saved reference may represent an agent still restoring: show it as opening/present, and do not launch a duplicate. If it is not yet focusable as an agent, leave the record available for refresh rather than declaring failure.

For a closed session, require the original directory and readable session file to exist. Create the destination without stealing focus, then use Herdr's managed `agent start` with Pi's `--session <absolute-path>` and a generated internal agent name. The registry label is not the Herdr agent identifier. Confirm the expected conversation reference and focus the destination; commit any unarchive change before exiting the popup. Apply the same successful-focus rule when visiting an already-open archived session. Resume loads a conversation; it does not submit a prompt or replay a command.

If startup fails or stops at an approval prompt, show the error/destination and leave any created tab available for inspection; do not blindly retry or answer prompts. Missing directories/files remain visible as unavailable records. No guessed cwd, environment reconstruction, process killing, or transcript repair. External terminals and other Herdr namespaces are outside duplicate prevention: say **“Open here / Not open here,”** never globally inactive.

## 6. Startup cue: useful but best-effort

After initial indexing, attempt one silent “Session registry ready” notification, retrying briefly (up to 30 seconds) if there is no attached client or delivery is rate-limited. Record shown/pending status per namespace and startup generation so ordinary reattach does not repeat it. A server handoff can start a new generation too.

**Interface constraint:** there is no documented client-attached plugin hook. If a server remains headless beyond that window, leave the cue pending and try on a later eligible pane-focus/status hook; an explicit Sessions action can consume the pending cue because the user is already viewing the registry. Do not keep a permanent worker alive just to deliver a toast. Disabled notification preferences are respected. Delivery is best-effort, not proof the user saw it.

This means the cue can be delayed or absent in an unusual headless-start flow. Registry access and recovery do not depend on it. The popup displays loading/errors itself and never claims that unlaunched saved conversations represent failed native restoration.

## 7. Trade-offs and alternatives

| Choice | Why this first | Alternative / cost |
|---|---|---|
| SQLite | Atomic user edits, concurrent hooks, simple queries | JSON is easier to inspect but requires locking and atomic-write coordination; an event log adds replay/compaction work |
| Python + curses | Available here, SQLite and TUI without dependency setup | TypeScript + a TUI library fits the existing Pi-extension stack better and may yield richer widgets; adds packaging and library choices. Curses costs more manual UI work |
| Disk scans + small hooks | Survives lost shutdown events; imports older conversations | Continuous event subscriber/daemon improves freshness but needs supervision and event-loss reconciliation; a Pi extension adds another installation surface |
| Snapshot-style popup refresh | Simple, responsive catalog at human-use boundaries | Continuous live sorting can be fresher but more distracting and operationally complex |
| Best-effort startup toast | No long-lived service for a cosmetic cue | Exact first-attach delivery needs a stronger lifecycle hook or a persistent observer |
| Registry-only labels | No transcript mutation or synchronization conflicts | Native naming is less confusing; explicitly tracked fast-follow |

## 8. Acceptance evidence before calling it usable

Test with synthetic Pi files and disposable named Herdr servers, never by stopping the user's active namespace:

1. Existing and externally created saved sessions appear; duplicate refreshes preserve pins/labels/archive.
2. Only new user-message timestamps change recency; no-submission sessions remain correctly ordered.
3. Archive, reopen/unarchive, pin retention, label fallback, and missing-path errors match the agreed behavior.
4. Herdr-first shutdown restores natively; Pi-first shutdown can lose Herdr's reference, but the registry still discovers the conversation and resumes it in the original cwd. Assert a real Pi process and a visible marker in that same conversation.
5. An already-open or restoring match does not create another Pi process. Multiple matches present destinations rather than spawning.
6. Interrupted indexing and process termination preserve committed user metadata; malformed files are not changed.
7. Popup mouse/keyboard operation, escape/draft preservation, focus transfer, and startup cue behavior receive an actual Herdr smoke test. Headless notification deferral is tested explicitly.

## Review and evidence

Self-reviewed against the agreed decisions and as a builder preparing an implementation plan; no independent reviewer tool was available. The review clarified startup delivery, unreliable event-only capture, original-directory ownership, and unarchive ordering. Remaining detailed choices are explicitly delegated, not unresolved product questions.

Checked the installed runtime, Pi's session format/manager, and Herdr v0.9.3's [plugin documentation](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.3/docs/next/website/src/content/docs/plugins.mdx), [plugin event allowlist](https://github.com/herdrdev/herdr/blob/v0.9.3/src/api/schema/events.rs), and [notification implementation](https://github.com/herdrdev/herdr/blob/v0.9.3/src/server/headless/notifications.rs). This is source-level feasibility evidence, not a claim that the proposed plugin has been built or end-to-end tested.

## Approval boundary

Approve the behavior and technical recommendations above before implementation planning. The two material qualifications to earlier discussion are **best-effort startup notification delivery** and **custom-path discovery depending on observation when outside known roots**. Exact colors, schema migrations, helper names, and test-fixture organization are left to the builder. Claude Code, naming synchronization, automatic morning recovery, and richer ranking remain follow-ups.
