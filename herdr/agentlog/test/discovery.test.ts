import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import {
  mkdir,
  cp,
  writeFile,
  appendFile,
  unlink,
  rename,
  realpath,
  chmod,
  access,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { discoverSources, refreshCatalog, type DiscoveryContext } from "#agentlog/discovery";
import { openStore } from "#agentlog/store";
import { makeFixture, appendUserMessage } from "./helpers/fixtures.ts";

async function place(source: string, path: string) {
  await mkdir(dirname(path), { recursive: true });
  await cp(source, path);
  return realpath(path);
}
function context(
  home: string,
  projectCwds: string[] = [],
  livePaths: string[] = [],
): DiscoveryContext {
  return { home, projectCwds, livePaths, env: {} };
}

await test("refresh advances user recency but retains labels, archive and pins; missing files stay visible", async (t) => {
  const { root, cwd, file } = await makeFixture(t);
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const ctx = context(join(root, "home"), [cwd], [file]);
  const first = await refreshCatalog(store, ctx);
  const record = first.records[0];
  assert.ok(record);
  assert.equal(record.lastUserAt, 3000);
  store.setPinned(record.key, true);
  store.setArchived(record.key, true);
  store.setLabel(record.key, "Keep");
  await appendUserMessage(file, 5000);
  await refreshCatalog(store, ctx);
  assert.equal(store.get(record.key).lastUserAt, 5000);
  assert.equal(store.get(record.key).labelOverride, "Keep");
  assert.equal(store.get(record.key).pinned, true);
  assert.equal(store.get(record.key).archived, true);
  await unlink(file);
  await refreshCatalog(store, ctx);
  assert.equal(store.get(record.key).availability, "missing-file");
  assert.equal(store.get(record.key).lastUserAt, 5000);
});
await test("default, alternative, env, global settings and observed roots discover outside-Herdr sessions", async (t) => {
  const { root, cwd, file } = await makeFixture(t);
  const home = join(root, "home");
  const alt = join(root, "alt");
  const override = join(root, "env");
  const configured = join(root, "configured");
  const expected = await Promise.all([
    place(file, join(home, ".pi/agent/sessions/project/a.jsonl")),
    place(file, join(alt, "sessions/b.jsonl")),
    place(file, join(override, "c.jsonl")),
    place(file, join(configured, "d.jsonl")),
  ]);
  await writeFile(join(alt, "settings.json"), JSON.stringify({ sessionDir: configured }));
  const ctx = context(home, [cwd], [file]);
  ctx.env = { PI_CODING_AGENT_DIR: alt, PI_CODING_AGENT_SESSION_DIR: override };
  const found = await discoverSources(ctx, []);
  assert.deepEqual(found.files.sort(), [...expected, await realpath(file)].sort());
  assert.deepEqual(found.issues, []);
});
await test("relative settings use known project cwd and traversal never follows directory symlinks", async (t) => {
  const { root, cwd, file } = await makeFixture(t);
  const home = join(root, "home");
  const agent = join(home, ".pi/agent");
  await mkdir(agent, { recursive: true });
  await writeFile(join(agent, "settings.json"), JSON.stringify({ sessionDir: ".saved" }));
  const expected = await place(file, join(cwd, ".saved/a.jsonl"));
  const outside = join(root, "outside");
  await place(file, join(outside, "hidden.jsonl"));
  await fs.promises.symlink(outside, join(cwd, ".saved/linked"));
  const found = await discoverSources(context(home, [cwd]), []);
  assert.deepEqual(found.files, [expected]);
  const unknown = await discoverSources(context(home), []);
  assert.equal(unknown.files.length, 0);
});
await test("unchanged files skip parsing; incomplete tails and malformed files remain retryable", async (t) => {
  const { root, file } = await makeFixture(t);
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const ctx = context(join(root, "home"), [], [file]);
  let reads = 0;
  const original = fs.createReadStream;
  t.mock.method(fs, "createReadStream", (...args: Parameters<typeof fs.createReadStream>) => {
    reads++;
    return original(...args);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const first = await refreshCatalog(store, ctx);
  const key = first.records[0]?.key;
  assert.ok(key);
  assert.equal(reads, 1);
  await refreshCatalog(store, ctx);
  assert.equal(reads, 1);
  await appendFile(file, '{"type":');
  await refreshCatalog(store, ctx);
  assert.equal(reads, 2);
  assert.equal(store.get(key).stamp, null);
  await refreshCatalog(store, ctx);
  assert.equal(reads, 3);
  await appendFile(file, "broken}\n");
  await refreshCatalog(store, ctx);
  assert.equal(store.get(key).availability, "invalid");
  assert.equal(store.get(key).lastUserAt, 3000);
  await refreshCatalog(store, ctx);
  assert.equal(reads, 5);
});
await test("cached transcript access is rechecked without losing organization and recovers on refresh", async (t) => {
  const { root, file } = await makeFixture(t);
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const ctx = context(root, [], [file]);
  const first = await refreshCatalog(store, ctx);
  const row = first.records[0];
  assert.ok(row);
  store.setPinned(row.key, true);
  store.setArchived(row.key, true);
  store.setLabel(row.key, "Keep this label");
  const before = await stat(file);
  await chmod(file, 0);
  try {
    await assert.rejects(access(file, fs.constants.R_OK));
    const after = await stat(file);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
    const refreshed = await refreshCatalog(store, ctx);
    const unavailable = store.get(row.key);
    assert.equal(unavailable.availability, "unreadable");
    assert.match(unavailable.error ?? "", /EACCES|permission denied/iu);
    assert.ok(refreshed.issues.some((issue) => issue.includes(row.sessionPath)));
    assert.equal(unavailable.pinned, true);
    assert.equal(unavailable.archived, true);
    assert.equal(unavailable.labelOverride, "Keep this label");
  } finally {
    await chmod(file, before.mode & 0o777);
  }
  await refreshCatalog(store, ctx);
  const recovered = store.get(row.key);
  assert.equal(recovered.availability, "available");
  assert.equal(recovered.error, null);
  assert.equal(recovered.labelOverride, "Keep this label");
  assert.equal(recovered.archived, true);
  assert.equal(recovered.pinned, true);
});
await test("missing original directory is distinct and rechecked even when transcript is unchanged", async (t) => {
  const { root, cwd, file } = await makeFixture(t);
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const ctx = context(join(root, "home"), [], [file]);
  const first = await refreshCatalog(store, ctx);
  const key = first.records[0]?.key;
  assert.ok(key);
  await rename(cwd, cwd + "-moved");
  await refreshCatalog(store, ctx);
  assert.equal(store.get(key).availability, "missing-directory");
  await rename(cwd + "-moved", cwd);
  await refreshCatalog(store, ctx);
  assert.equal(store.get(key).availability, "available");
});
await test("user edits during a yielding scan survive its source upsert", async (t) => {
  const { root, file } = await makeFixture(t);
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const ctx = context(join(root, "home"), [], [file]);
  const first = await refreshCatalog(store, ctx);
  const key = first.records[0]?.key;
  assert.ok(key);
  await appendFile(
    file,
    (JSON.stringify({ type: "custom", text: "x".repeat(2048) }) + "\n").repeat(5000),
  );
  const original = fs.createReadStream;
  let edited = false;
  t.mock.method(fs, "createReadStream", (...args: Parameters<typeof fs.createReadStream>) => {
    const stream = original(...args);
    stream.once("data", () => {
      setImmediate(() => {
        store.setLabel(key, "Edited while reading");
        edited = true;
      });
    });
    return stream;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  await refreshCatalog(store, ctx);
  assert.equal(edited, true);
  assert.equal(store.get(key).labelOverride, "Edited while reading");
});
await test("cancellation after a committed file keeps that record and aborts the in-flight file", async (t) => {
  const { root, file } = await makeFixture(t);
  const a = await place(file, join(root, "a.jsonl"));
  const b = await place(file, join(root, "b.jsonl"));
  await appendFile(
    b,
    (JSON.stringify({ type: "custom", text: "x".repeat(2048) }) + "\n").repeat(5000),
  );
  const store = openStore(join(root, "state"));
  t.after(() => store.close());
  const controller = new AbortController();
  const original = fs.createReadStream;
  t.mock.method(fs, "createReadStream", (...args: Parameters<typeof fs.createReadStream>) => {
    const stream = original(...args);
    if (String(args[0]) === b) stream.once("data", () => setImmediate(() => controller.abort()));
    return stream;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  await assert.rejects(
    refreshCatalog(store, context(join(root, "home"), [], [a, b]), controller.signal),
    { name: "AbortError" },
  );
  assert.deepEqual(
    store.list().map((r) => r.sessionPath),
    [a],
  );
});
