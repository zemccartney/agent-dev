import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { AgentState } from "#caffeinate/model";

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function deadline(state: AgentState): number {
  assert.ok(state.lease, "Expected a live lease");
  return state.lease.deadlineAt;
}

export class FakeAssertionChild extends EventEmitter {
  pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  constructor(pid: number) {
    super();
    this.pid = pid;
  }
  kill(signal: NodeJS.Signals): boolean {
    this.signalCode = signal;
    queueMicrotask(() => this.emit("exit", null, signal));
    return true;
  }
}
