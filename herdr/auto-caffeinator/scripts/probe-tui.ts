import assert from "node:assert/strict";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withHerdrSandbox } from "../test/helpers/herdr-sandbox.ts";
import { startPty } from "../test/helpers/pty.ts";

function assertNoAgents(text: string) {
  const response: unknown = JSON.parse(text);
  assert.ok(response && typeof response === "object" && "result" in response);
  const result = response.result;
  assert.ok(result && typeof result === "object" && "agents" in result);
  assert.deepEqual(result.agents, []);
}

await withHerdrSandbox(async (sandbox) => {
  const id = "grepco.auto-caffeinator-spike";
  const payload = join(sandbox.root, "payload");
  await mkdir(payload);
  await cp(new URL("../.build/tui-spike/spike.js", import.meta.url), join(payload, "spike.js"));
  await writeFile(join(payload, "package.json"), '{"type":"module"}\n');
  await writeFile(
    join(payload, "herdr-plugin.toml"),
    [
      `id = "${id}"`,
      'name = "Caffeinate toolkit probe"',
      'version = "0.0.0"',
      'min_herdr_version = "0.9.3"',
      'platforms = ["macos"]',
      "[[actions]]",
      'id = "controls"',
      'title = "Toolkit probe"',
      'contexts = ["global"]',
      `command = ${JSON.stringify([sandbox.binPath, "plugin", "pane", "open", "--plugin", id, "--entrypoint", "controls", "--focus"])}`,
      "[[panes]]",
      'id = "controls"',
      'title = "Toolkit probe"',
      'placement = "popup"',
      'width = "80%"',
      "height = 22",
      `command = ${JSON.stringify([process.execPath, "spike.js"])}`,
      "",
    ].join("\n"),
  );
  assertNoAgents(await sandbox.cli(["agent", "list"]));
  await sandbox.cli(["plugin", "link", payload, "--enabled"]);
  const client = startPty(
    sandbox.binPath,
    ["--session", sandbox.serverName],
    sandbox.env,
    sandbox.root,
  );
  try {
    await client.waitFor("CF_SANDBOX>");
    await sandbox.cli(["plugin", "action", "invoke", `${id}.controls`]);
    await client.waitFor("Hours: 2");
    await client.waitFor("東京");
    const rows = client.frame().split("\n");
    const selectedRow = rows.findIndex((line) => line.includes("→ Pi"));
    assert.equal(client.foregroundAt(rows[selectedRow].indexOf("→"), selectedRow), 0xfabd2f);
    client.send("\x151.25\r");
    await client.waitFor("Applied: 1.25");
    assert.match(client.frame(), /Applied: 1\.25\s/);
    client.click("Settings (s)");
    await client.waitFor("Default: 8");
    client.send("\x154.5");
    await client.waitFor("Default: 4.5");
    assert.match(client.frame(), /Default: 4\.5\s/);
    client.click("Agents (a)");
    await client.waitFor("Hours: 1.25");
    client.click("Agent 2");
    await client.waitFor("Selected: agent-2");
    client.send("r");
    await client.waitFor("Order: reversed");
    assert.match(client.frame(), /Selected: agent-2/);
    const tabGap = (text: string) => {
      const line = text.split("\n").find((row) => row.includes("Settings (s)")) ?? "";
      return line.indexOf("Settings (s)") - line.indexOf("Agents (a)");
    };
    const gap = tabGap(client.frame());
    await client.resize(120, 40);
    await client.waitUntil(
      (text) =>
        text.includes("Caffeinate toolkit spike") &&
        text.includes("Settings (s)") &&
        tabGap(text) > gap,
      "reflow the popup components after resize",
    );
    client.click("Settings (s)");
    await client.waitFor("Default: 4.5");
    client.send("\x1b");
    await client.waitWithout("Caffeinate toolkit spike");
    await client.waitFor("CF_SANDBOX>");
    assertNoAgents(await sandbox.cli(["agent", "list"]));
  } finally {
    await client.close();
    await sandbox.cli(["plugin", "unlink", id]);
  }
});
console.log(
  "PASS: isolated Herdr popup edits, tabs, mouse, Unicode, RGB theme, resize, Escape; zero agents; server/registration cleanup and normal config/socket unchanged.",
);
