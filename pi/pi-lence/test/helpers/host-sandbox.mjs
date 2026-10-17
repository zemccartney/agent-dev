import { spawn as spawnProcess, execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

/** @typedef {import('node:child_process').ChildProcessWithoutNullStreams} Child */

/**
 * Actual CLI and installer, private state, no inherited credentials or resources.
 * @param {string} tarballPath
 * @param {{nodePath?: string}} [options]
 */
export async function createHostSandbox(tarballPath, options = {}) {
  const nodePath = await realpath(options.nodePath ?? process.execPath);
  const sdkRoot = dirname(
    dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))),
  );
  const sdk = JSON.parse(await readFile(join(sdkRoot, "package.json"), "utf8"));
  if (sdk.version !== "1.3.0") throw new Error(`Host test expects Pi 1.3.0, found ${sdk.version}`);
  const cliPath = resolve(sdkRoot, sdk.bin.pi);
  const root = await mkdtemp(join(tmpdir(), "pi-lence-host-"));
  const home = join(root, "home");
  const agentDir = join(home, ".pi/agent");
  const cwd = join(root, "project");
  /** @type {Map<Child, {closed: Promise<void>, timeout: ReturnType<typeof setTimeout>, escalation?: ReturnType<typeof setTimeout>}>} */
  const children = new Map();
  const timedOut = new WeakSet();
  let disposed = false;
  const env = {
    PATH: `${dirname(nodePath)}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    HOME: home,
    TMPDIR: join(root, "tmp"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions"),
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    PI_LENCE_TEST_ROOT: root,
    npm_config_userconfig: join(root, "user.npmrc"),
    npm_config_globalconfig: join(root, "global.npmrc"),
    npm_config_cache: join(root, "npm-cache"),
    npm_config_offline: "true",
    npm_config_update_notifier: "false",
    npm_config_audit: "false",
    npm_config_fund: "false",
    TERM: "xterm-256color",
    LANG: "en_US.UTF-8",
  };
  const fixturePath = join(root, "host-driver.ts");
  const sessionArgs = [
    "--offline",
    "--no-mcp",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--provider",
    "pi-lence-fixture",
    "--model",
    "fixture",
    "--thinking",
    "off",
    "-e",
    fixturePath,
  ];

  /** @param {Child} child @param {NodeJS.Signals} signal */
  function signalGroup(child, signal) {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }

  /** @param {string} command @param {string[]} args @param {{timeoutMs?: number}} [limits] */
  function spawn(command, args, limits = {}) {
    if (disposed) throw new Error("Host sandbox has been disposed");
    const child = spawnProcess(command, args, { cwd, env, detached: true, stdio: "pipe" });
    /** @type {Promise<void>} */
    const closed = new Promise((resolve) => {
      child.once("close", () => resolve());
    });
    const timeout = setTimeout(() => {
      timedOut.add(child);
      signalGroup(child, "SIGTERM");
      const owned = children.get(child);
      if (owned) owned.escalation = setTimeout(() => signalGroup(child, "SIGKILL"), 500);
    }, limits.timeoutMs ?? 30_000);
    children.set(child, { closed, timeout });
    child.once("close", () => {
      clearTimeout(timeout);
    });
    // Capture spawn failures even when a caller is still setting up its listeners.
    child.on("error", () => {});
    return child;
  }

  /** @param {string[]} args @param {string} [input] */
  async function run(args, input = "") {
    const packageCommand = ["install", "remove", "list"].includes(args[0]);
    const child = spawn(nodePath, [cliPath, ...(packageCommand ? [] : sessionArgs), ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data;
    });
    child.on("error", (error) => {
      stderr += error.message;
    });
    /** @type {Promise<{code: number, stdout: string, stderr: string}>} */
    const finished = new Promise((resolve) => {
      child.once("close", (code) =>
        resolve({
          code: code ?? 1,
          stdout,
          stderr: stderr + (timedOut.has(child) ? "\nHost deadline exceeded" : ""),
        }),
      );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    return finished;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [child, state] of children) {
      clearTimeout(state.timeout);
      clearTimeout(state.escalation);
      signalGroup(child, "SIGTERM");
    }
    if (children.size) await delay(100);
    for (const child of children.keys()) signalGroup(child, "SIGKILL");
    await Promise.all([...children.values()].map((state) => state.closed));
    await rm(root, { recursive: true, force: true });
  }

  try {
    for (const dir of [agentDir, cwd, env.TMPDIR]) await mkdir(dir, { recursive: true });
    for (const config of [env.npm_config_userconfig, env.npm_config_globalconfig])
      await writeFile(config, "");
    await copyFile(
      fileURLToPath(new URL("../fixtures/host-driver.ts", import.meta.url)),
      fixturePath,
    );
    await writeFile(join(cwd, "fixture.txt"), "Fixture file contents\n");
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false } }),
    );
    const version = execFileSync(nodePath, ["--version"], {
      env,
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (!/^v(22|24)\./.test(version)) throw new Error(`Unexpected host runtime ${version}`);
    const install = await run(["install", `npm:@grepco/pi-lence@file:${resolve(tarballPath)}`]);
    if (install.code !== 0)
      throw new Error(`Packed installation failed: ${install.stderr}\n${install.stdout}`);
    return { root, home, agentDir, cwd, nodePath, cliPath, sessionArgs, run, spawn, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
