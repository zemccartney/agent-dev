import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

await test("the actual project-check pipeline invokes host acceptance and propagates its failure", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-lence-check-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  // Execute the real coordinator script, substituting bounded leaf commands to avoid recursion.
  const scripts: Record<string, string> = {};
  for (const name of Object.keys(manifest.scripts)) scripts[name] = 'node -e "process.exit(0)"';
  scripts["check:project"] = manifest.scripts["check:project"];
  scripts["test:host"] =
    `node -e "require('node:fs').writeFileSync('host-ran', 'yes'); process.exit(17)"`;
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "host-check-contract", private: true, scripts }),
  );
  const result = spawnSync("pnpm", ["run", "check:project"], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, npm_config_userconfig: join(root, "empty-npmrc") },
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, "host failure must fail the full project check");
  assert.equal(await readFile(join(root, "host-ran"), "utf8"), "yes");
});
