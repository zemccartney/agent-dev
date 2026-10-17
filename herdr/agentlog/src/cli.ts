import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { createHerdrClient } from "./herdr.js";
import { openStore } from "./store.js";
import { captureEvent } from "./capture.js";
import { runPopup } from "./popup.js";
import { safeDisplay } from "./catalog.js";

async function main() {
  const command = process.argv[2];
  if (command === "--help") {
    console.log(
      "agentlog — saved Pi conversation registry\nCommands: sessions | ui | capture\nInvoke through Herdr; see README for runtime prerequisites.",
    );
    return;
  }
  if (!["sessions", "ui", "capture"].includes(command ?? ""))
    throw new Error("unsupported command; use --help");
  const env = process.env;
  const stateDir = env.HERDR_PLUGIN_STATE_DIR;
  if (env.HERDR_PLUGIN_ID !== "grepco.agentlog" || !stateDir || !isAbsolute(stateDir))
    throw new Error("Run Agentlog from Herdr: missing plugin context");
  const herdr = createHerdrClient(env);
  if (command === "sessions") {
    await herdr.openPopup();
    return;
  }
  if (command === "ui" && (!process.stdin.isTTY || !process.stdout.isTTY))
    throw new Error(
      "The registry needs an interactive terminal; invoke the Sessions action in Herdr.",
    );
  const store = openStore(stateDir);
  try {
    if (command === "capture") {
      if (!env.HERDR_PLUGIN_EVENT_JSON) throw new Error("Missing HERDR_PLUGIN_EVENT_JSON");
      await captureEvent(env.HERDR_PLUGIN_EVENT_JSON, herdr, store);
      return;
    }
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      await runPopup({
        store,
        herdr,
        context: { home: homedir(), env, projectCwds: [], livePaths: [] },
        signal: controller.signal,
      });
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  } finally {
    store.close();
  }
}
try {
  await main();
} catch (error) {
  console.error(`agentlog: ${safeDisplay(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
}
