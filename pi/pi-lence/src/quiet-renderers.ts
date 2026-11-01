import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
type ToolRenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
import { Box, Container } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

// Unfamiliar/custom tools remain visible until their interaction contracts are understood.
const ROUTINE_TOOLS = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "powershell",
  "grep",
  "find",
  "ls",
]);
const empty: Component = { render: () => [], invalidate() {} };

/** Rendering only: execution, arguments, results, and stored history are never changed. */
export function registerQuietRenderers(pi: ExtensionAPI, isQuiet: () => boolean) {
  const invalidators = new Set<WeakRef<{ invalidateTool: () => void }>>();
  pi.registerToolRenderer((name, next) => {
    const original = next();
    if (!ROUTINE_TOOLS.has(name) || !original?.renderCall || !original.renderResult)
      return original;
    let call: Component | undefined;
    let result: Component | undefined;
    let context: ToolRenderContext;
    let theme: Theme;
    let rendered: Container | Box | undefined;
    let registered = false;
    const updateContext = (nextContext: ToolRenderContext, nextTheme: Theme) => {
      context = nextContext;
      theme = nextTheme;
      if (!registered) {
        invalidators.add(new WeakRef(body));
        registered = true;
      }
    };
    const body: Component & { invalidateTool: () => void } = {
      invalidateTool: () => context.invalidate(),
      render(width) {
        if (isQuiet() && !context.isError) {
          rendered = undefined;
          return [];
        }
        // Preserve the original renderer's framing in Raw, and for errors in either mode.
        rendered =
          original.renderShell === "self"
            ? new Container()
            : new Box(context.outputPad, 1, (text) =>
                theme.bg(
                  context.isPartial
                    ? "toolPendingBg"
                    : context.isError
                      ? "toolErrorBg"
                      : "toolSuccessBg",
                  text,
                ),
              );
        if (call) rendered.addChild(call);
        if (result) rendered.addChild(result);
        return rendered.render(width);
      },
      invalidate() {
        call?.invalidate();
        result?.invalidate();
      },
      handleMouse: (event) => rendered?.handleMouse(event),
    };
    return {
      renderShell: "self",
      renderCall(args, nextTheme, nextContext) {
        updateContext(nextContext, nextTheme);
        call = original.renderCall!(args, nextTheme, { ...nextContext, lastComponent: call });
        return body;
      },
      renderResult(value, options, nextTheme, nextContext) {
        updateContext(nextContext, nextTheme);
        result = original.renderResult!(value, options, nextTheme, {
          ...nextContext,
          lastComponent: result,
        });
        // Both slots render together in body, so the original shell is not duplicated.
        return empty;
      },
    };
  });
  return {
    invalidate() {
      for (const ref of invalidators) {
        const body = ref.deref();
        if (body) body.invalidateTool();
        else invalidators.delete(ref);
      }
    },
    dispose() {
      invalidators.clear();
    },
  };
}
