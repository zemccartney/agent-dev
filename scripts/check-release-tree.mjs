// CI calls this only for main-bound PRs or pushes to main, never from pre-commit.
import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || "Cannot inspect the release tree");
const scratch = result.stdout
  .split("\0")
  .filter(
    (path) =>
      path === "plan.md" || path.startsWith("thinking/") || path.startsWith(".superpowers/"),
  );
if (scratch.length) {
  console.error(
    `Remove work-branch scratch artifacts before promotion to main:\n${scratch.join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("Release tree contains no tracked work-branch scratch artifacts.");
}
