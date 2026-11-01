import assert from "node:assert/strict";
import { readFile, writeFile, symlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sourceFixture } from "./test-helpers/pi-release-stage.mjs";

const commit = "a".repeat(40);
test("artifact record binds accepted source and archive bytes and tolerates later main ancestry", async (t) => {
  const { prepareStageArtifact, verifyStageArtifact } = await import("./pi-release-stage.mjs");
  const f = await sourceFixture(t);
  f.git("commit", "--allow-empty", "-m", "later main");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  f.git("checkout", "--detach", f.authorization.commit);
  const record = await prepareStageArtifact(f.cwd, f.bundle, f.authorization);
  const raw = await readFile(join(f.bundle, "release.json"));
  const digest = createHash("sha256").update(raw).digest("hex");
  const checked = await verifyStageArtifact(f.cwd, f.bundle, f.authorization, digest);
  assert.equal(record.version, "0.1.0");
  assert.equal(record.commit, f.authorization.commit);
  assert.deepEqual(checked.record, record);
  assert.equal(
    record.sha256,
    createHash("sha256")
      .update(await readFile(checked.tarballPath))
      .digest("hex"),
  );
  assert.equal(f.git("status", "--porcelain"), "");
  await assert.rejects(prepareStageArtifact(f.cwd, f.bundle, f.authorization), /exist/i);
});

test("recovery permits corrected tooling but records original accepted product commit", async (t) => {
  const { prepareStageArtifact } = await import("./pi-release-stage.mjs");
  const f = await sourceFixture(t);
  const accepted = f.authorization.releaseCommit;
  await writeFile(join(f.cwd, "workflow-fix.md"), "Reviewed infrastructure-only correction\n");
  f.git("add", ".");
  f.git("commit", "-m", "workflow correction");
  f.authorization.commit = f.git("rev-parse", "HEAD");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  const record = await prepareStageArtifact(f.cwd, f.bundle, f.authorization);
  assert.equal(record.schema, 2);
  assert.equal(record.releaseCommit, accepted);
  assert.equal(record.commit, f.authorization.commit);
  assert.equal(record.sha256, f.artifact.sha256);
});

for (const changed of [
  "pi/pi-lence/README.md",
  "pi/pi-lence/package.json",
  "LICENSE",
  "non-ancestor",
]) {
  test(`recovery rejects changed accepted package/license or ancestry: ${changed}`, async (t) => {
    const { prepareStageArtifact } = await import("./pi-release-stage.mjs");
    const f = await sourceFixture(t);
    if (changed === "non-ancestor") f.git("checkout", "--orphan", "unrelated");
    else await writeFile(join(f.cwd, changed), "changed");
    f.git("add", ".");
    f.git("commit", "-m", "not the accepted release");
    f.authorization.commit = f.git("rev-parse", "HEAD");
    f.git("update-ref", "refs/remotes/origin/main", "HEAD");
    await assert.rejects(prepareStageArtifact(f.cwd, f.bundle, f.authorization));
  });
}

for (const condition of [
  "dirty source",
  "wrong HEAD",
  "wrong main ancestry",
  "zero version",
  "private",
  "manifest symlink",
  "inside checkout",
]) {
  test(`artifact preparation refuses ${condition}`, async (t) => {
    const { prepareStageArtifact } = await import("./pi-release-stage.mjs");
    const f = await sourceFixture(t);
    const path = join(f.cwd, "pi/pi-lence/package.json");
    if (condition === "dirty source") await writeFile(join(f.cwd, "untracked"), "dirty");
    if (condition === "wrong HEAD") f.authorization.commit = commit;
    if (condition === "wrong main ancestry") f.git("update-ref", "-d", "refs/remotes/origin/main");
    if (["zero version", "private", "manifest symlink"].includes(condition)) {
      const metadata = JSON.parse(await readFile(path, "utf8"));
      if (condition === "zero version") metadata.version = "0.0.0";
      if (condition === "private") metadata.private = true;
      await writeFile(path, JSON.stringify(metadata));
      if (condition === "manifest symlink") {
        await rename(path, `${path}.real`);
        await symlink("package.json.real", path);
      }
      f.git("add", ".");
      f.git("commit", "-m", "invalid release");
      f.authorization.commit = f.git("rev-parse", "HEAD");
      f.authorization.releaseCommit = f.authorization.commit;
      f.git("update-ref", "refs/remotes/origin/main", "HEAD");
    }
    await assert.rejects(
      prepareStageArtifact(
        f.cwd,
        condition === "inside checkout" ? join(f.cwd, "out") : f.bundle,
        f.authorization,
      ),
    );
  });
}

for (const condition of [
  "archive bytes",
  "record bytes",
  "expected digest",
  "different run",
  "different attempt",
  "legacy schema",
  "record release commit",
  "extra file",
  "archive symlink",
  "directory symlink",
  "dirty after checks",
]) {
  test(`artifact verification refuses ${condition}`, async (t) => {
    const { prepareStageArtifact, verifyStageArtifact } = await import("./pi-release-stage.mjs");
    const f = await sourceFixture(t);
    const record = await prepareStageArtifact(f.cwd, f.bundle, f.authorization);
    let digest = createHash("sha256")
      .update(await readFile(join(f.bundle, "release.json")))
      .digest("hex");
    if (condition === "archive bytes") await writeFile(join(f.bundle, record.filename), "tampered");
    if (condition === "record bytes") await writeFile(join(f.bundle, "release.json"), "{}");
    if (condition === "expected digest") digest = "0".repeat(64);
    if (condition === "different run") f.authorization.runId = "456";
    if (condition === "different attempt") f.authorization.runAttempt = "2";
    if (["legacy schema", "record release commit"].includes(condition)) {
      const mutated = {
        ...record,
        ...(condition === "legacy schema" ? { schema: 1 } : { releaseCommit: "c".repeat(40) }),
      };
      const bytes = JSON.stringify(mutated);
      await writeFile(join(f.bundle, "release.json"), bytes);
      digest = createHash("sha256").update(bytes).digest("hex");
    }
    if (condition === "extra file") await writeFile(join(f.bundle, "extra"), "unwanted");
    if (condition === "archive symlink") {
      const path = join(f.bundle, record.filename);
      await rename(path, join(f.root, "outside.tgz"));
      await symlink(join(f.root, "outside.tgz"), path);
    }
    if (condition === "directory symlink") {
      await rename(f.bundle, `${f.bundle}.real`);
      await symlink(`${f.bundle}.real`, f.bundle);
    }
    if (condition === "dirty after checks") await writeFile(join(f.cwd, "untracked"), "changed");
    await assert.rejects(verifyStageArtifact(f.cwd, f.bundle, f.authorization, digest));
  });
}
