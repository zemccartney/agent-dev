import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { HerdrClient, Pane } from "./herdr.js";
import type { RegistryStore, SessionKey, SessionRecord } from "./store.js";

export type OpenResult =
  | { kind: "opened"; paneId: string }
  | { kind: "choose"; panes: Pane[] }
  | { kind: "pending"; panes: Pane[] }
  | { kind: "error"; message: string; paneId?: string };
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}
async function matches(pane: Pane, record: SessionRecord): Promise<boolean> {
  const ref = pane.session;
  if (ref?.agent !== "pi") return false;
  if (ref.kind === "id") return ref.value === record.sessionId;
  return (
    isAbsolute(ref.value) && (await canonical(ref.value)) === (await canonical(record.sessionPath))
  );
}

export async function openSession(
  key: SessionKey,
  deps: { store: RegistryStore; herdr: HerdrClient },
  options: { paneId?: string; signal?: AbortSignal } = {},
): Promise<OpenResult> {
  const { store, herdr } = deps;
  const { signal } = options;
  let targetId: string | undefined;
  try {
    signal?.throwIfAborted();
    const record = store.get(key);
    const state = await herdr.state(signal);
    signal?.throwIfAborted();
    const matching: Pane[] = [];
    for (const pane of state.panes) {
      if (!(await matches(pane, record))) continue;
      if (
        pane.session?.kind === "id" &&
        store.list().filter((row) => row.harness === "pi" && row.sessionId === record.sessionId)
          .length !== 1
      ) {
        return {
          kind: "error",
          message:
            "Existing Pi ID matches multiple saved files. Visit its pane manually; no duplicate was started.",
          paneId: pane.paneId,
        };
      }
      matching.push(pane);
    }
    signal?.throwIfAborted();
    if (options.paneId && !matching.some((p) => p.paneId === options.paneId))
      return {
        kind: "error",
        message: "That destination no longer reports this conversation. Refresh and choose again.",
      };
    if (!options.paneId && matching.length > 1) return { kind: "choose", panes: matching };
    const existing = options.paneId
      ? matching.find((p) => p.paneId === options.paneId)
      : matching[0];
    if (existing) {
      if (existing.agent !== "pi") return { kind: "pending", panes: [existing] };
      targetId = existing.paneId;
      const current = await herdr.pane(targetId, signal);
      signal?.throwIfAborted();
      if (!(await matches(current, record)))
        throw new Error("Destination changed conversation; refresh before opening again.");
      if (current.agent !== "pi") return { kind: "pending", panes: [current] };
    } else {
      if (!(await stat(record.cwd)).isDirectory())
        throw new Error("Original working directory is unavailable");
      if (!(await stat(record.sessionPath)).isFile())
        throw new Error("Saved session is not a regular file");
      await access(record.cwd, constants.X_OK);
      await access(record.sessionPath, constants.R_OK);
      signal?.throwIfAborted();
      const cwd = await canonical(record.cwd);
      const workspaces = new Set<string>();
      for (const workspace of state.workspaces) {
        if (workspace.checkoutPath && (await canonical(workspace.checkoutPath)) === cwd)
          workspaces.add(workspace.workspaceId);
      }
      for (const pane of state.panes) {
        if (pane.cwd && (await canonical(pane.cwd)) === cwd) workspaces.add(pane.workspaceId);
      }
      signal?.throwIfAborted();
      const destination = await herdr.createDestination(
        record.cwd,
        workspaces.size === 1 ? [...workspaces][0] : undefined,
        signal,
      );
      targetId = destination.paneId;
      signal?.throwIfAborted();
      await herdr.startPi(
        targetId,
        record.sessionPath,
        `agentlog-${randomBytes(6).toString("hex")}`,
        signal,
      );
      signal?.throwIfAborted();
      const current = await herdr.pane(targetId, signal);
      signal?.throwIfAborted();
      if (current.agent !== "pi" || !(await matches(current, record)))
        throw new Error(
          "Started pane has not confirmed the expected Pi conversation. Inspect it before retrying.",
        );
    }
    signal?.throwIfAborted();
    await herdr.focus(targetId, signal);
    signal?.throwIfAborted();
    store.setArchived(key, false);
    return { kind: "opened", paneId: targetId };
  } catch (error) {
    return {
      kind: "error",
      message: signal?.aborted
        ? "Open cancelled. An already accepted launch may still finish; refresh before retrying."
        : error instanceof Error
          ? error.message
          : String(error),
      ...(targetId ? { paneId: targetId } : {}),
    };
  }
}
