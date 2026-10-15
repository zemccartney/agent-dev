# Caffeinate for Herdr — trial

Automatically caffeinate local Pi and Claude Code runs. No model calls, consumer npm installs, SQLite, or changes to agent execution. The self-contained bundle includes standalone pi-tui and its reviewed dependencies—not the Pi agent SDK.

## Prerequisites

- macOS supported by your Herdr installation.
- **Node 24.x** available on Herdr's launch `PATH`. Declared minimum: 24.11.0; tested: 24.16.0. The actual minimum binary remains unverified. Other majors are rejected. No particular version manager is required.
- **Herdr >=0.9.3**; tested with 0.9.3, newer versions are best-effort rather than a blanket compatibility guarantee. Pi also needs Herdr's Pi integration, as described below.
- Git for obtaining a source checkout or GitHub-based installation, not for ongoing caffeination.

The runtime launcher checks Node, macOS, built output, and the Herdr CLI before loading the application. It never installs runtimes/dependencies, sources shell profiles, or changes global configuration. Prebuilt consumers need no pnpm, TypeScript, or compiler. **Release artifacts and a public installer are not published yet**; the current local trial uses a developer-built checkout.

**Start with the [guided demo](docs/demo.md).** A historical real Pi tool-run demo passed. The refactored bundle passed isolated no-agent Herdr acceptance; independent review, real Pi/Claude exits under active protection, minimum-Node execution, laptop power transitions and overnight reliability remain open. See [validation](docs/validation.md) and the [design](docs/design.md).

## Local trial from a built checkout

