import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { formatLocalDeadline, presentAgent, safeText } from "#caffeinate/presentation";
import { initialState, type AgentState } from "#caffeinate/model";
void test("deadline uses local ISO milliseconds and deadline-specific DST offset", () => {
  const cases = [
    ["America/New_York", "2026-10-11T18:00:00.123Z", "2026-10-11T14:00:00.123-04:00"],
    ["America/New_York", "2026-12-11T18:00:00.123Z", "2026-12-11T13:00:00.123-05:00"],
    ["Asia/Kolkata", "2026-10-11T18:00:00.123Z", "2026-10-11T23:30:00.123+05:30"],
    ["UTC", "2026-10-11T18:00:00.123Z", "2026-10-11T18:00:00.123+00:00"],
  ];
  for (const [TZ, date, want] of cases) {
    const p = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {formatLocalDeadline} from '#caffeinate/presentation';console.log(formatLocalDeadline(Date.parse('${date}')))`,
      ],
      { env: { ...process.env, TZ }, encoding: "utf8" },
    );
    assert.equal(p.status, 0);
    assert.equal(p.stdout.trim(), want);
  }
  assert.throws(() => formatLocalDeadline(Infinity), /date|deadline/i);
});
void test("cup reflects actual assertion only; expired and released are ordinary inactive", () => {
  const s: AgentState = {
    ...initialState("a"),
    phase: "working",
    lease: { deadlineAt: 1800000010000, origin: "manual" },
  };
  assert.equal(presentAgent({ state: s, active: true }, "ac").cup, "☕");
  assert.equal(
    presentAgent({ state: s, active: false }, "battery").headline,
    "Paused · on battery",
  );
  for (const state of [
    { ...s, lease: null, suppressed: true },
    { ...s, phase: "idle", lease: null },
    { ...s, phase: "blocked", lease: null, armedDurationMs: 7200000 },
  ] satisfies AgentState[])
    assert.equal(presentAgent({ state, active: false }, "ac").cup, "");
  assert.equal(
    presentAgent(
      { state: { ...s, phase: "idle", lease: null, armedDurationMs: 7200000 }, active: false },
      "ac",
    ).headline,
    "Next run · 2 hours",
  );
  assert.equal(
    presentAgent({ state: { ...s, lease: null }, active: false }, "ac").headline,
    "Not caffeinated",
  );
});
void test("untrusted errors cannot inject terminal escape/control sequences", () => {
  assert.equal(safeText("bad\x1b[2J\x07\rname"), "badname");
});
