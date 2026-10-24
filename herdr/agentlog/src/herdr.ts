import { execFile } from "node:child_process";
import { promisify } from "node:util";
export interface Pane {
  paneId: string;
  workspaceId: string;
  tabId: string;
  cwd: string | null;
  agent: string | null;
  session: { agent: string; kind: "path" | "id"; value: string } | null;
}
export interface Workspace {
  workspaceId: string;
  checkoutPath?: string;
}
export interface HerdrState {
  panes: Pane[];
  workspaces: Workspace[];
}
export type Exec = (
  file: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; signal?: AbortSignal; timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;
export interface HerdrClient {
  state(signal?: AbortSignal): Promise<HerdrState>;
  pane(id: string, signal?: AbortSignal): Promise<Pane>;
  createDestination(cwd: string, workspaceId?: string, signal?: AbortSignal): Promise<Pane>;
  startPi(
    paneId: string,
    sessionPath: string,
    internalName: string,
    signal?: AbortSignal,
  ): Promise<void>;
  focus(paneId: string, signal?: AbortSignal): Promise<void>;
  openPopup(signal?: AbortSignal): Promise<void>;
}
export class HerdrError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HerdrError";
    this.code = code;
  }
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Herdr response object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Invalid or missing Herdr identifier");
  return value;
}
function pane(value: unknown): Pane {
  const p = object(value);
  let session: Pane["session"] = null;
  if (p.agent_session != null) {
    const ref = object(p.agent_session);
    if (ref.kind !== "path" && ref.kind !== "id")
      throw new Error("Invalid Herdr session reference");
    session = { agent: text(ref.agent), kind: ref.kind, value: text(ref.value) };
  }
  return {
    paneId: text(p.pane_id),
    workspaceId: text(p.workspace_id),
    tabId: text(p.tab_id),
    cwd: typeof p.cwd === "string" ? p.cwd : null,
    agent: typeof p.agent === "string" ? p.agent : null,
    session,
  };
}
function apiError(value: unknown): HerdrError | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const error = object(value).error;
  if (error === null || typeof error !== "object") return undefined;
  const body = object(error);
  return new HerdrError(text(body.code), text(body.message));
}
const runFile = promisify(execFile);
const execute: Exec = async (bin, args, options) => {
  const result = await runFile(bin, [...args], { ...options, encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr };
};
export function createHerdrClient(env: NodeJS.ProcessEnv, exec: Exec = execute): HerdrClient {
  const bin = env.HERDR_BIN_PATH;
  if (!bin || !env.HERDR_SOCKET_PATH)
    throw new Error("Run Agentlog from Herdr: missing plugin context");
  const childEnv = { ...env };
  async function call(args: string[], signal?: AbortSignal, timeout = 5000) {
    signal?.throwIfAborted();
    let stdout: string;
    try {
      ({ stdout } = await exec(bin!, args, {
        env: childEnv,
        signal,
        timeout,
        maxBuffer: 4 * 1024 * 1024,
      }));
    } catch (error) {
      signal?.throwIfAborted();
      const stderr =
        error instanceof Error ? (error as Error & { stderr?: unknown }).stderr : undefined;
      if (typeof stderr === "string") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(stderr);
        } catch {
          /* Preserve non-JSON process errors. */
        }
        const api = apiError(parsed);
        if (api) throw api;
      }
      throw error;
    }
    signal?.throwIfAborted();
    const response = object(JSON.parse(stdout));
    const error = apiError(response);
    if (error) throw error;
    return object(response.result);
  }
  return {
    async state(signal) {
      const [p, w] = await Promise.all([
        call(["pane", "list"], signal),
        call(["workspace", "list"], signal),
      ]);
      if (!Array.isArray(p.panes) || !Array.isArray(w.workspaces))
        throw new Error("Invalid or missing Herdr pane/workspace list");
      return {
        panes: p.panes.map(pane),
        workspaces: w.workspaces.map((value: unknown) => {
          const workspace = object(value);
          const worktree = workspace.worktree == null ? undefined : object(workspace.worktree);
          return {
            workspaceId: text(workspace.workspace_id),
            ...(typeof worktree?.checkout_path === "string"
              ? { checkoutPath: worktree.checkout_path }
              : {}),
          };
        }),
      };
    },
    async pane(id, signal) {
      return pane((await call(["pane", "get", id], signal)).pane);
    },
    async createDestination(cwd, workspaceId, signal) {
      const args = workspaceId
        ? ["tab", "create", "--workspace", workspaceId]
        : ["workspace", "create"];
      return pane((await call([...args, "--cwd", cwd, "--no-focus"], signal)).root_pane);
    },
    async startPi(paneId, sessionPath, internalName, signal) {
      await call(
        [
          "agent",
          "start",
          internalName,
          "--kind",
          "pi",
          "--pane",
          paneId,
          "--timeout",
          "30000",
          "--",
          "--session",
          sessionPath,
        ],
        signal,
        35000,
      );
    },
    async focus(paneId, signal) {
      await call(["agent", "focus", paneId], signal);
    },
    async openPopup(signal) {
      await call(
        [
          "plugin",
          "pane",
          "open",
          "--plugin",
          "grepco.agentlog",
          "--entrypoint",
          "registry",
          "--focus",
        ],
        signal,
      );
    },
  };
}
