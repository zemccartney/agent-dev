import test from "node:test";
import assert from "node:assert/strict";
import { cp, readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as wait } from "node:timers/promises";
import { withHerdrSandbox } from "../helpers/herdr-sandbox.ts";
import { startPty } from "../helpers/pty.ts";
import { runtimeRequest } from "#caffeinate/runtime";
import { object, records, parseMonitorResponse } from "#caffeinate/validation";
const exec = promisify(execFile);
async function poll<T>(read: () => Promise<T | undefined>, label: string): Promise<T> {
  const until = Date.now() + 10000;
  let error: unknown;
  do {
    try {
      const value = await read();
      if (value !== undefined) return value;
    } catch (failure) {
      error = failure;
    }
    await wait(30);
  } while (Date.now() < until);
  throw new Error(`Timed out waiting for ${label}: ${String(error)}`);
}

void test(
  "relocated production bundle owns one detached monitor and a working Herdr popup",
  { timeout: 60000 },
  async (t) => {
    assert.notEqual(
      process.env.CAFFEINATE_RUN_AGENT_EXIT_TESTS,
      "1",
      "Real-agent/native workloads require separate agreement and remain unimplemented; this test starts no agents or assertions",
    );
    await withHerdrSandbox(async (sandbox) => {
      const id = "grepco.auto-caffeinator",
        payload = join(sandbox.root, "payload");
      await cp(new URL("../../.build/runtime/", import.meta.url), payload, { recursive: true });
      await assert.rejects(access(join(payload, "node_modules")));
      await assert.rejects(access(join(payload, "src")));
      const configDir = (await sandbox.cli(["plugin", "config-dir", id])).trim();
      assert.ok(configDir.startsWith(sandbox.root + "/"));
      const env = {
        ...sandbox.env,
        HERDR_SOCKET_PATH: join(sandbox.root, "c/herdr/sessions", sandbox.serverName, "herdr.sock"),
        HERDR_PLUGIN_CONFIG_DIR: configDir,
      };
      const launch = async (command: string) =>
        (
          await exec("/bin/sh", [join(payload, "scripts/launch.sh"), command], {
            env,
            cwd: sandbox.root,
            timeout: 10000,
          })
        ).stdout;
      const temp = sandbox.env.TMPDIR;
      assert.ok(temp);
      const runtimeBase = join(temp, `caffeinate-${process.getuid?.()}`);
      await sandbox.cli(["plugin", "link", payload, "--enabled"]);
      const client = startPty(
        sandbox.binPath,
        ["--session", sandbox.serverName],
        sandbox.env,
        sandbox.root,
      );
      let monitorPid: number | undefined;
      let monitorReady = false;
      try {
        await client.waitFor("CF_SANDBOX>");
        await launch("ensure");
        monitorReady = true;
        const runtimeDir = await poll(async () => {
          const entries = (await readdir(runtimeBase, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
          assert.equal(entries.length, 1);
          const path = join(runtimeBase, entries[0]);
          const owner = object(JSON.parse(await readFile(join(path, "owner.json"), "utf8")));
          assert.equal(owner.socketPath, env.HERDR_SOCKET_PATH);
          assert.ok(typeof owner.pid === "number" && owner.pid > 1);
          monitorPid = owner.pid;
          return path;
        }, "private monitor owner");
        assert.ok(monitorPid);
        const pid = monitorPid;
        const command = (
          await exec("/bin/ps", ["-p", String(monitorPid), "-o", "command="])
        ).stdout.trim();
        assert.ok(command.startsWith(sandbox.nodeBinary + " "), command);
        assert.ok(command.includes(join(payload, "dist/main.js") + " monitor"), command);
        assert.doesNotMatch(command, /\.build\/test|\.ts(?:\s|$)/);
        t.diagnostic(
          `Detached bundled monitor ${monitorPid}: actual runtime ${sandbox.nodeVersion}, ${sandbox.nodeBinary}`,
        );
        const snapshot = async () =>
          parseMonitorResponse(await runtimeRequest({ runtimeDir }, { type: "snapshot" })).snapshot;
        await poll(async () => {
          const value = await snapshot();
          assert.deepEqual(value.agents, []);
          return value;
        }, "empty ready monitor");
        await Promise.all([launch("ensure"), launch("ensure"), launch("ensure")]);
        assert.equal(
          object(JSON.parse(await readFile(join(runtimeDir, "owner.json"), "utf8"))).pid,
          monitorPid,
        );
        assert.equal(
          (await readdir(runtimeBase, { withFileTypes: true })).filter((entry) =>
            entry.isDirectory(),
          ).length,
          1,
        );
        const panes = records(
          object(object(JSON.parse(await sandbox.cli(["pane", "list"]))).result).panes,
        );
        const target = panes[0]?.pane_id;
        assert.equal(typeof target, "string");
        await sandbox.cli(["plugin", "action", "invoke", `${id}.controls`]);
        await client.waitFor("No supported local agents available");
        const popupPid = await poll(async () => {
          const rows = (await exec("/bin/ps", ["-axo", "pid=,command="])).stdout.split("\n");
          const line = rows.find((row) => row.includes(join(payload, "dist/main.js") + " popup"));
          return line ? Number(line.trim().split(/\s+/)[0]) : undefined;
        }, "real popup process");
        const popupEnv = (await exec("/bin/ps", ["eww", "-p", String(popupPid), "-o", "command="]))
          .stdout;
        assert.ok(
          popupEnv.split(/\s+/).includes(`CAFFEINATE_TARGET=${String(target)}`),
          "Invocation target was not propagated",
        );
        client.click("settings (s)");
        await client.waitFor("Default duration (hours)");
        client.click("[ 8");
        client.send("1.25");
        await client.waitFor("[ 1.25");
        client.click("about (?)");
        await client.waitFor("ten seconds");
        client.send("s");
        await client.waitFor("[ 1.25");
        const oldCloseRow = client
          .frame()
          .split("\n")
          .findIndex((row) => row.includes("close (esc)"));
        await client.resize(120, 40);
        await client.waitUntil(
          (text) => text.split("\n").findIndex((row) => row.includes("close (esc)")) > oldCloseRow,
          "reposition popup after resize",
        );
        client.click("save (↵)");
        await poll(async () => {
          const value = await snapshot();
          return value.config.defaultDurationMs === 4500000 ? value : undefined;
        }, "saved settings from real popup");
        client.send("\x1b");
        await client.waitWithout("Default duration (hours)");
        await client.waitFor("CF_SANDBOX>");
        process.kill(monitorPid, 0);
        assert.deepEqual((await snapshot()).agents, []);
        await launch("stop");
        await poll(async () => {
          try {
            await access(runtimeDir);
            return undefined;
          } catch {
            return true;
          }
        }, "explicit monitor stop and IPC cleanup");
        await poll(async () => {
          try {
            process.kill(pid, 0);
            return undefined;
          } catch {
            return true;
          }
        }, "monitor process exit");
        monitorPid = undefined;
        monitorReady = false;
      } finally {
        try {
          if (monitorReady) await launch("stop");
        } finally {
          await client.close();
          await sandbox.cli(["plugin", "unlink", id]);
        }
      }
    });
  },
);
