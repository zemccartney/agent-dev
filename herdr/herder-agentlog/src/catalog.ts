import { stripVTControlCharacters } from "node:util";
import type { SessionRecord } from "./store.js";

export function safeDisplay(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
export function displayTitle(record: SessionRecord): string {
  return safeDisplay(
    record.labelOverride || record.nativeName || record.excerpt || record.sessionId.slice(0, 8),
  );
}
export function queryCatalog(
  records: SessionRecord[],
  filter: { query: string; archived: boolean },
): SessionRecord[] {
  const terms = safeDisplay(filter.query).toLowerCase().split(/\s+/u).filter(Boolean);
  return records
    .filter((row) => {
      const haystack = safeDisplay(
        [row.labelOverride, row.nativeName, row.excerpt, row.cwd].filter(Boolean).join(" "),
      ).toLowerCase();
      return row.archived === filter.archived && terms.every((term) => haystack.includes(term));
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (b.lastUserAt ?? -Infinity) - (a.lastUserAt ?? -Infinity) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
}
