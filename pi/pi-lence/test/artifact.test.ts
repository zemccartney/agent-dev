import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-artifact-selection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "checked.tgz");
  const bytes = Buffer.from("externally checked archive bytes, not a source rebuild");
  await writeFile(path, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    root,
    path,
    bytes,
    sha256,
    env: { PI_LENCE_HOST_TARBALL: path, PI_LENCE_HOST_SHA256: sha256 },
  };
}

await test("host fixtures copy the supplied archive rather than rebuilding source", async (t) => {
  const { selectHostArtifact } = await import("./helpers/artifact.mjs");
  const f = await fixture(t);
  const result = await selectHostArtifact(
    join(f.root, "out"),
    f.env,
    "/missing-source-must-not-be-packed",
  );
  assert.notEqual(result.tarballPath, f.path);
  assert.equal(result.sha256, f.sha256);
  assert.deepEqual(await readFile(result.tarballPath), f.bytes);
  await writeFile(f.path, "caller changed its copy");
  assert.deepEqual(await readFile(result.tarballPath), f.bytes);
});

for (const failure of ["digest", "missing digest", "missing file", "relative", "symlink"]) {
  await test(`supplied host artifact rejects ${failure}`, async (t) => {
    const { selectHostArtifact } = await import("./helpers/artifact.mjs");
    const f = await fixture(t);
    const env: NodeJS.ProcessEnv = { ...f.env };
    if (failure === "digest") env.PI_LENCE_HOST_SHA256 = "0".repeat(64);
    if (failure === "missing digest") delete env.PI_LENCE_HOST_SHA256;
    if (failure === "missing file") delete env.PI_LENCE_HOST_TARBALL;
    if (failure === "relative") env.PI_LENCE_HOST_TARBALL = "checked.tgz";
    if (failure === "symlink") {
      env.PI_LENCE_HOST_TARBALL = join(f.root, "link.tgz");
      await symlink(f.path, env.PI_LENCE_HOST_TARBALL);
    }
    await assert.rejects(
      selectHostArtifact(join(f.root, "out"), env),
      /artifact|digest|absolute|regular/i,
    );
    assert.deepEqual(await readFile(f.path), f.bytes);
  });
}

await test("default host fixtures retain canonical packing", async (t) => {
  const { selectHostArtifact } = await import("./helpers/artifact.mjs");
  const f = await fixture(t);
  const result = await selectHostArtifact(join(f.root, "out"), {});
  const bytes = await readFile(result.tarballPath);
  assert.equal(bytes[0], 0x1f);
  assert.equal(bytes[1], 0x8b);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), result.sha256);
});

await test("host CLI accepts archive selection but rejects its digest before any host startup", async (t) => {
  const f = await fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("run-host.mjs", import.meta.url)),
      "--tarball",
      f.path,
      "--sha256",
      "0".repeat(64),
    ],
    {
      env: { PATH: process.env.PATH, HOME: f.root },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /digest/i);
  assert.doesNotMatch(result.stderr, /Unknown option/);
  assert.doesNotMatch(result.stdout, /host tests:/);
});
