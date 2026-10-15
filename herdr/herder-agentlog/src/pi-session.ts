import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import type { ReadPiResult, SessionMeta } from "./model.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((value: unknown) => {
      const block = record(value);
      return block?.type === "text" && typeof block.text === "string" ? [block.text] : [];
    })
    .join(" ");
}

/** Read only saved metadata. No branch selection, transcript repair, or source writes. */
export async function readPiSession(path: string, signal?: AbortSignal): Promise<ReadPiResult> {
  signal?.throwIfAborted();
  let canonical = resolve(path);
  try {
    canonical = await realpath(canonical);
    const before = await stat(canonical);
    if (!before.isFile()) throw new Error("Session path is not a regular file");
    let meta: SessionMeta | undefined;
    let pending = "";
    let lines = 0;
    let cacheable = true;
    function entry(value: unknown) {
      const item = record(value);
      if (!item) throw new Error("Invalid session entry");
      if (!meta) {
        if (
          item.type !== "session" ||
          typeof item.id !== "string" ||
          !item.id ||
          typeof item.cwd !== "string" ||
          !isAbsolute(item.cwd)
        ) {
          throw new Error("Missing valid session header with ID and absolute directory");
        }
        meta = {
          harness: "pi",
          sessionId: item.id,
          sessionPath: canonical,
          cwd: item.cwd,
          nativeName: null,
          excerpt: null,
          lastUserAt: null,
        };
        return;
      }
      if (item.type === "session_info" && typeof item.name === "string")
        meta.nativeName = item.name.trim() || null;
      const message = record(item.message);
      if (item.type !== "message" || message?.role !== "user") return;
      const timestamp =
        typeof message.timestamp === "number"
          ? message.timestamp
          : typeof item.timestamp === "string"
            ? Date.parse(item.timestamp)
            : Number.NaN;
      if (Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()))
        meta.lastUserAt = Math.max(meta.lastUserAt ?? -Infinity, timestamp);
      if (meta.excerpt === null) {
        const text = userText(message.content).replace(/\s+/gu, " ").trim();
        if (text) meta.excerpt = Array.from(text).slice(0, 120).join("");
      }
    }
    const stream = createReadStream(canonical, { encoding: "utf8", signal });
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      pending += String(chunk);
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line) entry(JSON.parse(line) as unknown);
        if (++lines % 128 === 0) {
          await setImmediate();
          signal?.throwIfAborted();
        }
      }
    }
    if (pending.trim()) {
      let last: unknown;
      try {
        last = JSON.parse(pending);
      } catch {
        cacheable = false;
      }
      if (cacheable) entry(last);
    }
    if (!meta) throw new Error("Missing session header");
    const after = await stat(canonical);
    signal?.throwIfAborted();
    return {
      ok: true,
      meta,
      stamp: { size: after.size, mtimeMs: after.mtimeMs },
      cacheable: cacheable && before.size === after.size && before.mtimeMs === after.mtimeMs,
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof Error && error.name === "AbortError") throw error;
    const code = record(error)?.code;
    return {
      ok: false,
      path: canonical,
      code:
        code === "ENOENT"
          ? "missing-file"
          : code === "EACCES" || code === "EPERM"
            ? "unreadable"
            : "invalid",
      message:
        code === "ENOENT"
          ? "Session file is missing"
          : code === "EACCES" || code === "EPERM"
            ? "Session file is unreadable: permission denied"
            : "Session file is malformed or cannot be read",
    };
  }
}
