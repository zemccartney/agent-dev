// Version-coupled smoke through private host components, NOT full host-driven acceptance.
// Run via test:integration for an isolated HOME; no provider calls or real-time waits.
import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters as strip } from "node:util";
import { mock } from "node:test";
import { assistantMessage } from "./helpers/fixtures.ts";

assert.ok(
  process.env.PI_LENCE_SMOKE_HOME &&
    process.env.HOME === process.env.PI_LENCE_SMOKE_HOME &&
    process.env.PI_CODING_AGENT_DIR === join(process.env.HOME, "agent"),
  "Run via test:integration (test/run-smoke.mjs) so HOME and Pi state are isolated",
);

/** @typedef {{ dispose(): void, renderInBorder(width: number): string }} Indicator */
/** @typedef {import('@earendil-works/pi-tui').Component & { dispose?: () => void }} Widget */
const packageRoot =
  process.argv[2] ??
  dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
/** @param {string} relative */
const load = (relative) => import(pathToFileURL(join(packageRoot, "dist", relative)).href);
const { loadExtensions } = await load("core/extensions/loader.js");
const { DefaultPackageManager } = await load("core/package-manager.js");
const { SettingsManager } = await load("core/settings-manager.js");
const { initTheme, theme } = await load("modes/interactive/theme/theme.js");
const { InteractiveMode } = await load("modes/interactive/interactive-mode.js");
const { WorkingStatusIndicator, RetryStatusIndicator, CompactionStatusIndicator } = await load(
  "modes/interactive/components/status-indicator.js",
);
initTheme("dark", false);
const cwd = resolve(fileURLToPath(new URL("../", import.meta.url)));
const manager = new DefaultPackageManager({
  cwd,
  agentDir: cwd,
  settingsManager: SettingsManager.inMemory(),
});
/** @type {{ extensions: { enabled: boolean, path: string }[], skills: unknown[], prompts: unknown[], themes: unknown[] }} */
const resources = await manager.resolveExtensionSources([cwd]);
const entryPoints = resources.extensions
  .filter((resource) => resource.enabled)
  .map((resource) => resource.path);
assert.deepEqual(
  entryPoints,
  [join(cwd, "src/reference-ui.ts")],
  "only the declared entry point loads, not helpers or tests",
);
for (const resource of [resources.skills, resources.prompts, resources.themes])
  assert.deepEqual(resource, []);
const loaded = await loadExtensions(entryPoints, cwd);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];

