/** Experimental interaction prototype: response browsing and session-local named pins. */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ReferenceBrowser } from "./reference-browser.ts";
import { collectReferences, PIN_ENTRY_TYPE } from "./reference-state.ts";
import type { ReferenceState, ResponseReference } from "./reference-state.ts";
import { actionRow } from "./reference-widgets.ts";
import { installQuietMode } from "./quiet-mode.ts";

export default function referenceUiSpike(pi: ExtensionAPI) {
  let overlayOpen = false;
  let browser: ReferenceBrowser | undefined;
  let requestRender: (() => void) | undefined;
  const quietMode = installQuietMode(pi, () => { requestRender?.(); });
  let state: ReferenceState = { responses: [], pins: new Map() };
  const positions = new Map<string, number>();

  function refresh(ctx: ExtensionContext) {
    state = collectReferences(ctx.sessionManager.getBranch());
    browser?.refresh();
    requestRender?.();
  }

  function setPin(ctx: ExtensionContext, entryId: string, label: string | null) {
    // Use the captured response ID, never whichever response happens to be latest now.
    if (!state.responses.some(response => response.id === entryId)) return;
    pi.appendEntry(PIN_ENTRY_TYPE, { entryId, label });
    refresh(ctx);
  }

  async function open(ctx: ExtensionContext, pinResponse?: ResponseReference) {
    if (ctx.mode !== "tui" || overlayOpen) return;
    overlayOpen = true;
    try {
      await ctx.ui.custom<void>((tui, theme, _keys, done) => {
        let closed = false;
        browser = new ReferenceBrowser({
          tui, theme, state: () => state, positions, pinResponse,
          setPin: (id, label) => setPin(ctx, id, label),
          close: () => {
            if (closed) return;
            closed = true;
            done();
          },
        });
        return browser;
      }, {
        overlay: true,
        overlayOptions: { width: "95%", maxHeight: "90%", margin: 1, anchor: "center" },
      });
    } catch (error) {
      ctx.ui.notify(`Reference prototype: ${String(error)}`, "error");
    } finally {
      browser = undefined;
      overlayOpen = false;
    }
  }

  async function toggleLatest(ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || overlayOpen || !ctx.isIdle()) return;
    const latest = state.responses[0];
    if (!latest) return;
    if (state.pins.has(latest.id)) setPin(ctx, latest.id, null);
    else await open(ctx, latest);
  }

  function install(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;
    positions.clear();
    refresh(ctx);
    ctx.ui.setWidget("reference-ui-spike", (tui, theme) => {
      requestRender = () => tui.requestRender();
      return actionRow(theme, [
        { label: quietMode.label, run: quietMode.toggle },
        {
          label: () => {
            const latest = state.responses[0];
            return latest && state.pins.has(latest.id) ? "Unpin latest" : "Pin latest";
          },
          disabled: () => !ctx.isIdle() || !state.responses.length,
          run: () => { void toggleLatest(ctx); },
        },
        { label: "Responses", run: () => { void open(ctx); } },
      ], "right");
    }, { placement: "belowEditor" });
  }

  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_switch", (_event, ctx) => install(ctx));
  pi.on("session_tree", (_event, ctx) => refresh(ctx));
  pi.on("session_compact", (_event, ctx) => refresh(ctx));
  pi.on("agent_start", () => { requestRender?.(); });
  // agent_end can precede retries/continuations; latest changes once the run settles.
  pi.on("agent_settled", (_event, ctx) => refresh(ctx));
  pi.registerShortcut("ctrl+alt+p", {
    description: "Pin or unpin the latest assistant response",
    handler: toggleLatest,
  });
  pi.registerShortcut("ctrl+alt+r", {
    description: "Browse assistant responses and named pins",
    handler: ctx => open(ctx),
  });
}
