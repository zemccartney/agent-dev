import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  realpath,
  rm,
  lstat,
  symlink,
} from "node:fs/promises";
import { basename, dirname, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";

const exec = promisify(execFile);
export function sandboxEnvironment(root: string, nodeBinary: string): NodeJS.ProcessEnv {
  return {
    HOME: join(root, "home"),
    TMPDIR: join(root, "t"),
    XDG_CONFIG_HOME: join(root, "c"),
    XDG_STATE_HOME: join(root, "s"),
    XDG_DATA_HOME: join(root, "d"),
    PI_CODING_AGENT_DIR: join(root, "pi"),
    HERDR_CONFIG_PATH: join(root, "c/herdr/config.toml"),
    PATH: `${join(root, "bin")}:${dirname(nodeBinary)}:/usr/bin:/bin`,
    TERM: "xterm-256color",
    SHELL: "/bin/sh",
    PS1: "CF_SANDBOX> ",
  };
}
export interface HerdrSandbox {
  root: string;
  env: NodeJS.ProcessEnv;
  serverName: string;
  binPath: string;
  nodeBinary: string;
  nodeVersion: string;
  cli(args: string[]): Promise<string>;
}
async function digest(path: string) {
  try {
    return createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
async function socketIdentity(path: string) {
  try {
    const s = await lstat(path);
    return `${s.dev}:${s.ino}:${s.birthtimeMs}`;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
export async function withHerdrSandbox(
  run: (sandbox: HerdrSandbox) => Promise<void>,
): Promise<void> {
  if (process.env.CAFFEINATE_RUN_HERDR_TESTS !== "1")
    throw new Error("Herdr sandbox requires explicit opt-in: CAFFEINATE_RUN_HERDR_TESTS=1");
  if (process.platform !== "darwin") throw new Error("Herdr sandbox requires macOS");
  const binPath = await realpath(
    process.env.HERDR_BIN_PATH ?? (await exec("/usr/bin/which", ["herdr"])).stdout.trim(),
  );
  const normal = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "herdr");
  const normalFiles = [join(normal, "config.toml"), join(normal, "plugins.json")];
  const before = await Promise.all(normalFiles.map(digest));
  const normalSocket = process.env.HERDR_SOCKET_PATH ?? join(normal, "herdr.sock");
  const socketBefore = await socketIdentity(normalSocket);
  const nodeBinary = process.env.CAFFEINATE_TEST_NODE ?? process.execPath;
  assert.ok(isAbsolute(nodeBinary), "CAFFEINATE_TEST_NODE must be an absolute binary path");
  const nodeVersion = (
    await exec(nodeBinary, ["--version"], { timeout: 5000, env: { PATH: "/usr/bin:/bin" } })
  ).stdout.trim();
  assert.match(nodeVersion, /^v24\.\d+\.\d+$/);
  assert.ok(Number(nodeVersion.split(".")[1]) >= 11, "Node 24.11.0 minimum");
  // Keep Unix socket paths below macOS's sockaddr_un limit, including /private prefix.
  const root = await realpath(await mkdtemp("/tmp/cf-"));
  const env = sandboxEnvironment(root, nodeBinary);
  env.HERDR_BIN_PATH = binPath;
  const serverName = basename(root).toLowerCase();
  let server: ReturnType<typeof spawn> | undefined;
  let serverLog = "";
  const cli = async (args: string[]) =>
    (
      await exec(binPath, ["--session", serverName, ...args], {
        env,
        cwd: root,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout;
  try {
    await mkdir(join(root, "c/herdr"), { recursive: true, mode: 0o700 });
    for (const name of ["home", "s", "d", "pi", "t", "bin"])
      await mkdir(join(root, name), { mode: 0o700 });
    await symlink(await realpath(nodeBinary), join(root, "bin/node"));
    await writeFile(
      join(root, "c/herdr/config.toml"),
      [
        "onboarding = false",
        "[terminal]",
        'default_shell = "/bin/sh"',
        'shell_mode = "non_login"',
        "[update]",
        "version_check = false",
        "manifest_check = false",
        "",
      ].join("\n"),
    );
    const help = (await exec(binPath, ["--help"], { env, cwd: root, timeout: 5000 })).stdout;
    assert.ok(help.includes(`Config: ${root}/c/herdr/config.toml`), "Herdr config escaped sandbox");
    const configDir = (await cli(["plugin", "config-dir", "agent-dev.caffeinate-spike"])).trim();
    assert.ok((await realpath(configDir)).startsWith(root + "/"), "Plugin config escaped sandbox");
    assert.ok(
      (await realpath(join(root, "s/herdr/plugins/agent-dev.caffeinate-spike"))).startsWith(
        root + "/",
      ),
    );
    server = spawn(binPath, ["--session", serverName, "server"], {
      env,
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.on("error", (error) => {
      serverLog += error.message;
    });
    for (const stream of [server.stdout, server.stderr])
      stream?.on("data", (data: Buffer) => {
        serverLog = (serverLog + data.toString()).slice(-16000);
      });
    let ready = false,
      readinessError = "";
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null || server.signalCode !== null)
        throw new Error(`Sandbox Herdr exited: ${serverLog}`);
      try {
        const status: unknown = JSON.parse(await cli(["status", "server", "--json"]));
        ready =
          typeof status === "object" &&
          status !== null &&
          "running" in status &&
          status.running === true;
      } catch (error) {
        // Only sandbox readiness is retried; preserve diagnostics for format/CLI failures.
        readinessError = String(error);
      }
      if (ready) break;
      await wait(50);
    }
    assert.ok(ready, `Sandbox Herdr did not become ready: ${readinessError}\n${serverLog}`);
    await run({
      root,
      env,
      serverName,
      binPath,
      nodeBinary: await realpath(nodeBinary),
      nodeVersion,
      cli,
    });
  } finally {
    if (server) {
      try {
        await cli(["server", "stop"]);
      } catch {
        server.kill("SIGTERM");
      }
      for (
        let attempt = 0;
        attempt < 100 && server.exitCode === null && server.signalCode === null;
        attempt++
      )
        await wait(20);
      if (server.exitCode === null && server.signalCode === null) {
        server.kill("SIGKILL");
        for (
          let attempt = 0;
          attempt < 100 && server.exitCode === null && server.signalCode === null;
          attempt++
        )
          await wait(20);
      }
      assert.ok(
        server.exitCode !== null || server.signalCode !== null,
        `Sandbox server failed to exit; retained ${root}`,
      );
    }
    await rm(root, { recursive: true, force: true });
    assert.deepEqual(
      await Promise.all(normalFiles.map(digest)),
      before,
      "Normal Herdr configuration/registry changed",
    );
    assert.equal(await socketIdentity(normalSocket), socketBefore, "Normal Herdr socket changed");
  }
}
