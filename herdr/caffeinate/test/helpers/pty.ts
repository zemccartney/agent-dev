import { createEmulator } from "./xterm.ts";
import { spawn, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const exec = promisify(execFile);
export function startPty(command: string, args: string[], env: NodeJS.ProcessEnv, root: string) {
  const emulator = createEmulator(110, 36);
  const ttyFile = join(root, "client-tty");
  const child = spawn(
    "/bin/sh",
    [
      "-c",
      `/bin/cat | /usr/bin/script -qF /dev/null /bin/sh -c '/usr/bin/tty > "$1"; shift; stty columns 110 rows 36; exec "$@"' -- "$@"`,
      "--",
      ttyFile,
      command,
      ...args,
    ],
    { env, cwd: root },
  );
  let pending = Promise.resolve(),
    errors = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (data: string) => {
    errors = (errors + data).slice(-16000);
  });
  child.on("error", (error) => {
    errors += error.message;
  });
  emulator.onData((response) => {
    if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.write(response);
  });
  child.stdout.on("data", (data: string) => {
    pending = pending.then(() => new Promise<void>((resolve) => emulator.write(data, resolve)));
  });
  child.stdin.on("error", (error) => {
    errors += error.message;
  });
  const frame = () =>
    Array.from(
      { length: emulator.rows },
      (_, row) =>
        emulator.buffer.active
          .getLine(emulator.buffer.active.viewportY + row)
          ?.translateToString(true) ?? "",
    ).join("\n");
  const send = (data: string) => {
    child.stdin.write(data);
  };
  async function until(predicate: (text: string) => boolean, description: string) {
    const deadline = Date.now() + 10000;
    do {
      await wait(25);
      await pending;
      if (predicate(frame())) return;
      if (child.exitCode !== null || child.signalCode !== null) break;
    } while (Date.now() < deadline);
    throw new Error(`PTY did not ${description}: ${errors}\n${frame()}`);
  }
  return {
    frame,
    foregroundAt: (column: number, row: number) =>
      emulator.buffer.active
        .getLine(emulator.buffer.active.viewportY + row)
        ?.getCell(column)
        ?.getFgColor(),
    send,
    waitUntil: until,
    waitFor: (text: string) =>
      until((value) => value.includes(text), `show ${JSON.stringify(text)}`),
    waitWithout: (text: string) =>
      until((value) => !value.includes(text), `remove ${JSON.stringify(text)}`),
    click(text: string) {
      const lines = frame().split("\n");
      const y = lines.findIndex((line) => line.includes(text));
      if (y < 0) throw new Error(`Cannot click missing text: ${text}`);
      const x = lines[y].indexOf(text) + 1;
      send(`\x1b[<0;${x};${y + 1}M\x1b[<0;${x};${y + 1}m`);
    },
    async resize(columns: number, rows: number) {
      const tty = (await readFile(ttyFile, "utf8")).trim();
      if (!/^\/dev\/ttys[\da-z]+$/i.test(tty)) throw new Error("Unexpected sandbox PTY path");
      await exec("/bin/stty", ["-f", tty, "columns", String(columns), "rows", String(rows)]);
      emulator.resize(columns, rows);
    },
    async close() {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end("\x02q");
      for (let i = 0; i < 100 && child.exitCode === null && child.signalCode === null; i++)
        await wait(20);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await pending;
      emulator.dispose();
    },
  };
}
