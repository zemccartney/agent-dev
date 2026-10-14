import { presentAgent } from "./presentation";
import { validateDuration } from "./model";
import { request, PLUGIN_ID } from "./herdr";
import { renderPopup } from "./popup-view";
import { createPopupInput, type MouseInput } from "./popup-input";
import type { Readable, Writable } from "node:stream";
import type { Key } from "node:readline";
import type { Command } from "./model";
import type { MonitorSnapshot } from "./monitor";
import type { Theme } from "./popup-data";
import type { View, Focus, Action, Hit } from "./popup-view";
import { object, errorMessage } from "./validation";
export type PopupRequest = { type: "snapshot" } | { type: "command"; command: Command };
export interface PopupClient {
  request(message: PopupRequest): Promise<{ snapshot: MonitorSnapshot }>;
  close(): void;
}
export interface PopupInput extends Pick<Readable, "on" | "off" | "pause" | "resume"> {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => unknown;
}
export interface PopupOutput extends Pick<Writable, "write" | "on" | "off"> {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
}
interface PopupOptions {
  client: PopupClient;
  input: PopupInput;
  output: PopupOutput;
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
  const params = {
    plugin_id: PLUGIN_ID,
    entrypoint: "controls",
    placement: "popup",
    env: target ? { CAFFEINATE_TARGET: target } : {},
  };
  await send(context.socketPath, "plugin.pane.open", params);
}

