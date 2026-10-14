import { defineConfig } from "tsdown";
import { isBuiltin, createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

function packageAt(id: string) {
  let root = dirname(id);
  while (!existsSync(join(root, "package.json"))) {
    const parent = dirname(root);
    if (parent === root) throw new Error(`Cannot inventory ${id}`);
    root = parent;
  }
  const pkg: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (
    !pkg ||
    typeof pkg !== "object" ||
    !("name" in pkg) ||
    !("version" in pkg) ||
    typeof pkg.name !== "string" ||
    typeof pkg.version !== "string"
  )
    throw new Error(`Invalid package metadata: ${root}`);
  return { name: pkg.name, version: pkg.version, root };
}
const common = {
  format: "esm",
  platform: "node",
  target: "node24",
  dts: false,
  fixedExtension: false,
  clean: true,
  sourcemap: false,
} as const;
export default defineConfig([
  {
    ...common,
    entry: { main: "src/main.ts" },
    outDir: "dist",
    minify: true,
    deps: { alwaysBundle: ["@earendil-works/pi-tui", "marked", "get-east-asian-width"] },
    outputOptions: { codeSplitting: false },
    plugins: [
      {
        name: "caffeinate-inventory",
        generateBundle(_options, bundle) {
          const packages = new Map<string, ReturnType<typeof packageAt>>();
          for (const output of Object.values(bundle)) {
            if (output.type !== "chunk") continue;
            for (const id of [...output.imports, ...output.dynamicImports]) {
              if (!isBuiltin(id) && id !== output.fileName)
                throw new Error(`Unexpected runtime external: ${id}`);
            }
            for (const id of Object.keys(output.modules)) {
              let source = id;
              if (id.includes("rolldown/runtime")) {
                const require = createRequire(import.meta.resolve("tsdown"));
                source = require.resolve("rolldown/package.json");
              } else if (id.startsWith("\0")) throw new Error(`Unreviewed injected module: ${id}`);
              if (!source.includes("node_modules/")) continue;
              const pkg = packageAt(source);
              packages.set(`${pkg.name}@${pkg.version}`, pkg);
            }
          }
          mkdirSync(".build", { recursive: true });
          writeFileSync(
            ".build/bundle-inventory.json",
            JSON.stringify(
              [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)),
              null,
              2,
            ) + "\n",
          );
        },
      },
    ],
  },
  { ...common, entry: ["src/*.ts"], root: "src", outDir: ".build/test", unbundle: true },
]);
