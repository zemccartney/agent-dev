import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import xterm from "@xterm/headless";
import unicode from "@xterm/addon-unicode11";

/** @typedef {Awaited<ReturnType<typeof import('./host-sandbox.mjs').createHostSandbox>>} HostSandbox */
/** @param {string} arg */
const quote = (arg) => `'${arg.replaceAll("'", "'\\''")}'`;

/**
 * PTY transport for tests, using only OS tools and the sandbox-owned process group.
 * @param {HostSandbox} sandbox
 * @param {string} command
 * @param {string[]} args
 * @param {{columns:number, rows:number, timeoutMs?:number}} options
 */
export async function startTerminal(sandbox, command, args, options) {
  if (!["darwin", "linux"].includes(process.platform))
    throw new Error("PTY tests require macOS or Linux");
  for (const size of [options.columns, options.rows]) {
    if (!Number.isInteger(size) || size < 1 || size > 500)
      throw new Error("Invalid terminal dimensions");
  }
  await access("/usr/bin/script", constants.X_OK);
  await access("/bin/stty", constants.X_OK);
  const ttyFile = join(sandbox.root, "terminal-device");
  const bootstrap = 'tty > "$1"; shift; stty columns "$1" rows "$2"; shift 2; exec "$@"';
  const inner = [
    "/bin/sh",
    "-c",
    bootstrap,
    "--",
    ttyFile,
    String(options.columns),
    String(options.rows),
    command,
    ...args,
  ];
  const scriptArgs =
    process.platform === "darwin"
      ? ["-qF", "/dev/null", ...inner]
      : ["-qefc", inner.map(quote).join(" "), "/dev/null"];
  const child = sandbox.spawn(
    "/bin/sh",
    ["-c", 'cat | exec "$@"', "--", "/usr/bin/script", ...scriptArgs],
    { timeoutMs: options.timeoutMs ?? 120_000 },
  );
  const emulator = new xterm.Terminal({
    cols: options.columns,
    rows: options.rows,
    allowProposedApi: true,
  });
  emulator.loadAddon(new unicode.Unicode11Addon());
  emulator.unicode.activeVersion = "11";
  let pending = Promise.resolve();
  let errors = "";
  let disposed = false;
  child.stdout.setEncoding("utf8").on("data", (data) => {
    pending = pending.then(() => new Promise((resolve) => emulator.write(data, resolve)));
  });
  child.stderr.setEncoding("utf8").on("data", (data) => {
    errors = (errors + data).slice(-16000);
  });
  child.on("error", (error) => {
    errors += error.message;
  });
  child.once("close", () => {
    void pending.then(() => emulator.dispose());
  });
  child.stdin.on("error", (error) => {
    errors += error.message;
  });
  emulator.onData((data) => {
    if (!child.stdin.writableEnded && !child.stdin.destroyed) child.stdin.write(data);
  });

  async function screen() {
    await pending;
    return Array.from(
      { length: emulator.rows },
      (_, row) =>
        emulator.buffer.active
          .getLine(emulator.buffer.active.viewportY + row)
          ?.translateToString(true) ?? "",
    );
  }
  /** @param {(text:string) => boolean} predicate @param {string} description @param {number} [timeoutMs] */
  async function waitUntil(predicate, description, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    do {
      const text = (await screen()).join("\n");
      if (predicate(text)) return;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`PTY exited: ${errors}\n${text}`);
      await delay(25);
    } while (Date.now() < end);
    throw new Error(`PTY did not ${description}: ${errors}\n${(await screen()).join("\n")}`);
  }
  /** @param {string} input */
  function send(input) {
    child.stdin.write(input);
  }
  async function close() {
    if (disposed) return;
    disposed = true;
    child.stdin.end();
    const deadline = Date.now() + 3000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline)
      await delay(20);
    await pending;
    emulator.dispose();
    if (child.exitCode === null && child.signalCode === null)
      throw new Error(`PTY did not exit: ${errors}`);
  }
  return {
    send,
    screen,
    close,
    waitUntil,
    /** @param {string} text */
    async foregroundOf(text) {
      await pending;
      for (let row = 0; row < emulator.rows; row++) {
        const line = emulator.buffer.active.getLine(emulator.buffer.active.viewportY + row);
        if (!line) continue;
        let value = "";
        const columns = [];
        for (let column = 0; column < emulator.cols; column++) {
          const chars = line.getCell(column)?.getChars() ?? "";
          for (let i = 0; i < chars.length; i++) columns.push(column);
          value += chars;
        }
        const index = value.indexOf(text);
        if (index >= 0) {
          const cell = line.getCell(columns[index]);
          return { mode: cell?.getFgColorMode(), color: cell?.getFgColor() };
        }
      }
      throw new Error(`Missing color reference: ${text}`);
    },
    /** @param {string} text @param {number} [timeoutMs] */
    waitFor: (text, timeoutMs) =>
      waitUntil((value) => value.includes(text), `show ${JSON.stringify(text)}`, timeoutMs),
    /** @param {string} text */
    waitWithout: (text) =>
      waitUntil((value) => !value.includes(text), `remove ${JSON.stringify(text)}`),
    /** @param {string} text */
    async click(text) {
      const lines = await screen();
      const row = lines.findIndex((line) => line.includes(text));
      if (row < 0) throw new Error(`Missing mouse target: ${text}`);
      const col = lines[row].indexOf(text) + 1;
      send(`\x1b[<0;${col};${row + 1}M\x1b[<0;${col};${row + 1}m`);
    },
    /** @param {number} columns @param {number} rows */
    async resize(columns, rows) {
      if (![columns, rows].every((value) => Number.isInteger(value) && value > 0 && value <= 500))
        throw new Error("Invalid terminal dimensions");
      const tty = (await readFile(ttyFile, "utf8")).trim();
      if (!/^\/dev\/(?:ttys[\da-z]+|pts\/\d+)$/i.test(tty))
        throw new Error("Unexpected sandbox terminal device");
      const size = sandbox.spawn("/bin/stty", [
        process.platform === "darwin" ? "-f" : "-F",
        tty,
        "columns",
        String(columns),
        "rows",
        String(rows),
      ]);
      size.stdin.end();
      const code = await new Promise((resolve) => size.once("close", resolve));
      if (code !== 0) throw new Error("Failed to resize sandbox terminal");
      emulator.resize(columns, rows);
    },
  };
}

/** @param {HostSandbox} sandbox @param {{mode:'regular'|'fullscreen', columns:number, rows:number}} options */
export async function startTui(sandbox, options) {
  return startTerminal(
    sandbox,
    sandbox.nodePath,
    [sandbox.cliPath, ...sandbox.sessionArgs, "--tui-mode", options.mode],
    { ...options, timeoutMs: 180_000 },
  );
}
