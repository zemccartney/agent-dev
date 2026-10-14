import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, realpath, stat, rm, symlink } from "node:fs/promises";
import { join, delimiter, resolve } from "node:path";
import { homedir } from "node:os";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import headless from "@xterm/headless";
import { visibleWidth } from "@earendil-works/pi-tui";
import { prepareRuntime } from "./runtime.ts";
const exec = promisify(execFile);
export interface RawPane {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  cwd?: string;
  agent?: string;
  agent_session?: { agent: string; kind: string; value: string };
}
export async function waitUntil<T>(
  read: () => Promise<T> | T,
  accept: (value: T) => boolean,
  label: string,
  timeout = 15000,
): Promise<T> {
  const end = Date.now() + timeout;
  let last: unknown;
  do {
    try {
      const value = await read();
      if (accept(value)) return value;
      last = value;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await setTimeout(50);
  } while (Date.now() < end);
  throw new Error(`Timed out: ${label}; last=${JSON.stringify(last)}`);
}
async function fingerprint(path: string) {
  try {
    const info = await stat(path);
    return info.isFile()
      ? createHash("sha256")
          .update(await readFile(path))
          .digest("hex")
      : `${info.dev}:${info.ino}`;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "missing";
    throw error;
  }
}
async function binary(name: string) {
  const found = (await exec("/usr/bin/which", [name])).stdout.trim();
  assert.ok(found, `${name} is required for opted-in live tests`);
  return realpath(found);
}
function exited(child: ChildProcessWithoutNullStreams) {
  return child.exitCode !== null || child.signalCode !== null;
}
async function descendants(parent: number) {
  const output = (await exec("/bin/ps", ["-ax", "-o", "pid=,ppid="])).stdout;
  const rows = output
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/u).map(Number));
  const found = new Set([parent]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows)
      if (found.has(ppid) && !found.has(pid)) {
        found.add(pid);
        changed = true;
      }
  }
  found.delete(parent);
  return [...found];
}

