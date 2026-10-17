import xterm from "@xterm/headless";
import unicode from "@xterm/addon-unicode11";

/** Independent terminal cell widths: xterm's default Unicode 6 mismeasures emoji. */
export function createEmulator(columns: number, rows: number) {
  const emulator = new xterm.Terminal({ cols: columns, rows, allowProposedApi: true });
  emulator.loadAddon(new unicode.Unicode11Addon());
  emulator.unicode.activeVersion = "11";
  return emulator;
}
