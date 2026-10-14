import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Input, visibleWidth } from "@earendil-works/pi-tui";
import { makeView } from "#agentlog/ui-view";
import { runPopup } from "#agentlog/popup";
import { openStore, sessionKey } from "#agentlog/store";
import { readPiSession } from "#agentlog/pi-session";
import { makeFixture, type FixtureOptions } from "./helpers/fixtures.ts";
import { makeFakeHerdr } from "./helpers/fake-herdr.ts";
import { makeTestTerminal } from "./helpers/terminal.ts";

async function setup(t: TestContext, options: FixtureOptions = {}, cached = true) {
  const f = await makeFixture(t, options);
  const store = openStore(join(f.root, "state"));
  const parsed = await readPiSession(f.file);
  assert.ok(parsed.ok);
  if (cached) {
    store.upsert(parsed.meta, parsed.stamp);
    store.rememberPath(f.file);
  }
  const screen = makeTestTerminal({ columns: 80, rows: 24 });
  const fake = makeFakeHerdr({ panes: [], workspaces: [] });
  const controller = new AbortController();
  let done = Promise.resolve();
  // One cleanup owns the terminal before closing SQLite; fixture removal can happen first safely.
  t.after(async () => {
    controller.abort();
    await done;
    store.close();
    screen.dispose();
  });
  return {
    ...f,
    store,
    screen,
    fake,
    key: sessionKey(parsed.meta),
    record: parsed.meta,
    start() {
      done = runPopup({
        store,
        herdr: fake.api,
        context: { home: f.root, env: {}, projectCwds: [], livePaths: [] },
        terminal: screen.terminal,
        signal: controller.signal,
      });
      return done;
    },
  };
}
function click(screen: ReturnType<typeof makeTestTerminal>, text: string) {
  const lines = screen.frame().split("\n");
  const row = lines.findIndex((line) => line.includes(text));
  assert.ok(row >= 0, `No ${text} in ${screen.frame()}`);
  const col = lines[row].indexOf(text) + 2;
  screen.send(`\x1b[<0;${col};${row + 1}M`);
  screen.send(`\x1b[<0;${col};${row + 1}m`);
}
await test("navigation works before the replacement view has rendered", async (t) => {
  const s = await setup(t);
  const first = s.store.get(s.key);
  let selected = first.key;
  const noop = () => {};
  const view = makeView(
    {
      rows: [first, { ...first, key: "second" }],
      selected,
      archived: false,
      status: "",
      busy: false,
      editor: false,
      choices: undefined,
      choice: undefined,
      live: () => "",
    },
    {
      select: (value) => {
        selected = value;
      },
      open: noop,
      pin: noop,
      label: noop,
      archive: noop,
      filter: noop,
      refresh: noop,
      saveLabel: noop,
      cancel: noop,
    },
    s.screen.terminal,
    new Input(),
    new Input(),
  );
  view.handleListInput("\x1b[B");
  assert.equal(selected, "second");
});
await test("Escape stops a loading popup and aborts its outstanding refresh", async (t) => {
  const s = await setup(t, {}, false);
  let aborted = false;
  s.fake.api.state = async (signal) => {
    try {
      await setTimeout(10_000, undefined, { signal });
      return { panes: [], workspaces: [] };
    } catch (error) {
      aborted = true;
      throw error;
    }
  };
  const done = s.start();
  await s.screen.waitFor("Loading sessions…");
  s.screen.send("\x1b");
  await done;
  assert.equal(s.screen.stopped, true);
  assert.equal(aborted, true);
  const writes = s.screen.output.length;
  await setTimeout(30);
  assert.equal(s.screen.output.length, writes);
});
await test("cached rows remain usable while refreshing; keyboard actions persist, labels stay registry-only", async (t) => {
  const s = await setup(t, { userTimes: [] });
  s.fake.api.state = async (signal) => {
    await setTimeout(150, undefined, { signal });
    return { panes: [], workspaces: [] };
  };
  const done = s.start();
  await s.screen.waitFor("Refreshing…");
  assert.match(s.screen.frame(), /Current/);
  await s.screen.waitFor("No submissions");
  s.screen.send("\x10");
  assert.equal(s.store.get(s.key).pinned, true);
  await s.screen.waitFor("Unpin");
  s.screen.send("\x0c");
  await s.screen.waitFor("Registry only — does not rename the Pi session.");
  s.screen.send("Coworker label");
  s.screen.send("\r");
  assert.equal(s.store.get(s.key).labelOverride, "Coworker label");
  assert.equal(s.store.get(s.key).nativeName, "Current");
  s.screen.send("\x18");
  assert.equal(s.store.get(s.key).archived, true);
  await s.screen.waitFor("No matching");
  s.screen.send("\t");
  await s.screen.waitFor("Coworker label");
  s.screen.send("\x18");
  assert.equal(s.store.get(s.key).archived, false);
  assert.equal(s.store.get(s.key).pinned, true);
  s.screen.send("\x1b");
  await done;
});
await test("a prefilled label opens at its end so Ctrl+U can restore the native title", async (t) => {
  const s = await setup(t);
  s.store.setLabel(s.key, "Existing label");
  const done = s.start();
  await s.screen.waitFor("Existing label");
  s.screen.send("\x0c");
  await s.screen.waitFor("Registry only");
  s.screen.send("\x15");
  s.screen.send("\r");
  assert.equal(s.store.get(s.key).labelOverride, null);
  await s.screen.waitFor("Current");
  s.screen.send("\x1b");
  await done;
});
await test("mouse equivalents pin, label, archive, filter, refresh and open through the same actions", async (t) => {
  const s = await setup(t);
  const done = s.start();
  await s.screen.waitFor("Not open here");
  click(s.screen, "[Pin");
  assert.equal(s.store.get(s.key).pinned, true);
  await s.screen.waitFor("[Unpin");
  click(s.screen, "[Label");
  await s.screen.waitFor("Registry only");
  s.screen.send("Mouse label");
  s.screen.send("\r");
  await s.screen.waitFor("Mouse label");
  click(s.screen, "[Archive ");
  assert.equal(s.store.get(s.key).archived, true);
  await s.screen.waitFor("No matching");
  click(s.screen, "[Archived");
  await s.screen.waitFor("Mouse label");
  const reads = s.fake.calls.filter((c) => c.method === "state").length;
  click(s.screen, "[Refresh");
  await setTimeout(30);
  assert.ok(s.fake.calls.filter((c) => c.method === "state").length > reads);
  await s.screen.waitFor("[Open");
  click(s.screen, "[Open");
  await done;
  assert.equal(s.screen.stopped, true);
  assert.equal(s.store.get(s.key).archived, false);
  assert.equal(s.fake.startedPaths.length, 1);
  assert.ok(!s.screen.output.join("").includes("\x1b]52;"), "no automatic clipboard writes");
});
await test("search and refresh retain SessionKey selection; editor Escape cancels without saving", async (t) => {
  const s = await setup(t);
  s.store.upsert(
    {
      ...s.record,
      sessionPath: s.file + ".second",
      sessionId: "second",
      nativeName: "Second",
      lastUserAt: 1000,
    },
    null,
  );
  const done = s.start();
  await s.screen.waitFor("Current");
  s.screen.send("\x1b[B");
  s.screen.send("\x10");
  assert.equal(s.store.get("pi:" + s.file + ".second").pinned, true);
  assert.equal(s.store.get(s.key).pinned, false);
  s.screen.resize(40, 24);
  await s.screen.waitFor("Second");
  s.screen.send("\x12");
  await setTimeout(40);
  s.screen.send("\x10");
  assert.equal(s.store.get("pi:" + s.file + ".second").pinned, false);
  s.screen.send("Current");
  await s.screen.waitFor("Current");
  s.screen.send("\x0c");
  await s.screen.waitFor("Registry only");
  s.screen.send("discard me");
  s.screen.send("\x1b");
  await s.screen.waitFor("Current");
  assert.equal(s.screen.stopped, false);
  assert.equal(s.store.get(s.key).labelOverride, null);
  s.screen.send("\x15");
  s.screen.send("café");
  await s.screen.waitFor("Current");
  s.screen.send("\x15");
  s.screen.send("not a match");
  await s.screen.waitFor("No matching");
  s.screen.send("\x1b");
  await done;
});
await test("unavailable Herdr and rejected writes show errors without inventing live status or successful edits", async (t) => {
  const s = await setup(t);
  s.fake.api.state = () => Promise.reject(new Error("server unavailable"));
  const done = s.start();
  await s.screen.waitFor("server unavailable");
  assert.match(s.screen.frame(), /Current/);
  assert.doesNotMatch(s.screen.frame(), /Not open here/);
  s.store.setPinned = () => {
    throw new Error("registry busy");
  };
  s.screen.send("\x10");
  await s.screen.waitFor("registry busy");
  assert.equal(s.store.get(s.key).pinned, false);
  s.screen.send("\x1b");
  await done;
});
await test("pending, duplicate choices and failed opens stay actionable, and repeated Open is disabled", async (t) => {
  const s = await setup(t);
  const pane = {
    paneId: "w1:p1",
    workspaceId: "w1",
    tabId: "w1:t1",
    cwd: s.cwd,
    agent: null,
    session: { agent: "pi", kind: "path" as const, value: s.record.sessionPath },
  };
  s.fake.setState({ panes: [pane], workspaces: [] });
  const done = s.start();
  await s.screen.waitFor("Restoring");
  s.screen.send("\r");
  await s.screen.waitFor("not ready");
  assert.equal(s.fake.startedPaths.length, 0);
  assert.equal(s.screen.stopped, false);
  s.fake.setState({
    panes: [
      { ...pane, agent: "pi" },
      { ...pane, paneId: "w2:p2", agent: "pi" },
    ],
    workspaces: [],
  });
  s.screen.send("\r");
  await s.screen.waitFor("Choose destination");
  s.screen.send("\x1b");
  await s.screen.waitFor("[Open");
  s.fake.setState({ panes: [], workspaces: [] });
  s.fake.api.startPi = async (_pane, _path, _name, signal) => {
    await setTimeout(100, undefined, { signal });
    throw new Error("startup blocked");
  };
  s.screen.send("\r");
  s.screen.send("\r");
  await s.screen.waitFor("startup blocked");
  assert.equal(s.fake.createdCwds.length, 1);
  assert.equal(s.screen.stopped, false);
  s.screen.send("\x1b");
  await done;
});
await test("an invalid cached timestamp cannot prevent the popup from opening", async (t) => {
  const s = await setup(t);
  s.store.upsert({ ...s.record, lastUserAt: 1e30 }, null);
  s.fake.api.state = async (signal) => {
    await setTimeout(150, undefined, { signal });
    return { panes: [], workspaces: [] };
  };
  await assert.doesNotReject(async () => {
    const done = s.start();
    await Promise.race([done, s.screen.waitFor("Submission time unavailable")]);
    assert.match(s.screen.frame(), /Submission time unavailable/);
    s.screen.send("\x1b");
    await done;
  });
});
await test("rendered terminal fits narrow and wide sizes, sanitizes labels and survives resize", async (t) => {
  const s = await setup(t, { nativeNames: ["Café 👩‍💻 unicode"] });
  s.store.setLabel(s.key, "\x1b[31mCafé 👩‍💻\x1b[0m");
  const done = s.start();
  await s.screen.waitFor("Café");
  for (const width of [40, 120, 80]) {
    s.screen.resize(width, 24);
    await setTimeout(25);
    assert.match(s.screen.frame(), /Café/);
    for (const line of s.screen.frame().split("\n"))
      assert.ok(visibleWidth(line) <= width, JSON.stringify(line));
  }
  s.screen.resize(20, 5);
  await s.screen.waitFor("Terminal too small");
  s.screen.send("\x1b");
  await done;
  assert.equal(s.screen.stopped, true);
});
