import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, cp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
void test(
  "minified toolkit spike runs on a PTY without checkout dependencies or native helpers",
  {
    skip: process.platform !== "darwin",
    timeout: 15000,
  },
  async (t) => {
    const build = spawnSync("pnpm", ["build:spike"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const dir = await mkdtemp(join(tmpdir(), "cf-tui-payload-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(join(root, ".build/tui-spike/spike.js"), join(dir, "spike.js"));
    await writeFile(join(dir, "package.json"), '{"type":"module"}\n');
    assert.equal(existsSync(join(dir, "node_modules")), false);
    assert.equal(existsSync(join(dir, "native")), false);
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        // Node's pipe is a socketpair; macOS script needs an ordinary pipe or TTY.
        `/bin/cat | /usr/bin/script -q /dev/null /bin/sh -c 'stty columns 56 rows 18; exec "$@"' -- "$@"`,
        "--",
        process.execPath,
        join(dir, "spike.js"),
      ],
      { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: dir, TERM: "xterm-256color" } },
    );
    t.after(() => {
      child.kill("SIGTERM");
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let output = "",
      errors = "",
      edited = false,
      closed = false;
    child.stderr.on("data", (data: string) => {
      errors += data;
    });
    child.stdout.on("data", (data: string) => {
      output += data;
      const text = stripVTControlCharacters(output);
      if (!edited && text.includes("Hours: 2")) {
        edited = true;
        child.stdin.write("\u00153.75\r");
      }
      if (!closed && text.includes("Applied: 3.75")) {
        closed = true;
        child.stdin.end("\u0003");
      }
    });
    const [code] = await once(child, "close", { signal: AbortSignal.timeout(10000) }).catch(
      (error: unknown) => {
        throw new Error(`PTY failed: ${errors}\n${JSON.stringify(output)}`, { cause: error });
      },
    );
    assert.equal(code, 0, errors + output);
    assert.equal(closed, true, output);
    assert.ok(output.includes("\x1b[?1049l"), "alternate screen must be restored");
    assert.doesNotMatch(errors + output, /Cannot find|ERR_MODULE|TypeError/);
  },
);
