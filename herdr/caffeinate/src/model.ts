export interface Config {
  automatic: boolean;
  defaultDurationMs: number;
}
export type Phase = "working" | "idle" | "blocked" | "unknown" | "gone";
export interface Observation {
  occupant: string;
  phase: Phase;
  evidence: "authoritative" | "positive" | "uncertain";
}
export interface AgentState {
  occupant: string;
  runId: number;
  revision: number;
  phase: Phase;
  boundaryKnown: boolean;
  pending: null | { startAt: number; readyAt: number; deadlineAt: number };
  lease: null | { deadlineAt: number; origin: "automatic" | "manual" };
  armedDurationMs: number | null;
  suppressed: boolean;
}
export type ModelEvent =
  | { type: "observe"; observation: Observation }
  | { type: "tick" | "release" | "cancel-arm" }
  | { type: "manual"; durationMs: number };
export interface Guard {
  occupant: string;
  runId: number;
  revision: number;
}
export type Command =
  | (Guard & ({ type: "set-duration"; durationMs: number } | { type: "release" | "cancel-arm" }))
  | { type: "set-config"; config: Config };
export const DEFAULT_CONFIG = Object.freeze({ automatic: true, defaultDurationMs: 28_800_000 });
export function validateDuration(durationMs: unknown, now: number): asserts durationMs is number {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    Math.floor(durationMs) < 1 ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(now + Math.floor(durationMs)) ||
    !Number.isFinite(new Date(now + Math.floor(durationMs)).getTime())
  )
    throw new RangeError("Choose a positive, representable duration (at least 1 millisecond)");
}
export function initialState(occupant: string): AgentState {
  return {
    occupant,
    runId: 0,
    revision: 0,
    phase: "unknown",
    boundaryKnown: false,
    pending: null,
    lease: null,
    armedDurationMs: null,
    suppressed: false,
  };
}
/** Pure transitions; repeated observations never renew a deadline. */
export function reduce(
  state: AgentState,
  event: ModelEvent,
  now: number,
  config: Config = DEFAULT_CONFIG,
): AgentState {
  let s = structuredClone(state);
  if (event.type === "observe" && event.observation.occupant !== s.occupant)
    s = initialState(event.observation.occupant);
  if (event.type === "observe") {
    const o = event.observation;
    if (o.evidence === "uncertain" || o.phase === "unknown") {
      s.phase = "unknown";
    } else if (o.phase === "idle" || o.phase === "blocked" || o.phase === "gone") {
      s.phase = o.phase;
      s.boundaryKnown = o.phase !== "gone";
      s.pending = null;
      s.lease = null;
      s.suppressed = false;
      if (o.phase === "gone") s.armedDurationMs = null;
    } else if (o.phase === "working") {
      if (s.boundaryKnown) {
        s.runId++;
        s.boundaryKnown = false;
        s.suppressed = false;
        if (s.armedDurationMs !== null) {
          s.lease = { deadlineAt: now + s.armedDurationMs, origin: "manual" };
          s.armedDurationMs = null;
        } else if (config.automatic) {
          validateDuration(config.defaultDurationMs, now);
          s.pending = {
            startAt: now,
            readyAt: now + 10000,
            deadlineAt: now + Math.floor(config.defaultDurationMs),
          };
        }
      }
      s.phase = "working";
    }
  } else if (event.type === "manual") {
    validateDuration(event.durationMs, now);
    const duration = Math.floor(event.durationMs);
    if (s.phase === "gone") throw new Error("Agent is no longer available");
    if (s.phase === "idle" || s.phase === "blocked") {
      s.armedDurationMs = duration;
    } else {
      s.pending = null;
      s.lease = { deadlineAt: now + duration, origin: "manual" };
      s.suppressed = false;
    }
  } else if (event.type === "release") {
    s.pending = null;
    s.lease = null;
    s.suppressed = true;
  } else if (event.type === "cancel-arm") {
    s.armedDurationMs = null;
  }
  if (s.pending && s.pending.deadlineAt <= now) {
    s.pending = null;
    s.suppressed = true;
  }
  if (s.lease && s.lease.deadlineAt <= now) {
    s.lease = null;
    s.suppressed = true;
  }
  if (s.pending && s.phase === "working" && now >= s.pending.readyAt && !s.suppressed) {
    s.lease = { deadlineAt: s.pending.deadlineAt, origin: "automatic" };
    s.pending = null;
  }
  if (JSON.stringify(s) !== JSON.stringify(state)) s.revision = state.revision + 1;
  return s;
}
