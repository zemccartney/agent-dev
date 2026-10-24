import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const home = mkdtempSync(join(tmpdir(), "pi-lence-smoke-"));
try {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./quiet-label.smoke.mjs", import.meta.url)), ...process.argv.slice(2)],
    {
      env: {
        ...process.env,
        HOME: home,
        PI_LENCE_SMOKE_HOME: home,
        USERPROFILE: home,
        PI_CODING_AGENT_DIR: join(home, "agent"),
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_CACHE_HOME: join(home, "cache"),
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(home, { recursive: true, force: true });
}
