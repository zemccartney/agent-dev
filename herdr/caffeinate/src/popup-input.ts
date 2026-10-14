import { PassThrough } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { emitKeypressEvents, type Key } from "node:readline";
export interface MouseInput {
  button: number;
  x: number;
  y: number;
  release: boolean;
}
interface InputHandlers {
  onKey: (text: string | undefined, key: Key) => void;
  onMouse: (event: MouseInput) => void;
}

/** Remove mouse reports before readline can interpret their digits as typing. */
export function createPopupInput({ onKey, onMouse }: InputHandlers) {
  const keys = new PassThrough(),
    decoder = new StringDecoder("utf8");
  emitKeypressEvents(keys);
  keys.on("keypress", onKey);
  let pending = "",
    timer: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  function drain() {
    clearTimeout(timer);
    while (pending) {
      if (pending[0] !== "\x1b") {
        const next = pending.indexOf("\x1b");
        const end = next < 0 ? pending.length : next;
        keys.write(pending.slice(0, end));
        pending = pending.slice(end);
        continue;
      }
      const mouse = pending.startsWith("\x1b[<")
        ? pending.slice(3).match(/^(\d+);(\d+);(\d+)([Mm])/)
        : null;
      if (mouse) {
        pending = pending.slice(3 + mouse[0].length);
        onMouse({
          button: Number(mouse[1]),
          x: Number(mouse[2]),
          y: Number(mouse[3]),
          release: mouse[4] === "m",
        });
        continue;
      }
      if (
        "\x1b[<".startsWith(pending) ||
        (pending.startsWith("\x1b[<") && /^[\d;]*$/.test(pending.slice(3)))
      ) {
        if (pending.length > 80) {
          pending = "";
          return;
        }
        timer = setTimeout(() => {
          const escape = pending === "\x1b";
          pending = "";
          if (escape && !closed) onKey("\x1b", { name: "escape", sequence: "\x1b" });
        }, 40);
        return;
      }
      keys.write(pending[0]);
      pending = pending.slice(1);
    }
  }
  return {
    feed(chunk: string | Buffer) {
      if (closed) return;
      pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
      drain();
    },
    close() {
      closed = true;
      clearTimeout(timer);
      keys.destroy();
    },
  };
}
