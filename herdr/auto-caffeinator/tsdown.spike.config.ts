import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { spike: "test/fixtures/tui-spike.ts" },
  outDir: ".build/tui-spike",
  format: "esm",
  platform: "node",
  target: "node24",
  fixedExtension: false,
  dts: false,
  minify: true,
  sourcemap: false,
  clean: true,
  outputOptions: { codeSplitting: false },
  deps: {
    alwaysBundle: ["@earendil-works/pi-tui", "marked", "get-east-asian-width"],
  },
});
