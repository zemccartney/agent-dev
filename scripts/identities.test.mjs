import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const projects = [
  { directory: "pi/pi-lence", name: "@grepco/pi-lence" },
  {
    directory: "herdr/auto-caffeinator",
    name: "@grepco/auto-caffeinator",
    pluginId: "grepco.auto-caffeinator",
  },
  { directory: "herdr/agentlog", name: "@grepco/agentlog", pluginId: "grepco.agentlog" },
];

for (const project of projects) {
  test(`${project.directory} exposes consistent install and package identities`, () => {
    const path = join(root, project.directory);
    assert.ok(existsSync(path), `Missing install directory: ${project.directory}`);
    const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    assert.equal(pkg.name, project.name);
    if (project.pluginId) {
      assert.equal(pkg.private, true, "Herdr plugins must not be published to npm");
      // Required top-level manifest fields precede the first table.
      const metadata = readFileSync(join(path, "herdr-plugin.toml"), "utf8").split(/^\[/m)[0];
      assert.equal(metadata.match(/^id\s*=\s*"([^"]+)"/m)?.[1], project.pluginId);
      assert.equal(metadata.match(/^version\s*=\s*"([^"]+)"/m)?.[1], pkg.version);
    } else {
      assert.notEqual(pkg.private, true);
      assert.ok(pkg.keywords.includes("pi-package"));
      assert.equal(pkg.pi.extensions.length, 1);
      assert.ok(existsSync(join(path, pkg.pi.extensions[0])), "Pi's declared entry must exist");
    }
  });
}

test("superseded directories cannot expose duplicate installable plugins", () => {
  for (const directory of ["herdr/caffeinate", "herdr/herder-agentlog"]) {
    assert.equal(existsSync(join(root, directory)), false, directory);
  }
});
