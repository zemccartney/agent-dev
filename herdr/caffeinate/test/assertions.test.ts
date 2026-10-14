import test from "node:test";
import assert from "node:assert/strict";
import { FakeAssertionChild } from "./helpers.ts";
import { createAssertions } from "#caffeinate/assertions";
function fixture() {
  let time = 10000;
  const calls: { bin: string; args: string[]; child: FakeAssertionChild }[] = [],
    exits: [string, unknown][] = [];
  let pid = 100;
  const spawn = (bin: string, args: string[]) => {
    const child = new FakeAssertionChild(++pid);
    calls.push({ bin, args, child });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  return {
    calls,
    exits,
    setTime: (n: number) => (time = n),
    manager: createAssertions({
      spawn,
      ownerPid: 77,
      now: () => time,
      onExit: (...a) => exits.push(a),
    }),
  };
}
void test("assertions use finite floor timeout, owner PID and no display flags", async () => {
  const f = fixture();
  let a = await f.manager.reconcile(
    new Map([
      ["a", 12900],
      ["short", 10900],
      ["old", 9999],
    ]),
  );
  assert.equal(a.size, 1);
  assert.deepEqual(f.calls[0].args, ["-i", "-w", "77", "-t", "2"]);
  assert.equal(f.calls[0].bin, "/usr/bin/caffeinate");
  a = await f.manager.reconcile(new Map([["a", 12900]]));
  assert.equal(f.calls.length, 1);
  await f.manager.close();
  assert.equal(f.calls[0].child.signalCode, "SIGTERM");
});
void test("replacement and removal do not affect independent leases", async () => {
  const f = fixture();
  await f.manager.reconcile(
    new Map([
      ["a", 20000],
      ["b", 30000],
    ]),
  );
  const b = f.calls[1].child;
  await f.manager.reconcile(
    new Map([
      ["a", 40000],
      ["b", 30000],
    ]),
  );
  assert.equal(f.calls[0].child.signalCode, "SIGTERM");
  assert.equal(b.signalCode, null);
  await f.manager.reconcile(new Map([["b", 30000]]));
  assert.equal(f.calls[2].child.signalCode, "SIGTERM");
  await f.manager.close();
  assert.equal(b.signalCode, "SIGTERM");
});
void test("expiry and unexpected child failure are observable and never extend absolute deadline", async () => {
  const f = fixture();
  await f.manager.reconcile(new Map([["a", 20000]]));
  f.calls[0].child.exitCode = 1;
  f.calls[0].child.emit("exit", 1, null);
  assert.equal(f.exits.length, 1);
  f.setTime(21000);
  assert.equal((await f.manager.reconcile(new Map([["a", 20000]]))).size, 0);
  assert.equal(f.calls.length, 1);
  await f.manager.close();
});
void test("failed spawn cannot be reported active and does not erase other children", async () => {
  let attempt = 0;
  const m = createAssertions({
    ownerPid: 77,
    now: () => 0,
    spawn: () => {
      if (++attempt === 1) throw Error("denied");
      const c = new FakeAssertionChild(99);
      c.kill = () => {
        queueMicrotask(() => c.emit("exit"));
        return true;
      };
      queueMicrotask(() => c.emit("spawn"));
      return c;
    },
  });
  const result = await m.reconcile(
    new Map([
      ["a", 5000],
      ["b", 6000],
    ]),
  );
  assert.equal(result.has("a"), false);
  assert.equal(result.has("b"), true);
  await m.close();
});
