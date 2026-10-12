# Validation record

## Platform gates — 2026-10-12

- macOS; Node 24.16.0; Herdr 0.9.3, protocol 22.
- `npm test`: 2 probe tests passed after missing-module RED.
- `npm run probe:assertions -- --allow-system-assertion`: PASS timeout, owner SIGTERM, owner SIGKILL, explicit child SIGTERM. Each assertion was observed via `pmset -g assertions` and absent after exit. Validated argv: `caffeinate -i -w OWNER_PID -t WHOLE_SECONDS`, no wrapped utility. Probe max 15 seconds.
- Actual `pmset -g batt` on this machine: `Now drawing from 'AC Power'` (desktop/no battery listing). Battery parsing must also handle the documented `Battery Power` heading; physical unplug testing remains pending.
- Disposable Herdr server under isolated XDG config/state `/tmp/caffeine-herdr-test`, named `caffeine-validation`; normal server/config untouched.
- `agent.get` exposes terminal_id, agent_session, state_change_seq, screen_detection_skipped. `agent.explain` exposes authoritative skip reason or positive matched_rule/visible flags and fallback_reason. Live Pi-shaped simulator authority confirmed after session-start anchoring; acknowledgement of a report before anchoring had no effect. This is not a real Pi model run.
- Claude positive working/idle/blocked evidence confirmed using installed `agent explain --file` on synthetic screens; fallback produces no matched rule. No private transcript contents committed.
- Server identity can use owned local socket device/inode/birth time. `lsof -n -Fpc SOCKET` identifies a local `herdr` server PID; plugin.list supplies enabled state. Local foreground agent PIDs can be checked against OS process identity; remote/SSH foreground commands are not eligible.
- Versioned source and installed schema confirm subscription events and plugin registry reads. Lifecycle restart/loss/replacement, disable, popup, and real agent scenarios remain downstream validation tasks.

## Implemented-path validation

- `npm test`: 49/49 passing at the first full integration checkpoint; final count is reported in handoff after review fixes.
- `npm run test:integration`: fake Herdr Unix socket -> production evidence adapter -> production model/monitor -> real child processes (substituted for OS assertions); 4/4 passing including runtime singleton tests. No paid model calls.
- Actual disposable Herdr plugin link accepted the manifest. Controls action initially exposed a real API constraint: popup placement rejects `target_pane_id`. Fixed with a RED/GREEN regression by passing captured target only in popup environment. Repeated action succeeded.
- Real Herdr client attached in a pseudoterminal: popup rendered, Escape closed it, client detach exercised. No normal Herdr config was changed.
- Native Pi-shaped simulator, with proper session-start anchor: idle -> working -> ten-second delay acquired a real `PreventUserIdleSystemSleep` assertion and coffee metadata; deadline remained anchored to start.
- Plugin disable: monitor and its caffeinate child exited, coffee token cleared, simulator stayed working.
- Actual production monitor SIGKILL: its macOS assertion disappeared. Verified-dead disposable runtime directory removed explicitly, then restart showed no restored lease and no automatic adoption of ongoing work.
- Manual three-second lease on production monitor expired, without ending simulated work.
- Confirmed Herdr server stop with active caffeine: assertion released and monitor exited. Regression distinguishes missing server ownership from transient read failure.
- Production assertion helper independently passed a real short native timeout. Unrelated existing caffeinate assertions were observed but never modified.
- Stale UI guard fired once during the monitor's initial discovery (snapshot before first observation completed); retry after discovery succeeded. Treat this as a usability wrinkle, not a reason to remove identity/revision guards.

## Remaining live checks

Real Pi and Claude runs: short response, silent tool, completion/cancel, permission wait, multiple agents, client detach. Physical battery transitions, display dark with work continuing, popup feel and sidebar row configuration. Record each separately; simulator tests do not satisfy these checks.
