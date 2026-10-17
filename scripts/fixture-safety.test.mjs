import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

await test("Git-hook environment cannot redirect disposable fixtures into the calling repository", async (t) => {
  const caller = await mkdtemp(join(tmpdir(), "agent-dev-calling-repo-"));
  t.after(() => rm(caller, { recursive: true, force: true }));
  const safe = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_") && !key.startsWith("HK_") && key !== "NODE_TEST_CONTEXT",
    ),
  );
  const init = spawnSync("git", ["init", "--quiet", caller], { env: safe, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const before = await readFile(join(caller, ".git/config"), "utf8");
  for (const [file, pattern] of [
    ["hooks.test.mjs", "real installed pre-commit"],
    ["check-projects.test.mjs", "real CLI discovers"],
  ]) {
    const child = spawnSync(
      process.execPath,
      [
        "--test",
        `--test-name-pattern=${pattern}`,
        fileURLToPath(new URL(`./${file}`, import.meta.url)),
      ],
      {
        env: {
          ...safe,
          GIT_DIR: join(caller, ".git"),
          GIT_WORK_TREE: caller,
          GIT_INDEX_FILE: join(caller, ".git/index"),
          HK_SKIP_HOOKS: "pre-commit",
        },
        encoding: "utf8",
        timeout: 60000,
      },
    );
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.equal(await readFile(join(caller, ".git/config"), "utf8"), before);
    await assert.rejects(readFile(join(caller, ".git/hooks/pre-commit")), { code: "ENOENT" });
  }
});
