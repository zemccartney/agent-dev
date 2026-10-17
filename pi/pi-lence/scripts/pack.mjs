import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const sourceFiles = [
  "quiet-mode.ts",
  "quiet-renderers.ts",
  "quiet-state.ts",
  "reference-browser.ts",
  "reference-state.ts",
  "reference-ui.ts",
  "reference-widgets.ts",
];
const payload = ["LICENSE", "README.md", ...sourceFiles.map((path) => `src/${path}`)].sort();
const metadata = [
  "name",
  "version",
  "description",
  "keywords",
  "license",
  "repository",
  "type",
  "engines",
  "peerDependencies",
  "pi",
];

/** Read only ordinary files; packaging must not follow input symlinks. @param {string} path */
async function readInput(path) {
  if (!(await lstat(path)).isFile())
    throw new Error(`Payload input is not a regular file (symlink?): ${path}`);
  return readFile(path);
}

/**
 * Stage the consumer contract, pack offline, and publish the local file exclusively.
 * This does not publish to a registry or execute package/dependency scripts.
 * @param {string} packageRoot
 * @param {string} outputDir
 * @returns {Promise<{tarballPath: string, sha256: string}>}
 */
export async function packCandidate(packageRoot, outputDir) {
  const root = resolve(packageRoot);
  const sourceDir = join(root, "src");
  if (!(await lstat(sourceDir)).isDirectory())
    throw new Error("Source directory must not be a symlink");
  const actualSource = (await readdir(sourceDir)).sort();
  if (JSON.stringify(actualSource) !== JSON.stringify(sourceFiles))
    throw new Error("Source inventory does not match the reviewed production payload");
  /** @type {Record<string, unknown>} */
  const manifest = JSON.parse((await readInput(join(root, "package.json"))).toString("utf8"));
  if (
    manifest.name !== "@grepco/pi-lence" ||
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(manifest.version)
  ) {
    throw new Error("Invalid Pi-lence package name/version");
  }
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ]) {
    if (manifest[field] && Object.keys(manifest[field]).length)
      throw new Error(`Unexpected runtime dependencies: ${field}`);
  }
  for (const field of metadata) {
    if (manifest[field] === undefined) throw new Error(`Missing consumer metadata: ${field}`);
  }
  const consumer = {
    ...Object.fromEntries(metadata.map((field) => [field, manifest[field]])),
    files: payload,
  };
  const inputs = new Map([["package.json", Buffer.from(`${JSON.stringify(consumer, null, 2)}\n`)]]);
  for (const path of payload) {
    inputs.set(
      path,
      await readInput(path === "LICENSE" ? resolve(root, "../../LICENSE") : join(root, path)),
    );
  }

  const temporary = await mkdtemp(join(tmpdir(), "pi-lence-stage-"));
  try {
    const stage = join(temporary, "package");
    for (const [path, bytes] of inputs) {
      const destination = join(stage, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
      await chmod(destination, 0o644);
    }
    for (const config of ["user.npmrc", "global.npmrc"])
      await writeFile(join(temporary, config), "");
    const env = {
      PATH: process.env.PATH,
      HOME: temporary,
      npm_config_userconfig: join(temporary, "user.npmrc"),
      npm_config_globalconfig: join(temporary, "global.npmrc"),
      npm_config_cache: join(temporary, "cache"),
      npm_config_update_notifier: "false",
    };
    await execute(
      "npm",
      ["pack", "--ignore-scripts", "--offline", "--json", "--pack-destination", temporary, "."],
      { cwd: stage, env, timeout: 30_000 },
    );
    const filename = `grepco-pi-lence-${manifest.version}.tgz`;
    const packed = join(temporary, filename);
    const { stdout } = await execute("tar", ["-tzf", packed], { env, timeout: 10_000 });
    const expected = [...inputs.keys()].map((path) => `package/${path}`).sort();
    if (JSON.stringify(stdout.trim().split("\n").sort()) !== JSON.stringify(expected))
      throw new Error("Packed archive inventory differs from the staged payload");
    const sha256 = createHash("sha256")
      .update(await readFile(packed))
      .digest("hex");
    await mkdir(outputDir, { recursive: true });
    const tarballPath = resolve(outputDir, filename);
    await copyFile(packed, tarballPath, constants.COPYFILE_EXCL);
    return { tarballPath, sha256 };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length !== 1) throw new Error("Usage: pack:candidate -- <output-directory>");
  console.log(
    JSON.stringify(await packCandidate(fileURLToPath(new URL("../", import.meta.url)), args[0])),
  );
}
