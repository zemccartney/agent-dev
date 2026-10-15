import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { unlink, rename, chmod } from "node:fs/promises";
import { refreshCatalog } from "#agentlog/discovery";
import { join } from "node:path";
import { openSession } from "#agentlog/resume";
import { openStore, sessionKey } from "#agentlog/store";
import { readPiSession } from "#agentlog/pi-session";
import { HerdrError, type Pane } from "#agentlog/herdr";
import { makeFixture } from "./helpers/fixtures.ts";
import { makeFakeHerdr } from "./helpers/fake-herdr.ts";

async function setup(t: TestContext) {
  const fixture = await makeFixture(t);
  const parsed = await readPiSession(fixture.file);
  assert.ok(parsed.ok);
  const store = openStore(join(fixture.root, "state"));
  t.after(() => store.close());
  store.upsert(parsed.meta, parsed.stamp);
  const key = sessionKey(parsed.meta);
  store.setArchived(key, true);
  store.setPinned(key, true);
  const fake = makeFakeHerdr({ panes: [], workspaces: [] });
  const live: Pane = {
    paneId: "w1:p1",
    workspaceId: "w1",
    tabId: "w1:t1",
    cwd: fixture.cwd,
    agent: "pi",
    session: { agent: "pi", kind: "path", value: parsed.meta.sessionPath },
  };
  return { ...fixture, store, key, fake, live, record: store.get(key) };
}
await test("closed session resumes in original cwd and unarchives only after successful focus", async (t) => {
  const s = await setup(t);
  const outcome = await openSession(s.key, { store: s.store, herdr: s.fake.api });
  assert.equal(outcome.kind, "opened");
  assert.deepEqual(s.fake.startedPaths, [s.record.sessionPath]);
  assert.deepEqual(s.fake.createdCwds, [s.cwd]);
  assert.equal(s.store.get(s.key).archived, false);
  assert.equal(s.store.get(s.key).pinned, true);
  assert.equal(s.store.get(s.key).lastUserAt, 3000);
  assert.deepEqual(
    s.fake.calls
      .filter((c) => ["startPi", "pane", "focus"].includes(c.method))
      .map((c) => c.method),
    ["startPi", "pane", "focus"],
  );
  const start = s.fake.calls.find((c) => c.method === "startPi");
  assert.match(String(start?.args[2]), /^agentlog-[a-f0-9]{12}$/);
});
await test("final ID-only confirmation must remain unambiguous before any focus or unarchive", async (t) => {
  for (const stage of ["after launch", "before existing focus"]) {
    const s = await setup(t);
    s.store.upsert({ ...s.record, sessionPath: s.record.sessionPath + ".copy" }, null);
    if (stage === "before existing focus") s.fake.setState({ panes: [s.live], workspaces: [] });
    s.fake.api.pane = (paneId) =>
      Promise.resolve({
        ...s.live,
        paneId,
        session: { agent: "pi", kind: "id", value: s.record.sessionId },
      });
    const result = await openSession(s.key, { store: s.store, herdr: s.fake.api });
    assert.equal(result.kind, "error", stage);
    assert.equal(s.fake.calls.filter((call) => call.method === "focus").length, 0);
    assert.equal(s.store.get(s.key).archived, true);
    assert.equal(s.fake.startedPaths.length, stage === "after launch" ? 1 : 0);
  }
});
await test("path and exact ID matches focus without another process, even if backing file disappeared", async (t) => {
  for (const kind of ["path", "id"] as const) {
    const s = await setup(t);
    s.live.session = {
      agent: "pi",
      kind,
      value: kind === "path" ? s.record.sessionPath : s.record.sessionId,
    };
    s.fake.setState({ panes: [s.live], workspaces: [{ workspaceId: "w1" }] });
    await unlink(s.file);
    const outcome = await openSession(s.key, { store: s.store, herdr: s.fake.api });
    assert.equal(outcome.kind, "opened");
    assert.equal(s.fake.startedPaths.length, 0);
    assert.equal(s.fake.createdCwds.length, 0);
    assert.equal(s.fake.calls.find((c) => c.method === "focus")?.args[0], "w1:p1");
  }
});
await test("access lost after refresh fails Open usefully without a destination and recovers after restoration", async (t) => {
  const s = await setup(t);
  s.store.setLabel(s.key, "Keep label");
  await refreshCatalog(s.store, { home: s.root, env: {}, projectCwds: [], livePaths: [s.file] });
  assert.equal(s.store.get(s.key).availability, "available");
  await chmod(s.file, 0);
  try {
    const outcome = await openSession(s.key, { store: s.store, herdr: s.fake.api });
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") throw new Error("Expected an access error");
    assert.match(outcome.message, /EACCES|permission denied/iu);
    assert.ok(outcome.message.includes(s.record.sessionPath));
    assert.equal(s.fake.createdCwds.length, 0);
    assert.equal(s.fake.startedPaths.length, 0);
    assert.equal(s.store.get(s.key).archived, true);
    assert.equal(s.store.get(s.key).pinned, true);
    assert.equal(s.store.get(s.key).labelOverride, "Keep label");
  } finally {
    await chmod(s.file, 0o600);
  }
  const recovered = await openSession(s.key, { store: s.store, herdr: s.fake.api });
  assert.equal(recovered.kind, "opened");
});
await test("an unreadable transcript does not prevent focusing its already running pane", async (t) => {
  const s = await setup(t);
  s.fake.setState({ panes: [s.live], workspaces: [] });
  await chmod(s.file, 0);
  try {
    const outcome = await openSession(s.key, { store: s.store, herdr: s.fake.api });
    assert.deepEqual(outcome, { kind: "opened", paneId: "w1:p1" });
    assert.equal(s.fake.startedPaths.length, 0);
    assert.equal(s.fake.createdCwds.length, 0);
  } finally {
    await chmod(s.file, 0o600);
  }
});
await test("multiple matches require a destination choice and stale choices never trigger a new launch", async (t) => {
  const s = await setup(t);
  const second = { ...s.live, paneId: "w2:p2", workspaceId: "w2" };
  s.fake.setState({ panes: [s.live, second], workspaces: [] });
  const first = await openSession(s.key, { store: s.store, herdr: s.fake.api });
  assert.equal(first.kind, "choose");
  assert.equal(s.store.get(s.key).archived, true);
  const chosen = await openSession(
    s.key,
    { store: s.store, herdr: s.fake.api },
    { paneId: "w2:p2" },
  );
  assert.equal(chosen.kind, "opened");
  s.fake.setState({ panes: [], workspaces: [] });
  const stale = await openSession(
    s.key,
    { store: s.store, herdr: s.fake.api },
    { paneId: "w2:p2" },
  );
  assert.equal(stale.kind, "error");
  assert.equal(s.fake.startedPaths.length, 0);
});
await test("restoring references and ambiguous ID-only references never create a duplicate", async (t) => {
  const s = await setup(t);
  s.fake.setState({ panes: [{ ...s.live, agent: null }], workspaces: [] });
  assert.equal((await openSession(s.key, { store: s.store, herdr: s.fake.api })).kind, "pending");
  s.store.upsert({ ...s.record, sessionPath: s.record.sessionPath + ".copy" }, null);
  s.fake.setState({
    panes: [{ ...s.live, session: { agent: "pi", kind: "id", value: s.record.sessionId } }],
    workspaces: [],
  });
  assert.equal((await openSession(s.key, { store: s.store, herdr: s.fake.api })).kind, "error");
  assert.equal(s.fake.startedPaths.length, 0);
});
await test("missing closed-session file or directory creates no destination and preserves archive", async (t) => {
  for (const missing of ["file", "directory"]) {
    const s = await setup(t);
    if (missing === "file") await unlink(s.file);
    else await rename(s.cwd, s.cwd + "-gone");
    assert.equal((await openSession(s.key, { store: s.store, herdr: s.fake.api })).kind, "error");
    assert.equal(s.fake.createdCwds.length, 0);
    assert.equal(s.store.get(s.key).archived, true);
  }
});
await test("workspace matching is exact and only one match is reusable", async (t) => {
  for (const mode of ["pane", "worktree", "ambiguous", "none"]) {
    const s = await setup(t);
    const shell = { ...s.live, agent: null, session: null };
    s.fake.setState({
      panes:
        mode === "pane"
          ? [shell]
          : mode === "ambiguous"
            ? [shell, { ...shell, paneId: "w2:p1", workspaceId: "w2" }]
            : [],
      workspaces:
        mode === "worktree"
          ? [{ workspaceId: "w1", checkoutPath: s.cwd }]
          : [{ workspaceId: "w1" }, { workspaceId: "w2" }],
    });
    assert.equal((await openSession(s.key, { store: s.store, herdr: s.fake.api })).kind, "opened");
    assert.equal(
      s.fake.calls.find((c) => c.method === "createDestination")?.args[1],
      ["pane", "worktree"].includes(mode) ? "w1" : undefined,
    );
  }
});
await test("blocked startup, timeouts, vanished targets, wrong references and focus failures do not unarchive or retry", async (t) => {
  for (const failure of ["blocked", "timeout", "vanished", "wrong-reference", "focus"]) {
    const s = await setup(t);
    let starts = 0;
    const original = s.fake.api.startPi.bind(s.fake.api);
    s.fake.api.startPi = async (...args) => {
      starts++;
      if (failure === "blocked" || failure === "timeout") throw new HerdrError(failure, failure);
      await original(...args);
    };
    if (failure === "vanished")
      s.fake.api.pane = () => Promise.reject(new HerdrError("pane_not_found", "gone"));
    if (failure === "wrong-reference")
      s.fake.api.pane = (id) =>
        Promise.resolve({
          ...s.live,
          paneId: id,
          session: { agent: "pi", kind: "path", value: "/wrong.jsonl" },
        });
    if (failure === "focus") s.fake.api.focus = () => Promise.reject(new Error("Cannot focus"));
    const outcome = await openSession(s.key, { store: s.store, herdr: s.fake.api });
    assert.equal(outcome.kind, "error");
    assert.equal(starts, 1);
    assert.equal(s.store.get(s.key).archived, true);
    if (outcome.kind === "error") assert.ok(outcome.paneId);
  }
});
await test("cancellation during an accepted launch cannot cause late focus or unarchive", async (t) => {
  const s = await setup(t);
  const controller = new AbortController();
  const original = s.fake.api.startPi.bind(s.fake.api);
  s.fake.api.startPi = async (...args) => {
    await original(...args);
    controller.abort();
  };
  const outcome = await openSession(
    s.key,
    { store: s.store, herdr: s.fake.api },
    { signal: controller.signal },
  );
  assert.equal(outcome.kind, "error");
  assert.equal(s.fake.startedPaths.length, 1);
  assert.equal(s.fake.calls.filter((c) => c.method === "focus").length, 0);
  assert.equal(s.store.get(s.key).archived, true);
});
