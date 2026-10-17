import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { readPiSession } from "./pi-session.js";
import { sessionKey, type RegistryStore, type SessionRecord } from "./store.js";
import { safeDisplay } from "./catalog.js";

export interface DiscoveryContext {
  home: string;
  env: NodeJS.ProcessEnv;
  projectCwds: string[];
  livePaths: string[];
}
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function configuredPaths(value: string | undefined, context: DiscoveryContext): string[] {
  if (!value) return [];
  const expanded =
    value === "~"
      ? context.home
      : value.startsWith("~/")
        ? join(context.home, value.slice(2))
        : value;
  return isAbsolute(expanded)
    ? [resolve(expanded)]
    : context.projectCwds.filter(isAbsolute).map((cwd) => resolve(cwd, expanded));
}

export async function discoverSources(
  context: DiscoveryContext,
  knownPaths: string[],
  signal?: AbortSignal,
): Promise<{ files: string[]; issues: string[] }> {
  signal?.throwIfAborted();
  const files = new Set<string>();
  const issues: string[] = [];
  const agents = new Set([
    join(context.home, ".pi/agent"),
    ...configuredPaths(context.env.PI_CODING_AGENT_DIR, context),
  ]);
  const roots = new Set([...agents].map((agent) => join(agent, "sessions")));
  for (const path of configuredPaths(context.env.PI_CODING_AGENT_SESSION_DIR, context))
    roots.add(path);
  for (const agent of agents) {
    try {
      const parsed: unknown = JSON.parse(
        (await readFile(join(agent, "settings.json"), { encoding: "utf8", signal })).replace(
          /^\uFEFF/u,
          "",
        ),
      );
      if (
        parsed &&
        typeof parsed === "object" &&
        "sessionDir" in parsed &&
        typeof parsed.sessionDir === "string"
      ) {
        for (const path of configuredPaths(parsed.sessionDir, context)) roots.add(path);
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (!missing(error))
        issues.push(`Cannot read Pi settings: ${safeDisplay(join(agent, "settings.json"))}`);
    }
  }
  async function addFile(path: string) {
    signal?.throwIfAborted();
    try {
      files.add(await realpath(path));
    } catch {
      files.add(resolve(path));
    }
  }
  async function walk(root: string): Promise<void> {
    signal?.throwIfAborted();
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (!missing(error)) issues.push(`Cannot scan session directory: ${safeDisplay(root)}`);
      return;
    }
    for (const entry of entries) {
      signal?.throwIfAborted();
      const path = join(root, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) await addFile(path);
    }
  }
  for (const root of roots) await walk(root);
  for (const path of [...knownPaths, ...context.livePaths])
    if (isAbsolute(path)) await addFile(path);
  signal?.throwIfAborted();
  return { files: [...files].sort(), issues };
}

export async function refreshCatalog(
  store: RegistryStore,
  context: DiscoveryContext,
  signal?: AbortSignal,
): Promise<{ records: SessionRecord[]; issues: string[] }> {
  signal?.throwIfAborted();
  for (const path of context.livePaths) if (isAbsolute(path)) store.rememberPath(path);
  const initial = store.list();
  const byPath = new Map(initial.map((row) => [row.sessionPath, row]));
  const sources = await discoverSources(
    {
      ...context,
      projectCwds: [...new Set([...context.projectCwds, ...initial.map((row) => row.cwd)])],
    },
    store.knownPaths(),
    signal,
  );
  const issues = [...sources.issues];
  for (const path of sources.files) {
    signal?.throwIfAborted();
    let row = byPath.get(path);
    let cached = false;
    if (row?.stamp) {
      try {
        const current = await stat(path);
        await access(path, constants.R_OK);
        cached =
          current.isFile() &&
          current.size === row.stamp.size &&
          current.mtimeMs === row.stamp.mtimeMs;
      } catch {
        /* Adapter reports missing/unreadable paths below. */
      }
    }
    if (!cached) {
      const parsed = await readPiSession(path, signal);
      signal?.throwIfAborted();
      if (!parsed.ok) {
        if (row) store.setAvailability(row.key, parsed.code, parsed.message);
        issues.push(`${safeDisplay(path)}: ${parsed.message}`);
        continue;
      }
      store.upsert(parsed.meta, parsed.cacheable ? parsed.stamp : null);
      row = store.get(sessionKey(parsed.meta));
    }
    if (row) {
      let directoryAvailable = false;
      try {
        directoryAvailable = (await stat(row.cwd)).isDirectory();
      } catch {
        /* Keep the record and explain its unavailable directory. */
      }
      signal?.throwIfAborted();
      store.setAvailability(
        row.key,
        directoryAvailable ? "available" : "missing-directory",
        directoryAvailable ? null : "Original directory is missing or inaccessible",
      );
    }
    await setImmediate();
  }
  signal?.throwIfAborted();
  return { records: store.list(), issues };
}
