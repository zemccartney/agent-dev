import assert from "node:assert/strict";
import { constants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const packScript = join(packageRoot, "scripts/pack.mjs");
const payload = [
  "LICENSE",
  "README.md",
  "package.json",
  "src/quiet-mode.ts",
  "src/quiet-renderers.ts",
  "src/quiet-state.ts",
  "src/reference-browser.ts",
  "src/reference-state.ts",
  "src/reference-ui.ts",
  "src/reference-widgets.ts",
].sort();

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-lence-pack-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const producer = join(root, "producer checkout/pi/pi-lence");
  await mkdir(producer, { recursive: true });
  for (const path of ["src", "README.md", "package.json"]) {
    await cp(join(packageRoot, path), join(producer, path), { recursive: true });
  }
  const manifest = JSON.parse(await readFile(join(producer, "package.json"), "utf8"));
  manifest.version = "0.1.0"; // A fixed fixture version, independent of future release bumps.
  await writeFile(join(producer, "package.json"), JSON.stringify(manifest));
  const license = resolve(producer, "../../LICENSE");
  await cp(resolve(packageRoot, "../../LICENSE"), license);
  return { root, producer, license, output: join(root, "candidate output") };
}

async function pack(producer: string, output: string) {
  assert.ok(
    await access(packScript, constants.R_OK).then(
      () => true,
      () => false,
    ),
    "canonical tarball producer must exist",
  );
  const { packCandidate } = await import("../scripts/pack.mjs");
  return packCandidate(producer, output);
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const [path, hash] of Object.entries(await snapshot(join(root, entry.name)))) {
        result[`${entry.name}/${path}`] = hash;
      }
    } else {
      result[entry.name] = createHash("sha256")
        .update(await readFile(join(root, entry.name)))
        .digest("hex");
    }
  }
  return result;
}

await test("packs only the consumer contract without modifying or executing producer inputs", async (t) => {
  const f = await fixture(t);
  const manifest = JSON.parse(await readFile(join(f.producer, "package.json"), "utf8"));
  manifest.scripts.prepack = "node -e 'process.exit(99)'";
  await writeFile(join(f.producer, "package.json"), JSON.stringify(manifest));
  await writeFile(join(f.producer, "secret.env"), "must not ship");
  const before = await snapshot(dirname(dirname(f.producer)));
  const candidate = await pack(f.producer, f.output);
  assert.equal(dirname(candidate.tarballPath), f.output);
  const archive = await readFile(candidate.tarballPath);
  assert.equal(candidate.sha256, createHash("sha256").update(archive).digest("hex"));
  const paths = execFileSync("tar", ["-tzf", candidate.tarballPath], { encoding: "utf8" })
    .trim()
    .split("\n")
    .sort();
  assert.deepEqual(
    paths,
    payload.map((path) => `package/${path}`),
  );
  const consumer = JSON.parse(
    execFileSync("tar", ["-xOf", candidate.tarballPath, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  assert.deepEqual(consumer, {
    name: "@grepco/pi-lence",
    version: "0.1.0",
    description: manifest.description,
    keywords: ["pi-package"],
    license: "MIT",
    repository: manifest.repository,
    type: "module",
    engines: { node: ">=22.19.0" },
    peerDependencies: { "@earendil-works/pi-coding-agent": "*", "@earendil-works/pi-tui": "*" },
    pi: { extensions: ["./src/reference-ui.ts"] },
    files: payload.filter((path) => path !== "package.json"),
  });
  assert.deepEqual(
    execFileSync("tar", ["-xOf", candidate.tarballPath, "package/LICENSE"]),
    await readFile(f.license),
  );
  assert.deepEqual(await snapshot(dirname(dirname(f.producer))), before);
  assert.deepEqual(await readdir(f.output), ["grepco-pi-lence-0.1.0.tgz"]);
});

await test("identical inputs produce identical tarballs regardless of output path", async (t) => {
  const f = await fixture(t);
  const first = await pack(f.producer, f.output);
  const second = await pack(f.producer, join(f.root, "another output"));
  assert.equal(first.sha256, second.sha256);
});

for (const kind of [
  "license",
  "entry",
  "extra source",
  "escaping source symlink",
  "source directory symlink",
] as const) {
  await test(`rejects ${kind} before producing an artifact`, async (t) => {
    const f = await fixture(t);
    if (kind === "license") await rm(f.license);
    if (kind === "entry") await rm(join(f.producer, "src/reference-ui.ts"));
    if (kind === "extra source")
      await writeFile(join(f.producer, "src/forgotten.ts"), "export {};");
    if (kind === "escaping source symlink") {
      await rm(join(f.producer, "src/reference-ui.ts"));
      await symlink(f.license, join(f.producer, "src/reference-ui.ts"));
    }
    if (kind === "source directory symlink") {
      await cp(join(f.producer, "src"), join(f.root, "outside"), { recursive: true });
      await rm(join(f.producer, "src"), { recursive: true });
      await symlink(join(f.root, "outside"), join(f.producer, "src"));
    }
    await assert.rejects(
      () => pack(f.producer, f.output),
      /LICENSE|source|reference-ui|symlink|inventory/i,
    );
    assert.deepEqual(await readdir(f.output).catch(() => []), []);
  });
}

await test("refuses to overwrite an existing candidate", async (t) => {
  const f = await fixture(t);
  await mkdir(f.output);
  const target = join(f.output, "grepco-pi-lence-0.1.0.tgz");
  await writeFile(target, "previous approved bytes");
  await assert.rejects(() => pack(f.producer, f.output), { code: "EEXIST" });
  assert.equal(await readFile(target, "utf8"), "previous approved bytes");
});

await test("candidate CLI accepts a literal output path and prints artifact identity", async (t) => {
  const f = await fixture(t);
  const output = join(f.root, "literal ; $ output");
  const child = spawnSync(process.execPath, [packScript, output], {
    cwd: f.root,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const candidate = JSON.parse(child.stdout);
  assert.equal(dirname(candidate.tarballPath), output);
  assert.equal(
    candidate.sha256,
    createHash("sha256")
      .update(await readFile(candidate.tarballPath))
      .digest("hex"),
  );
});
