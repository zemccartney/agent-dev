import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { runPopup, type PopupRequest } from "#caffeinate/popup";
import { initialState } from "#caffeinate/model";
import type { MonitorSnapshot } from "#caffeinate/monitor";
import { makeTestTerminal } from "./helpers/terminal.ts";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const snapshot: MonitorSnapshot = {
  now: 1800000000000,
  stopped: false,
  error: null,
  power: "ac",
  config: { automatic: true, defaultDurationMs: 28800000 },
  agents: [
    {
      target: "p1",
      state: { ...initialState("a"), phase: "working", revision: 7 },
      active: false,
      error: null,
    },
  ],
};
void test("close interrupts initial snapshot, labels, refresh and command without late paints or duplicate requests", async (t) => {
  for (const phase of ["snapshot", "labels", "refresh", "command"] as const) {
    await t.test(phase, { timeout: 4000 }, async (t) => {
      const screen = makeTestTerminal({ columns: 80, rows: 20 });
      t.after(() => screen.dispose());
      const pending = deferred<{ snapshot: MonitorSnapshot }>();
      const labels = deferred<Record<string, string>>();
      const started = deferred<void>();
      let calls = 0,
        closed = 0;
      const messages: PopupRequest[] = [];
      const done = runPopup({
        terminal: screen.terminal,
        target: "p1",
        client: {
          request(message) {
            messages.push(message);
            calls++;
            if (
              phase === "snapshot" ||
              (phase === "refresh" && calls > 1) ||
              (phase === "command" && message.type === "command")
            ) {
              started.resolve();
              return pending.promise;
            }
            return Promise.resolve({ snapshot: structuredClone(snapshot) });
          },
          close() {
            closed++;
          },
        },
        loadLabels: () => {
          if (phase === "labels") {
            started.resolve();
            return labels.promise;
          }
          return Promise.resolve({});
        },
      });
      if (phase === "command") {
        await screen.waitFor("Set from now");
        screen.send("1\r\r");
      }
      await started.promise;
      screen.send(phase === "labels" ? "\x03" : "\x1b");
      await done;
      const output = screen.text();
      if (phase === "refresh") pending.reject(new Error("late refresh failure"));
      else pending.resolve({ snapshot });
      if (phase === "labels") labels.reject(new Error("late label failure"));
      else labels.resolve({ p1: "late" });
      await wait(30);
      assert.equal(screen.text(), output);
      assert.equal(closed, 1);
      assert.equal(screen.stopCount, 1);
      assert.equal(
        messages.filter((message) => message.type === "command").length,
        phase === "command" ? 1 : 0,
      );
      screen.send("\x03");
      assert.equal(closed, 1);
    });
  }
});
void test("initial request rejection restores terminal and closes client once", async (t) => {
  const screen = makeTestTerminal({ columns: 80, rows: 20 });
  t.after(() => screen.dispose());
  let closed = 0;
  await assert.rejects(
    runPopup({
      terminal: screen.terminal,
      client: {
        request: async () => {
          throw new Error("initial failure");
        },
        close() {
          closed++;
        },
      },
    }),
    /initial failure/,
  );
  assert.equal(screen.stopCount, 1);
  assert.equal(closed, 1);
});
void test("input termination closes popup without sending a monitor command", async (t) => {
  const screen = makeTestTerminal({ columns: 80, rows: 20 });
  t.after(() => screen.dispose());
  let closed = 0;
  const done = runPopup({
    terminal: screen.terminal,
    target: "p1",
    client: {
      request: async (message) => {
        assert.equal(message.type, "snapshot");
        return { snapshot };
      },
      close() {
        closed++;
      },
    },
  });
  await screen.waitFor("Set from now");
  process.stdin.emit("end");
  await done;
  assert.equal(closed, 1);
  assert.equal(screen.stopCount, 1);
});
