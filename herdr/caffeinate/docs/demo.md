# Your first caffeine run

This is a hands-on trial, not an overnight reliability claim. Start while plugged in and present, using Node 24.x. Independent review of the refactor is still pending; the normal trial has not been restarted or relinked automatically. Nothing below requires your agent project to live in this worktree.

## 1. Link the trial

First check the [prerequisites and development build steps](../README.md). A fresh source checkout needs `pnpm install --frozen-lockfile` and `pnpm build`; Herdr linking does not compile it. For the already-built trial worktree, run these from **any directory in a Herdr terminal**:

```sh
PLUGIN=/absolute/path/to/agent-dev/herdr/caffeinate
herdr plugin link "$PLUGIN"
herdr plugin action invoke agent-dev.caffeinate.controls
```

The absolute path tells Herdr where the code lives. Your projects stay where they are. No merge or `cd` is required to invoke an already-built plugin; rebuild after source edits. Keep that worktree around until you unlink or relink the plugin elsewhere.

The first controls action starts the background monitor for this Herdr server. If it finds a run already underway, that run intentionally has no automatic lease. Future server starts launch the monitor automatically. Named sessions: prefix each command with `herdr --session NAME`.

The popup opens the focused agent's controls, or offers an agent picker if invoked from a shell. Tab / **all agents** opens the list from a focused agent. The top **Agents (a)** tab returns from Settings or About without losing your detail/list position. Choose your Pi or Claude session using arrows or a click, then Enter / **open**. Pi needs Herdr's current integration; if prompted by the controls, install/update with `herdr integration install pi`, then restart/reload Pi. No additional Claude hook is installed.

## 2. Add the cup if you want it

