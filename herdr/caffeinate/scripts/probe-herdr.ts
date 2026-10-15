import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { object, errorMessage } from "#caffeinate/validation";
export function assertCompatible(value: unknown) {
  const evidence = object(value);
  for (const key of [
    "occupantIdentity",
    "detectionProvenance",
    "serverIdentity",
    "pluginEnabledRead",
    "localTargetGuard",
    "finiteTimeout",
    "ownerExitCleanup",
  ]) {
    if (evidence[key] !== true) throw new Error(`Missing verified contract: ${key}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2])
      throw new Error("Usage: node scripts/probe-herdr.ts <verified-evidence.json>");
    assertCompatible(JSON.parse(await readFile(process.argv[2], "utf8")));
    console.log("Recorded platform contracts verified; see docs/validation.md for live evidence.");
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
