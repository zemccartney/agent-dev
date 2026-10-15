import { mkdirSync, chmodSync, openSync, closeSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import type { FileStamp, SessionMeta } from "./model.js";

export type SessionKey = string;
export type Availability =
  | "available"
  | "missing-file"
  | "missing-directory"
  | "unreadable"
  | "invalid";
export interface SessionRecord extends SessionMeta {
  key: SessionKey;
  stamp: FileStamp | null;
  pinned: boolean;
  archived: boolean;
  labelOverride: string | null;
  availability: Availability;
  error: string | null;
}
export function sessionKey(meta: SessionMeta): SessionKey {
  return meta.harness + ":" + meta.sessionPath;
}
function decode(row: Record<string, SQLOutputValue>): SessionRecord {
  const source = JSON.parse(String(row.source)) as SessionMeta;
  return {
    ...source,
    key: String(row.key),
    stamp: row.stamp === null ? null : (JSON.parse(String(row.stamp)) as FileStamp),
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    labelOverride: row.label === null ? null : String(row.label),
    availability: String(row.availability) as Availability,
    error: row.error === null ? null : String(row.error),
  };
}
export class RegistryStore {
  private readonly db: DatabaseSync;
  private closed = false;
  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    chmodSync(stateDir, 0o700);
    const file = join(stateDir, "agentlog.sqlite3");
    closeSync(openSync(file, "a", 0o600));
    chmodSync(file, 0o600);
    this.db = new DatabaseSync(file);
    try {
      this.db.exec("PRAGMA busy_timeout=2000");
      const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
      if (version !== 0 && version !== 1)
        throw new Error(`Unsupported registry schema: ${String(version)}`);
      this.db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS sessions (
          key TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, source TEXT NOT NULL, stamp TEXT,
          pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, label TEXT,
          availability TEXT NOT NULL DEFAULT 'available', error TEXT
        );
        CREATE TABLE IF NOT EXISTS observed_paths (path TEXT PRIMARY KEY);
        PRAGMA user_version=1;
        COMMIT;`);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  list(): SessionRecord[] {
    return this.db.prepare("SELECT * FROM sessions").all().map(decode);
  }
  get(key: SessionKey): SessionRecord {
    const row = this.db.prepare("SELECT * FROM sessions WHERE key=?").get(key);
    if (!row) throw new Error(`Unknown session: ${key}`);
    return decode(row);
  }
  upsert(meta: SessionMeta, stamp: FileStamp | null): void {
    if (!isAbsolute(meta.sessionPath) || !isAbsolute(meta.cwd))
      throw new Error("Session paths must be absolute");
    this.db
      .prepare(`INSERT INTO sessions(key,path,source,stamp) VALUES(?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET source=excluded.source,stamp=excluded.stamp,availability='available',error=NULL`)
      .run(
        sessionKey(meta),
        meta.sessionPath,
        JSON.stringify(meta),
        stamp === null ? null : JSON.stringify(stamp),
      );
  }
  private edit(
    key: SessionKey,
    field: "pinned" | "archived" | "label",
    value: SQLInputValue,
  ): void {
    const result = this.db.prepare(`UPDATE sessions SET ${field}=? WHERE key=?`).run(value, key);
    if (result.changes === 0) throw new Error(`Unknown session: ${key}`);
  }
  setPinned(key: SessionKey, value: boolean): void {
    this.edit(key, "pinned", Number(value));
  }
  setArchived(key: SessionKey, value: boolean): void {
    this.edit(key, "archived", Number(value));
  }
  setLabel(key: SessionKey, label: string | null): void {
    this.edit(key, "label", label?.trim() || null);
  }
  setAvailability(key: SessionKey, status: Availability, error: string | null): void {
    const result = this.db
      .prepare(`UPDATE sessions SET availability=?,error=?,
      stamp=CASE WHEN ? IN ('invalid','unreadable','missing-file') THEN NULL ELSE stamp END WHERE key=?`)
      .run(status, error, status, key);
    if (result.changes === 0) throw new Error(`Unknown session: ${key}`);
  }
  rememberPath(path: string): void {
    if (!isAbsolute(path)) throw new Error("Observed session path must be absolute");
    this.db.prepare("INSERT OR IGNORE INTO observed_paths(path) VALUES(?)").run(resolve(path));
  }
  knownPaths(): string[] {
    return this.db
      .prepare("SELECT path FROM observed_paths UNION SELECT path FROM sessions")
      .all()
      .map((row) => String(row.path));
  }
  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}
export function openStore(stateDir: string): RegistryStore {
  return new RegistryStore(stateDir);
}
