import assert from "node:assert/strict";
import { test } from "node:test";
import { QuietActivity } from "../src/quiet-state.ts";

test("ordinary work stays quiet; a warning appears only after 60 seconds without updates", () => {
  const activity = new QuietActivity();
  activity.start(1_000);
  assert.equal(activity.status(1_000), undefined);
  assert.equal(activity.status(60_999), undefined);
  assert.deepEqual(activity.status(61_000), {
    text: "Working · no updates for 60s", kind: "warning",
  });
});

test("real activity clears the warning; polling and a sleep-sized gap do not reset the clock", () => {
  const activity = new QuietActivity();
  activity.start(1_000);
  activity.toolStart("a", "bash", 2_000);
  assert.match(activity.status(92_000)!.text, /no updates for 90s.*bash/);
  assert.match(activity.status(93_000)!.text, /91s/);
  activity.touch(94_000);
  assert.equal(activity.status(95_000), undefined);
  assert.match(activity.status(3_694_000)!.text, /3600s/);
});

test("open dialogs suppress warnings, including nested dialogs", () => {
  const activity = new QuietActivity();
  activity.start(0);
  activity.dialogOpened();
  activity.dialogOpened();
  activity.dialogClosed();
  assert.equal(activity.status(90_000), undefined);
  activity.dialogClosed();
  assert.match(activity.status(91_000)!.text, /91s/);
});

test("settlement and session reset remove warnings rather than add duplicate terminal notices", () => {
  const activity = new QuietActivity();
  activity.start(0);
  assert.ok(activity.status(60_000));
  activity.settle();
  assert.equal(activity.status(90_000), undefined);
  activity.start(100_000);
  assert.equal(activity.status(100_000), undefined);
  assert.ok(activity.status(160_000));
  activity.reset();
  assert.equal(activity.status(200_000), undefined);
});

test("warnings identify outstanding tools, but no tool name persists after it finishes", () => {
  const activity = new QuietActivity();
  activity.start(0);
  activity.toolStart("a", "bash", 1_000);
  activity.toolStart("b", "read", 2_000);
  assert.match(activity.status(62_000)!.text, /2 tools/);
  activity.toolEnd("a", 64_000);
  assert.equal(activity.status(65_000), undefined);
  assert.match(activity.status(124_000)!.text, /read/);
  activity.toolEnd("b", 126_000);
  assert.doesNotMatch(activity.status(186_000)!.text, /read|bash/);
});