export async function runPopup({
  client,
  input,
  output,
  target,
  loadLabels = async () => ({}),
  theme,
}: PopupOptions) {
  if (!input.isTTY || !output.isTTY || !input.setRawMode)
    throw new Error("Caffeination controls require an interactive terminal");
  let snapshot: MonitorSnapshot | undefined,
    labels: Record<string, string> = {},
    selected: string | undefined,
    pick: string | undefined,
    view: View = "controls",
    focus: Focus = "duration",
    hours = "2",
    caret = 1,
    replace = true;
  let settingsHours = "8",
    automatic = true,
    message = "",
    transportError = "",
    busy = false,
    ended = false,
    entered = false,
    timer: ReturnType<typeof setInterval> | undefined,
    decoder: ReturnType<typeof createPopupInput> | undefined,
    lastPaint = "",
    frame: ReturnType<typeof renderPopup> | undefined;
  let agentView: "controls" | "picker" = "controls";
  const wasRaw = !!input.isRaw;
  const row = () => snapshot?.agents.find((a) => a.state.occupant === selected);
  const request = async (m: PopupRequest) => {
    const r = await client.request(m);
    snapshot = r.snapshot;
    return snapshot;
  };
  const duration = (value: string) => {
    const ms = Math.floor(Number(value) * 3600000);
    validateDuration(ms, Date.now());
    return ms;
  };
  function paint() {
    if (ended || !entered) return;
    frame = renderPopup({
      snapshot,
      labels,
      selected,
      pick,
      view,
      focus,
      hours,
      caret,
      settingsHours,
      automatic,
      message: message || transportError,
      width: output.columns ?? 80,
      height: output.rows ?? 20,
      theme,
    });
    const text =
      "\x1b[?25l" +
      frame.text +
      (frame.cursor ? `\x1b[${frame.cursor.y};${frame.cursor.x}H\x1b[?25h` : "");
    if (text !== lastPaint) {
      output.write(text);
      lastPaint = text;
    }
  }
  async function refresh() {
    if (busy || ended) return;
    busy = true;
    try {
      await request({ type: "snapshot" });
      labels = await loadLabels();
      transportError = "";
    } catch (e) {
      transportError = errorMessage(e);
    } finally {
      busy = false;
      paint();
    }
  }
  async function submit(command: Command) {
    busy = true;
    try {
      await request({ type: "command", command });
      message = "";
    } catch (e) {
      message = errorMessage(e);
      try {
        await request({ type: "snapshot" });
      } catch {}
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
    caret = view === "settings" ? settingsHours.length : hours.length;
    replace = true;
  }
  function agents() {
    message = "";
    if (view === "picker" && row()) {
      view = "controls";
      focus = "duration";
      caret = hours.length;
      replace = true;
    } else {
      view = "picker";
      pick = selected ?? snapshot?.agents[0]?.state.occupant;
    }
  }
  function movePick(delta: number) {
    const rows = snapshot?.agents ?? [];
    if (!rows.length) return;
    const index = rows.findIndex((a) => a.state.occupant === pick);
    pick =
      rows[
        index < 0 ? (delta < 0 ? rows.length - 1 : 0) : (index + delta + rows.length) % rows.length
      ]?.state.occupant;
  }
  async function activate(action: Action, hit?: Hit & { clickX: number }) {
    if (action === "close") return end();
    if (busy || ended) return;
    try {
      if (action === "agents") agents();
      else if (action === "agent-tab" || action === "settings" || action === "about")
        navigate(action);
      else if (action === "pick") pick = hit?.occupant;
      else if (action === "next") movePick(1);
      else if (action === "open") {
        const a = snapshot?.agents.find((a) => a.state.occupant === pick);
        if (a) {
          selected = a.state.occupant;
          view = "controls";
          focus = "duration";
          caret = hours.length;
          replace = true;
          message = "";
        }
      } else if (action === "duration" || action === "defaultDuration") {
        const value = action === "duration" ? hours : settingsHours;
        replace = focus !== action;
        focus = action;
        caret = replace
          ? value.length
          : Math.max(
              0,
              Math.min(value.length, (hit?.clickX ?? 0) - (hit?.valueX ?? 0) + (hit?.scroll ?? 0)),
            );
      } else if (action === "automatic") {
        automatic = !automatic;
        focus = "automatic";
      } else if (action === "save")
        await submit({
          type: "set-config",
          config: { automatic, defaultDurationMs: duration(settingsHours) },
        });
      else if (action === "apply" || action === "secondary") {
        const a = row();
        if (!a) return;
        const guard = {
          occupant: a.state.occupant,
          runId: a.state.runId,
          revision: a.state.revision,
        };
        if (action === "apply")
          await submit({ ...guard, type: "set-duration", durationMs: duration(hours) });
        else if (presentAgent(a, snapshot?.power ?? "unknown").secondaryLabel)
          await submit({
            ...guard,
            type: a.state.armedDurationMs !== null ? "cancel-arm" : "release",
          });
      }
    } catch (e) {
      message = errorMessage(e);
    }
    paint();
  }
  function mouse(event: MouseInput) {
    if (event.release || ended) return;
    if (view === "picker" && (event.button === 64 || event.button === 65)) {
      if (!busy) {
        movePick(event.button === 64 ? -1 : 1);
        paint();
      }
      return;
    }
    if ((event.button & 3) !== 0 || (event.button & 32) !== 0) return;
    const hit = frame?.hits.find(
      (h) =>
        event.x >= h.x && event.x < h.x + h.width && event.y >= h.y && event.y < h.y + h.height,
    );
    if (hit) void activate(hit.action, { ...hit, clickX: event.x });
  }
  function key(str: string | undefined, k: Key = {}) {
    if (ended) return;
    if (k.name === "escape" || (k.ctrl && k.name === "c")) return end();
    if (busy) return;
    if (str === "a") return void activate("agent-tab");
    if (str === "s") return void activate("settings");
    if (str === "?") return void activate("about");
    if (k.name === "tab") {
      if (view === "settings") {
        focus = focus === "automatic" ? "defaultDuration" : "automatic";
        caret = settingsHours.length;
        replace = true;
        paint();
      } else void activate(view === "about" ? "agent-tab" : "agents");
      return;
    }
    if (view === "about") return;
    if (view === "picker") {
      if (k.name === "return") void activate("open");
      else if (k.name === "down" || k.name === "up") {
        movePick(k.name === "up" ? -1 : 1);
        paint();
      } else if (k.name === "home" || k.name === "end") {
        pick = snapshot?.agents[k.name === "home" ? 0 : snapshot.agents.length - 1]?.state.occupant;
        paint();
      }
      return;
    }
    if (k.name === "return") return void activate(view === "settings" ? "save" : "apply");
    if (view === "settings" && focus === "automatic" && (k.name === "space" || str === " "))
      return void activate("automatic");
    if (view === "controls" && str === "r") return void activate("secondary");
    if (
      !(
        (view === "settings" && focus === "defaultDuration") ||
        (view === "controls" && focus === "duration" && row())
      )
    )
      return;
    let value = view === "settings" ? settingsHours : hours;
    if (k.ctrl && k.name === "u") {
      value = "";
      caret = 0;
      replace = false;
    } else if (k.name === "left") {
      caret = Math.max(0, caret - 1);
      replace = false;
    } else if (k.name === "right") {
      caret = Math.min(value.length, caret + 1);
      replace = false;
    } else if (k.name === "home") {
      caret = 0;
      replace = false;
    } else if (k.name === "end") {
      caret = value.length;
      replace = false;
    } else if (k.name === "backspace") {
      if (caret > 0) {
        value = value.slice(0, caret - 1) + value.slice(caret);
        caret--;
      }
      replace = false;
    } else if (k.name === "delete") {
      value = value.slice(0, caret) + value.slice(caret + 1);
      replace = false;
    } else if (!k.ctrl && !k.meta && str && /^[0-9.eE+-]+$/.test(str)) {
      if (replace) {
        value = "";
        caret = 0;
      }
      if (value.length + str.length <= 100) {
        value = value.slice(0, caret) + str + value.slice(caret);
        caret += str.length;
      }
      replace = false;
    }
    if (view === "settings") settingsHours = value;
    else hours = value;
    paint();
  }
  let finish: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  function end() {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    decoder?.close();
    input.off("data", feed);
    input.off("end", end);
    output.off("resize", paint);
    if (entered) {
      input.setRawMode?.(wasRaw);
      input.pause();
      output.write("\x1b[?1000l\x1b[?1006l\x1b[0 q\x1b[0m\x1b[?25h\x1b[?1049l");
    }
    client.close();
    finish();
  }
  const feed = (chunk: string | Buffer) => decoder?.feed(chunk);
  try {
    await request({ type: "snapshot" });
    try {
      labels = await loadLabels();
    } catch (e) {
      transportError = `Agent names unavailable: ${errorMessage(e)}`;
    }
    automatic = snapshot?.config.automatic ?? true;
    settingsHours = String((snapshot?.config.defaultDurationMs ?? 28800000) / 3600000);
    selected = snapshot?.agents.find((a) => a.target === target)?.state.occupant;
    pick = selected ?? snapshot?.agents[0]?.state.occupant;
    if (!selected) view = "picker";
    output.write("\x1b[?1049h\x1b[2J\x1b[?25l\x1b[5 q\x1b[?1000h\x1b[?1006h");
    entered = true;
    decoder = createPopupInput({ onKey: key, onMouse: mouse });
    input.setRawMode(true);
    input.on("data", feed);
    input.on("end", end);
    output.on("resize", paint);
    input.resume();
    paint();
    timer = setInterval(() => {
      void refresh();
    }, 1000);
    await done;
  } finally {
    end();
  }
}
