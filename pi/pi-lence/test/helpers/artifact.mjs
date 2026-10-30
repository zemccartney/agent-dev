import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packCandidate } from "../../scripts/pack.mjs";

/** Select immutable supplied bytes, or retain the ordinary source-packing test path.
 * The caller owns outputDir; the caller's input is never modified or removed.
 * @param {string} outputDir @param {NodeJS.ProcessEnv} [env] @param {string} [packageRoot] */
export async function selectHostArtifact(
  outputDir,
  env = process.env,
  packageRoot = fileURLToPath(new URL("../../", import.meta.url)),
) {
  const path = env.PI_LENCE_HOST_TARBALL;
  const expected = env.PI_LENCE_HOST_SHA256;
  if (path === undefined && expected === undefined) return packCandidate(packageRoot, outputDir);
  if (
    !path ||
    !isAbsolute(path) ||
    !path.endsWith(".tgz") ||
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected)
  )
    throw new Error("Host artifact requires an absolute .tgz path and SHA256 digest together");
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
    throw new Error("Host artifact must be a bounded regular file, not a symlink");
  const bytes = await readFile(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expected) throw new Error("Host artifact digest mismatch");
  await mkdir(outputDir, { recursive: true });
  const tarballPath = join(outputDir, "supplied.tgz");
  await writeFile(tarballPath, bytes, { flag: "wx", mode: 0o400 });
  return { tarballPath, sha256 };
}
