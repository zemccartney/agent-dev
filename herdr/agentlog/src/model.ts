export interface SessionMeta {
  harness: "pi";
  sessionId: string;
  sessionPath: string;
  cwd: string;
  nativeName: string | null;
  excerpt: string | null;
  lastUserAt: number | null;
}
export interface FileStamp {
  size: number;
  mtimeMs: number;
}
export type ReadPiResult =
  | { ok: true; meta: SessionMeta; stamp: FileStamp; cacheable: boolean }
  | { ok: false; path: string; code: "missing-file" | "unreadable" | "invalid"; message: string };
