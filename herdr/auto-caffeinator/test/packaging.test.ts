import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRuntime } from "../scripts/prepare-runtime.ts";
const root = fileURLToPath(new URL("../", import.meta.url));

void test("prepared payload is allowlisted and copies the canonical license", async () => {
  const payload = join(root, ".build/runtime");
  assert.deepEqual((await readdir(payload)).sort(), [
    "LICENSE",
    "THIRD_PARTY_NOTICES.txt",
    "dist",
    "herdr-plugin.toml",
    "package.json",
    "scripts",
  ]);
  assert.equal(
    await readFile(join(payload, "LICENSE"), "utf8"),
    await readFile(join(root, "../../LICENSE"), "utf8"),
  );
  const notices = await readFile(join(payload, "THIRD_PARTY_NOTICES.txt"), "utf8");
  const bundlerRoot = join(root, "node_modules/.pnpm/rolldown@1.2.12/node_modules/rolldown");
  for (const file of ["LICENSE", "THIRD-PARTY-LICENSE"]) {
    assert.ok(
      notices.includes(await readFile(join(bundlerRoot, file), "utf8")),
      `Missing complete bundler ${file}`,
    );
  }
  for (const file of [
    "scripts/licenses/pi-tui-1.0.4/LICENSE",
    "scripts/licenses/pi-tui-1.0.4/OpenTUI-LICENSE",
    "scripts/licenses/pi-tui-1.0.4/NOTICE",
    "node_modules/.pnpm/marked@18.0.11/node_modules/marked/LICENSE",
    "node_modules/.pnpm/get-east-asian-width@1.6.0/node_modules/get-east-asian-width/license",
  ]) {
    assert.ok(
      notices.includes(await readFile(join(root, file), "utf8")),
      `Missing complete upstream text: ${file}`,
    );
  }
  const pkg: unknown = JSON.parse(await readFile(join(payload, "package.json"), "utf8"));
  assert.deepEqual(pkg, {
    name: "@grepco/auto-caffeinator",
    version: "0.1.0",
    type: "module",
    license: "MIT",
    engines: { node: "^24.11.0" },
  });
});
void test("packaging fails closed for missing canonical license and unreviewed or missing upstream text", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cf-pack-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = join(dir, "herdr/auto-caffeinator");
  await mkdir(join(fixture, ".build"), { recursive: true });
  await cp(join(root, "scripts"), join(fixture, "scripts"), { recursive: true });
  await cp(join(root, "dist"), join(fixture, "dist"), { recursive: true });
  for (const name of ["package.json", "herdr-plugin.toml"])
    await cp(join(root, name), join(fixture, name));
  await writeFile(join(fixture, ".build/bundle-inventory.json"), "[]");
  await assert.rejects(prepareRuntime(fixture, join(dir, "payload")), /LICENSE/);
  await cp(join(root, "../../LICENSE"), join(dir, "LICENSE"));
  const library = join(fixture, "node_modules/example");
  await mkdir(library, { recursive: true });
  await writeFile(
    join(library, "package.json"),
    JSON.stringify({ name: "example", version: "1.0.0" }),
  );
  await writeFile(
    join(fixture, ".build/bundle-inventory.json"),
    JSON.stringify([{ name: "example", version: "1.0.0", root: library }]),
  );
  await assert.rejects(prepareRuntime(fixture, join(dir, "payload")), /reviewed|policy/i);
  await writeFile(
    join(fixture, "scripts/license-policy.json"),
    JSON.stringify([
      {
        name: "example",
        version: "1.0.0",
        source: "https://example.invalid/source",
        licenseFiles: ["LICENSE"],
        noticeFiles: [],
      },
    ]),
  );
  await assert.rejects(prepareRuntime(fixture, join(dir, "payload")), /LICENSE/);
  for (const [file, expected] of [
    ["vendor:missing/LICENSE", /LICENSE/],
    ["vendor:../../LICENSE", /Unsafe license path/],
  ] as const) {
    await writeFile(
      join(fixture, "scripts/license-policy.json"),
      JSON.stringify([
        {
          name: "example",
          version: "1.0.0",
          source: "https://example.invalid/source",
          licenseFiles: [file],
          noticeFiles: [],
        },
      ]),
    );
    await assert.rejects(prepareRuntime(fixture, join(dir, "payload")), expected);
  }
});
