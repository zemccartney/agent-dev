# Caffeinate for Herdr — trial

Automatically caffeinate local Pi and Claude Code runs. No model calls, dependencies to install, or changes to agent execution. macOS only; Node >=22.18.0 and Herdr >=0.9.3.

**Start with the [guided demo](docs/demo.md).** Real harness behavior and your UI experience are the remaining acceptance checks; this is not yet a promise of reliable overnight operation. See [validation](docs/validation.md) and the [design](docs/design.md).

## Install from any directory

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
- Tab to **Stop caffeinating** or **Cancel next run**, then Enter. Neither cancels agent work.
- `s`: global settings (automatic toggle and default hours). Space toggles automatic; Tab moves to duration; Enter saves. Changes affect future runs only.
- `?`: help. Escape goes back or closes. Ctrl+U clears a duration field. Escape/closing/detaching does not stop the monitor.

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

Disable releases owned assertions while agent work continues. To load changed source, disable, wait a few seconds, enable and invoke controls. If you move/merge the checkout, unlink and link its new plugin path. Do not delete a worktree while Herdr still points into it.

Settings live in the directory printed by `herdr plugin config-dir agent-dev.caffeinate`, in `settings.json`. Temporary runtime state and a sibling log live under the OS temp directory's `caffeinate-<uid>/` directory. An unavailable monitor reports its exact paths.

**Crash recovery is deliberately conservative:** SIGKILL releases the monitor's native assertions, but can leave an ownership directory. The next start refuses that stale lock rather than guessing which PID is safe to kill. Inspect the reported `owner.json` and process identity, confirm the original monitor is gone, then remove only that reported server-specific directory and invoke controls again. Do not remove another live monitor's directory, and do not kill a PID merely because an old file names it. Restarting the Herdr server is not a harmless workaround: it stops its panes.

## Development

```sh
cd "$PLUGIN"
npm test
npm run test:integration
# Explicitly opt in to brief, real macOS assertions:
npm run probe:assertions -- --allow-system-assertion
```

Tests use injected clocks, fake socket servers and child processes, without acquiring real OS assertions. The optional probe does acquire short assertions. No build or `npm install` step is required. The root repository LICENSE applies.
