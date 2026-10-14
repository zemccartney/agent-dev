import test from "node:test";
import assert from "node:assert/strict";
import { labelsFromSnapshot, themeFromConfig } from "#caffeinate/popup-data";

void test("picker labels join Herdr workspace/tab/agent names, including duplicate panes", () => {
  const snapshot = {
    workspaces: [{ workspace_id: "w7", label: "pi-ext" }],
    tabs: [{ tab_id: "w7:tA", label: "caff-test" }],
    panes: [
      { pane_id: "w7:pA", label: "reviewer" },
      { pane_id: "w7:pB", label: "builder" },
    ],
    agents: [{ pane_id: "w7:pA", workspace_id: "w7", tab_id: "w7:tA", agent: "pi" }],
  };
  assert.equal(labelsFromSnapshot(snapshot)["w7:pA"], "pi-ext — caff-test (pi)");
  snapshot.agents.push({ ...snapshot.agents[0], pane_id: "w7:pB" });
  assert.equal(labelsFromSnapshot(snapshot)["w7:pA"], "pi-ext — caff-test / reviewer (pi)");
  assert.equal(labelsFromSnapshot(snapshot)["w7:pB"], "pi-ext — caff-test / builder (pi)");
  snapshot.tabs[0].label = "renamed";
  assert.match(labelsFromSnapshot(snapshot)["w7:pA"], /renamed/);
});
void test("unlabelled workspaces use project name and tab number instead of machine IDs", () => {
  const labels = labelsFromSnapshot({
    workspaces: [{ workspace_id: "w1", cwd: "/projects/hello" }],
    tabs: [{ tab_id: "t1", number: 2 }],
    agents: [{ pane_id: "p1", workspace_id: "w1", tab_id: "t1", agent: "claude" }],
  });
  assert.equal(labels.p1, "hello — 2 (claude)");
});
void test("Gruvbox colors match Herdr tokens and validated custom overrides; unknown modes fall back", () => {
  const t = themeFromConfig(
    '[theme]\nname = "gruvbox"\nauto_switch = false\n[theme.custom]\naccent = "#abcdef"\n',
  );
  assert.equal(t.accent, "#abcdef");
  assert.equal(t.bg, "#282828");
  assert.equal(t.muted, "#928374");
  assert.equal(themeFromConfig('[theme]\nname="gruvbox"').accent, "#d79921");
  assert.equal(themeFromConfig('[theme]\nname="gruvbox"\nauto_switch=true').accent, null);
  assert.equal(themeFromConfig('[theme]\nname="unknown"').accent, null);
});
