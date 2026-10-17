import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { QuietActivity } from "./quiet-state.ts";
import { registerQuietRenderers } from "./quiet-renderers.ts";

/** Quiet/Raw is presentation state only. Native dialogs, retry indicators, and errors stay intact. */
export function installQuietMode(pi: ExtensionAPI, repaint: () => void) {
  let quiet = true;
  let ui: ExtensionContext["ui"] | undefined;
  let lastMessage: string | undefined;
  let stopTimer = () => {};
  const activity = new QuietActivity();
  const renderers = registerQuietRenderers(pi, () => quiet);

  function clearLabel() {
    if (lastMessage !== undefined) ui?.setWorkingMessage();
    lastMessage = undefined;
  }
  function updateLabel() {
    if (!ui) return;
    const status = activity.status(Date.now());
    const message = status ? ui.theme.fg("warning", status.text) : undefined;
    if (message === lastMessage) return;
    // Pi updates only its ordinary Working indicator here. Retry and compaction
    // indicators keep their own wording; we never replace the indicator itself.
    ui.setWorkingMessage(message);
    lastMessage = message;
  }

  function install(ctx: ExtensionContext) {
    stopTimer();
    clearLabel();
    activity.reset();
    ui = ctx.mode === "tui" ? ctx.ui : undefined;
    if (!ui) return;
    ui.setWidget("quiet-activity", undefined); // Remove the earlier standalone row.
    if (!ctx.isIdle()) activity.start(Date.now());
    // Poll the age, but never count this timer as model/tool activity.
    const timer = setInterval(updateLabel, 1000);
    timer.unref();
    stopTimer = () => clearInterval(timer);
  }

  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_shutdown", () => {
    stopTimer();
    clearLabel();
    ui = undefined;
    renderers.dispose();
  });
  pi.on("agent_start", () => {
    activity.start(Date.now());
    updateLabel();
  });
  pi.on("message_update", () => {
    activity.touch(Date.now());
    updateLabel();
  });
  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") {
      activity.touch(Date.now());
      updateLabel();
    }
  });
  pi.on("tool_execution_start", (event) => {
    activity.toolStart(event.toolCallId, event.toolName, Date.now());
    updateLabel();
  });
  pi.on("tool_execution_update", () => {
    activity.touch(Date.now());
    updateLabel();
  });
  pi.on("tool_execution_end", (event) => {
    activity.toolEnd(event.toolCallId, Date.now());
    updateLabel();
  });
  pi.on("ui_prompt_start", () => {
    activity.dialogOpened();
    updateLabel();
  });
  pi.on("ui_prompt_end", () => {
    activity.dialogClosed();
    updateLabel();
  });
  pi.on("agent_settled", () => {
    activity.settle();
    updateLabel();
  });

  const toggle = () => {
    quiet = !quiet;
    renderers.invalidate();
    repaint();
  };
  pi.registerShortcut("ctrl+alt+q", {
    description: "Toggle Quiet/Raw tool display",
    handler: (ctx) => {
      if (ctx.mode === "tui") toggle();
    },
  });
  return { label: () => (quiet ? "View: Quiet" : "View: Raw"), toggle };
}
