import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function assertCompatible(evidence) {
  for (const key of ['occupantIdentity','detectionProvenance','serverIdentity','pluginEnabledRead','localTargetGuard','finiteTimeout','ownerExitCleanup']) {
    if (evidence[key] !== true) throw new Error(`Missing verified contract: ${key}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/probe-herdr.mjs <verified-evidence.json>');
    assertCompatible(JSON.parse(await readFile(process.argv[2], 'utf8')));
    console.log('Recorded platform contracts verified; see docs/validation.md for live evidence.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
