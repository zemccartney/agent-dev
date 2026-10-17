/** Read-only projection of the active branch. Pin entries never enter model context. */
export const PIN_ENTRY_TYPE = "response-references.pin.v1";

export interface HistoryEntry {
  type: string;
  id: string;
  timestamp?: string;
  message?: { role: string; content?: unknown; stopReason?: string };
  customType?: string;
  data?: unknown;
}
export interface ResponseReference {
  id: string;
  text: string;
  title: string;
  timestamp: string;
}
export interface ReferenceState {
  responses: ResponseReference[];
  pins: Map<string, string>;
}

export function collectReferences(entries: readonly HistoryEntry[]): ReferenceState {
  const responses: ResponseReference[] = [];
  const pins = new Map<string, string>();
  for (const entry of entries) {
    if (
      entry.type === "message" &&
      entry.message?.role === "assistant" &&
      entry.message.stopReason !== "pending" &&
      Array.isArray(entry.message.content)
    ) {
      const text = entry.message.content
        .filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n\n");
      if (text.trim())
        responses.push({
          id: entry.id,
          text,
          timestamp: entry.timestamp ?? "",
          title:
            text
              .split(/\r?\n/)
              .find((line) => line.trim())
              ?.replace(/^[#>*\s-]+/, "")
              .trim() || "Response",
        });
    }
    if (
      entry.type === "custom" &&
      entry.customType === PIN_ENTRY_TYPE &&
      entry.data &&
      typeof entry.data === "object"
    ) {
      const data = entry.data as { entryId?: unknown; label?: unknown };
      if (typeof data.entryId !== "string") continue;
      if (data.label === null) pins.delete(data.entryId);
      else if (typeof data.label === "string" && data.label.trim())
        pins.set(data.entryId, data.label.trim());
    }
  }
  const ids = new Set(responses.map((response) => response.id));
  for (const id of pins.keys()) if (!ids.has(id)) pins.delete(id);
  return { responses: responses.reverse(), pins };
}
