import assert from "node:assert/strict";
import { test } from "node:test";
import { collectReferences, PIN_ENTRY_TYPE } from "../src/reference-state.ts";

const response = (id: string, text: string) => ({
  type: "message", id, timestamp: "2026-01-01T10:00:00Z",
  message: { role: "assistant", content: [{ type: "text", text }] },
});
const pin = (id: string, entryId: string, label: string | null) => ({
  type: "custom", id, timestamp: "2026-01-01T10:01:00Z", customType: PIN_ENTRY_TYPE,
  data: { entryId, label },
});

test("newest-first assistant prose only; no user, tool, or thinking-only entries", () => {
  const state = collectReferences([
    response("a", "# Checklist\n\n1. Test"),
    { type: "message", id: "user", message: { role: "user", content: "Question" } },
    { type: "message", id: "tool", message: { role: "toolResult", content: [{ type: "text", text: "noise" }] } },
    { type: "message", id: "thinking", message: { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }] } },
    { type: "message", id: "pending", message: { role: "assistant", stopReason: "pending", content: [{ type: "text", text: "partial" }] } },
    response("b", "Follow-up"),
  ]);
  assert.deepEqual(state.responses.map(r => r.id), ["b", "a"]);
  assert.equal(state.responses[1].title, "Checklist");
  assert.equal(state.responses[1].text, "# Checklist\n\n1. Test");
});

test("pin, rename, unpin replay from session metadata; older pins survive a new latest", () => {
  const history = [response("a", "Checklist"), pin("p1", "a", "Release"), response("b", "Next")];
  let state = collectReferences(history);
  assert.equal(state.pins.get("a"), "Release");
  assert.equal(state.pins.has(state.responses[0].id), false);
  history.push(pin("p2", "b", "Other"), pin("p3", "a", "Renamed"));
  state = collectReferences(history);
  assert.deepEqual([...state.pins], [["a", "Renamed"], ["b", "Other"]]);
  history.push(pin("p4", "b", null));
  assert.deepEqual([...collectReferences(history).pins], [["a", "Renamed"]]);
});

test("bad metadata and references outside the supplied branch are ignored", () => {
  const state = collectReferences([
    response("a", "Same prose"), response("b", "Same prose"),
    pin("p1", "a", "First"), pin("missing", "other-branch", "Elsewhere"),
    { type: "custom", id: "bad", customType: PIN_ENTRY_TYPE, data: { entryId: "b", label: 3 } },
    { type: "custom", id: "foreign", customType: "another-extension", data: { entryId: "b", label: "No" } },
  ]);
  assert.equal(state.responses.length, 2, "identity is entry ID, not text");
  assert.deepEqual([...state.pins], [["a", "First"]]);
});
