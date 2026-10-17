import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export interface FixtureOptions {
  userTimes?: number[];
  assistantTime?: number;
  nativeNames?: string[];
  cwdName?: string;
  userContent?: string | Array<{ type: string; text?: string }>;
}
export async function makeFixture(t: TestContext, options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "agentlog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, options.cwdName ?? "Alice's café 👩‍💻");
  await mkdir(cwd);
  const file = join(root, "session.jsonl");
  const entries: unknown[] = [
    { type: "session", version: 3, id: "session-a", timestamp: new Date(0).toISOString(), cwd },
  ];
  for (const [i, timestamp] of (options.userTimes ?? [1000, 3000]).entries()) {
    entries.push({
      type: "message",
      id: `user-${i}`,
      parentId: null,
      timestamp: new Date(timestamp).toISOString(),
      message: {
        role: "user",
        content: options.userContent ?? [{ type: "text", text: "First prompt" }],
        timestamp,
      },
    });
  }
  entries.push({
    type: "message",
    id: "assistant",
    parentId: null,
    timestamp: new Date(options.assistantTime ?? 9999).toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Later output" }],
      timestamp: options.assistantTime ?? 9999,
    },
  });
  for (const name of options.nativeNames ?? ["Old", "Current"])
    entries.push({
      type: "session_info",
      id: `name-${name}`,
      parentId: null,
      timestamp: new Date().toISOString(),
      name,
    });
  await writeFile(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return { root, cwd, file };
}
export async function appendUserMessage(file: string, timestamp: number) {
  await appendFile(
    file,
    JSON.stringify({
      type: "message",
      id: `user-${timestamp}`,
      parentId: null,
      timestamp: new Date(timestamp).toISOString(),
      message: { role: "user", content: "Later user message", timestamp },
    }) + "\n",
  );
}
