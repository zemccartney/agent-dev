import type { AgentState, Command, Config, Phase } from "./model.js";
import type { MonitorSnapshot, AgentRow } from "./monitor.js";

export function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const items: unknown[] = value;
  return items.map(object);
}
export function errorCode(error: unknown): unknown {
  return object(error).code;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
export function isPhase(v: unknown): v is Phase {
  return v === "working" || v === "idle" || v === "blocked" || v === "unknown" || v === "gone";
}
function isConfig(value: unknown): value is Config {
  const v = object(value);
  return typeof v.automatic === "boolean" && number(v.defaultDurationMs);
}
function isState(value: unknown): value is AgentState {
  const v = object(value),
    p = object(v.pending),
    l = object(v.lease);
  return (
    typeof v.occupant === "string" &&
    number(v.runId) &&
    number(v.revision) &&
    isPhase(v.phase) &&
    typeof v.boundaryKnown === "boolean" &&
    typeof v.suppressed === "boolean" &&
    (v.armedDurationMs === null || number(v.armedDurationMs)) &&
    (v.pending === null || (number(p.startAt) && number(p.readyAt) && number(p.deadlineAt))) &&
    (v.lease === null ||
      (number(l.deadlineAt) && (l.origin === "automatic" || l.origin === "manual")))
  );
}
export function parseCommand(value: unknown): Command {
  const v = object(value);
  if (v.type === "set-config" && isConfig(v.config)) return { type: v.type, config: v.config };
  if (typeof v.occupant === "string" && number(v.runId) && number(v.revision)) {
    const guard = { occupant: v.occupant, runId: v.runId, revision: v.revision };
    if (v.type === "set-duration" && typeof v.durationMs === "number")
      return { ...guard, type: v.type, durationMs: v.durationMs };
    if (v.type === "release" || v.type === "cancel-arm") return { ...guard, type: v.type };
  }
  throw new Error("Invalid command");
}
export function parseMonitorResponse(value: unknown): { snapshot: MonitorSnapshot } {
  const s = object(object(value).snapshot);
  if (
    !number(s.now) ||
    !["ac", "battery", "unknown"].includes(String(s.power)) ||
    !isConfig(s.config) ||
    typeof s.stopped !== "boolean" ||
    !textOrNull(s.error) ||
    !Array.isArray(s.agents)
  )
    throw new Error("Invalid monitor snapshot");
  const agents: AgentRow[] = records(s.agents).map((a) => {
    if (
      typeof a.target !== "string" ||
      !isState(a.state) ||
      typeof a.active !== "boolean" ||
      !textOrNull(a.error)
    )
      throw new Error("Invalid monitor agent");
    return { target: a.target, state: a.state, active: a.active, error: a.error };
  });
  const power = s.power;
  if (power !== "ac" && power !== "battery" && power !== "unknown")
    throw new Error("Invalid power source");
  return {
    snapshot: { now: s.now, power, config: s.config, stopped: s.stopped, error: s.error, agents },
  };
}
