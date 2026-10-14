import { readFile, writeFile, mkdir, mkdtemp, rm, rename, realpath } from "node:fs/promises";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid inventory/policy object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Missing inventory/policy text");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid inventory/policy list");
  return value;
}
async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function prepareRuntime(packageRoot: string, outputDir: string): Promise<void> {
  const root = await realpath(packageRoot),
    output = resolve(outputDir);
  if (
    root === output ||
    root.startsWith(output + "/") ||
    (output.startsWith(root + "/") && !output.startsWith(join(root, ".build") + "/"))
  )
    throw new Error("Unsafe runtime output directory");
  const license = await readFile(join(root, "../../LICENSE"));
  if (!license.toString().trim()) throw new Error("Empty canonical LICENSE");
  const inventory = list(await json(join(root, ".build/bundle-inventory.json"))).map(record);
  const policy = list(await json(join(root, "scripts/license-policy.json"))).map(record);
  const sections: string[] = [];
  const seen = new Set<string>();
  for (const item of inventory) {
    const name = text(item.name),
      version = text(item.version),
      key = `${name}@${version}`;
    if (seen.has(key)) throw new Error(`Duplicate inventory package: ${key}`);
    seen.add(key);
    const matches = policy.filter((entry) => entry.name === name && entry.version === version);
    if (matches.length !== 1) throw new Error(`Missing unique reviewed license policy: ${key}`);
    const entry = matches[0];
    const source = text(entry.source);
    const library = await realpath(text(item.root));
    if (!library.startsWith(join(root, "node_modules") + "/"))
      throw new Error(`Inventory root outside dependencies: ${key}`);
    const metadata = record(await json(join(library, "package.json")));
    if (metadata.name !== name || metadata.version !== version)
      throw new Error(`Inventory version mismatch: ${key}`);
    const licenses = list(entry.licenseFiles).map(text),
      notices = list(entry.noticeFiles).map(text);
    if (!licenses.length) throw new Error(`No required license text for ${key}`);
    const contents: string[] = [];
    for (const file of [...licenses, ...notices]) {
      const vendored = file.startsWith("vendor:");
      const relative = vendored ? file.slice(7) : file;
      const base = vendored ? await realpath(join(root, "scripts/licenses")) : library;
      if (isAbsolute(relative) || relative.split(/[\\/]/).includes(".."))
        throw new Error(`Unsafe license path: ${file}`);
      const location = await realpath(join(base, relative));
      if (!location.startsWith(base + "/")) throw new Error(`License escaped package: ${file}`);
      const content = await readFile(location, "utf8");
      if (!content.trim()) throw new Error(`Empty required license/notice: ${file}`);
      contents.push(`${file}\n${content}`);
    }
    sections.push(`${key}\nSource: ${source}\n\n${contents.join("\n\n")}`);
  }
  const pkg = record(await json(join(root, "package.json")));
  const manifest = await readFile(join(root, "herdr-plugin.toml"));
  if (/\b(?:pnpm|npm|tsdown)\b|src\/main\.mjs/.test(manifest.toString()))
    throw new Error("Runtime manifest contains developer build hooks");
  const files = new Map<string, Buffer>([
    ["LICENSE", license],
    [
      "THIRD_PARTY_NOTICES.txt",
      Buffer.from(sections.join("\n\n----------------------------------------\n\n") + "\n"),
    ],
    ["herdr-plugin.toml", manifest],
    [
      "package.json",
      Buffer.from(
        JSON.stringify(
          {
            name: text(pkg.name),
            version: text(pkg.version),
            type: "module",
            license: "MIT",
            engines: { node: "^24.0.0" },
          },
          null,
          2,
        ) + "\n",
      ),
    ],
  ]);
  for (const name of ["dist/main.js", "scripts/launch.sh", "scripts/preflight.cjs"])
    files.set(name, await readFile(join(root, name)));
  await mkdir(dirname(output), { recursive: true });
  const stage = await mkdtemp(output + ".tmp-");
  try {
    for (const [name, content] of files) {
      await mkdir(dirname(join(stage, name)), { recursive: true });
      await writeFile(join(stage, name), content, { mode: name.endsWith(".sh") ? 0o755 : 0o644 });
    }
    await rm(output, { recursive: true, force: true });
    await rename(stage, output);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  const raw = [...files.values()].reduce((sum, value) => sum + value.length, 0);
  const compressed = [...files.values()].reduce((sum, value) => sum + gzipSync(value).length, 0);
  console.log(
    `Runtime payload: ${raw} raw bytes; ${compressed} summed per-file gzip bytes (not an archive size).`,
  );
}
if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  await prepareRuntime(root, join(root, ".build/runtime"));
}
