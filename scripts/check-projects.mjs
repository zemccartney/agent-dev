import { readFileSync, realpathSync } from "node:fs";
import { join, relative, sep, posix } from "node:path";
import { spawnSync } from "node:child_process";

/** @typedef {{ name: string, path: string, dependencies: string[] }} Project */
/** Conservative selection: callers supply both names of a rename, including deleted paths.
 * @param {string[]} files @param {Project[]} projects */
export function selectProjects(files, projects) {
  /** @type {Set<string>} */
  const selected = new Set();
  const all = projects.map((project) => project.name).sort();
  for (const file of files) {
    const path = posix.normalize(file);
    const owners = projects.filter(
      (project) => path === project.path || path.startsWith(`${project.path}/`),
    );
    if (!owners.length) return all;
    for (const owner of owners) selected.add(owner.name);
  }
  let added = true;
  while (added) {
    added = false;
    for (const project of projects) {
      if (!selected.has(project.name) && project.dependencies.some((name) => selected.has(name))) {
        selected.add(project.name);
        added = true;
      }
    }
  }
  return [...selected].sort();
}

/** @param {string} command @param {string[]} args @param {string} cwd @param {boolean} [inherit] */
function run(command, args, cwd, inherit = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed (${result.status ?? result.signal}): ${result.stderr ?? ""}`,
    );
  return result.stdout ?? "";
}
/** @param {string} root */
function discoverProjects(root) {
  /** @type {{name: string, path: string}[]} */
  const entries = JSON.parse(run("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], root));
  const members = entries.filter((entry) => realpathSync(entry.path) !== realpathSync(root));
  const names = new Set(members.map((member) => member.name));
  return members.map((member) => {
    const manifest = JSON.parse(readFileSync(join(member.path, "package.json"), "utf8"));
    const dependencies = [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]
      .flatMap((kind) => Object.keys(manifest[kind] ?? {}))
      .filter((name) => names.has(name));
    return {
      name: member.name,
      path: relative(root, member.path).split(sep).join("/"),
      dependencies,
    };
  });
}
/** Keep statuses so hk's existing-file lists can recover staged deletions and rename sources.
 * @param {string} root @returns {{status: string, paths: string[]}[]} */
function stagedChanges(root) {
  const output = run("git", ["diff", "--cached", "--name-status", "-z", "--find-renames"], root);
  if (!output) return [];
  const fields = output.split("\0");
  if (fields.pop() !== "") throw new Error("Invalid NUL-terminated Git output");
  const records = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!/^[ACDMRTUXB]\d*$/.test(status)) throw new Error(`Invalid Git status: ${status}`);
    const count = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.slice(index, index + count);
    if (paths.length !== count || paths.some((path) => !path))
      throw new Error("Incomplete Git change record");
    records.push({ status, paths });
    index += count;
  }
  return records;
}
/** @param {string[]} args */
function main(args) {
  if (!((args.length === 1 && ["--all", "--staged"].includes(args[0])) || args[0] === "--")) {
    throw new Error(
      "Usage: node scripts/check-projects.mjs --all | --staged | -- <repository-relative paths...>",
    );
  }
  const root = run("git", ["rev-parse", "--show-toplevel"], process.cwd()).trim();
  const projects = discoverProjects(root);
  let files;
  if (args[0] === "--all") files = ["pnpm-workspace.yaml"];
  else {
    const changes = stagedChanges(root);
    files = args[0] === "--staged" ? changes.flatMap((change) => change.paths) : args.slice(1);
    if (args[0] === "--") {
      const named = new Set(files.map((path) => posix.normalize(path)));
      files = [
        ...files,
        ...changes
          .filter(
            ({ status, paths }) =>
              status === "D" || (paths.length === 2 && paths.some((path) => named.has(path))),
          )
          .flatMap((change) => change.paths),
      ];
    }
  }
  const selected = selectProjects(files, projects);
  if (!selected.length) console.log("No affected projects.");
  for (const name of selected) {
    console.log(`Checking ${name}`);
    run("pnpm", ["--filter", name, "run", "check:project"], root, true);
  }
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
