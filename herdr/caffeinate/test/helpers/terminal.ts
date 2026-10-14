import { createEmulator } from "./xterm.ts";
import { StdinBuffer, type Terminal } from "@earendil-works/pi-tui";
import { setTimeout as wait } from "node:timers/promises";

/** Parse actual renderer output; StdinBuffer models ProcessTerminal's input boundary. */
export function makeTestTerminal({ columns, rows }: { columns: number; rows: number }) {
  const emulator = createEmulator(columns, rows);
  const input = new StdinBuffer();
  let onResize = () => {};
  let pending = Promise.resolve();
  let stopCount = 0;
  const terminal: Terminal = {
    get columns() {
      return emulator.cols;
    },
    get rows() {
      return emulator.rows;
    },
    kittyProtocolActive: false,
    start(onInput, resize) {
      onResize = resize;
      input.on("data", onInput);
      input.on("paste", (value) => onInput(`\x1b[200~${value}\x1b[201~`));
    },
    stop() {
      stopCount++;
      input.destroy();
    },
    async drainInput() {},
    write(data) {
      pending = pending.then(() => new Promise<void>((resolve) => emulator.write(data, resolve)));
    },
    moveBy(lines) {
      terminal.write(`\x1b[${Math.abs(lines)}${lines < 0 ? "A" : "B"}`);
    },
    hideCursor() {
      terminal.write("\x1b[?25l");
    },
    showCursor() {
      terminal.write("\x1b[?25h");
    },
    clearLine() {
      terminal.write("\x1b[2K");
    },
    clearFromCursor() {
      terminal.write("\x1b[J");
    },
    clearScreen() {
      terminal.write("\x1b[2J\x1b[H");
    },
    setTitle() {},
    setProgress() {},
  };
  const frame = () =>
    Array.from(
      { length: emulator.rows },
      (_, row) =>
        emulator.buffer.active
          .getLine(emulator.buffer.active.viewportY + row)
          ?.translateToString(true) ?? "",
    ).join("\n");
  return {
    terminal,
    send(data: string) {
      if (!stopCount) input.process(data);
    },
    resize(nextColumns: number, nextRows: number) {
      emulator.resize(nextColumns, nextRows);
      onResize();
    },
    frame,
    foregroundAt: (column: number, row: number) =>
      emulator.buffer.active
        .getLine(emulator.buffer.active.viewportY + row)
        ?.getCell(column)
        ?.getFgColor(),
    async waitFor(text: string) {
      const until = Date.now() + 2000;
      do {
        await wait(10);
        await pending;
        if (frame().includes(text)) return;
      } while (Date.now() < until);
      throw new Error(`Terminal did not show ${JSON.stringify(text)}:\n${frame()}`);
    },
    get stopped() {
      return stopCount > 0;
    },
    get stopCount() {
      return stopCount;
    },
    async dispose() {
      input.destroy();
      await pending;
      emulator.dispose();
    },
  };
}