The controls work immediately, but the sidebar cup requires one layout token. Follow the short [README sidebar instructions](../README.md#coffee-cup-in-the-sidebar), adding `"$caffeination"` to your existing Agents row and reloading Herdr config. This is deliberately not an automatic rewrite of your layout.

**Notice:** the cup means this session actually has an active OS assertion, not merely an eight-hour deadline. There is no expired badge and no cup while on battery.

## 3. Try a short exchange, then a longer run

First ask the agent a quick question. If it finishes inside ten seconds, the sidebar should remain quiet.

Next ask for something useful that takes a little longer. For a deterministic trial, ask the agent to run a harmless `sleep 25` and wait for it to finish; your harness may require permission. This is your normal agent interaction and may incur its normal model cost—the plugin makes no model requests itself.

**Watch for:**

1. No cup immediately.
2. A cup after about ten seconds of autonomous work, while plugged in.
3. An unchanged deadline through commentary and tool calls.
4. Cup disappears at confirmed completion, not at an intermediate message.

Open the controls during work. The prominent line should be a full timestamp such as `2026-10-12T08:42:15.123-04:00`, using your machine's timezone. The eight-hour deadline is anchored to the observed start, not ten seconds later.

**Question:** does the ten-second delay feel quiet enough without making you wonder whether caffeination is working?

## 4. Feel the manual controls

While a run is underway, enter `0.01` hours (36 seconds), then Enter. It replaces the deadline with 36 seconds from now. For a longer extension, enter whatever positive finite duration you need, including more than eight hours.

When those 36 seconds expire, the cup should disappear without interrupting the agent. Continued tool activity must not bring it back. Apply another duration to re-caffeinate explicitly.

Click **Stop caffeinating**, or press `r`. Again, agent work continues. No hidden per-session policy has changed.

**Watch for:** a deadline that updates predictably, no persistent expired label, and no need to read paragraphs to perform the action. If a run changes between opening the popup and applying a command, the control asks you to refresh/retry instead of applying your intent to a different run.

## 5. Arm the next run

After the agent settles, open controls, choose a duration, and apply **Set next run**. The popup says `Next run · … hours`; the sidebar has no cup yet. Cancel it once to try the control, then arm again.

Start work. Explicit arming skips the ten-second delay. After that run, the next run follows the global automatic/opt-in setting again.

**Question:** is the armed state discoverable enough inside the controls, or do you miss an indicator beside the agent? We intentionally left a second sidebar icon out of v1.

## 6. Optional power and detach checks

Only if you are comfortable testing these during noncritical work:

- Unplug: cup disappears; controls say `Paused · on battery`, with the same deadline. Reconnect before expiry: caffeine returns. Reconnect after expiry: it does not.
- Detach the Herdr client (`ctrl+b q`) and reattach. Work and caffeination continue under the server. **Do not use `herdr server stop` for this test**—that ends its panes.
- With two agents working, finish one. The other should retain its cup and deadline.

If you want OS-level evidence, run `pmset -g assertions`. Look for `caffeinate` and `PreventUserIdleSystemSleep`; the details identify the owning monitor PID. Other applications, and any manual caffeinate commands you already run, can hold separate assertions. Don't kill unrelated ones.

Don't close the lid or intentionally sleep the machine as part of this first pass. Display-off and real sleep behavior are separate manual acceptance checks, not proven by the UI.

## 7. Turn it off without stopping work

```sh
herdr plugin disable agent-dev.caffeinate
```

Cups/assertions should disappear within a few seconds while agents continue. If you like it:

```sh
herdr plugin enable agent-dev.caffeinate
herdr plugin action invoke agent-dev.caffeinate.controls
```

Already-running work needs manual caffeination after that restart. To remove registration, use `herdr plugin unlink agent-dev.caffeinate`; the worktree remains intact.

## What building it taught us

- **A report being accepted is not proof it took effect.** Herdr requires proper session-start anchoring for authoritative Pi reports. We check the effective authority, not merely a successful API acknowledgement.
- **Claude's idle is not one thing.** Positive prompt/terminal evidence differs from fallback idle. Fallback alone must not release an existing lease or restart its clock.
- **Herdr has useful UI primitives, with limits.** The cup is a display-only token; controls are a terminal popup. Popup placement follows the active pane, but the action carries its captured target so focus changes don't retarget commands. No custom right-click integration.
- **Historical native cleanup evidence is more than an exit handler.** Before this refactor, short timeout, owner exit, owner SIGKILL, actual monitor SIGKILL and server stop were checked against macOS assertions. The current bundle has not repeated those native checks. The monitor's disappearance releases its children even when JavaScript cleanup cannot run.
- **Restart recovery trades convenience for safety.** Leases aren't persisted or resurrected. A SIGKILL may leave a stale monitor directory requiring explicit cleanup; the plugin refuses to kill or steal ownership from an arbitrary PID.
- **You can distinguish caffeine from progress.** Disabling/expiring caffeine left the simulated working agent running. The plugin does not control execution or spending.

## Still to learn from your use

The refactored bundle passed a source-free, no-agent Herdr test of singleton startup, target propagation, popup editing/navigation, resize and cleanup. That historical run does not substitute for the agent/native checks below or acceptance of the later review repairs. The initial independent review produced seven accepted findings; repairs receive a separate fresh review. The raised minimum Node 24.11.0 binary has not been exercised; current execution evidence is on 24.16.0.

- Actual Pi/Claude behavior across your usual long tools, permission prompts, retries and cancellations. Protocol simulations and unit tests don't establish real-harness reliability.
- Whether AC-only feels disruptive. Physical battery transitions and display-off work still need hands-on validation.
- Whether the popup's numeric-hours field, keyboard navigation and raw timestamp feel minimal enough.
- Whether process/evidence polling has noticeable overhead with many concurrent agents. This first version favors evidence checks over caching.
- Whether conservative crash recovery is acceptable or worth a more sophisticated supervisor later.

Detailed results and unverified cases: [validation.md](validation.md). Please try a short, attended run before trusting it with lunch or overnight work.
