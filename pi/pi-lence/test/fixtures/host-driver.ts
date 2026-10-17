/** Deterministic, network-free provider for real-host tests; never packaged. */
import assert from "node:assert/strict";
import { appendFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const root = process.env.PI_LENCE_TEST_ROOT;
  assert.ok(root, "Host fixture requires an explicit disposable sandbox");
  assert.equal(realpathSync(process.cwd()), realpathSync(join(root, "project")));
  assert.equal(realpathSync(process.env.HOME!), realpathSync(join(root, "home")));
  const events = join(root, "events.jsonl");
  pi.on("session_start", (event, ctx) => {
    appendFileSync(
      events,
      `${JSON.stringify({ type: "start", reason: event.reason, mode: ctx.mode })}\n`,
    );
  });
  pi.on("session_shutdown", () => {
    appendFileSync(events, `${JSON.stringify({ type: "shutdown" })}\n`);
  });
  pi.registerProvider("pi-lence-fixture", {
    baseUrl: "http://127.0.0.1:1/not-used",
    api: "pi-lence-fixture-stream",
    apiKey: "fixture-not-a-credential",
    models: [
      {
        id: "fixture",
        name: "Offline fixture",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 4096,
      },
    ],
    streamSimple: (model, context) => {
      const stream = createAssistantMessageEventStream();
      const userIndex = context.messages.findLastIndex((message) => message.role === "user");
      const user = context.messages[userIndex];
      assert.ok(user?.role === "user");
      const prompt =
        typeof user.content === "string"
          ? user.content
          : user.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("");
      const hasResult = context.messages
        .slice(userIndex + 1)
        .some((message) => message.role === "toolResult");
      const tool = prompt === "fixture-read" && !hasResult;
      const output: AssistantMessage = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [],
        stopReason: "pending",
        timestamp: Date.now(),
        usage: {
          input: 100,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 110,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      queueMicrotask(() => {
        stream.push({ type: "start", partial: output });
        if (tool) {
          const call = {
            type: "toolCall" as const,
            id: "fixture-read-call",
            name: "read",
            arguments: { path: "fixture.txt" },
          };
          output.content.push(call);
          stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
          stream.push({
            type: "toolcall_delta",
            contentIndex: 0,
            delta: JSON.stringify(call.arguments),
            partial: output,
          });
          stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: output });
          output.stopReason = "toolUse";
          stream.push({ type: "done", reason: "toolUse", message: output });
        } else {
          const text = { type: "text" as const, text: "" };
          output.content.push(text);
          stream.push({ type: "text_start", contentIndex: 0, partial: output });
          text.text = `Fixture answer: ${prompt}`;
          stream.push({ type: "text_delta", contentIndex: 0, delta: text.text, partial: output });
          stream.push({ type: "text_end", contentIndex: 0, content: text.text, partial: output });
          output.stopReason = "stop";
          stream.push({ type: "done", reason: "stop", message: output });
        }
        stream.end();
      });
      return stream;
    },
  });
}
