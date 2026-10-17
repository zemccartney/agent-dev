import type { Theme } from "@earendil-works/pi-coding-agent";
import { Box, MouseRegion, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

export type Action = {
  label: string | (() => string);
  run: () => void;
  disabled?: () => boolean;
  active?: () => boolean;
};

/** Whole-label hit targets; disabled actions are checked again at click time. */
export function actionRow(
  theme: Theme,
  actions: Action[],
  align: "left" | "right" = "left",
): Component {
  let targets: { start: number; end: number; action: Action }[] = [];
  return new MouseRegion(
    {
      render(width) {
        targets = [];
        const shown: { label: string; action: Action }[] = [];
        let used = 0;
        for (const action of actions) {
          const label = `[${typeof action.label === "function" ? action.label() : action.label}]`;
          const next = used + (shown.length ? 2 : 0) + visibleWidth(label);
          if (next > width - 2) break;
          shown.push({ label, action });
          used = next;
        }
        if (!shown.length) return [""];
        let column = align === "right" ? width - used - 1 : 1;
        let line = " ".repeat(column);
        for (const { label, action } of shown) {
          const end = column + visibleWidth(label);
          targets.push({ start: column, end, action });
          const color = action.disabled?.()
            ? "dim"
            : action.active && !action.active()
              ? "muted"
              : "accent";
          line += theme.fg(color, action.active?.() ? theme.bold(label) : label) + "  ";
          column = end + 2;
        }
        return [line.trimEnd()];
      },
      invalidate() {},
    },
    (event) => {
      if (event.button !== "left" || event.y !== 0) return;
      const target = targets.find(({ start, end }) => event.x >= start && event.x < end);
      if (!target || !["press", "release", "click"].includes(event.type)) return;
      if (event.type === "click" && !target.action.disabled?.()) target.action.run();
      // Claim press/click, but never steal keyboard focus from the composer.
      return { handled: true };
    },
  );
}

export function oneLine(text: () => string): Component {
  return { render: (width) => [truncateToWidth(text(), width)], invalidate() {} };
}

export function modalHeight(terminalRows: number): number {
  return Math.max(1, Math.min(terminalRows - 2, Math.floor(terminalRows * 0.9)));
}

/** Keep controls stationary even when the results are empty or contain hundreds of entries. */
export function fixedHeight(child: Component, height: number): Component {
  return {
    render(width) {
      const lines = child.render(width).slice(0, height);
      while (lines.length < height) lines.push("");
      return lines;
    },
    invalidate: () => child.invalidate(),
    handleMouse: (event) =>
      child.handleMouse?.(event) ?? (event.type === "wheel" ? { handled: true } : undefined),
  };
}

/** A neutral panel rather than the colored background intended for custom chat messages. */
export function framed(theme: Theme, children: Component[]): Component {
  const box = new Box(2, 1, (text) => theme.bg("toolPendingBg", text));
  for (const child of children) box.addChild(child);
  let renderedWidth = 0;
  let renderedHeight = 0;
  return {
    render(width) {
      renderedWidth = width;
      if (width < 4) {
        renderedHeight = 1;
        return [truncateToWidth("…", width)];
      }
      const innerWidth = width - 2;
      const border = (text: string) => theme.fg("borderAccent", text);
      const lines = box
        .render(innerWidth)
        .map((line) => border("│") + truncateToWidth(line, innerWidth, "") + border("│"));
      renderedHeight = lines.length + 2;
      return [
        border(`╭${"─".repeat(innerWidth)}╮`),
        ...lines,
        border(`╰${"─".repeat(innerWidth)}╯`),
      ];
    },
    invalidate: () => box.invalidate(),
    handleMouse(event) {
      if (
        renderedWidth < 4 ||
        event.x < 1 ||
        event.x >= renderedWidth - 1 ||
        event.y < 1 ||
        event.y >= renderedHeight - 1
      )
        return;
      return box.handleMouse({
        ...event,
        x: event.x - 1,
        y: event.y - 1,
        width: renderedWidth - 2,
        height: renderedHeight - 2,
      });
    },
  };
}
