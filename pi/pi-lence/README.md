# pi-lence

A quieter Pi conversation, with a response browser and session-local named pins.
Runs independently of Herdr, in regular and fullscreen Pi.

**Unpublished release candidate.** Requires a compatible Pi installation; tested
with **Pi 1.3.0**. Uses Pi's runtime: no separate Node installation, compiler or
pnpm setup is required for Pi-lence. Its Node `>=22.19.0` package metadata matches
that host's runtime requirement; Pi's installer can arrange Node for you.

The tarball contains TypeScript, its manifest, this README and the canonical MIT
license. Wildcard host peers do not promise compatibility with every Pi version.
Maintenance is personal-first and best-effort; see the repository's
[maintenance policy](https://github.com/zemccartney/agent-dev/blob/dev/MAINTENANCE.md).

## Install

Until publication, an explicitly chosen checkout can be installed locally:

```sh
pi install /absolute/path/to/agent-dev/pi/pi-lence
pi
```

This changes your personal Pi settings. Keep the checkout at that path. To update,
use `git pull --ff-only` there, then `/reload` or restart Pi. To remove it:

```sh
pi remove /absolute/path/to/agent-dev/pi/pi-lence
```

Removal unregisters the package; it does not delete your checkout or saved pins.
`pi list` shows the registered source. If the checkout moved, remove its old source
and install the new path. Do not load the same extension twice with an additional
`-e` argument.

After an approved npm publication, the intended command will be
`pi install npm:@grepco/pi-lence`. **That public installation is not available or
verified yet.** Local tarball tests do not establish npm scope access or registry
installation. For a no-registration trial, use
`pi -e /absolute/path/to/agent-dev/pi/pi-lence/src/reference-ui.ts` instead.

## Use

| Action                            | Keyboard      | Fullscreen mouse  |
| --------------------------------- | ------------- | ----------------- |
| Quiet / Raw tool display          | Ctrl+Alt+Q    | View button       |
| Pin/unpin latest response         | Ctrl+Alt+P    | Pin latest button |
| Open response browser             | Ctrl+Alt+R    | Responses button  |
| Switch Pins / All                 | Tab           | Tab label         |
| Select / read                     | Arrows, Enter | Response row      |
| Pin/unpin the response being read | `p`           | Pin / Unpin       |
| Return from reader to list        | `b`           | Back              |
| Close and return to draft         | Escape        | Close             |

Regular mode leaves mouse handling to your terminal; use the keyboard controls.
Terminal support for modified shortcuts varies. Naming uses Enter to save and
Escape to cancel. Empty names are rejected. Arrows and PageUp/PageDown scroll;
Home/End reach the ends of a response. Resize a very small terminal if prompted.

The browser opens on **Pins**. **All** includes earlier assistant responses, which
can be pinned retroactively. Search matches response text and pin names in the
current tab, not thinking or tool output. Browsing never submits/replaces your
draft or calls the model. Reader positions last until the extension reloads.

Pins belong to stable message IDs on the active session branch. They are stored
as append-only `response-references.pin.v1` entries, outside model context.
Resume restores them; a fork excludes pins targeting abandoned history. Use a
saved session, not `--no-session`, to keep pins across exits.

## Quiet / Raw

Quiet hides successful routine calls/results for `read`, `write`, `edit`, `bash`,
`powershell`, `grep`, `find` and `ls`. It does not change tool execution, history,
model context, your messages, assistant prose or your thinking-display setting.
Raw restores native rendering, including its collapsed state: **Ctrl+O** expands
native tool output. The reference browser contains assistant prose, not tool results.

Pi's ordinary Working indicator stays intact. After **60 seconds without a
model/tool update**, its label uses the native warning color:

```text
Working · no updates for 90s · bash
```

New activity, completion, cancellation, session replacement and reload clear the
override. Open extension dialogs suppress it; native retry/compaction indicators
retain their own wording and priority. Polling does not count as activity.

This is a warning, not stall detection: healthy silent work and a hung command can
look identical. A chatty hung process can look active; sleeping the computer can
increase the reported age. Use Raw to inspect details.

Failed results and unfamiliar tools remain visible. Native dialogs, notifications,
provider errors and cancellation displays are not replaced. Warnings embedded in
otherwise successful shell output cannot reliably be recognized and may be hidden.
There is no cross-session pin library or automatic checklist updating.

## Development and evidence

From a prepared repository checkout:

```sh
mise exec -- pnpm --filter @grepco/pi-lence check
mise exec -- pnpm --filter @grepco/pi-lence pack:candidate -- /tmp/pi-lence-candidate
```

Use a fresh output directory; packing refuses to overwrite an existing tarball.
It prints the artifact path and SHA-256, stages consumer-only metadata and copies
the root license without modifying source. It does **not** publish.

The full check includes formatting/types/lint, fast regressions, a separately
identified pinned-SDK smoke, and real-host tests against the packed artifact.
Expect roughly two minutes for the real elapsed-time warning cases.
`check:contracts` is the faster subset, **not** the complete acceptance gate.

| Actual-host target                         | Evidence on this branch                        |
| ------------------------------------------ | ---------------------------------------------- |
| macOS ARM64, Node 22.19.0 and 24.16.0      | Local packed-host suites passed on Pi 1.3.0    |
| Ubuntu 24.04 x64, Node 22.19.0 and 24.16.0 | Advisory CI configured; hosted results pending |
| Other hosts/platforms/runtimes             | Not verified                                   |

Real-host tests cover managed tarball install/reinstall/removal, print/JSON/RPC,
regular/fullscreen UI, keyboard and fullscreen mouse access, saved pins,
new/resume/fork/reload, dialogs, errors, draft preservation, resize/Unicode,
and actual warning completion/cancellation. They use private homes and a
network-free test provider, not personal credentials or a normal installation.

The SDK smoke uses some private host components and controlled events; it is not
substituted for those CLI tests. Live-provider retries, actual computer sleep,
public registry installs and a comprehensive release security review remain
outside this evidence. The initial owner daily-use trial is accepted; no new soak
period is required.

See the repository's [development protocol](https://github.com/zemccartney/agent-dev/blob/dev/DEVELOPMENT.md)
for the disposable interactive demo and cleanup. Styling and README wording remain
subject to owner review before publication.

## License

MIT. Every candidate tarball includes the repository's canonical `LICENSE`.
