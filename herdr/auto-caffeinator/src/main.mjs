#!/usr/bin/env node
// Compatibility for Herdr's already-cached trial manifest. New registrations use scripts/launch.sh.
import preflight from "../scripts/preflight.cjs";
try {
  preflight.check("runtime");
  // Keep generated JS out of the source typecheck; its TS sources are checked separately.
  const entry = new URL("../dist/main.js", import.meta.url);
  await import(entry.href);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
