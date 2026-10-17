import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeFiles = [
  "dist/cli.js",
  "scripts/run.cjs",
  "herdr-plugin.toml",
  "THIRD_PARTY_NOTICES.txt",
  "package.json",
];
export async function prepareRuntime(destination: string): Promise<void> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  for (const file of runtimeFiles.filter((file) => file !== "package.json")) {
    await mkdir(dirname(join(destination, file)), { recursive: true });
    await cp(join(root, file), join(destination, file));
  }
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    name: string;
    version: string;
    engines: { node: string };
  };
  await writeFile(
    join(destination, "package.json"),
    JSON.stringify({
      name: metadata.name,
      version: metadata.version,
      type: "module",
      engines: metadata.engines,
    }) + "\n",
  );
}
