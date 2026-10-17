import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
void test("build emits one production entry and runnable modular test imports", () => {
  assert.ok(existsSync(join(root, "dist/main.js")), "Missing built entrypoint");
  assert.deepEqual(readdirSync(join(root, "dist")), ["main.js"]);
  for (const name of readdirSync(join(root, "src")).filter((n) => n.endsWith(".ts"))) {
    const base = name.slice(0, -3);
    assert.doesNotMatch(
      readFileSync(join(root, "src", name), "utf8"),
      /(?:from\s+|import\()["']\.\/[^"']+\.js["']/,
    );
    assert.ok(existsSync(join(root, ".build/test", base + ".js")), `Missing ${base}`);
    assert.equal(
      import.meta.resolve(`#caffeinate/${base}`),
      new URL(`../.build/test/${base}.js`, import.meta.url).href,
    );
  }
});
void test("built help works in a clean consumer layout without source or developer dependencies", async (t) => {
  assert.ok(existsSync(join(root, "dist/main.js")), "Missing built entrypoint");
  const dir = await mkdtemp(join(tmpdir(), "caffeinate-consumer-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(root, "dist"), join(dir, "dist"), { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  const r = spawnSync(process.execPath, [join(dir, "dist/main.js"), "--help"], {
    cwd: tmpdir(),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ensure.*monitor.*controls.*popup.*stop/s);
  assert.equal(existsSync(join(dir, "src")), false);
  assert.equal(existsSync(join(dir, "node_modules")), false);
});
