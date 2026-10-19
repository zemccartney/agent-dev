import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const pi = "@grepco/pi-lence";
const manifestPath = "pi/pi-lence/package.json";
const changelogPath = "pi/pi-lence/CHANGELOG.md";
const members = new Map([
  [pi, "pi/pi-lence"],
  ["@grepco/agentlog", "herdr/agentlog"],
  ["@grepco/auto-caffeinator", "herdr/auto-caffeinator"],
]);
const configuration = {
  changelog: "@changesets/cli/changelog",
  commit: false,
  fixed: [],
  linked: [],
  access: "public",
  baseBranch: "dev",
  format: "oxfmt",
  privatePackages: { version: true, tag: false },
  updateInternalDependencies: "patch",
  ignore: [],
};
/** @typedef {{sourceCommit: string, targetVersion: string | null, changesetIds: string[]}} Preparation */
/** @typedef {{id: string, releases: {name: string, type: string}[]} } Note */
/** @typedef {{name: string, oldVersion: string, newVersion: string, type: string}} Release */
/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
/** @param {string} path */
async function jsonFile(path) {
  requireThat((await lstat(path)).isFile(), `Expected a regular file: ${path}`);
  return JSON.parse(await readFile(path, "utf8"));
}
/** Hash tracked inputs, including modes and symlink targets, without following leaf symlinks.
 * @param {string} cwd @param {string[]} paths */
async function fingerprints(cwd, paths) {
  return new Map(
    await Promise.all(
      paths.map(async (path) => {
        const absolute = join(cwd, path);
        const stat = await lstat(absolute);
        const bytes = stat.isSymbolicLink() ? await readlink(absolute) : await readFile(absolute);
        /** @type {[string, string]} */
        const fingerprint = [
          path,
          `${stat.mode}:${createHash("sha256").update(bytes).digest("hex")}`,
        ];
        return fingerprint;
      }),
    ),
  );
}

/** Owned process groups, one deadline for the operation, and no inherited credential routing.
 * @param {string} cwd @param {string} scratch @param {AbortSignal} signal */
function commands(cwd, scratch, signal) {
  const deadline = Date.now() + 20_000;
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: join(scratch, "home"),
    TMPDIR: join(scratch, "tmp"),
    XDG_CONFIG_HOME: join(scratch, "config"),
    XDG_CACHE_HOME: join(scratch, "cache"),
    XDG_DATA_HOME: join(scratch, "data"),
    PWD: cwd,
    CI: "true",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    npm_config_userconfig: join(scratch, "user.npmrc"),
    npm_config_globalconfig: join(scratch, "global.npmrc"),
    npm_config_cache: join(scratch, "cache"),
    npm_config_offline: "true",
    npm_config_update_notifier: "false",
    pnpm_config_verify_deps_before_run: "false",
  };
  /** @param {string} command @param {string[]} args @returns {Promise<string>} */
  function run(command, args) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Preparation interrupted"));
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reject(new Error("Preparation command deadline exceeded"));
        return;
      }
      const child = spawn(command, args, {
        cwd,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let failure = "";
      const terminate = () => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ESRCH") throw error;
        }
      };
      const interrupt = () => {
        failure = "preparation interrupted";
        terminate();
      };
      signal.addEventListener("abort", interrupt, { once: true });
      const timer = setTimeout(() => {
        failure = "command deadline exceeded";
        terminate();
      }, remaining);
      const bound = () => {
        if (stdout.length + stderr.length > 1024 * 1024) {
          failure = "command output limit exceeded";
          terminate();
        }
      };
      child.stdout.on("data", (data) => {
        stdout += data;
        bound();
      });
      child.stderr.on("data", (data) => {
        stderr += data;
        bound();
      });
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", interrupt);
        terminate();
        if (failure || code !== 0)
          reject(
            new Error(
              `${command} ${args.join(" ")} failed (${failure || code}):\n${stderr}\n${stdout}`,
            ),
          );
        else resolve(stdout);
      });
    });
  }
  return run;
}

