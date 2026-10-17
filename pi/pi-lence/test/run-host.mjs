import { spawnSync, execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const { values } = parseArgs({
  args,
  options: { modes: { type: "boolean" }, tui: { type: "boolean" }, node: { type: "string" } },
});
if (values.modes && values.tui) throw new Error("Select --modes, --tui, or neither for both");
const nodePath = values.node ?? process.execPath;
if (!isAbsolute(nodePath)) throw new Error("--node requires an absolute executable path");
/** @type {NodeJS.ProcessEnv} */
const env = { PI_LENCE_HOST_NODE: nodePath };
for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "TERM"]) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
const version = execFileSync(nodePath, ["--version"], {
  env,
  encoding: "utf8",
  timeout: 5000,
}).trim();
console.log(`Pi 1.3.0 host tests: ${version}, ${process.platform}/${process.arch}`);
const suites = [];
if (!values.tui) suites.push(fileURLToPath(new URL("host-modes.test.mjs", import.meta.url)));
if (!values.modes) suites.push(fileURLToPath(new URL("host-tui.test.mjs", import.meta.url)));
const result = spawnSync(process.execPath, ["--test", ...suites], {
  env,
  stdio: "inherit",
  timeout: 10 * 60_000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