Build a source checkout first using [Development](#development). Herdr `plugin link` does not build it. Then run the commands below from any directory.

Keep the checkout at its linked location. A Git worktree is a perfectly valid plugin directory; you do not need to run your agent or shell inside it.

```sh
# Set this to the actual plugin directory; absolute paths avoid cwd surprises.
PLUGIN=/absolute/path/to/agent-dev/herdr/caffeinate
herdr plugin link "$PLUGIN"
herdr plugin action invoke agent-dev.caffeinate.controls
```

Herdr must be running. For a named session, use `herdr --session NAME ...` consistently. The first controls action starts this server's monitor immediately; linking/enabling alone does not run startup hooks. Future server starts run the startup hook automatically. The plugin registry/settings are global, but monitors and leases belong to each server.

Pi requires Herdr's current Pi integration:

```sh
herdr integration install pi
```

Restart Pi or reload its extensions after installing/updating that integration. This plugin does not install it on your behalf. Claude Code uses Herdr's existing screen evidence; it does not need a new caffeination hook.

## Coffee cup in the sidebar

The popup works without changing your layout. To display a cup in Herdr's expanded **Agents** sidebar, add `"$caffeination"` to an existing row in your Herdr config. If you use the default layout, its caffeinated variant is:

```toml
[ui.sidebar.agents]
rows = [
  ["state_icon", "machine", "workspace", "tab"],
  ["agent", "$caffeination"],
]
```

Do not append a duplicate `[ui.sidebar.agents]` section. Preserve custom rows; per-agent `rows_by_agent` overrides also need the token if you use them. Missing cups and their separators disappear. Run `herdr server reload-config` after editing. No agent name or activity state is overwritten.

Optional keybinding (choose an unused key; this example claims `prefix+l`):

```toml
[[keys.command]]
key = "prefix+l"
type = "plugin_action"
command = "agent-dev.caffeinate.controls"
description = "caffeination controls"
```

Otherwise invoke the controls action from a Herdr terminal. When no supported agent was targeted, the popup offers an agent picker.

## Controls

- Type a duration in **hours**; fractions work. Enter applies it immediately to an ongoing run. Deadline uses your machine's timezone, down to milliseconds.
- For idle/permission-waiting agents, **Set next run** arms one run; it does not keep an idle machine awake.
- Persistent **Agents (a) / Settings (s) / About (?)** tabs are always at the top; the active tab uses the theme accent. Returning to Agents restores its last detail/list view. Clicking the active tab is a no-op; unsaved settings survive tab switches.
- The focused agent opens first. **Tab / all agents** opens all supported local agents, labelled `workspace — tab (agent)`. Use arrows or click a row, then Enter / **open**. Tab returns to the current agent without changing it; the mouse wheel browses longer lists.
- Click the hours field to edit; a cursor marks its position. Left/right, Home/End, Backspace/Delete and Ctrl+U work. Enter / **apply** submits.
- Click **Stop caffeinating** / **Cancel next run**, or press `r`. Neither cancels agent work.
- `s`: global settings (automatic toggle and default hours). Space toggles automatic; Tab moves to duration; Enter saves. Clicks work too. `a` returns to Agents. Changes affect future runs only.
- `?`: About / usage guidance. Escape or **close** closes the popup from any view. Closing/detaching does not stop the monitor.

This UI is a first-pass trial. Allow at least 56 × 18 terminal cells inside the popup. Static Gruvbox dark/light colors and simple custom hex overrides are read from Herdr's config when opening; other/auto-switching themes use terminal ANSI colors because Herdr 0.9.3 has no public resolved-theme API. The native Agents sidebar right-click menu has no plugin-action hook yet; keep using the shortcut/action for now.

Automatic is initially on. Default is eight hours from observed run start, with a ten-second start delay. Tools, commentary and retries do not reset that deadline. A confirmed finish/wait ends the lease. Explicit manual actions bypass the delay.

## Important boundaries

- Caffeination is active **only while plugged in**. Battery/unknown power suspends it, but the absolute deadline keeps counting. The cup is absent while suspended.
- Display sleep is allowed. This does not override lid closure, explicit Sleep, critical-battery behavior, or network failure.
- Timeout releases caffeination; it does not stop the agent or cap spending. Other runs/apps may still keep the machine awake.
- Starting/restarting the monitor does not automatically adopt work already underway. Caffeinate that run manually or start a genuinely new run.
- No persisted leases or arming. Client detach preserves in-memory state; server/agent exit does not.
- Remote/SSH, tmux-wrapped agents, unidentified foreground processes and detached background jobs are outside this first version's coverage.
- Claude status is heuristic. Unexpected UI can remain uncertain; existing caffeine then lasts only to its original deadline. It cannot create a fresh lease from uncertainty.
- Native timeout is whole seconds, rounded down; a lease may stop less than a second early. Durations below one second cannot acquire an OS assertion.
- Tokens have a six-second TTL: a crash can leave a cup visible briefly even after the OS releases caffeine.

## Disable / update / recover

```sh
herdr plugin disable agent-dev.caffeinate
# Later:
herdr plugin enable agent-dev.caffeinate
herdr plugin action invoke agent-dev.caffeinate.controls
# Remove registration (does not delete your source):
herdr plugin unlink agent-dev.caffeinate
```

Disable releases owned assertions while agent work continues. After source edits, run `pnpm build`. For popup-only changes, close and reopen controls; the running monitor and leases need no restart. To load changed monitor code, deliberately disable, wait a few seconds, enable and invoke controls. If you move/merge the checkout, unlink and link its new plugin path. Do not delete a worktree while Herdr still points into it.

Settings live in the directory printed by `herdr plugin config-dir agent-dev.caffeinate`, in `settings.json`. Temporary runtime state and a sibling log live under the OS temp directory's `caffeinate-<uid>/` directory. An unavailable monitor reports its exact paths.

**Crash recovery is deliberately conservative:** SIGKILL releases the monitor's native assertions, but can leave an ownership directory. The next start refuses that stale lock rather than guessing which PID is safe to kill. Inspect the reported `owner.json` and process identity, confirm the original monitor is gone, then remove only that reported server-specific directory and invoke controls again. Do not remove another live monitor's directory, and do not kill a PID merely because an old file names it. Restarting the Herdr server is not a harmless workaround: it stops its panes.

## Development

Provide Node 24.x and the pinned **pnpm 11.26.0** yourself. Matching `engines` and error-only `devEngines.runtime` checks never provision Node. Tooling is package-local; this does not change the other projects' workflow.

```sh
cd "$PLUGIN"
node scripts/preflight.cjs build
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test:integration
pnpm test:runtime
```

- TypeScript in `src/` uses extensionless application imports with one strict ESNext/Bundler compiler project and one Node 24 types version. Raw Node stripping does not resolve those imports: build application code rather than running `src/main.ts` directly. Native-run developer helpers keep `.ts` imports or package aliases.
- tsdown emits one minified/tree-shaken production ESM entry, `dist/main.js`, without chunks/maps, and separate readable modular test output in `.build/test/`. Build before linking or trying edits. Compilation requires no running Herdr server and performs no install/relink/restart.
- `pnpm check` runs Oxfmt, independent strict `tsc --noEmit`, type-aware Oxlint, then the built-output tests. `pnpm format` formats owned files. Exact devDependency versions, the pinned manager, and `pnpm-lock.yaml` are checked in.
- pnpm enforces a seven-day release cooldown, trust-downgrade checks even against the lockfile, no exotic subdependencies, and no unapproved dependency build scripts. Do not bypass a blocked resolution silently.
- `pnpm test` builds first, then uses the built-in Node test runner with TAP output. Native Node stripping runs developer `.ts` tests/probes; `#caffeinate/*` imports execute `.build/test/*.js` while TypeScript checks source contracts. Tests, fixtures, scripts and build configuration are included in strict checking; isolated negative canaries verify the actual compiler/linter gates.
- Default tests use injected clocks, fake sockets, ordinary child processes and a real toolkit renderer/terminal emulator; they acquire no OS assertions. Separate artifact tests execute the actual production bundle. `pnpm test:runtime` consumes an already prepared payload and reports the actual selected binary; use `CAFFEINATE_TEST_NODE=/absolute/path/to/node` for another preinstalled Node 24 binary. Simulated version boundaries are not minimum-runtime acceptance.
- `pnpm build` prepares `.build/runtime/`: only `dist/main.js`, launcher/preflight, runtime manifest, minimal ESM package metadata, the canonical repository LICENSE and `THIRD_PARTY_NOTICES.txt`. It does not contain source, tests, tools, node_modules, devEngines or maps. This local payload is not a published release.
- Bundle-graph inventory and exact-version `scripts/license-policy.json` drive fail-closed notices. Installed upstream texts are preserved in full, including injected bundler helpers. Explicit version-bound `vendor:` inputs supply pi-tui's omitted root license and copied OpenTUI attribution, with pinned source provenance under `scripts/licenses/`. Unknown versions or missing required text block preparation. The repository LICENSE is copied, not independently maintained.
- Installer, release archives, checksums and publishing automation remain subsequent work. The [fresh-context review request](docs/review-request.md) covers the whole package; independent review has not occurred.
- Temporary `src/main.mjs` supports the already-cached trial manifest and forwards through preflight to the build. New manifest registrations use `/bin/sh scripts/launch.sh`. Existing monitors/IPC/leases are not restarted or restored by building; relinking the live trial is intentionally not automatic.

### Separately opted-in validation

```sh
# Temporary isolated Herdr only; no agents or native assertions:
CAFFEINATE_RUN_HERDR_TESTS=1 pnpm test:herdr
# Test-only toolkit spike, also isolated:
CAFFEINATE_RUN_HERDR_TESTS=1 pnpm probe:tui
# Separate permission required: briefly acquires real macOS assertions:
pnpm probe:assertions --allow-system-assertion
```

Do not run native probes or real-agent workloads merely to satisfy default tests. Real-agent exit acceptance needs an agreed finite workload; `CAFFEINATE_RUN_AGENT_EXIT_TESTS=1` currently fails clearly rather than running an unapproved scenario. Building does not restart or relink the normal trial.

The root repository LICENSE covers original work; bundled third-party code retains the licenses reproduced in the prepared payload.
