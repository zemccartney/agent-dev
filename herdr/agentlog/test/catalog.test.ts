import test from "node:test";
import assert from "node:assert/strict";
import { queryCatalog, displayTitle, safeDisplay } from "#agentlog/catalog";
import type { SessionRecord } from "#agentlog/store";

function row(key: string, patch: Partial<SessionRecord> = {}): SessionRecord {
  return {
    key,
    harness: "pi",
    sessionId: "abcdef123456",
    sessionPath: "/sessions/" + key,
    cwd: "/projects/Café",
    nativeName: "Native title",
    excerpt: "First question",
    lastUserAt: null,
    pinned: false,
    archived: false,
    labelOverride: null,
    availability: "available",
    error: null,
    stamp: null,
    ...patch,
  };
}
await test("pins lead, latest user timestamp sorts within each group, nulls sort last", () => {
  const records = [
    row("z"),
    row("a"),
    row("new", { lastUserAt: 9000 }),
    row("pinned-empty", { pinned: true }),
    row("pinned-old", { pinned: true, lastUserAt: 1000 }),
    row("hidden", { pinned: true, archived: true, lastUserAt: 10000 }),
  ];
  assert.deepEqual(
    queryCatalog(records, { query: "", archived: false }).map((r) => r.key),
    ["pinned-old", "pinned-empty", "new", "a", "z"],
  );
  assert.deepEqual(
    queryCatalog(records, { query: "", archived: true }).map((r) => r.key),
    ["hidden"],
  );
  assert.equal(records[0]?.key, "z", "query must not reorder its input");
});
await test("search combines case-insensitive words across label/native name/project metadata", () => {
  const records = [
    row("a", { labelOverride: "My LABEL" }),
    row("b", { cwd: "/other", nativeName: "Other", excerpt: null }),
  ];
  assert.deepEqual(
    queryCatalog(records, { query: "label CAFÉ native", archived: false }).map((r) => r.key),
    ["a"],
  );
  assert.equal(queryCatalog(records, { query: "not-in-metadata", archived: false }).length, 0);
});
await test("title fallback and sanitization never interpret data as terminal commands", () => {
  const base = row("a");
  assert.equal(displayTitle({ ...base, labelOverride: "Override" }), "Override");
  assert.equal(displayTitle(base), "Native title");
  assert.equal(displayTitle({ ...base, nativeName: null }), "First question");
  assert.equal(displayTitle({ ...base, nativeName: null, excerpt: null }), "abcdef12");
  assert.equal(safeDisplay("\u001b[31mred\u001b[0m\nnext\u0007"), "red next");
  assert.equal(safeDisplay("👩‍💻 e\u0301"), "👩‍💻 e\u0301");
  const path = "/path/with\ncontrol";
  const record = row("x", { cwd: path });
  queryCatalog([record], { query: "", archived: false });
  assert.equal(record.cwd, path);
});
