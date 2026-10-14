import test from "node:test";
import assert from "node:assert/strict";
import { readFile, appendFile, writeFile, chmod, symlink } from "node:fs/promises";
import { join } from "node:path";
import { readPiSession } from "#agentlog/pi-session";
import { makeFixture } from "./helpers/fixtures.ts";

await test("reads latest user timestamp and native name without rewriting transcript", async (t) => {
  const { file, cwd } = await makeFixture(t);
  const before = await readFile(file, "utf8");
  const r = await readPiSession(file);
  assert.ok(r.ok);
  assert.equal(r.meta.cwd, cwd);
  assert.equal(r.meta.nativeName, "Current");
  assert.equal(r.meta.lastUserAt, 3000);
  assert.equal(r.meta.excerpt, "First prompt");
  assert.equal(r.cacheable, true);
  assert.equal(await readFile(file, "utf8"), before);
});
await test("branches use maximum submitted timestamp, not file order or assistant output", async (t) => {
  const { file } = await makeFixture(t, { userTimes: [5000, 1000], assistantTime: 9999 });
  const r = await readPiSession(file);
  assert.ok(r.ok);
  assert.equal(r.meta.lastUserAt, 5000);
});
await test("string content, text blocks and Unicode excerpts have bounded metadata", async (t) => {
  for (const userContent of [
    "🙂".repeat(121),
    [{ type: "image" }, { type: "text", text: "🙂".repeat(121) }],
  ]) {
    const { file } = await makeFixture(t, { userContent });
    const r = await readPiSession(file);
    assert.ok(r.ok);
    assert.equal(r.meta.excerpt, "🙂".repeat(120));
  }
});
await test("sessions without user submissions retain null recency and excerpt", async (t) => {
  const { file } = await makeFixture(t, { userTimes: [], nativeNames: [] });
  const r = await readPiSession(file);
  assert.ok(r.ok);
  assert.equal(r.meta.lastUserAt, null);
  assert.equal(r.meta.excerpt, null);
  assert.equal(r.meta.nativeName, null);
});
await test("incomplete final write preserves earlier messages but is never cached", async (t) => {
  const { file } = await makeFixture(t);
  await appendFile(file, '{"type":"message"');
  const r = await readPiSession(file);
  assert.ok(r.ok);
  assert.equal(r.meta.lastUserAt, 3000);
  assert.equal(r.cacheable, false);
});
await test("malformed complete lines are errors, not silently skipped", async (t) => {
  const { file } = await makeFixture(t);
  await appendFile(file, "{broken}\n");
  const r = await readPiSession(file);
  assert.ok(!r.ok);
  assert.equal(r.code, "invalid");
});
await test("invalid headers do not fabricate identity or a replacement cwd", async (t) => {
  for (const header of [{ type: "session", id: "x", cwd: "relative" }, { type: "message" }]) {
    const { file } = await makeFixture(t);
    await writeFile(file, JSON.stringify(header) + "\n");
    const r = await readPiSession(file);
    assert.ok(!r.ok);
    assert.equal(r.code, "invalid");
  }
});
await test("missing and unreadable files have explicit availability errors", async (t) => {
  const { root, file } = await makeFixture(t);
  const missing = await readPiSession(join(root, "missing.jsonl"));
  assert.ok(!missing.ok);
  assert.equal(missing.code, "missing-file");
  await chmod(file, 0);
  const unreadable = await readPiSession(file);
  assert.ok(!unreadable.ok);
  assert.equal(unreadable.code, "unreadable");
  await chmod(file, 0o600);
});
await test("canonical session identity resolves symlinks without altering original cwd", async (t) => {
  const { root, file, cwd } = await makeFixture(t);
  const link = join(root, "link.jsonl");
  await symlink(file, link);
  const a = await readPiSession(file);
  const b = await readPiSession(link);
  assert.ok(a.ok && b.ok);
  assert.equal(a.meta.sessionPath, b.meta.sessionPath);
  assert.equal(b.meta.cwd, cwd);
});
await test("aborted reads reject rather than returning a malformed-file result", async (t) => {
  const { file } = await makeFixture(t);
  await assert.rejects(readPiSession(file, AbortSignal.abort()), { name: "AbortError" });
});
