# pi-lence

A quieter pi conversation, with a response browser and session-local named pins.
First trial release (0.1.0), tested with **pi 1.1.0's fullscreen TUI in Herdr**.
Styling remains provisional. The source tests require Node.js 22.18 or later.

## Install once, then launch normally

From the `agent-dev` repository root:

```sh
pi install ./pi/pi-lence
pi
```

Or from this package directory, run `pi install .`. This registers the package
in your personal pi settings and loads it on future launches, regardless of
working directory. No build or `npm install` is needed: pi provides the runtime
libraries listed as peer dependencies. Only `reference-ui.ts` is an extension
entry point; helper modules and tests are not independently loaded.

To install on another machine, first clone
`https://github.com/zemccartney/agent-dev.git`, then run the commands above.
The package is not published to npm yet. Pi 1.1.0's Git installer does not select
subdirectory packages, so install the local `pi/pi-lence` folder, not the repo
root or its Git URL.

### Updating and developing

Run `git pull --ff-only` in the checkout to receive pushed changes, then restart
pi or use `/reload`. Local edits also take effect on `/reload`. Local-path
packages are excluded from pi's package update notifications and `pi update`;
use Git for updates until a standalone package is published.

Pi records the resolved package path. Keep the checkout in place. If you move
it, remove the old source and install the new one:

```sh
pi remove /absolute/old/agent-dev/pi/pi-lence
pi install /absolute/new/agent-dev/pi/pi-lence
```

`pi list` shows the registered source. To uninstall, use `pi remove` with that
source and restart pi. This removes registration, not your checkout or pins.

**Coming from the original spike:** restart pi without the old
`-e ./spikes/reference-ui.ts` argument; that file has moved. From the same working
directory, `pi --continue` resumes your saved conversation with the installed
extension. Do not use `--no-session` if you want pins to survive exit.

### Try without installing

From the repository root:

```sh
pi --tui-mode fullscreen -e ./pi/pi-lence/reference-ui.ts
```

Use this alternative only when the package is not already installed.

## Interaction

Controls sit at the right below the composer:

- **View: Quiet / View: Raw** switches tool presentation (see below).
- **Pin latest** opens a naming form for the latest assistant response. After
  saving, it becomes **Unpin latest**. Clicking again removes that pin.
- The latest-response control is disabled while pi is busy or history is empty.
  A newly completed agent run updates which response it targets; older pins stay.
- **Responses** opens on **Pins**, with an **All** tab for the rest of the history.
  The active tab is accent-colored and bold; the inactive tab is muted. Select a
  response to read it, then **Pin** or **Unpin** it. This also works retroactively.
- Search matches **full assistant-response text and pin names** within the current
  tab, case-insensitively. It does not search thinking, tool output, or timestamps.
  Rows use the whole width: a pin name in Pins, or a response's first line in All.
  A ◆ marks pinned responses in All. There is no timestamp/description side column.
  A spacer row with a short muted divider separates entries; divider clicks do
  nothing. Fewer entries fit per page, but the modal stays the same size.
- Click or press Enter to read; Tab switches lists. Use the wheel, arrows, or
  PageUp/PageDown to browse long lists or responses. Home/End also work in the
  reader. **Back** returns to the list; **Close** or Escape returns to your draft.
- Naming starts with a **blank input**. Enter a memorable name; Enter saves and
  Escape cancels. Saving an empty name is not allowed.
- The modal uses a fixed 90% of the pane's height and up to 95% of its width, with
  more spacing between controls. Lists and responses scroll inside it; adding
  results or searching does not grow or shrink it. The background is neutral.
- Ctrl+Alt+P toggles the latest pin; Ctrl+Alt+R opens the browser. Terminal shortcut
  support varies. No conversation commands are required for normal use.

The overlay owns keyboard input until dismissed. Your main draft is not replaced
or submitted. Reading positions are remembered while this extension stays loaded.

## Quiet / Raw

Quiet is the default on extension load. It hides routine call arguments and result
text for `read`, `write`, `edit`, `bash`, `powershell`, `grep`, `find`, and `ls`.
Your messages and the agent's prose, including interim acknowledgments, remain in
the ordinary transcript. Older turns are **not** hidden, and your thinking-display
setting is unchanged.

Click **View: Quiet** to switch to Raw, or use Ctrl+Alt+Q. Raw restores the tools'
normal renderers and respects pi's existing collapsed/expanded setting; use Ctrl+O
to expand their output. Switching modes does not alter execution, session data,
model context, or your draft. Pins still work in either mode.

