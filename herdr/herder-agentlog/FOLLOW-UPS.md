# herder-agentlog — follow-ups

Living record of ideas raised during design. Nothing here silently expands v0. “Fast-follow” records intent, not a delivery date or an approved implementation.

Current decisions: [DISCUSSION.md](DISCUSSION.md).

## Requested fast-follows

### Claude Code support

- Motivation: frequent work use while transitioning to Pi.
- Herdr already reports Claude session identity and supports `claude --resume <id>`.
- Investigate historical discovery, native names, meaningful human recency, and adapter-specific restoration tests.
- Preserve the same registry behavior rather than building a second catalog.

### Resolve native-name / registry-label divergence

- V0 uses native names by default and supports an optional registry-only label override, with explicit explanatory UI text.
- Motivation: users may expect their registry label to appear in Pi's `/resume` picker or work in a native resume command.
- Investigate native-name updates/synchronization and conflict ownership. Do not assume bidirectional synchronization is the solution before testing it.
- Pi currently documents `--session` as accepting a path or ID, not a friendly name. Name synchronization alone does not create CLI name aliases.

## Revisit after day-to-day use

### Morning work-set recovery

- Desired scenario: shut down with ten agent conversations open; next morning reopen the three relevant ones and show a note about the others.
- V0 pins only influence catalog ordering; they do not request automatic launch.
- Later decisions: explicit restore sets vs inferred choices, startup consent, duplicate prevention, and reliable coordination with native Herdr restoration.

### Richer prioritization

- Start with manual pins and recency measured only by submitted user messages. Opening or viewing a conversation does not update recency. Avoid inferred importance in v0.
- Consider whether long-running tasks should influence ranking once finished or when the user returns.
- Herdr's built-in priority is runtime attention ranking, not durable work importance; it is not an off-the-shelf morning-selection algorithm.

### Startup cue and readiness presentation

- V0: one silent, nonblocking availability notification when a fresh server's registry becomes usable and visible to a client; no repeated cue on ordinary reattach.
- Evaluate both directions after actual use: a louder or more informative recovery note, or subtler inline readiness/disabled-until-ready behavior for the registry entry point.
- More specific missing-session alerts require a reliable expected-open model; an intentionally closed conversation is not a restoration failure.
- Do not treat startup hook execution as proof that native agent restoration has completed.

### Optional housekeeping

- User explicitly prefers no automation initially.
- If the archive grows unwieldy, consider opt-in aging suggestions or retention controls—not silent pruning or transcript deletion.
- No separate Completed status unless experience demonstrates a meaningful distinction from Archive.

### Upstream Herdr report / contribution

- Share the reproducible shutdown-ordering failure and evaluate whether a core fix or optional persistence policy is appropriate.
- Plugin adoption and personal usage can inform an upstream proposal; building a plugin does not rule out reporting the underlying issue sooner.
- Existing diagnostic evidence and harness are currently in temporary directories referenced by the original investigation; preserve/redact them durably before relying on them for a future report.

## Deliberately out of v0; not promised roadmap items

- Detecting agent processes outside the current Herdr namespace, including ordinary terminals.
- Multi-namespace or remote-machine navigation and cross-machine registry synchronization.
- Transcript-content search.
- Directory relocation / repository move repair.
- Exact tab/split layout, shell environment, development-server, or original-process restoration.
- A general cross-harness metadata protocol before concrete Pi and Claude needs establish one.

Keep this file updated as decisions change; move an item into active scope only with explicit agreement.
