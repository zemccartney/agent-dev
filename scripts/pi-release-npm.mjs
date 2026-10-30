import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** @typedef {{tarballPath:string,name:string,version:string,integrity:string}} StageInput */
/** @typedef {{cwd:string,env:NodeJS.ProcessEnv,timeout:number,maxBuffer:number}} ExecutionOptions */
/** @param {string} cli @param {string[]} args @param {ExecutionOptions} options */
export async function executeNpm(cli, args, options) {
  return promisify(execFile)(process.execPath, [cli, ...args], {
    ...options,
    encoding: "utf8",
    killSignal: "SIGKILL",
  });
}

/** Native submission only: no publish/inspect/reject/approve authority or configurable registry.
 * An executor can replace the subprocess boundary; tests keep the CLI real and HTTP local.
 * @param {StageInput} artifact @param {NodeJS.ProcessEnv} sourceEnv
 * @param {typeof executeNpm} [execute] */
export async function stageTarball(artifact, sourceEnv, execute = executeNpm) {
  if (
    artifact.name !== "@grepco/pi-lence" ||
    !/^\d+\.\d+\.\d+$/.test(artifact.version) ||
    !isAbsolute(artifact.tarballPath)
  )
    throw new Error("Invalid staging artifact identity/path");
  const stat = await lstat(artifact.tarballPath);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
    throw new Error("Invalid staging archive file");
  const bytes = await readFile(artifact.tarballPath);
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== artifact.integrity)
    throw new Error("Staging artifact integrity changed");
  const metadataUrl = new URL(import.meta.resolve("npm/package.json"));
  const metadata = JSON.parse(await readFile(metadataUrl, "utf8"));
  if (metadata.version !== "11.21.1") throw new Error("Reviewed npm11.21.1 is required");
  const cli = fileURLToPath(new URL("bin/npm-cli.js", metadataUrl));
  const root = await mkdtemp(join(tmpdir(), "pi-npm-stage-"));
  try {
    // Anchor npm's project discovery here: user/global config overrides alone do not
    // prevent an ancestor package.json/.npmrc from supplying credentials or tags.
    await writeFile(join(root, "package.json"), '{"private":true}\n', { flag: "wx" });
    await writeFile(join(root, ".npmrc"), "", { flag: "wx", mode: 0o600 });
    const tarball = join(root, "release.tgz");
    await writeFile(tarball, bytes, { mode: 0o400, flag: "wx" });
    const userconfig = join(root, "user.npmrc");
    const globalconfig = join(root, "global.npmrc");
    await writeFile(userconfig, "", { mode: 0o600 });
    await writeFile(globalconfig, "", { mode: 0o600 });
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      HOME: root,
      npm_config_userconfig: userconfig,
      npm_config_globalconfig: globalconfig,
      npm_config_cache: join(root, "cache"),
      npm_config_update_notifier: "false",
    };
    // Only context required by npm's GitHub OIDC/provenance implementations; no token fallback.
    for (const key of [
      "PATH",
      "TMPDIR",
      "LANG",
      "CI",
      "GITHUB_ACTIONS",
      "GITHUB_REPOSITORY",
      "GITHUB_REPOSITORY_ID",
      "GITHUB_REPOSITORY_OWNER_ID",
      "GITHUB_SERVER_URL",
      "GITHUB_REF",
      "GITHUB_SHA",
      "GITHUB_RUN_ID",
      "GITHUB_RUN_ATTEMPT",
      "GITHUB_WORKFLOW_REF",
      "GITHUB_WORKFLOW_SHA",
      "GITHUB_EVENT_NAME",
      "RUNNER_ENVIRONMENT",
      "ACTIONS_ID_TOKEN_REQUEST_URL",
      "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
    ])
      if (sourceEnv[key] !== undefined) env[key] = sourceEnv[key];
    try {
      const result = await execute(
        cli,
        [
          "stage",
          "publish",
          tarball,
          "--json",
          "--ignore-scripts",
          "--workspaces=false",
          "--access=public",
          "--registry=https://registry.npmjs.org",
          "--provenance",
          "--fetch-retries=0",
          "--fetch-timeout=30000",
        ],
        { cwd: root, env, timeout: 120_000, maxBuffer: 1024 * 1024 },
      );
      const output = JSON.parse(result.stdout);
      const receipt = output[artifact.name];
      if (
        !receipt ||
        receipt.name !== artifact.name ||
        receipt.version !== artifact.version ||
        receipt.integrity !== artifact.integrity ||
        typeof receipt.stageId !== "string" ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(receipt.stageId)
      )
        throw new Error("Invalid stage receipt");
      return {
        stageId: receipt.stageId,
        name: artifact.name,
        version: artifact.version,
        integrity: artifact.integrity,
      };
    } catch {
      // Do not print subprocess exceptions, command environment or npm debug logs (credentials).
      // The remote POST may already have succeeded even though its response was lost.
      throw new Error(
        "No verified staging receipt. Inspect npm before any retry; a pending stage may already exist. Nothing was approved or replaced by this tool.",
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