Pi's ordinary **Working** indicator is unchanged during normal activity. There is
no additional status row. After **60 seconds without a model/tool update**, its
existing label becomes a yellow/amber warning (using the theme's warning color):

```text
Working · no updates for 90s · bash
```

New activity immediately restores pi's normal wording. The timer never counts
its own redraws as activity. The warning is suppressed while an extension dialog
is open; pi's retry and compaction indicators keep their own wording and priority.
Completion, cancellation, session switching, and reload clear our label override.

This is a yellow flag, not a confirmed stall. A silent healthy command and a hung
command can look identical; Raw is available to inspect the details. A chatty hung
process can still appear active. A clock jump after sleep increases the displayed
age; the extension cannot update while the machine sleeps or after pi crashes.

Safety boundaries for this prototype:

- Failed tool results remain visible in both modes, using pi's explicit error flag.
- Native permission dialogs, notifications, provider errors, retry/compaction
  indicators, and cancellation displays are not replaced or suppressed.
- We no longer add separate dialog, failure, or cancellation notices; pi's own
  dialogs and transcript messages provide that feedback.
- Unfamiliar tools remain visible. Inline images remain visible. Warnings or
  interactive requests printed as ordinary successful shell output cannot be
  reliably recognized; use Raw when activity is unexpectedly quiet.

### Quiet-mode checkpoint

1. Ask for a small task that uses tools. Compare Quiet and Raw during and after it.
2. Notice whether the remaining prose feels like a readable conversation rather
   than a log. Errors and dialogs should still demand attention.
3. To exercise the warning, ask the agent to run `sleep 70` through its bash tool
   with a timeout of at least 90 seconds. The composer should look normal for the
   first minute, then show the yellow warning, and clear it when the command ends.
   This checks visibility of a wait, not stall detection.
4. Switch back to Raw to inspect the same tool history; check that pins and an
   unsent draft still behave normally.

## Pinning checkpoint — checklist plus a detour

1. Get a checklist, click **Pin latest**, and name it.
2. Confirm the button changes to **Unpin latest**. Optionally unpin/re-pin it.
3. Ask follow-ups. The control should disable while working, then refer to the new
   response. Find the original checklist under **Responses → Pins**.
4. Open **All**, find an older unpinned response, read it, and pin it there.
5. Leave an unsent draft, open a reference, scroll, close, and continue typing.
6. In a saved session, reload or resume it and verify the pins are still there.

Notice whether locating, naming, and repeatedly consulting references feels easy,
particularly whether closing the reader to compose a reply gets in your way.
This feedback determines the next interaction change, not visual polish yet.

## Scope and storage

- The browser reads the current session branch, including original entries still
  stored before compaction. It lists assistant messages containing prose; that
  includes textual acknowledgments, not just final answers. Thinking and tool
  blocks are excluded. The full main transcript is untouched.
- New run output is refreshed when the agent settles. A pin targets a stable
  message ID, not whichever response happens to be latest when the label is saved.
- Pins are append-only `response-references.pin.v1` custom session entries.
  They follow the active branch and do **not** enter model context. Browsing,
  naming, and unpinning do not call the model or rewind the conversation.
- No checklist auto-updates, excerpts, user-message browsing, cross-session
  reference library, or “respond to this” action yet.

## Verification

From `pi/pi-lence`:

```sh
npm test
```

State tests cover filtering, identity, metadata replay, unpinning, branch scope,
and the 60-second warning threshold, activity reset, dialog suppression, settlement,
and a sleep-sized gap.
Additional development smoke checks exercised busy-state guards, labels, both
lists, full-text/name search, scroll position, active tabs, blank naming, and
fixed-height rendering with 120 responses and pane resizing, spaced-row click
mapping, and inert separators. A fullscreen
pseudoterminal trial verified mouse pin/unpin, retroactive pinning, reader/draft
focus, and Pins opening by default after restarting pi. Real Herdr usability
remains the human checkpoint.

Quiet-mode development checks compared all eight wrapped tool renderers with pi's
native Raw text rendering, confirmed failed/unknown tools stay visible, and
simulated waiting, dialog, provider-failure, cancellation, and recovery events.
The integration check verifies that pi's package resolver exposes only the
extension entry point, then uses pi's real status components and label API with
a controlled clock. It covers warning color, normal-label restoration,
retry/compaction precedence, and timer/override cleanup:

```sh
npm run test:integration -- /path/to/node_modules/@earendil-works/pi-coding-agent
```

A fullscreen pseudoterminal trial verified Quiet/Raw clicks, intact transcripts,
a native permission dialog, stored tool/provider failures, and draft preservation.
Live provider retries and actual machine sleep have **not** been end-to-end tested.

Development browser mockups are untracked under the repository's
`.superpowers/brainstorm/` directory and are not part of this package.

## License and future distribution

MIT, under the repository's [root license](../../LICENSE). Before publishing a
standalone npm release, include that license text in the published archive.
See the repository's [scratch ideas](../../docs/ideas.md) for possible future work.
