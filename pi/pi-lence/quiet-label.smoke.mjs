// Integration check against an installed pi; no provider calls or real-time wait.
// npm run test:integration -- /path/to/node_modules/@earendil-works/pi-coding-agent
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters as strip } from "node:util";

const packageRoot = process.argv[2];
if (!packageRoot) throw new Error("Pass the installed pi-coding-agent package directory.");
const load = relative => import(pathToFileURL(join(packageRoot, "dist", relative)).href);
const { loadExtensions } = await load("core/extensions/loader.js");
const { DefaultPackageManager } = await load("core/package-manager.js");
const { SettingsManager } = await load("core/settings-manager.js");
const { initTheme, theme } = await load("modes/interactive/theme/theme.js");
const { InteractiveMode } = await load("modes/interactive/interactive-mode.js");
const { WorkingStatusIndicator, RetryStatusIndicator, CompactionStatusIndicator } =
  await load("modes/interactive/components/status-indicator.js");
initTheme("dark", false);
const cwd = resolve(fileURLToPath(new URL(".", import.meta.url)));
const manager = new DefaultPackageManager({ cwd, agentDir: cwd, settingsManager: SettingsManager.inMemory() });
const resources = await manager.resolveExtensionSources([cwd]);
const entryPoints = resources.extensions.filter(resource => resource.enabled).map(resource => resource.path);
assert.deepEqual(entryPoints, [join(cwd, "reference-ui.ts")], "installing the package loads only its entry point, not helpers or tests");
for (const type of ["skills", "prompts", "themes"]) assert.deepEqual(resources[type], []);
const loaded = await loadExtensions(entryPoints, cwd);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];

// Control time only. Render through pi's real indicators and real setWorkingMessage implementation.
const original = { now: Date.now, set: globalThis.setInterval, clear: globalThis.clearInterval };
let now = 0;
const timers = new Map();
Date.now = () => now;
globalThis.setInterval = (callback, delay) => {
  const handle = { unref() {} };
  timers.set(handle, { callback, delay });
  return handle;
};
globalThis.clearInterval = handle => { timers.delete(handle); };
const widgets = new Map();
const tui = { terminal: { rows: 36 }, requestRender() {} };
const indicators = [];
const host = {
  ui: tui,
  defaultWorkingMessage: "Working...",
  workingMessage: undefined,
  activeStatusIndicator: undefined,
  setExtensionWidget(key, content) {
    widgets.get(key)?.dispose?.();
    if (content === undefined) widgets.delete(key);
    else widgets.set(key, content(tui, theme));
  },
};
const ctx = {
  mode: "tui", isIdle: () => true, sessionManager: { getBranch: () => [] },
  ui: InteractiveMode.prototype.createExtensionUIContext.call(host),
};
const emit = async (type, event = {}) => {
  for (const handler of extension.handlers.get(type) ?? []) await handler({ type, ...event }, ctx);
};
const tick = time => {
  now = time;
  for (const { callback, delay } of [...timers.values()]) if (delay === 1000) callback();
};
const show = indicator => {
  host.activeStatusIndicator?.dispose(); // Match pi's showStatusIndicator lifecycle.
  indicators.push(indicator);
  host.activeStatusIndicator = indicator;
};
const visible = () => strip(host.activeStatusIndicator.renderInBorder(120));
try {
  await emit("session_start");
  show(new WorkingStatusIndicator(tui, "Working..."));
  await emit("agent_start");
  await emit("tool_execution_start", { toolCallId: "silent", toolName: "bash" });
  assert.deepEqual(widgets.get("quiet-activity")?.render(120) ?? [], [], "no duplicate activity row");
  tick(59_999);
  assert.match(visible(), /Working\.\.\./);
  assert.doesNotMatch(visible(), /no updates/);
  tick(60_000);
  assert.match(visible(), /no updates for 60s.*bash/);
  assert(host.activeStatusIndicator.renderInBorder(120).includes(
    theme.fg("warning", "Working · no updates for 60s · bash")), "warning color survives pi's normal label styling");

  await emit("message_update");
  assert.match(visible(), /Working\.\.\./, "new model activity restores native wording");
  tick(120_000);
  assert.match(visible(), /no updates/);
  await emit("ui_prompt_start");
  assert.doesNotMatch(visible(), /no updates/, "dialog suppresses warning");
  tick(180_000);
  assert.doesNotMatch(visible(), /no updates/);
  await emit("ui_prompt_end");

  show(new RetryStatusIndicator(tui, 1, 3, 5000));
  tick(181_000);
  assert.match(visible(), /Retrying/);
  assert.doesNotMatch(visible(), /no updates/, "native retry takes priority");
  show(new CompactionStatusIndicator(tui, "threshold"));
  tick(182_000);
  assert.match(visible(), /compacting/i);
  assert.doesNotMatch(visible(), /no updates/, "native compaction takes priority");

  show(new WorkingStatusIndicator(tui, host.workingMessage ?? host.defaultWorkingMessage));
  await emit("tool_execution_end", { toolCallId: "silent" });
  assert.match(visible(), /Working\.\.\./);
  tick(242_000);
  assert.match(visible(), /no updates/);
  await emit("agent_settled", { aborted: true });
  assert.equal(host.workingMessage, undefined, "cancellation clears our override");
  assert.deepEqual(widgets.get("quiet-activity")?.render(120) ?? [], []);

  await emit("agent_start");
  tick(302_000);
  assert.match(visible(), /no updates/);
  await emit("session_switch");
  assert.equal(host.workingMessage, undefined, "session switch clears our override");
  assert.equal([...timers.values()].filter(timer => timer.delay === 1000).length, 1, "one activity timer after switching");
  await emit("agent_start");
  tick(362_000);
  assert.match(visible(), /no updates/);
  await emit("session_shutdown");
  assert.equal(host.workingMessage, undefined, "shutdown/reload clears our override");
  assert.equal([...timers.values()].filter(timer => timer.delay === 1000).length, 0);
  console.log("PASS: package discovery, no extra row, 60s warning in native label, warning color, activity reset, dialog suppression, retry/compaction precedence, session/timer cleanup.");
} finally {
  await emit("session_shutdown");
  for (const indicator of indicators) indicator.dispose();
  Date.now = original.now;
  globalThis.setInterval = original.set;
  globalThis.clearInterval = original.clear;
}
