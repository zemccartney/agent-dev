import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { packCandidate } from "../scripts/pack.mjs";
import { createHostSandbox } from "./helpers/host-sandbox.mjs";

/** @param {import('node:test').TestContext} t */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-lence-tui-artifact-"));
  const { tarballPath } = await packCandidate(fileURLToPath(new URL("../", import.meta.url)), root);
  const host = await createHostSandbox(tarballPath, { nodePath: process.env.PI_LENCE_HOST_NODE });
  t.after(async () => {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return host;
}

await test(
  "PTY preserves literal arguments, accepts input, resizes and reaps failed children",
  { timeout: 30_000 },
  async (t) => {
    const host = await fixture(t);
    const { startTerminal } = await import("./helpers/terminal.mjs");
    const literal = "literal ; $(touch escaped) ' argument";
    const terminal = await startTerminal(
      host,
      host.nodePath,
      [
        "-e",
        "console.log(process.argv[1]); process.stdin.setRawMode(true); process.stdin.on('data', data => {console.log('INPUT:' + data); if (data.includes(4)) process.exit(0);});",
        literal,
      ],
      { columns: 100, rows: 30 },
    );
    await terminal.waitFor(literal);
    terminal.send("hello");
    await terminal.waitFor("INPUT:hello");
    await terminal.resize(72, 24);
    assert.equal((await terminal.screen()).length, 24);
    terminal.send("\x04");
    await terminal.close();
    await assert.rejects(readFile(join(host.cwd, "escaped")), { code: "ENOENT" });
    const bad = await startTerminal(host, join(host.root, "missing-command"), [], {
      columns: 80,
      rows: 24,
    });
    await assert.rejects(bad.waitFor("impossible", 1500), /exited|not found|No such file/);
    await bad.close();
  },
);

/** @type {Array<"regular" | "fullscreen">} */
const modes = ["regular", "fullscreen"];
const browse = "\x1b[114;7u";
const pin = "\x1b[112;7u";
const toggleQuiet = "\x1b[113;7u";

await test(
  "regular: older-response pin/unpin and Back work without a mouse",
  { timeout: 30_000 },
  async (t) => {
    const host = await fixture(t);
    const { startTui } = await import("./helpers/terminal.mjs");
    const ui = await startTui(host, { mode: "regular", columns: 110, rows: 40 });
    await ui.waitFor("View: Quiet");
    ui.send("Earlier answer\r");
    await ui.waitFor("Fixture answer: Earlier answer");
    ui.send("Later answer\r");
    await ui.waitFor("Fixture answer: Later answer");
    ui.send(browse);
    await ui.waitFor("No pins yet");
    ui.send("\t");
    await ui.waitFor("Tab switches");
    ui.send("\x1b[B\r");
    await ui.waitFor("Read-only");
    await ui.waitFor("Fixture answer: Earlier answer");
    ui.send("p");
    await ui.waitFor("Name this pin", 2000);
    ui.send("Older pin\r");
    await ui.waitFor("Read-only");
    await ui.waitFor("Older pin");
    ui.send("b");
    await ui.waitFor("Tab switches");
    ui.send("\t");
    await ui.waitFor("Older pin");
    ui.send("\r");
    await ui.waitFor("Read-only");
    ui.send("p");
    await ui.waitWithout("Older pin");
    ui.send("b");
    await ui.waitFor("No pins yet");
    ui.send("\x1b");
    await ui.waitWithout("Tab switches");
    ui.send("/fixture-quit\r");
    await ui.close();
  },
);

/** @param {Awaited<ReturnType<typeof createHostSandbox>>} host @param {string} reason @param {number} [count] */
async function transition(host, reason, count = 1) {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const events = (await readFile(join(host.root, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    if (events.filter((event) => event.type === "start" && event.reason === reason).length >= count)
      return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Missing real host transition: ${reason}`);
}

for (const mode of modes) {
  await test(
    `${mode}: quiet/raw, keyboard browser, pins and real session replacements`,
    { timeout: 90_000 },
    async (t) => {
      const host = await fixture(t);
      const { startTui } = await import("./helpers/terminal.mjs");
      const ui = await startTui(host, { mode, columns: 110, rows: 40 });
      await ui.waitFor("View: Quiet");
      ui.send("fixture-read\r");
      await ui.waitFor("Fixture answer: fixture-read");
      assert.doesNotMatch((await ui.screen()).join("\n"), /Fixture file contents/);
      ui.send(toggleQuiet);
      await ui.waitFor("View: Raw");
      ui.send("\x0f"); // Native Ctrl+O expands the read result, even in Raw.
      await ui.waitFor("Fixture file contents");
      ui.send(toggleQuiet);
      await ui.waitFor("View: Quiet");
      ui.send(pin);
      await ui.waitFor("Name this pin");
      ui.send("Release notes\r");
      await ui.waitWithout("Name this pin");
      await ui.waitFor("Unpin latest");
      ui.send(browse);
      await ui.waitFor("Release notes");
      ui.send("\r");
      await ui.waitFor("Read-only");
      await ui.waitFor("Fixture answer: fixture-read");
      ui.send("\x1b");
      await ui.waitWithout("Read-only");
      ui.send("Branch tail\r");
      await ui.waitFor("Fixture answer: Branch tail");
      ui.send("/fixture-fork\r");
      await transition(host, "fork");
      ui.send("\x15");
      ui.send(browse);
      await ui.waitFor("Release notes");
      ui.send("\t");
      await ui.waitFor("Fixture answer: fixture-read");
      assert.doesNotMatch((await ui.screen()).join("\n"), /Fixture answer: Branch tail/);
      ui.send("\x1b");
      await ui.waitWithout("Tab switches");
      ui.send("/fixture-new\r");
      await transition(host, "new");
      ui.send(browse);
      await ui.waitFor("No pins yet");
      ui.send("\t");
      await ui.waitFor("No assistant responses yet");
      ui.send("\x1b");
      await ui.waitWithout("Tab switches");
      ui.send("/fixture-resume\r");
      await transition(host, "resume");
      ui.send(browse);
      await ui.waitFor("Release notes");
      ui.send("\x1b");
      await ui.waitWithout("Tab switches");
      for (let repeat = 0; repeat < 2; repeat++) {
        ui.send("/reload\r");
        await transition(host, "reload", repeat + 1);
        await ui.waitFor("Reloaded");
        ui.send(browse);
        await ui.waitFor("Release notes");
        ui.send("\x1b");
        await ui.waitWithout("Tab switches");
      }
      assert.equal((await ui.screen()).join("\n").split("View: Quiet").length - 1, 1);
      ui.send("/fixture-dialog\r");
      await ui.waitFor("Fixture confirmation");
      ui.send("\x1b");
      await ui.waitWithout("Fixture confirmation");
      ui.send("Unsent draft");
      await ui.waitFor("Unsent draft");
      ui.send(browse);
      await ui.waitFor("Release notes");
      ui.send("\x1b");
      await ui.waitWithout("Tab switches");
      await ui.waitFor("Unsent draft");
      ui.send("\x15");
      ui.send("Wide 界 and é\r");
      await ui.waitFor("Fixture answer: Wide 界 and é");
      await ui.resize(64, 30);
      ui.send(browse);
      await ui.waitFor("Release notes");
      ui.send("\t");
      await ui.waitFor("Wide 界 and é");
      ui.send("\r");
      await ui.waitFor("Read-only");
      ui.send("\x1b");
      await ui.waitWithout("Read-only");
      if (mode === "fullscreen") {
        await ui.click("Responses");
        await ui.waitFor("Release notes");
        await ui.click("Close");
        await ui.waitWithout("Tab switches");
      }
      ui.send("fixture-error\r");
      await ui.waitFor("Fixture answer: fixture-error");
      await ui.waitFor("ENOENT");
      ui.send("After replacement\r");
      await ui.waitFor("Fixture answer: After replacement");
      ui.send("/fixture-quit\r");
      await ui.close();
      const events = await readFile(join(host.root, "events.jsonl"), "utf8");
      assert.match(events, /"reason":"reload"/);
      assert.match(events, /"type":"shutdown"/);
    },
  );
}

for (const mode of modes) {
  await test(
    `${mode}: real elapsed warning clears after ${mode === "regular" ? "completion" : "cancellation"}`,
    { timeout: 85_000 },
    async (t) => {
      const host = await fixture(t);
      const { startTui } = await import("./helpers/terminal.mjs");
      const ui = await startTui(host, { mode, columns: 110, rows: 40 });
      await ui.waitFor("View: Quiet");
      ui.send("/fixture-warning\r");
      await ui.waitFor("Warning color probe", 2500);
      const warningColor = await ui.foregroundOf("Warning color probe");
      const started = Date.now();
      ui.send("fixture-slow\r");
      await ui.waitFor("Working", 2500);
      assert.doesNotMatch((await ui.screen()).join("\n"), /no updates for/);
      await ui.waitFor("Working · no updates for", 70_000);
      assert.ok(
        Date.now() - started >= 60_000,
        "warning must not appear before sixty real seconds",
      );
      assert.deepEqual(await ui.foregroundOf("Working · no updates for"), warningColor);
      if (mode === "fullscreen") ui.send("\x1b");
      else await ui.waitFor("Fixture answer: fixture-slow", 10_000);
      await ui.waitWithout("no updates for");
      ui.send("After warning\r");
      await ui.waitFor("Fixture answer: After warning");
      ui.send("/fixture-quit\r");
      await ui.close();
    },
  );
}