// Real, immediately cleared timer handles preserve Node's timer contract without waiting.
const originalSet = globalThis.setInterval;
const originalClear = globalThis.clearInterval;
let now = 0;
/** @type {Map<ReturnType<typeof setInterval>, { callback: () => void, delay: number }>} */
const timers = new Map();
mock.method(Date, "now", () => now);
mock.method(
  globalThis,
  "setInterval",
  (/** @type {() => void} */ callback, /** @type {number} */ delay) => {
    const handle = originalSet(() => {}, 1_000_000);
    originalClear(handle);
    timers.set(handle, { callback, delay });
    return handle;
  },
);
mock.method(globalThis, "clearInterval", (/** @type {ReturnType<typeof setInterval>} */ handle) => {
  timers.delete(handle);
});
/** @type {Map<string, Widget>} */
const widgets = new Map();
const tui = { terminal: { rows: 36 }, requestRender() {} };
/** @type {Indicator[]} */
const indicators = [];
const host = {
  ui: tui,
  defaultWorkingMessage: "Working...",
  workingMessage: /** @type {string | undefined} */ (undefined),
  activeStatusIndicator: /** @type {Indicator | undefined} */ (undefined),
  /** @param {string} key @param {((surface: typeof tui, theme: import('@earendil-works/pi-coding-agent').Theme) => Widget) | undefined} content */
  setExtensionWidget(key, content) {
    widgets.get(key)?.dispose?.();
    if (content === undefined) widgets.delete(key);
    else widgets.set(key, content(tui, theme));
  },
};
const ctx = {
  mode: "tui",
  isIdle: () => true,
  sessionManager: { getBranch: () => [] },
  ui: InteractiveMode.prototype.createExtensionUIContext.call(host),
};
/** @param {import('@earendil-works/pi-coding-agent').ExtensionEvent} event */
const emit = async (event) => {
  for (const handler of extension.handlers.get(event.type) ?? []) await handler(event, ctx);
};
/** @param {number} time */
const tick = (time) => {
  now = time;
  // Callbacks can replace timers; snapshot the schedule before dispatch.
  const pending = [...timers.values()];
  for (const { callback, delay } of pending) if (delay === 1000) callback();
};
/** @param {Indicator} indicator */
const show = (indicator) => {
  host.activeStatusIndicator?.dispose();
  indicators.push(indicator);
  host.activeStatusIndicator = indicator;
};
const rendered = () => {
  assert.ok(host.activeStatusIndicator);
  return host.activeStatusIndicator.renderInBorder(120);
};
const visible = () => strip(rendered());
try {
  await emit({ type: "session_start", reason: "startup" });
  show(new WorkingStatusIndicator(tui, "Working..."));
  await emit({ type: "agent_start" });
  await emit({
    type: "tool_execution_start",
    toolCallId: "silent",
    toolName: "bash",
    args: { command: "sleep 70" },
  });
  assert.deepEqual(
    widgets.get("quiet-activity")?.render(120) ?? [],
    [],
    "no duplicate activity row",
  );
  tick(59_999);
  assert.match(visible(), /Working\.\.\./);
  assert.doesNotMatch(visible(), /no updates/);
  tick(60_000);
  assert.match(visible(), /no updates for 60s.*bash/);
  assert(
    rendered().includes(theme.fg("warning", "Working · no updates for 60s · bash")),
    "warning color survives host label styling",
  );

  await emit({
    type: "tool_execution_update",
    toolCallId: "silent",
    toolName: "bash",
    args: {},
    partialResult: { content: [], details: undefined },
  });
  assert.match(visible(), /Working\.\.\./, "real tool activity restores native wording");
  tick(120_000);
  assert.match(visible(), /no updates/);
  await emit({ type: "ui_prompt_start", reason: "ui_prompt", kind: "confirm" });
  assert.doesNotMatch(visible(), /no updates/, "dialog suppresses warning");
  tick(180_000);
  assert.doesNotMatch(visible(), /no updates/);
  await emit({ type: "ui_prompt_end", reason: "ui_prompt", kind: "confirm" });

  show(new RetryStatusIndicator(tui, 1, 3, 5000));
  tick(181_000);
  assert.match(visible(), /Retrying/);
  assert.doesNotMatch(visible(), /no updates/, "native retry takes priority");
  show(new CompactionStatusIndicator(tui, "threshold"));
  tick(182_000);
  assert.match(visible(), /compacting/i);
  assert.doesNotMatch(visible(), /no updates/, "native compaction takes priority");

  show(new WorkingStatusIndicator(tui, host.workingMessage ?? host.defaultWorkingMessage));
  await emit({
    type: "tool_execution_end",
    toolCallId: "silent",
    toolName: "bash",
    result: { content: [], details: undefined },
    isError: false,
  });
  assert.match(visible(), /Working\.\.\./);
  tick(242_000);
  assert.match(visible(), /no updates/);
  await emit({ type: "agent_settled", aborted: true });
  assert.equal(host.workingMessage, undefined, "cancellation clears our override");
  assert.deepEqual(widgets.get("quiet-activity")?.render(120) ?? [], []);

  await emit({ type: "agent_start" });
  tick(302_000);
  assert.match(visible(), /no updates/);
  const message = assistantMessage("New assistant activity");
  await emit({
    type: "message_update",
    message,
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "New", partial: message },
  });
  assert.match(visible(), /Working\.\.\./, "new assistant activity clears the quiet warning");
  tick(362_000);
  assert.match(visible(), /no updates/);
  await emit({ type: "session_shutdown", reason: "resume" });
  assert.equal([...timers.values()].filter((timer) => timer.delay === 1000).length, 0);
  await emit({ type: "session_start", reason: "resume" });
  assert.equal(host.workingMessage, undefined, "session replacement clears our override");
  assert.equal([...timers.values()].filter((timer) => timer.delay === 1000).length, 1);
  await emit({ type: "agent_start" });
  tick(422_000);
  assert.match(visible(), /no updates/);
  await emit({ type: "session_shutdown", reason: "reload" });
  assert.equal(host.workingMessage, undefined);
  assert.equal([...timers.values()].filter((timer) => timer.delay === 1000).length, 0);
  console.log(
    "PASS: pinned-host discovery, native warning rendering, activity/dialog handling, retry/compaction precedence, shutdown/start cleanup.",
  );
} finally {
  await emit({ type: "session_shutdown", reason: "quit" });
  for (const indicator of indicators) indicator.dispose();
  mock.restoreAll();
}
