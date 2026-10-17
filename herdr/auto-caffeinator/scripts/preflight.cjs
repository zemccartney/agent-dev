// Intentionally old CommonJS syntax: diagnose unsupported Node before loading output.
var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var nodeFloor = [24, 11, 0];
var herdrFloor = [0, 9, 3];

/** @param {string} version @param {number[]} floor */
function atLeast(version, floor) {
  var match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  for (var i = 0; i < 3; i++) {
    var component = Number(match[i + 1]);
    if (component !== floor[i]) return component > floor[i];
  }
  return true;
}

/** @param {'build' | 'runtime'} mode */
function check(mode) {
  if (!process.versions.node.startsWith("24.") || !atLeast(process.versions.node, nodeFloor)) {
    throw new Error(
      "auto-caffeinator requires Node 24.x, minimum " +
        nodeFloor.join(".") +
        "; found " +
        process.versions.node +
        ". Install a supported stable Node separately and make it available to Herdr.",
    );
  }
  if (mode === "build") return;
  if (process.platform !== "darwin")
    throw new Error("Caffeination requires macOS; found " + process.platform + ".");
  var entry = path.join(__dirname, "..", "dist", "main.js");
  if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
    throw new Error(
      "auto-caffeinator build is missing. Developers: run pnpm build in the plugin directory. Consumers: use a complete prebuilt plugin artifact.",
    );
  }
  var result = childProcess.spawnSync(process.env.HERDR_BIN_PATH || "herdr", ["--version"], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 65536,
  });
  var found = (result.stdout || "").trim();
  var version = found.match(/^herdr (\d+\.\d+\.\d+)(?:\s|$)/);
  if (result.error || result.status !== 0 || !version || !atLeast(version[1], herdrFloor)) {
    throw new Error(
      "auto-caffeinator requires Herdr >=" +
        herdrFloor.join(".") +
        "; found " +
        (found || "unavailable") +
        ". Make Herdr available on PATH or through HERDR_BIN_PATH.",
    );
  }
}
module.exports = { check: check };
if (require.main === module) {
  try {
    check(process.argv[2] === "build" ? "build" : "runtime");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
