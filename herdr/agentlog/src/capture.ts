import { isAbsolute } from "node:path";
import { HerdrError, type HerdrClient } from "./herdr.js";
import type { RegistryStore } from "./store.js";

export async function captureEvent(
  json: string,
  client: HerdrClient,
  store: RegistryStore,
): Promise<void> {
  const event: unknown = JSON.parse(json);
  if (!event || typeof event !== "object" || !("event" in event) || !("data" in event)) return;
  if (event.event !== "pane.agent_detected" && event.event !== "pane.agent_status_changed") return;
  const data = event.data;
  if (!data || typeof data !== "object" || !("pane_id" in data) || typeof data.pane_id !== "string")
    return;
  try {
    const pane = await client.pane(data.pane_id);
    const ref = pane.session;
    if (ref?.agent === "pi" && ref.kind === "path" && isAbsolute(ref.value))
      store.rememberPath(ref.value);
  } catch (error) {
    if (error instanceof HerdrError && error.code === "pane_not_found") return;
    throw error;
  }
}
