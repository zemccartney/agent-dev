import { serveRuntime } from "#caffeinate/runtime";
try {
  const s = await serveRuntime({ runtimeDir: process.argv[2] }, async () => ({
    snapshot: { pid: process.pid, agents: [] },
  }));
  process.on("SIGTERM", () => {
    void s.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
} catch {
  process.exit(1);
}
