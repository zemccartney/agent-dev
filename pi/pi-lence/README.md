# pi-lence

A quieter Pi conversation, with a response browser and session-local named pins.
Runs independently of Herdr, in regular and fullscreen Pi.

## Prerequisites

- [Pi](https://pi.dev): **1.3.0** is the oldest version covered by the host test suite.
- Node **>=22.19.0**, matching [Pi 1.3.0's runtime requirement](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/package.json). Pi-lence uses Pi's runtime.

## Install

```sh
pi install npm:@grepco/pi-lence
```

See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
for updates, removal and installation options.

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

Pins belong to the active session branch. Resuming restores them; forking keeps
only pins whose responses remain in the fork's history. Use a saved session, not
`--no-session`, to keep pins across exits.

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

[Changelog](https://github.com/zemccartney/agent-dev/blob/dev/pi/pi-lence/CHANGELOG.md)
· [Development and maintenance](https://github.com/zemccartney/agent-dev/blob/dev/pi/pi-lence/docs/maintenance/README.md)
