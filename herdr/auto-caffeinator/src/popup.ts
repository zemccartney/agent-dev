import { ProcessTerminal, TuiAltScreen, matchesKey, type Terminal } from "@earendil-works/pi-tui";
import { presentAgent } from "./presentation";
import { validateDuration } from "./model";
import { request, PLUGIN_ID } from "./herdr";
import { createPopupView, type View, type Focus, type Action } from "./popup-view";
import type { Command } from "./model";
import type { MonitorSnapshot } from "./monitor";
import type { Theme } from "./popup-data";
import { object, errorMessage } from "./validation";
export type PopupRequest = { type: "snapshot" } | { type: "command"; command: Command };
export interface PopupClient {
  request(message: PopupRequest): Promise<{ snapshot: MonitorSnapshot }>;
  close(): void;
}
interface PopupOptions {
  client: PopupClient;
  terminal?: Terminal;
  target?: string;
  loadLabels?: () => Promise<Record<string, string>>;
  theme?: Theme;
}
type Send = (
  socketPath: string,
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;
export async function openControls(
  context: { socketPath: string },
  env = process.env,
  send: Send = request,
) {
  let invocation: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid context");
    invocation = object(raw);
  } catch {
    throw new Error("Invalid Herdr action context");
  }
  const target = invocation.focused_pane_id ?? env.HERDR_PANE_ID;
  if (target !== undefined && typeof target !== "string")
    throw new Error("Invalid Herdr pane context");
  await send(context.socketPath, "plugin.pane.open", {
    plugin_id: PLUGIN_ID,
    entrypoint: "controls",
    placement: "popup",
    env: target ? { CAFFEINATE_TARGET: target } : {},
  });
}
export async function runPopup({
  client,
  terminal: supplied,
  target,
  loadLabels = async () => ({}),
  theme,
}: PopupOptions): Promise<void> {
  if (!supplied && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    client.close();
    throw new Error("Caffeination controls require an interactive terminal");
  }
  const terminal = supplied ?? new ProcessTerminal();
  let snapshot: MonitorSnapshot | undefined,
    labels: Record<string, string> = {};
  let selected: string | undefined, pick: string | undefined;
  let view: View = "controls",
    agentView: "controls" | "picker" = "controls",
    focus: Focus = "duration";
  let hours = "2",
    settingsHours = "8",
    automatic = true,
    message = "",
    transportError = "";
  let busy = true,
    ended = false,
    started = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let resolveDone!: () => void, rejectDone!: (error: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const originalStart = terminal.start.bind(terminal);
  terminal.start = (onInput, onResize) =>
    originalStart(onInput, () => {
      paint();
      onResize();
    });
  const tui = new TuiAltScreen(terminal, true, undefined, { copyOnSelect: false });
  const component = createPopupView({
    onAction: (action, occupant) => {
      void activate(action, occupant);
    },
    onEdit: (field, value) => {
      if (ended || busy) return;
      if (field === "duration") hours = value;
      else settingsHours = value;
      paint();
    },
  });
  const row = () => snapshot?.agents.find((agent) => agent.state.occupant === selected);
  const small = () => terminal.columns < 56 || terminal.rows < 18;
  function paint() {
    if (ended) return;
    component.update({
      snapshot,
      labels,
      selected,
      pick,
      view,
      focus,
      hours,
      settingsHours,
      automatic,
      message: message || transportError,
      width: terminal.columns,
      height: terminal.rows,
      theme,
      busy,
    });
    tui.requestRender();
  }
  async function get(message: PopupRequest) {
    const response = await client.request(message);
    if (!ended) snapshot = response.snapshot;
  }
  const duration = (value: string) => {
    const ms = Math.floor(Number(value) * 3600000);
    validateDuration(ms, Date.now());
    return ms;
  };
  async function refresh() {
    if (busy || ended) return;
    busy = true;
    paint();
    try {
      await get({ type: "snapshot" });
      if (ended) return;
      const next = await loadLabels();
      if (!ended) {
        labels = next;
        transportError = "";
      }
    } catch (error) {
      if (!ended) transportError = errorMessage(error);
    } finally {
      busy = false;
      paint();
    }
  }
  async function submit(command: Command) {
    busy = true;
    paint();
    try {
      await get({ type: "command", command });
      if (!ended) message = "";
    } catch (error) {
      if (!ended) {
        message = errorMessage(error);
        try {
          await get({ type: "snapshot" });
        } catch {
          /* Retain the original command failure. */
        }
      }
    } finally {
      busy = false;
      paint();
    }
  }
  function navigate(tab: "agent-tab" | "settings" | "about") {
    if (view === "controls" || view === "picker") agentView = view;
    const next = tab === "agent-tab" ? agentView : tab;
    if (view === next) return;
    view = next;
    message = "";
    focus = view === "settings" ? "automatic" : "duration";
  }
  function movePick(delta: number) {
    const rows = snapshot?.agents ?? [];
    if (!rows.length) return;
    const index = rows.findIndex((agent) => agent.state.occupant === pick);
    pick =
      rows[
        index < 0 ? (delta < 0 ? rows.length - 1 : 0) : (index + delta + rows.length) % rows.length
      ]?.state.occupant;
  }
  async function activate(action: Action, occupant?: string) {
    if (action === "close") return end();
    if (busy || ended || small()) return;
    try {
      if (action === "agents") {
        message = "";
        if (view === "picker" && row()) {
          view = "controls";
          focus = "duration";
        } else {
          view = "picker";
          pick = selected ?? snapshot?.agents[0]?.state.occupant;
        }
      } else if (action === "agent-tab" || action === "settings" || action === "about")
        navigate(action);
      else if (action === "pick") pick = occupant;
      else if (action === "next") movePick(1);
      else if (action === "open") {
        const agent = snapshot?.agents.find((agent) => agent.state.occupant === pick);
        if (agent) {
          selected = agent.state.occupant;
          view = "controls";
          focus = "duration";
          message = "";
        }
      } else if (action === "duration" || action === "defaultDuration") focus = action;
      else if (action === "automatic") {
        automatic = !automatic;
        focus = "automatic";
      } else if (action === "save")
        await submit({
          type: "set-config",
          config: { automatic, defaultDurationMs: duration(settingsHours) },
        });
      else if (action === "apply" || action === "secondary") {
        const agent = row();
        if (!agent) return;
        const guard = {
          occupant: agent.state.occupant,
          runId: agent.state.runId,
          revision: agent.state.revision,
        };
        if (action === "apply")
          await submit({ ...guard, type: "set-duration", durationMs: duration(hours) });
        else if (presentAgent(agent, snapshot?.power ?? "unknown").secondaryLabel)
          await submit({
            ...guard,
            type: agent.state.armedDurationMs !== null ? "cancel-arm" : "release",
          });
      }
    } catch (error) {
      if (!ended) message = errorMessage(error);
    }
    paint();
  }
  function close() {
    end();
  }
  function end(error?: unknown) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    process.stdin.off("end", close);
    process.stdout.off("close", close);
    process.off("SIGTERM", close);
    process.off("SIGINT", close);
    try {
      client.close();
    } catch (failure) {
      error ??= failure;
    }
    const failure = error;
    void terminal
      .drainInput()
      .catch(() => {})
      .then(() => {
        try {
          if (started) tui.stop({ preserveScreen: true });
        } finally {
          terminal.start = originalStart;
        }
      })
      .then(() => {
        if (failure) rejectDone(failure);
        else resolveDone();
      }, rejectDone);
  }
  tui.addInputListener((data) => {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      end();
      return { consume: true };
    }
    if (ended || busy || small()) return { consume: true };
    let action: Action | undefined;
    if (data === "a") action = "agent-tab";
    else if (data === "s") action = "settings";
    else if (data === "?") action = "about";
    else if (matchesKey(data, "tab")) {
      if (view === "settings") {
        focus = focus === "automatic" ? "defaultDuration" : "automatic";
        paint();
        return { consume: true };
      }
      action = view === "about" ? "agent-tab" : "agents";
    } else if (matchesKey(data, "enter") && view !== "about")
      action = view === "picker" ? "open" : view === "settings" ? "save" : "apply";
    else if (view === "settings" && focus === "automatic" && data === " ") action = "automatic";
    else if (view === "controls" && data === "r") action = "secondary";
    if (action) {
      void activate(action);
      return { consume: true };
    }
    return undefined;
  });
  tui.setLayoutRoot(component);
  tui.setFocus(component);
  process.stdin.on("end", close);
  process.stdout.on("close", close);
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
  try {
    paint();
    started = true;
    tui.start();
    void (async () => {
      await get({ type: "snapshot" });
      if (ended) return;
      try {
        const next = await loadLabels();
        if (!ended) labels = next;
      } catch (error) {
        if (!ended) transportError = `Agent names unavailable: ${errorMessage(error)}`;
      }
      if (ended) return;
      automatic = snapshot?.config.automatic ?? true;
      settingsHours = String((snapshot?.config.defaultDurationMs ?? 28800000) / 3600000);
      selected = snapshot?.agents.find((agent) => agent.target === target)?.state.occupant;
      pick = selected ?? snapshot?.agents[0]?.state.occupant;
      if (!selected) view = "picker";
      busy = false;
      paint();
      timer = setInterval(() => {
        void refresh();
      }, 1000);
    })().catch((error: unknown) => {
      if (!ended) end(error);
    });
  } catch (error) {
    end(error);
  }
  await done;
}
