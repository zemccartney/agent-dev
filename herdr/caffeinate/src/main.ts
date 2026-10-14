#!/usr/bin/env node
import { join } from "node:path";
import { resolveContext, ensureMonitor, serveRuntime, runtimeRequest } from "./runtime.js";
import { connectHerdr } from "./herdr.js";
import { createAssertions } from "./assertions.js";
import { readPower } from "./power.js";
import { createMonitor } from "./monitor.js";
import { loadConfig, saveConfig } from "./config.js";
import type { HostContext } from "./runtime.js";
import { object, errorMessage, parseMonitorResponse } from "./validation.js";

async function runMonitor(context: HostContext) {
  let monitor: ReturnType<typeof createMonitor> | undefined,
    ipc: Awaited<ReturnType<typeof serveRuntime>> | undefined,
    client: Awaited<ReturnType<typeof connectHerdr>> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    closing = false,
    busy = false,
    dirty = false;
  const log = (e: unknown) => console.error(new Date().toISOString(), errorMessage(e));
  async function shutdown() {
    if (closing) return;
    closing = true;
    clearTimeout(timer);
    // Release OS children even if the serialized Herdr control plane is stuck.
    await assertions.close();
    await monitor?.close();
    client?.close();
    await ipc?.close();
  }
  const assertions = createAssertions({
    onExit: (_key, error) => {
      if (error) log(error);
      schedule();
    },
  });
  function schedule() {
    if (closing) return;
    dirty = true;
    if (!busy) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void cycle().catch(log);
      }, 50);
    }
  }
  async function cycle() {
    if (closing || !monitor) return;
    busy = true;
    dirty = false;
    try {
      await monitor.refresh();
      if (monitor.snapshot().stopped) {
        await shutdown();
        return;
      }
    } catch (e) {
      log(e);
    } finally {
      busy = false;
      if (!closing)
        timer = setTimeout(
          () => {
            void cycle().catch(log);
          },
          dirty ? 50 : 1000,
        );
    }
  }
  try {
    ipc = await serveRuntime(context, async (message) => {
      if (!monitor) throw new Error("Monitor starting");
      if (message.type === "command") {
        if (object(message.command).type === "stop-monitor") {
          setTimeout(() => {
            void shutdown().catch(log);
          }, 100);
        } else await monitor.command(message.command);
      }
      return { snapshot: monitor.snapshot() };
    });
    client = await connectHerdr({
      socketPath: context.socketPath,
      onInvalidate: schedule,
      onUnavailable: (e) => {
        log(e);
        void monitor?.markGap().catch(log);
      },
    });
    const configPath = join(context.configDir, "settings.json");
    monitor = createMonitor({
      herdr: client,
      assertions,
      readPower,
      config: await loadConfig(configPath),
      persistConfig: (config) => saveConfig(configPath, config),
      reloadConfig: () => loadConfig(configPath),
    });
    const stop = () => {
      void shutdown().catch(log);
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    await cycle();
  } catch (e) {
    await shutdown();
    throw e;
  }
}
async function main() {
  const command = process.argv[2];
  if (!command || command === "--help") {
    console.log(
      "Caffeinate: ensure | monitor | controls | popup | stop\nLaunch actions through Herdr so socket and plugin context are available.",
    );
    return;
  }
  if (!["ensure", "monitor", "controls", "popup", "stop"].includes(command))
    throw new Error("Unknown command");
  const context = await resolveContext();
  if (command === "monitor") return runMonitor(context);
  if (command === "stop") {
    await runtimeRequest(context, { type: "command", command: { type: "stop-monitor" } });
    console.log("Monitor stopping");
    return;
  }
  const client = await ensureMonitor(context);
  if (command === "ensure") {
    console.log("Caffeination monitor ready");
    return;
  }
  if (command === "popup") {
    const { runPopup } = await import("./popup.js");
    const { readAgentLabels, readPopupTheme } = await import("./popup-data.js");
    await runPopup({
      client: {
        request: async (message) => parseMonitorResponse(await client.request(message)),
        close: () => client.close(),
      },
      input: process.stdin,
      output: process.stdout,
      target: process.env.CAFFEINATE_TARGET,
      loadLabels: () => readAgentLabels(context.socketPath),
      theme: await readPopupTheme(),
    });
    return;
  }
  const { openControls } = await import("./popup.js");
  await openControls(context, process.env);
}
main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
