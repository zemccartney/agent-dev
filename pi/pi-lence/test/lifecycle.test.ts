import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  SessionEntry,
  SessionStartEvent,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import referenceUi from "../src/reference-ui.ts";
import { PIN_ENTRY_TYPE } from "../src/reference-state.ts";
import { assistantMessage } from "./helpers/fixtures.ts";

// Test-only partials fail on every unexpected host operation instead of silently accepting it.
function strictPartial<T extends object>(members: Partial<T>): T {
  return new Proxy(members, {
    get(target, key, receiver) {
      if (!(key in target)) throw new Error(`Unexpected host access: ${String(key)}`);
      return Reflect.get(target, key, receiver);
    },
  }) as T;
}

type EventName = ExtensionEvent["type"];
const supported = new Set<EventName>([
  "session_start",
  "session_shutdown",
  "session_tree",
  "session_compact",
  "agent_start",
  "agent_settled",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "ui_prompt_start",
  "ui_prompt_end",
]);

function harness(t: TestContext) {
  // Erase callback parameters only at the typed event-map boundary; emit dispatches by event.type.
  const handlers = new Map<EventName, ((event: never, context: never) => unknown)[]>();
  const shortcuts = new Map<string, Parameters<ExtensionAPI["registerShortcut"]>[1]>();
  const widgets = new Map<string, Component>();
  const timers = new Map<ReturnType<typeof setInterval>, () => void>();
  let now = 0;
  let renders = 0;
  let uiCalls = 0;
  let message: string | undefined;
  let branch: SessionEntry[] = [];
  let mode: ExtensionContext["mode"] = "tui";
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setInterval", (callback: () => void) => {
    const handle = originalSet(() => {}, 1_000_000);
    originalClear(handle);
    timers.set(handle, callback);
    return handle;
  });
  t.mock.method(globalThis, "clearInterval", (handle: ReturnType<typeof setInterval>) => {
    timers.delete(handle);
  });
  const theme = strictPartial<Theme>({ fg: (_color, text) => text });
  const tui = strictPartial<TUI>({
    requestRender: () => {
      renders++;
    },
  });
  const ui = strictPartial<ExtensionContext["ui"]>({
    theme,
    setWorkingMessage(value) {
      uiCalls++;
      message = value;
    },
    setWidget(
      key: string,
      content: string[] | ((tui: TUI, theme: Theme) => Component) | undefined,
    ) {
      uiCalls++;
      if (typeof content === "function") widgets.set(key, content(tui, theme));
      else if (content === undefined) widgets.delete(key);
      else throw new Error("Unexpected static widget");
    },
  });
  const context = strictPartial<ExtensionContext>({
    get mode() {
      return mode;
    },
    get hasUI() {
      return mode === "tui" || mode === "rpc";
    },
    ui,
    isIdle: () => true,
    sessionManager: strictPartial<ExtensionContext["sessionManager"]>({ getBranch: () => branch }),
  });
  const api = strictPartial<ExtensionAPI>({
    on(type: EventName, handler: (event: never, context: never) => unknown) {
      assert.ok(supported.has(type), `Unsupported event: ${type}`);
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
      return () => {
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
      };
    },
    registerShortcut: (key, shortcut) => {
      shortcuts.set(key, shortcut);
    },
    registerToolRenderer: () => {},
  });
  return {
    api,
    timers,
    shortcuts,
    context,
    setMode(value: ExtensionContext["mode"]) {
      mode = value;
    },
    setBranch(value: SessionEntry[]) {
      branch = value;
    },
    counts: () => ({ renders, uiCalls }),
    message: () => message,
    toolbar: () => widgets.get("reference-ui-spike")?.render(120).join("\n") ?? "",
    tick(value: number) {
      now = value;
      for (const callback of timers.values()) callback();
    },
    async emit(event: ExtensionEvent) {
      for (const handler of handlers.get(event.type) ?? [])
        await handler(event as never, context as never);
    },
  };
}

function pinnedBranch(): SessionEntry[] {
  return [
    {
      type: "message",
      id: "a",
      parentId: null,
      timestamp: "2026-01-01T00:00:00Z",
      message: assistantMessage(),
    },
    {
      type: "custom",
      id: "pin",
      parentId: "a",
      timestamp: "2026-01-01T00:00:01Z",
      customType: PIN_ENTRY_TYPE,
      data: { entryId: "a", label: "Saved" },
    },
  ];
}

await test("handler fake rejects obsolete event names at compile time and runtime", (t) => {
  const h = harness(t);
  assert.throws(() => {
    // @ts-expect-error Pi 1.3 has session_start reasons, not session_switch.
    h.api.on("session_switch", () => {});
  }, /Unsupported event/);
});

const reasons: SessionStartEvent["reason"][] = ["startup", "reload", "new", "resume", "fork"];
for (const reason of reasons) {
  await test(`${reason}: reset branch/warning state and own exactly one timer`, async (t) => {
    const h = harness(t);
    referenceUi(h.api);
    assert.equal(h.timers.size, 0, "factory loading is inert");
    h.setBranch(pinnedBranch());
    await h.emit({ type: "session_start", reason: "startup" });
    assert.match(h.toolbar(), /Unpin latest/);
    await h.emit({ type: "agent_start" });
    h.tick(60_000);
    assert.match(h.message() ?? "", /no updates/);
    h.setBranch([]);
    await h.emit({ type: "session_shutdown", reason: reason === "startup" ? "reload" : reason });
    assert.equal(h.timers.size, 0);
    assert.equal(h.message(), undefined);
    await h.emit({ type: "session_start", reason });
    await h.emit({ type: "session_start", reason });
    assert.equal(h.timers.size, 1);
    assert.doesNotMatch(h.toolbar(), /Unpin latest/);
    h.tick(120_000);
    assert.equal(h.message(), undefined);
    await h.emit({ type: "session_shutdown", reason: "quit" });
    await h.emit({ type: "session_shutdown", reason: "quit" });
    assert.equal(h.timers.size, 0);
  });
}

for (const mode of ["rpc", "json", "print"] as const) {
  await test(`${mode}: no terminal calls or timers, including after a TUI session`, async (t) => {
    const h = harness(t);
    referenceUi(h.api);
    for (const startInTui of [false, true]) {
      if (startInTui) {
        h.setMode("tui");
        await h.emit({ type: "session_start", reason: "startup" });
        await h.emit({ type: "session_shutdown", reason: "reload" });
      }
      h.setMode(mode);
      const before = h.counts();
      await h.emit({ type: "session_start", reason: "reload" });
      await h.emit({ type: "agent_start" });
      await h.emit({ type: "agent_settled", aborted: false });
      for (const shortcut of h.shortcuts.values()) await shortcut.handler(h.context);
      await h.emit({ type: "session_shutdown", reason: "quit" });
      assert.equal(h.timers.size, 0);
      assert.deepEqual(h.counts(), before);
    }
  });
}