export async function createHerdrSandbox() {
  assert.equal(process.env.AGENTLOG_RUN_HERDR_TESTS, "1", "Live tests must be explicitly opted in");
  assert.equal(process.platform, "darwin", "Live PTY helper currently targets macOS");
  const herdr = await binary("herdr");
  const pi = await binary("pi");
  const node = await realpath(process.execPath);
  await stat("/usr/bin/script");
  const realConfig = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "herdr");
  const protectedPaths = [
    join(realConfig, "config.toml"),
    join(realConfig, "plugins.json"),
    join(realConfig, "herdr.sock"),
    join(homedir(), ".pi/agent/extensions/herdr-agent-state.ts"),
    ...([process.env.HERDR_CONFIG_PATH, process.env.HERDR_SOCKET_PATH].filter(Boolean) as string[]),
  ];
  const before = await Promise.all(protectedPaths.map(fingerprint));
  const root = await realpath(await mkdtemp("/tmp/al-"));
  const name = `al-${randomBytes(3).toString("hex")}`;
  const home = join(root, "home");
  const config = join(root, "c");
  const state = join(root, "s");
  const agent = join(root, "pi");
  const bin = join(root, "bin");
  const project = join(root, "project café");
  const payload = join(root, "payload");
  for (const dir of [home, join(config, "herdr"), state, agent, bin, project])
    await mkdir(dir, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_STATE_HOME: state,
    XDG_DATA_HOME: join(root, "d"),
    TMPDIR: root,
    PATH: [bin, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter),
    SHELL: "/bin/bash",
    TERM: "xterm-256color",
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    PI_CODING_AGENT_DIR: agent,
    PI_OFFLINE: "1",
    AGENTLOG_REAL_PI: pi,
  };
  for (const path of [home, config, state, agent, project])
    assert.ok((await realpath(path)).startsWith(root + "/"), "isolation root escaped sandbox");
  for (const key of Object.keys(env))
    assert.ok(
      !key.startsWith("HERDR_") && !/KEY|TOKEN|SECRET|CREDENTIAL/u.test(key),
      "unexpected inherited routing/credential",
    );
  await symlink(node, join(bin, "node"));
  await symlink(herdr, join(bin, "herdr"));
  await writeFile(
    join(bin, "pi"),
    '#!/bin/sh\nexec "$AGENTLOG_REAL_PI" --offline --no-skills --no-prompt-templates --no-context-files --no-approve "$@"\n',
    { mode: 0o700 },
  );
  await writeFile(join(home, ".bashrc"), "PS1='sandbox$ '\nunset PROMPT_COMMAND\nset +o history\n");
  await writeFile(
    join(config, "herdr/config.toml"),
    'onboarding = false\n[terminal]\ndefault_shell = "/bin/bash"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n',
  );
  await writeFile(
    join(agent, "settings.json"),
    JSON.stringify({ quietStartup: true, checkForUpdates: false }),
  );
  const sessions = join(agent, "sessions", "fixture");
  await mkdir(sessions, { recursive: true });
  const file = join(sessions, "conversation.jsonl");
  const marker = "AGENTLOG_RECOVERY_MARKER";
  await writeFile(
    file,
    [
      {
        type: "session",
        version: 3,
        id: randomUUID(),
        timestamp: "2026-01-01T00:00:00.000Z",
        cwd: project,
      },
      {
        type: "custom_message",
        id: "marker",
        parentId: null,
        timestamp: "2026-01-01T00:00:00.000Z",
        customType: "agentlog-test",
        content: marker,
        display: true,
      },
      {
        type: "session_info",
        id: "name",
        parentId: "marker",
        timestamp: "2026-01-01T00:00:00.000Z",
        name: "Recovery café 👩‍💻",
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  await prepareRuntime(payload);
  const stateDir = join(state, "herdr/plugins/herder-agentlog");
  const sessionDir = join(config, "herdr/sessions", name);
  let server: ChildProcessWithoutNullStreams | undefined;
  let client: ChildProcessWithoutNullStreams | undefined;
  let parser: InstanceType<typeof headless.Terminal> | undefined;
  let serverOutput = "";
  let clientOutput = "";
  let linked = false;
  async function raw(args: string[]) {
    assert.ok(name.startsWith("al-"));
    return (
      await exec(herdr, ["--session", name, ...args], {
        env,
        cwd: root,
        timeout: 40000,
        maxBuffer: 4 * 1024 * 1024,
      })
    ).stdout;
  }
  async function api<T>(args: string[]): Promise<T> {
    const response = JSON.parse(await raw(args)) as { result: T; error?: { message: string } };
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }
  const panes = async () => (await api<{ panes: RawPane[] }>(["pane", "list"])).panes;
  function frame() {
    if (!parser) return "";
    const buffer = parser.buffer.active;
    return Array.from(
      { length: parser.rows },
      (_, i) =>
        buffer.getLine(buffer.viewportY + i)?.translateToString(true, 0, parser!.cols) ?? "",
    ).join("\n");
  }
  async function flush() {
    if (parser) await new Promise<void>((done) => parser!.write("", done));
  }
  const waitFor = async (text: string) => {
    await waitUntil(
      async () => {
        await flush();
        return frame();
      },
      (screen) => screen.includes(text),
      `screen contains ${text}`,
    );
  };
  function send(data: string) {
    assert.ok(client && !exited(client), "client not attached");
    client.stdin.write(data);
  }
  async function clientPid() {
    assert.ok(client?.pid);
    const children = await descendants(client.pid);
    for (const pid of children) {
      const command = (await exec("/bin/ps", ["-p", String(pid), "-o", "command="])).stdout.trim();
      if (command.startsWith(`${herdr} --session ${name}`)) return pid;
    }
    throw new Error("No sandbox Herdr PTY client child");
  }
  async function attach() {
    assert.ok(!client || exited(client));
    parser?.dispose();
    parser = new headless.Terminal({ cols: 140, rows: 40, allowProposedApi: true });
    // Node uses socketpairs for stdio; macOS script needs a real stdin pipe.
    client = spawn(
      "/bin/sh",
      [
        "-c",
        '/bin/cat | /usr/bin/script -q /dev/null "$@"',
        "agentlog-pipe",
        "/bin/sh",
        "-c",
        'stty rows "$1" cols "$2"; shift 2; exec "$@"',
        "agentlog-pty",
        "40",
        "140",
        herdr,
        "--session",
        name,
      ],
      { env, cwd: project },
    );
    const attached = client;
    parser.onData((data) => {
      if (!exited(attached)) attached.stdin.write(data);
    });
    client.stdout.on("data", (data: Buffer) => {
      clientOutput = (clientOutput + data.toString()).slice(-200000);
      parser?.write(data.toString());
    });
    client.stderr.on("data", (data: Buffer) => {
      clientOutput = (clientOutput + data.toString()).slice(-200000);
    });
    await waitUntil(
      async () => {
        await flush();
        return frame();
      },
      (screen) => screen.includes("sandbox$") || screen.includes(marker),
      "client attached",
    );
  }
  async function detach() {
    if (!client || exited(client)) return;
    const pid = await clientPid();
    send("\x02q");
    await waitUntil(
      () => {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          return true;
        }
      },
      Boolean,
      "Herdr client detached",
      5000,
    );
    client.stdin.end();
    await waitUntil(() => exited(client!), Boolean, "client detached", 5000);
  }
  async function start() {
    assert.ok(!server || exited(server));
    server = spawn(herdr, ["--session", name, "server"], { env, cwd: project });
    server.stdout.on("data", (data: Buffer) => {
      serverOutput = (serverOutput + data.toString()).slice(-100000);
    });
    server.stderr.on("data", (data: Buffer) => {
      serverOutput = (serverOutput + data.toString()).slice(-100000);
    });
    await waitUntil(panes, () => true, "server ready");
    if (!(await panes()).length) await api(["workspace", "create", "--cwd", project, "--no-focus"]);
    await attach();
  }
  async function stop() {
    if (!server || exited(server)) return;
    await raw(["server", "stop"]);
    await waitUntil(() => exited(server!), Boolean, "server stopped");
  }
  async function invoke() {
    await api(["plugin", "action", "invoke", "herder-agentlog.sessions"]);
    await waitFor("Sessions —");
  }
  async function click(text: string) {
    await waitFor(text);
    await flush();
    const lines = frame().split("\n");
    const row = lines.findIndex((line) => line.includes(text));
    const index = lines[row].indexOf(text);
    const col = visibleWidth(lines[row].slice(0, index)) + 2;
    send(`\x1b[<0;${col};${row + 1}M`);
    send(`\x1b[<0;${col};${row + 1}m`);
  }
  async function resize(columns: number, rows: number) {
    const pid = await clientPid();
    const tty = (await exec("/bin/ps", ["-p", String(pid), "-o", "tty="])).stdout.trim();
    assert.match(tty, /^ttys\d+$/u);
    await exec("/bin/stty", ["-f", "/dev/" + tty, "rows", String(rows), "cols", String(columns)]);
    parser?.resize(columns, rows);
    await setTimeout(100);
  }
  function record() {
    const db = new DatabaseSync(join(stateDir, "agentlog.sqlite3"), { readOnly: true });
    try {
      return db.prepare("SELECT pinned,archived,label,source FROM sessions WHERE path=?").get(file);
    } finally {
      db.close();
    }
  }
  async function piProcess(paneId: string) {
    const info = await api<{
      process_info: { foreground_processes: Array<{ pid: number; name: string; argv0?: string }> };
    }>(["pane", "process-info", "--pane", paneId]);
    return info.process_info.foreground_processes.find((p) => p.name === "pi" || p.argv0 === "pi");
  }
  async function killPi(paneId: string, signal: NodeJS.Signals) {
    const pane = (await panes()).find((p) => p.pane_id === paneId);
    assert.ok(pane?.cwd && resolve(pane.cwd).startsWith(root + "/"));
    const process = await piProcess(paneId);
    assert.ok(process, "no sandbox Pi foreground process");
    globalThis.process.kill(process.pid, signal);
    return process.pid;
  }
  async function killPopup() {
    assert.ok(server?.pid);
    const candidates = await descendants(server.pid);
    for (const pid of candidates) {
      const command = (await exec("/bin/ps", ["-p", String(pid), "-o", "command="])).stdout.trim();
      if (command.endsWith("scripts/run.cjs ui")) {
        process.kill(pid, "SIGKILL");
        return;
      }
    }
    throw new Error("Could not identify sandbox-owned popup process");
  }
  async function screen(paneId: string) {
    return raw(["pane", "read", paneId, "--source", "recent-unwrapped", "--lines", "100"]);
  }
  async function snapshot() {
    return readFile(join(sessionDir, "session.json"), "utf8");
  }
  async function cleanup(failure?: unknown) {
    try {
      if (client && !exited(client)) {
        send("\x1b");
        await setTimeout(100);
        send("\x1b");
        await setTimeout(100);
        try {
          await detach();
        } catch {
          client.kill("SIGTERM");
          client.stdin.destroy();
        }
      }
      try {
        if (linked && server && !exited(server)) await raw(["plugin", "unlink", "herder-agentlog"]);
      } finally {
        await stop();
      }
    } finally {
      parser?.dispose();
      parser = undefined;
      if (failure) {
        const diagnostics = root + "-diagnostics";
        await mkdir(diagnostics, { mode: 0o700 });
        await writeFile(
          join(diagnostics, "failure.txt"),
          (failure instanceof Error ? failure.stack : JSON.stringify(failure)) +
            "\n" +
            serverOutput +
            "\n" +
            clientOutput,
        );
        console.error(`Sandbox diagnostics: ${diagnostics}`);
      }
      assert.deepEqual(
        await Promise.all(protectedPaths.map(fingerprint)),
        before,
        "real Herdr configuration, plugin registry, integration or default socket changed",
      );
      if (!server || exited(server)) await rm(root, { recursive: true, force: true });
    }
  }
  let versions = "";
  try {
    // Both Herdr storage roots are already canonical and inside root before any link/install.
    const pluginConfig = (await raw(["plugin", "config-dir", "herder-agentlog"])).trim();
    assert.ok((await realpath(pluginConfig)).startsWith(root + "/"));
    assert.ok((await realpath(stateDir)).startsWith(root + "/"));
    await raw(["integration", "install", "pi"]);
    assert.ok(
      (await realpath(join(agent, "extensions/herdr-agent-state.ts"))).startsWith(root + "/"),
    );
    await api(["plugin", "link", payload]);
    linked = true;
    const herdrVersion = (await exec(herdr, ["--version"], { env, cwd: root })).stdout.trim();
    const piVersion = (
      await exec(join(bin, "pi"), ["--version"], { env, cwd: root })
    ).stdout.trim();
    versions = `Node ${process.version}; ${herdrVersion}; Pi ${piVersion}`;
  } catch (error) {
    await cleanup(error);
    throw error;
  }
  return {
    versions,
    root,
    name,
    env,
    file,
    marker,
    project,
    stateDir,
    payload,
    api,
    raw,
    panes,
    start,
    stop,
    attach,
    detach,
    invoke,
    send,
    click,
    resize,
    frame,
    waitFor,
    record,
    piProcess,
    killPi,
    killPopup,
    screen,
    snapshot,
    cleanup,
  };
}
