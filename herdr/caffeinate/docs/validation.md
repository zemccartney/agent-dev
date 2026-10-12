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

## Remaining live checks

Real Pi and Claude runs: short response, silent tool, completion/cancel, permission wait, multiple agents, client detach. Physical battery transitions, display dark with work continuing, popup feel and sidebar row configuration. Record each separately; simulator tests do not satisfy these checks.
