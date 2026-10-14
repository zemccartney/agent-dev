import { initialState, reduce, DEFAULT_CONFIG } from "./model.js";
import { validateConfig } from "./config.js";
import type { AgentState, Config, Observation } from "./model.js";
import type { Power } from "./power.js";
import { errorCode, errorMessage, parseCommand } from "./validation.js";
export interface AgentRow {
  target: string;
  state: AgentState;
  active: boolean;
  error: string | null;
  label?: string;
}
export interface MonitorSnapshot {
  now: number;
  power: Power;
  config: Config;
  stopped: boolean;
  error: string | null;
  agents: AgentRow[];
}
export interface TrackedAgent {
  target: string;
  occupant: string;
  kind: string;
  record?: Record<string, unknown>;
}
export interface HerdrPort {
  hostStatus(): Promise<{ instance: string; local: boolean; pluginEnabled: boolean }>;
  list(): Promise<TrackedAgent[]>;
  observe(target: string): Promise<Observation>;
  publishToken(target: string, value: string | null, ttlMs?: number): Promise<unknown>;
  close(): void;
}
export interface AssertionsPort {
  reconcile(desired: Map<string, number>): Promise<ReadonlyMap<string, unknown>>;
  close(): Promise<void>;
}
interface MonitorOptions {
  herdr: HerdrPort;
  assertions: AssertionsPort;
  readPower: () => Promise<Power>;
  now?: () => number;
  config?: Config;
  persistConfig?: (config: Config) => Promise<void>;
  reloadConfig?: () => Promise<unknown>;
}
interface InternalRow extends AgentRow {
  token: string | null | undefined;
  tokenAt: number;
}

/** Serialized control plane. Never interprets an event payload as history. */
export function createMonitor({
  herdr,
  assertions,
  readPower,
  now = Date.now,
  config = DEFAULT_CONFIG,
  persistConfig = async () => {},
  reloadConfig,
}: MonitorOptions) {
  let prefs = validateConfig(config),
    rows = new Map<string, InternalRow>();
  let power: Power = "unknown",
    instance: string | null = null,
    stopped = false,
    chain = Promise.resolve(),
    error: string | null = null,
    gap = false;
  const serial = (fn: () => Promise<void>) => {
    const next = chain.then(fn);
    chain = next.catch(() => {});
    return next;
  };
  const key = (row: AgentRow) => `${row.state.occupant}:${row.state.runId}`;
  async function clear() {
    await assertions.close();
    await Promise.allSettled(
      [...rows.values()].map((row) => herdr.publishToken(row.target, null, 6000)),
    );
    for (const row of rows.values()) {
      row.active = false;
      row.state = initialState(row.state.occupant);
    }
    herdr.close();
    stopped = true;
  }
  async function sync() {
    if (stopped) return;
    power = await readPower().catch((): Power => "unknown");
    const desired = new Map<string, number>();
    for (const row of rows.values()) {
      row.state = reduce(row.state, { type: "tick" }, now(), prefs);
      if (row.state.lease && power === "ac") desired.set(key(row), row.state.lease.deadlineAt);
    }
    const active = await assertions.reconcile(desired);
    for (const row of rows.values()) {
      row.active = active.has(key(row));
      if (desired.has(key(row)) && !row.active && (desired.get(key(row)) ?? 0) - now() >= 1000)
        row.error = "Could not acquire caffeination assertion";
      else if (row.error === "Could not acquire caffeination assertion") row.error = null;
      // Refresh only every two seconds; otherwise event-driven refreshes can loop
      // through metadata notifications. Clearing a cup is immediate.
      const token = row.active ? "☕" : null;
      if (row.token !== token || now() - row.tokenAt >= 2000) {
        try {
          await herdr.publishToken(row.target, token, 6000);
          row.token = token;
          row.tokenAt = now();
        } catch (e) {
          row.error = `Sidebar unavailable: ${errorMessage(e)}`;
        }
      }
    }
  }
  async function refresh() {
    if (stopped) return;
    try {
      const host = await herdr.hostStatus();
      if (!host.local || !host.pluginEnabled || (instance && instance !== host.instance)) {
        await clear();
        return;
      }
      instance = host.instance;
      if (reloadConfig) prefs = validateConfig(await reloadConfig());
      const tracked = await herdr.list(),
        seen = new Set<string>();
      for (const agent of tracked) {
        seen.add(agent.occupant);
        let row = rows.get(agent.occupant);
        if (!row) {
          row = {
            target: agent.target,
            state: initialState(agent.occupant),
            active: false,
            error: null,
            token: undefined,
            tokenAt: 0,
          };
          rows.set(agent.occupant, row);
        }
        row.target = agent.target;
        if (gap) {
          row.state = { ...row.state, boundaryKnown: false };
        }
        try {
          const observation = await herdr.observe(agent.target);
          if (observation.occupant !== agent.occupant)
            throw new Error("Agent identity changed during observation");
          row.state = reduce(row.state, { type: "observe", observation }, now(), prefs);
          row.error = null;
          if (observation.evidence === "uncertain" && agent.kind === "pi" && !row.state.lease)
            row.error = "Pi lifecycle unavailable; install/update Herdr’s Pi integration";
        } catch (e) {
          row.state = reduce(
            row.state,
            {
              type: "observe",
              observation: { occupant: agent.occupant, phase: "unknown", evidence: "uncertain" },
            },
            now(),
            prefs,
          );
          row.error = errorMessage(e);
        }
      }
      for (const [occupant, row] of rows)
        if (!seen.has(occupant)) {
          await herdr.publishToken(row.target, null, 6000).catch(() => {});
          rows.delete(occupant);
        }
      gap = false;
      error = null;
    } catch (e) {
      if (errorCode(e) === "HOST_GONE") {
        error = errorMessage(e);
        await clear();
        return;
      }
      gap = true;
      error = errorMessage(e);
    }
    await sync();
  }
  return {
    refresh: () => serial(refresh),
    tick: () => serial(refresh),
    markGap: () =>
      serial(async () => {
        gap = true;
      }),
    command: (value: unknown) =>
      serial(async () => {
        if (stopped) throw new Error("Monitor stopped");
        const command = parseCommand(value);
        if (command.type === "set-config") {
          const next = validateConfig(command.config);
          await persistConfig(next);
          prefs = next;
          return;
        }
        // Re-read before honoring UI intent; a completed/replaced run rejects old guards.
        await refresh();
        if (stopped) throw new Error("Monitor stopped");
        const row = rows.get(command.occupant);
        if (!row || row.state.runId !== command.runId || row.state.revision !== command.revision)
          throw new Error("Agent changed; refresh controls and try again");
        const event =
          command.type === "set-duration"
            ? { type: "manual" as const, durationMs: command.durationMs }
            : { type: command.type };
        row.state = reduce(row.state, event, now(), prefs);
        await sync();
      }),
    snapshot: (): MonitorSnapshot => ({
      now: now(),
      power,
      config: { ...prefs },
      stopped,
      error,
      agents: [...rows.values()].map(({ target, state, active, error }) => ({
        target,
        state: structuredClone(state),
        active,
        error,
      })),
    }),
    close: () =>
      serial(async () => {
        if (!stopped) await clear();
      }),
  };
}
