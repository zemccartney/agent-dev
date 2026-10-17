import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    outDir: "dist",
    platform: "node",
    target: "node24",
    format: "esm",
    dts: false,
    minify: true,
    sourcemap: false,
    fixedExtension: false,
    deps: { alwaysBundle: [/.*/] },
    outputOptions: { codeSplitting: false },
  },
  {
    entry: ["src/*.ts"],
    root: "src",
    outDir: ".build/test",
    platform: "node",
    target: "node24",
    format: "esm",
    dts: false,
    unbundle: true,
    fixedExtension: false,
  },
]);