/** @param {string} input @param {boolean} apply @returns {Promise<Preparation>} */
async function prepare(input, apply) {
  const cwd = await realpath(input);
  const scratch = await mkdtemp(join(tmpdir(), "agent-dev-release-prep-"));
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    for (const name of ["home", "tmp", "config", "cache", "data"]) await mkdir(join(scratch, name));
    for (const name of ["user.npmrc", "global.npmrc"]) await writeFile(join(scratch, name), "");
    const run = commands(cwd, scratch, controller.signal);
    /** @param {string[]} args */
    const git = (...args) => run("git", args);
    requireThat(
      (await realpath((await git("rev-parse", "--show-toplevel")).trim())) === cwd,
      "Preparation requires a repository root",
    );
    const sourceCommit = (await git("rev-parse", "HEAD")).trim();
    requireThat(
      (await git("status", "--porcelain=v1", "--untracked-files=all")) === "",
      "Preparation requires a clean checkout",
    );
    const refs = await git("for-each-ref", "--format=%(refname) %(objectname)");
    const tracked = (await git("ls-files", "-z")).split("\0").filter(Boolean);
    const original = await fingerprints(cwd, tracked);
    const rootManifest = await jsonFile(join(cwd, "package.json"));
    requireThat(
      rootManifest.private === true && rootManifest.packageManager === "pnpm@11.26.0",
      "Invalid private workspace/toolchain identity",
    );
    requireThat(
      isDeepStrictEqual(await jsonFile(join(cwd, ".changeset/config.json")), configuration),
      "Unsupported Changesets configuration",
    );
    const entries = await readdir(join(cwd, ".changeset"), { withFileTypes: true });
    requireThat(
      !entries.some((entry) => entry.name === "pre.json"),
      "Prerelease state is not supported",
    );
    requireThat(
      entries.every((entry) => entry.isFile()),
      "Unsupported changeset note layout: regular top-level files required",
    );
    const noteFiles = entries
      .filter((entry) => entry.name.endsWith(".md") && entry.name !== "README.md")
      .map((entry) => entry.name);

    /** @type {{name: string, path: string}[]} */
    const projects = JSON.parse(
      await run("pnpm", ["list", "--recursive", "--depth", "-1", "--json"]),
    );
    const ignored = [];
    let piManifest;
    const seen = new Set();
    for (const project of projects) {
      const absolute = await realpath(project.path);
      if (absolute === cwd) continue;
      const path = relative(cwd, absolute).split(sep).join("/");
      requireThat(
        members.get(project.name) === path && !seen.has(project.name),
        `Unsupported workspace identity: ${project.name} at ${path}`,
      );
      seen.add(project.name);
      const manifest = await jsonFile(join(absolute, "package.json"));
      requireThat(
        manifest.name === project.name,
        `Unsupported workspace identity: ${project.name}`,
      );
      if (project.name === pi) {
        requireThat(manifest.private !== true, "Pi-lence must be public");
        piManifest = manifest;
      } else {
        requireThat(manifest.private === true, "Herdr members must remain private");
        ignored.push(project.name);
      }
    }
    requireThat(piManifest !== undefined, "Pi-lence workspace member is required");
    requireThat(
      typeof piManifest.version === "string" && !piManifest.version.includes("-"),
      "Prerelease Pi-lence versions are not supported",
    );
    const cliPath = fileURLToPath(import.meta.resolve("@changesets/cli/bin.js"));
    requireThat(
      (await jsonFile(join(dirname(cliPath), "package.json"))).version === "3.0.3",
      "Changesets CLI 3.0.3 is required",
    );
    /** @param {string[]} args */
    const cli = (...args) => run(process.execPath, [cliPath, ...args]);
    /** @type {Preparation} */
    const result = { sourceCommit, targetVersion: null, changesetIds: [] };
    if (noteFiles.length > 0) {
      const output = join(scratch, "status.json");
      await cli("status", "--output", output);
      /** @type {{changesets: Note[], releases: Release[]}} */
      const status = await jsonFile(output);
      requireThat(
        Array.isArray(status.changesets) && Array.isArray(status.releases),
        "Invalid Changesets status output",
      );
      for (const note of status.changesets) {
        requireThat(
          noteFiles.includes(`${note.id}.md`) && Array.isArray(note.releases),
          "Invalid Changesets note identity",
        );
        if (note.releases.some((release) => release.name === pi)) {
          requireThat(
            note.releases.every((release) => release.name === pi),
            "Mixed Pi/Herdr note: split this note before preparation",
          );
          result.changesetIds.push(note.id);
        }
      }
      result.changesetIds.sort();
      if (result.changesetIds.length > 0) {
        const releases = status.releases.filter((release) => release.name === pi);
        requireThat(
          releases.length === 1 &&
            releases[0].oldVersion === piManifest.version &&
            typeof releases[0].newVersion === "string",
          "Invalid Pi-lence release plan",
        );
        result.targetVersion = releases[0].newVersion;
        requireThat(
          piManifest.version !== "0.0.0" || result.targetVersion === "0.1.0",
          "The first Pi-lence release must be 0.1.0",
        );
      }
    }
    const unchangedGit = async () => {
      requireThat(
        (await git("rev-parse", "HEAD")).trim() === sourceCommit,
        "Source HEAD changed during preparation",
      );
      requireThat(
        (await git("for-each-ref", "--format=%(refname) %(objectname)")) === refs,
        "Repository refs changed during preparation",
      );
      requireThat(
        (await git("diff", "--cached", "--name-only", "-z")) === "",
        "Unexpected index changes during preparation",
      );
    };
    await unchangedGit();
    requireThat(
      (await git("status", "--porcelain=v1", "--untracked-files=all")) === "" &&
        isDeepStrictEqual(await fingerprints(cwd, tracked), original),
      "Inspection changed repository inputs",
    );
    if (!apply || result.targetVersion === null) return result;

    await cli("version", ...ignored.flatMap((name) => ["--ignore", name]));
    await unchangedGit();
    const removed = result.changesetIds.map((id) => `.changeset/${id}.md`);
    const expected = new Set([manifestPath, changelogPath, ...removed]);
    const records = (await git("status", "--porcelain=v1", "-z", "--untracked-files=all"))
      .split("\0")
      .filter(Boolean);
    const actual = new Set();
    for (const record of records) {
      const path = record.slice(3);
      const state = record.slice(0, 2);
      requireThat(
        expected.has(path) &&
          (removed.includes(path) ? state === " D" : [" M", "??"].includes(state)),
        `Unexpected preparation change: ${record}`,
      );
      actual.add(path);
    }
    requireThat(isDeepStrictEqual(actual, expected), "Unexpected preparation changed-file set");
    const protectedPaths = tracked.filter((path) => !expected.has(path));
    requireThat(
      isDeepStrictEqual(
        await fingerprints(cwd, protectedPaths),
        new Map(protectedPaths.map((path) => [path, original.get(path)])),
      ),
      "Unexpected protected input mutation",
    );
    requireThat(
      isDeepStrictEqual(await jsonFile(join(cwd, manifestPath)), {
        ...piManifest,
        version: result.targetVersion,
      }),
      "Unexpected Pi-lence manifest changes",
    );
    requireThat(
      (await lstat(join(cwd, changelogPath))).isFile(),
      "Expected a regular Pi-lence changelog",
    );
    requireThat(
      (await readFile(join(cwd, changelogPath), "utf8")).includes(`## ${result.targetVersion}`),
      "Missing target changelog entry",
    );
    return result;
  } finally {
    try {
      await rm(scratch, { recursive: true, force: true });
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
    requireThat(!controller.signal.aborted, "Preparation interrupted");
  }
}

/** Inspect committed intent without versioning. @param {string} cwd @returns {Promise<Preparation>} */
export function inspectPiRelease(cwd) {
  return prepare(cwd, false);
}
/** Apply only inside an explicitly selected disposable release checkout. @param {string} cwd @returns {Promise<Preparation>} */
export function preparePiRelease(cwd) {
  return prepare(cwd, true);
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    requireThat(
      args.length === 1 && ["--check", "--apply"].includes(args[0]),
      "Usage: node scripts/prepare-pi-release.mjs --check | --apply",
    );
    console.log(JSON.stringify(await prepare(process.cwd(), args[0] === "--apply")));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
