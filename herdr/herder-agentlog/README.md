# herder-agentlog

A Herdr popup for finding and reopening saved Pi conversations, with pins, registry-only labels, and archival.

**Local source-build milestone, not a published release.** Tested with Herdr 0.9.3, Pi 1.2.0, and Node 24.16.0 on macOS. Claude Code remains a requested fast-follow. Nothing is installed into your Herdr setup automatically.

## Runtime and distribution

V0 requires **a separately installed Node.js 24.15+** runtime (Node 25.x requires **25.7+**; current Node 26 is also an intended target). This is this plugin's prerequisite, **not Herdr's**. Development checks have run on Node 24.16.0; version-boundary tests do not constitute testing on every Node release.

**SQLite stability:** Node's built-in `node:sqlite` became **Stability 1.2 — Release candidate** in Node 24.15 and 25.7. This is still under Node's experimental classification, **not Stable (2)**: breaking API changes remain possible without the normal compatibility guarantee. That trade-off is accepted for this personal-use v0 and will be reassessed later. See [Node's SQLite version history](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html) and [stability definitions](https://nodejs.org/api/documentation.html#stability-index).

Older Node 22.13+, 23.4+, 24.0–24.14, and 25.0–25.6 already expose SQLite without an experimental flag. They **might work**, but use the earlier experimental API and are **not supported or validated** by this plugin. The launcher explains this and asks you to upgrade before loading the application. There are no older-runtime workarounds or automatic Node installations.

We recognize that this prerequisite adds installation friction. It is accepted for the first personal-use version while we evaluate native distribution, with **Rust and bundled SQLite** as the preferred direction to investigate. A native rewrite is not scheduled or required for v0.

**We will not bundle a JavaScript runtime.** The build bundles, tree-shakes, and minifies the plugin's JavaScript, including pi-tui. **Consumers do not install pi-tui, pnpm, a compiler, or npm dependencies.** Their prerequisites are Node, Herdr, and Pi, with Herdr's official Pi integration for reliable live-session references. Missing Node is reported by Herdr when launching the command; there is no fallback installation.

No prebuilt release artifact is available yet: a developer must build before linking this source checkout. The tested clean runtime contains only `dist/cli.js`, `scripts/run.cjs`, `herdr-plugin.toml`, minimal ESM package metadata, and `THIRD_PARTY_NOTICES.txt`. No source, node_modules, optional native helpers, or JavaScript runtime is needed. The current bundle is about 194 KB (59 KB gzip); the complete runtime is about 202 KB (62 KB tar.gz). Tests print exact sizes. See the notices file for the included libraries' complete licenses.

## Behavior

- An on-demand popup searches saved Pi sessions by name and project path.
- Pins sort first, then the latest submitted user message.
- Open a session in its original working directory, or visit its existing pane in the current Herdr namespace.
- Closing Pi or its pane does not remove its registry record.
- Archive hides a record without deleting its conversation or stopping its process.
- The whole popup waits for initial loading and manual refresh before enabling the session list. Loading-time keys/clicks are discarded, not queued; Escape still closes. No refresh runs while editing a label, choosing a destination, or opening a session. Incomplete refresh is explained before showing saved records. There is no startup toast or attachment polling.

Pi's JSONL files remain the conversation source. Pins, archive state, and labels live in `HERDR_PLUGIN_STATE_DIR/agentlog.sqlite3`; they are **not transcript backups or native Pi renames**. Nothing deletes transcripts or prunes old records. There is no startup popup, toast, daemon, or attachment polling.

**“Open here / Not open here” refers only to the current Herdr namespace.** Matching live agents take precedence over starting another process; ambiguous destinations require a choice, and restoring references do not trigger another launch. Otherwise Open creates a new tab in one unambiguously matching project workspace, or a new workspace, in the original directory. It never splits or replaces an occupied pane. Failed starts leave their destination available for inspection; no prompts are submitted or answered automatically.

Discovery scans known Pi roots: `~/.pi/agent/sessions`, `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, global `sessionDir` settings, and paths captured from this namespace's Pi references. Relative settings use known project directories. Arbitrary custom locations from outside Herdr cannot be discovered magically. Refresh is explicit; there is no filesystem watcher. Deleted/unreadable files and missing directories remain listed but cannot be resumed, unless their still-running matching pane can be visited.

## Build and try locally (developer)

Review the manifest and build first; linking does not install dependencies or build code:

```sh
cd /absolute/path/to/pi-ext/herdr/herder-agentlog
pnpm install --frozen-lockfile
pnpm check
# Only when you deliberately want to change your own Herdr installation:
herdr integration install pi
herdr plugin link "$PWD"
herdr plugin action invoke herder-agentlog.sessions
```

Install the official Pi integration before starting Pi sessions you want Herdr to recognize. Invoke **Sessions…** from Herdr's workspace/pane actions, or use the CLI command above with an attached client. Do not install the raw GitHub source as a ready-to-run release: distribution artifacts are a follow-up. `herdr plugin unlink herder-agentlog` unregisters the plugin without deleting its registry or your sessions.

An optional keybinding goes in your Herdr config **only after checking for conflicts**; choose another key if `prefix+a` is already used:

```toml
[[keys.command]]
key = "prefix+a"
type = "plugin_action"
command = "herder-agentlog.sessions"
description = "Saved Pi sessions"
```

No configuration is edited automatically. See [FOLLOW-UPS.md](FOLLOW-UPS.md) for native/Rust distribution and the separate Caffeinate pi-tui evaluation.

## Controls

| Key              | Action                                                  |
| ---------------- | ------------------------------------------------------- |
| Type / Up / Down | Search / select                                         |
| Enter            | Open or focus selected conversation                     |
| Tab              | Saved / Archived                                        |
| Ctrl+P           | Pin / unpin                                             |
| Ctrl+L           | Registry-only label; Enter saves, empty clears          |
| Ctrl+X           | Archive / unarchive                                     |
| Ctrl+R           | Refresh known roots and current namespace               |
| Esc / Ctrl+C     | Cancel editor/destination choice first, otherwise close |

Buttons provide mouse equivalents. A label editor says **“Registry only — does not rename the Pi session.”** Closing the popup preserves the underlying draft. Selections are not automatically copied to the clipboard. Enlarge a terminal showing “Terminal too small.”

## Verification

```sh
pnpm check
# Explicit opt-in; requires real local Herdr/Pi and macOS /usr/bin/script:
AGENTLOG_RUN_HERDR_TESTS=1 pnpm test:integration
```

Normal tests never connect to live Herdr. The live suite creates a short private sandbox with its own HOME, XDG config/state/data, Pi configuration, plugin registry, and uniquely named server. It runs the **clean minified payload**, offline with synthetic conversations and no model prompts. It verifies organization, mouse/control-key input, Unicode, resize, draft preservation, durable metadata after killing the popup, focus without duplicate processes, and recovery after:

- Herdr-first shutdown: native restoration succeeds.
- Pi-SIGTERM-first or Pi-SIGKILL-first shutdown: native references are lost; Agentlog reopens the saved conversation in its original directory.

The suite stops only its own server, removes its disposable state, and checks that the real configuration, integration, plugin registry, and default socket were unchanged. Failure diagnostics contain only synthetic test output, not credentials or saved transcript files. A full Mac reboot and physical-terminal/IME behavior are not automated checks.

Before a hands-on trial: confirm the intended Node is on Herdr's PATH; verify the Pi integration; choose a nonconflicting keybinding; try one disposable conversation and an underlying draft; inspect the original cwd after Open. Installation into your normal namespace still requires your deliberate approval.

## Design and implementation plan

- [Implementation plan — approved in Crit](PLAN.md)
- [Compact design and trade-offs](DESIGN.md)
- [Agreed requirements and discussion](DISCUSSION.md)
- [Follow-ups and distribution direction](FOLLOW-UPS.md)
