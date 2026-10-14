import {
  VStack,
  HStack,
  Input,
  MouseRegion,
  ProcessTerminal,
  SelectList,
  Text,
  TuiAltScreen,
  matchesKey,
  type SelectItem,
  type Terminal,
} from "@earendil-works/pi-tui";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

/** Disposable toolkit probe: no Herdr requests, agent commands, or assertions. */
export async function runTuiSpike(terminal?: Terminal): Promise<void> {
  if (!terminal && (!process.stdin.isTTY || !process.stdout.isTTY))
    throw new Error("Toolkit spike requires an interactive terminal");
  const tui = new TuiAltScreen(terminal ?? new ProcessTerminal(), true, undefined, {
    copyOnSelect: false,
  });
  const content = new VStack();
  const hours = new Input({ prompt: "Hours: " });
  const defaults = new Input({ prompt: "Default: " });
  hours.setValue("2");
  defaults.setValue("8");
  hours.handleInput("\x05");
  defaults.handleInput("\x05");
  const status = new Text("Selected: agent-1", 0, 0);
  const order = new Text("Order: original", 0, 0);
  let settings = false,
    reversed = false,
    ended = false,
    listFocused = false;
  let selected = "agent-1";
  let items: SelectItem[] = Array.from({ length: 12 }, (_, index) => ({
    value: `agent-${index + 1}`,
    label: index === 0 ? "Pi 🚀 東京 e\u0301" : `Agent ${index + 1}`,
  }));
  const plain = (text: string) => text;
  const theme = {
    selectedPrefix: plain,
    selectedText: (text: string) => `\x1b[38;2;250;189;47m${text}\x1b[0m`,
    description: plain,
    scrollInfo: plain,
    noMatch: plain,
  };
  function makeList() {
    const next = new SelectList(items, 5, theme);
    next.setSelectedIndex(
      Math.max(
        0,
        items.findIndex((item) => item.value === selected),
      ),
    );
    const select = (item: SelectItem) => {
      selected = item.value;
      status.setText(`Selected: ${selected}`);
      tui.requestRender();
    };
    next.onSelect = select;
    next.onSelectionChange = select;
    return next;
  }
  let list = makeList();
  const tab = (label: string, value: boolean) =>
    new MouseRegion(new Text(label, 0, 0), (event) => {
      if (event.type !== "click" || event.button !== "left") return;
      settings = value;
      paint();
      return { handled: true };
    });
  const tabs = new HStack([tab("Agents (a)", false), tab("Settings (s)", true)]);
  function paint() {
    content.clear();
    content.addChild(new Text("Caffeinate toolkit spike (no leases)", 0, 0));
    content.addChild(tabs);
    content.addChild(settings ? defaults : hours);
    if (!settings) {
      content.addChild(list);
      content.addChild(order);
    }
    content.addChild(status);
    tui.setFocus(settings ? defaults : listFocused ? list : hours);
    tui.requestRender();
  }
  hours.onSubmit = (value) => {
    status.setText(`Applied: ${value}`);
    tui.requestRender();
  };
  defaults.onSubmit = (value) => {
    status.setText(`Default applied: ${value}`);
    tui.requestRender();
  };
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  function close() {
    if (ended) return;
    ended = true;
    // Unlike the default stop, this restores the parent without printing the final document.
    tui.stop({ preserveScreen: true });
    finish();
  }
  tui.addInputListener((data) => {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      close();
      return { consume: true };
    }
    if (data === "a" || data === "s") {
      settings = data === "s";
      paint();
      return { consume: true };
    }
    if (matchesKey(data, "tab")) {
      listFocused = !listFocused;
      paint();
      return { consume: true };
    }
    if (data === "r" && !settings) {
      items = [...items].reverse();
      reversed = !reversed;
      list = makeList();
      order.setText(`Order: ${reversed ? "reversed" : "original"}`);
      paint();
      return { consume: true };
    }
    return undefined;
  });
  tui.setLayoutRoot(content);
  paint();
  try {
    tui.start();
    await done;
  } finally {
    close();
  }
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url)
  await runTuiSpike();
