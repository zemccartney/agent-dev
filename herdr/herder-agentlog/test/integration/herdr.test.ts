import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createHerdrSandbox, waitUntil, type RawPane } from "../helpers/herdr-sandbox.ts";

await test(
  "clean bundled popup organizes, preserves drafts, and recovers after native and Pi-first restarts",
  { skip: process.env.AGENTLOG_RUN_HERDR_TESTS !== "1", timeout: 240000 },
  async (t) => {
    const s = await createHerdrSandbox();
    let failure: unknown;
    async function popupClosed() {
      await waitUntil(
        () => s.frame(),
        (screen) => !screen.includes("Sessions —") && !screen.includes("Registry only"),
        "popup closed",
      );
    }
    async function activePi(): Promise<RawPane> {
      const rows = await waitUntil(
        s.panes,
        (panes) => panes.some((p) => p.agent === "pi" && p.agent_session?.value === s.file),
        "Pi reports expected saved conversation",
        25000,
      );
      const pane = rows.find((p) => p.agent === "pi" && p.agent_session?.value === s.file)!;
      await waitUntil(() => s.piProcess(pane.pane_id), Boolean, "real Pi foreground process");
      await waitUntil(
        () => s.screen(pane.pane_id),
        (screen) => screen.includes(s.marker),
        "original conversation marker visible",
      );
      return pane;
    }
    async function reopen() {
      await s.invoke();
      await s.waitFor("Survives crash");
      s.send("\r");
      await popupClosed();
      const pane = await activePi();
      assert.equal(pane.cwd, s.project);
      await s.waitFor(s.marker);
      return pane;
    }
    try {
      await s.start();
      assert.doesNotMatch(s.frame(), /Sessions —|Registry only/);
      const initial = (await s.panes())[0];
      s.send("DRAFT_KEEP_731");
      await s.waitFor("DRAFT_KEEP_731");
      await s.invoke();
      await s.waitFor("Recovery café");
      await waitUntil(s.record, Boolean, "catalog imported fixture");
      const recency = (JSON.parse(String(s.record()?.source)) as { lastUserAt: number | null })
        .lastUserAt;
      await s.click("[Pin ");
      await waitUntil(s.record, (row) => row?.pinned === 1, "mouse pin committed");
      s.send("\x0c");
      await s.waitFor("Registry only — does not rename the Pi session.");
      s.send("Recovered 👩‍💻");
      s.send("\r");
      await waitUntil(s.record, (row) => row?.label === "Recovered 👩‍💻", "registry label committed");
      s.send("\x18");
      await waitUntil(s.record, (row) => row?.archived === 1, "archive committed");
      s.send("\t");
      await s.waitFor("Recovered");
      s.send("\x18");
      await waitUntil(s.record, (row) => row?.archived === 0, "unarchive committed");
      s.send("\t");
      s.send("no-such-title");
      await s.waitFor("No matching");
      s.send("\x15");
      s.send("café");
      await s.waitFor("Recovered");
      s.send("\x15");
      await s.resize(80, 30);
      await s.waitFor("[Open");
      await waitUntil(
        () => s.frame(),
        (screen) => screen.replace(/[│\s]/gu, "").includes("conversation.jsonl"),
        "selected filename remains visible across wrapped lines",
      );
      for (const line of s.frame().split("\n"))
        assert.ok(visibleWidth(line) <= 80, `width ${visibleWidth(line)}: ${JSON.stringify(line)}`);
      await s.resize(140, 40);
      s.send("\x1b");
      await popupClosed();
      await s.waitFor("DRAFT_KEEP_731");
      assert.match(await s.screen(initial.pane_id), /DRAFT_KEEP_731/);
      s.send("\x15");
      await s.invoke();
      await s.waitFor("Recovered");
      s.send("\x0c");
      await s.waitFor("Registry only");
      s.send("\x15");
      s.send("Survives crash");
      s.send("\r");
      await waitUntil(
        s.record,
        (row) => row?.label === "Survives crash",
        "commit before killing UI",
      );
      await s.killPopup();
      await popupClosed();
      assert.equal(s.record()?.pinned, 1);
      assert.equal(s.record()?.label, "Survives crash");
      let pane = await reopen();
      let pid = (await s.piProcess(pane.pane_id))!.pid;
      const count = (await s.panes()).filter((p) => p.agent === "pi").length;
      await s.invoke();
      await s.waitFor("Open here");
      s.send("\r");
      await popupClosed();
      assert.equal((await s.piProcess(pane.pane_id))?.pid, pid);
      assert.equal((await s.panes()).filter((p) => p.agent === "pi").length, count);
      await waitUntil(
        s.snapshot,
        (snapshot) => snapshot.includes(s.file),
        "native reference persisted",
      );
      await s.detach();
      await s.stop();
      await s.start();
      pane = await activePi();
      assert.notEqual((await s.piProcess(pane.pane_id))?.pid, pid);
      assert.doesNotMatch(s.frame(), /Sessions —/);
      t.diagnostic("Herdr-first stop/restart restored the native conversation");
      for (const signal of ["SIGTERM", "SIGKILL"] as const) {
        pid = (await s.piProcess(pane.pane_id))!.pid;
        await s.detach();
        await s.killPi(pane.pane_id, signal);
        await waitUntil(
          s.panes,
          (panes) => !panes.find((p) => p.pane_id === pane.pane_id)?.agent_session,
          `${signal} clears native reference`,
        );
        await waitUntil(
          s.snapshot,
          (snapshot) => !snapshot.includes(s.file),
          `${signal} reference removal persisted`,
        );
        await s.stop();
        await s.start();
        assert.equal((await s.panes()).filter((p) => p.agent === "pi").length, 0);
        assert.doesNotMatch(s.frame(), /Sessions —/);
        pane = await reopen();
        assert.notEqual((await s.piProcess(pane.pane_id))?.pid, pid);
        assert.equal((await s.panes()).filter((p) => p.agent === "pi").length, 1);
        t.diagnostic(
          `${signal}-first restart lost native reference, then Agentlog recovered the same conversation`,
        );
      }
      assert.equal(
        (JSON.parse(String(s.record()?.source)) as { lastUserAt: number | null }).lastUserAt,
        recency,
      );
      assert.equal(s.record()?.pinned, 1);
      assert.equal(s.record()?.label, "Survives crash");
      assert.equal(s.record()?.archived, 0);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await s.cleanup(failure);
    }
  },
);
