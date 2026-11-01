import headless from "@xterm/headless";
import type { Terminal } from "@earendil-works/pi-tui";
import { setTimeout } from "node:timers/promises";

export function makeTestTerminal(size: { columns: number; rows: number }) {
  const parser = new headless.Terminal({
    cols: size.columns,
    rows: size.rows,
    allowProposedApi: true,
  });
  let onInput: ((data: string) => void) | undefined;
  let onResize: (() => void) | undefined;
  let stopped = false;
  const output: string[] = [];
  const write = (data: string) => {
    output.push(data);
    parser.write(data);
  };
  const terminal: Terminal = {
    start(input, resize) {
      onInput = input;
      onResize = resize;
      stopped = false;
    },
    stop() {
      stopped = true;
      onInput = undefined;
      onResize = undefined;
    },
    drainInput() {
      return Promise.resolve();
    },
    write,
    get columns() {
      return parser.cols;
    },
    get rows() {
      return parser.rows;
    },
    kittyProtocolActive: false,
    moveBy(lines) {
      if (lines !== 0) write(`\x1b[${Math.abs(lines)}${lines > 0 ? "B" : "A"}`);
    },
    hideCursor() {
      write("\x1b[?25l");
    },
    showCursor() {
      write("\x1b[?25h");
    },
    clearLine() {
      write("\x1b[2K");
    },
    clearFromCursor() {
      write("\x1b[J");
    },
    clearScreen() {
      write("\x1b[2J\x1b[H");
    },
    setTitle() {},
    setProgress() {},
  };
  function frame() {
    const buffer = parser.buffer.active;
    return Array.from(
      { length: parser.rows },
      (_, i) => buffer.getLine(buffer.viewportY + i)?.translateToString(true, 0, parser.cols) ?? "",
    ).join("\n");
  }
  return {
    terminal,
    output,
    send(data: string) {
      onInput?.(data);
    },
    resize(columns: number, rows: number) {
      parser.resize(columns, rows);
      onResize?.();
    },
    frame,
    async waitFor(text: string) {
      const end = Date.now() + 2500;
      do {
        await setTimeout(5);
        await new Promise<void>((resolve) => parser.write("", resolve));
        if (frame().includes(text)) return;
      } while (Date.now() < end);
      throw new Error(`Missing ${JSON.stringify(text)} in terminal:\n${frame()}`);
    },
    get stopped() {
      return stopped;
    },
    dispose() {
      parser.dispose();
    },
  };
}
