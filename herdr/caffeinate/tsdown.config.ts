import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/*.ts"],
  root: "src",
  outDir: "dist",
  unbundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  dts: false,
  fixedExtension: false,
  clean: true,
  sourcemap: false,
});
