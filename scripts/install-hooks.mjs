import { lstatSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** @param {string[]} args @param {boolean} [optional] */
function git(args, optional = false) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (optional && result.status === 1) return undefined;
  if (result.status !== 0)
    throw new Error(result.stderr || "Cannot inspect Git hook configuration");
  return result.stdout.trim();
}
try {
  if (
    git(["config", "--get", "core.hooksPath"], true) !== undefined ||
    git(["config", "--get-regexp", "^hook\\."], true) !== undefined
  ) {
    throw new Error("Existing Git hook configuration detected; refusing to change or replace it.");
  }
  const directory = git(["rev-parse", "--absolute-git-dir"]);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!directory || directory !== common)
    throw new Error(
      "Refusing to install shared hooks from a linked worktree; use the primary checkout after reviewing the effect on all worktrees.",
    );
  if (lstatSync(join(directory, "hooks"), { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(
      "Symlinked hooks directory left untouched; refusing non-repository hook installation.",
    );
  }
  const hook = join(directory, "hooks/pre-commit");
  if (lstatSync(hook, { throwIfNoEntry: false }))
    throw new Error(`Existing hook left untouched: ${hook}`);
  // Explicit legacy/local scope is consistent across Git versions; never --global or --force.
  const result = spawnSync("hk", ["install", "--legacy", "--mise"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
