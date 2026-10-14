if (process.argv[2] === "--help") {
  console.log("herder-agentlog — saved Pi conversation registry");
} else {
  console.error("agentlog: unsupported command; use --help");
  process.exitCode = 1;
}
