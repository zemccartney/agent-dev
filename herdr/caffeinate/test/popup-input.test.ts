import test from "node:test";
import assert from "node:assert/strict";
import { createPopupInput, type MouseInput } from "#caffeinate/popup-input";
import type { Key } from "node:readline";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
void test("split SGR mouse reports never leak coordinates into typed duration", async () => {
  const keys: { text: string | undefined; key: Key }[] = [],
    mouse: MouseInput[] = [];
  const p = createPopupInput({
    onKey: (text, key) => keys.push({ text, key }),
    onMouse: (e) => mouse.push(e),
  });
  p.feed(Buffer.from("\x1b[<0;12;"));
  p.feed(Buffer.from("7M"));
  p.feed(Buffer.from("\x1b[<0;12;7m"));
  p.feed(Buffer.from("0.5\r"));
  await wait(5);
  assert.deepEqual(mouse, [
    { button: 0, x: 12, y: 7, release: false },
    { button: 0, x: 12, y: 7, release: true },
  ]);
  assert.equal(keys.map((k) => k.text).join(""), "0.5\r");
  p.close();
});
void test("arrow keys and standalone Escape still reach keyboard handler", async () => {
  const keys: (string | undefined)[] = [];
  const p = createPopupInput({ onKey: (_text, key) => keys.push(key.name), onMouse: () => {} });
  p.feed(Buffer.from("\x1b[A"));
  p.feed(Buffer.from("\x1b"));
  await wait(100);
  p.close();
  assert.deepEqual(keys, ["up", "escape"]);
});
