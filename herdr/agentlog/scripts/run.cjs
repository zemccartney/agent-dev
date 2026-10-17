// Check the host before loading bundled code or node:sqlite. No provisioning.
const version = process.versions.node;
const [major, minor] = version.split(".").map(Number);
const supported = major > 25 || (major === 25 && minor >= 7) || (major === 24 && minor >= 15);
if (!supported) {
  const unflaggedSqlite =
    major >= 24 || (major === 23 && minor >= 4) || (major === 22 && minor >= 13);
  console.error(
    `agentlog: Node ${version} is below the supported SQLite baseline. Upgrade to Node 24.15+ (25.x requires 25.7+); current Node 26 is also suitable.`,
  );
  if (unflaggedSqlite) {
    console.error(
      "It might work with this earlier experimental node:sqlite API, but this runtime is not supported or validated by Agentlog.",
    );
  }
  process.exitCode = 1;
} else {
  const entry = "../dist/cli.js";
  void import(entry).catch((error) => {
    console.error(`agentlog: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
