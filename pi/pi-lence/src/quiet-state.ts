/** Observed activity, not a watchdog or a claim that a process is making progress. */
export class QuietActivity {
  private active = false;
  private lastActivity = 0;
  private tools = new Map<string, string>();
  private dialogs = 0;

  reset() {
    this.active = false;
    this.tools.clear();
    this.dialogs = 0;
  }
  start(now: number) {
    this.active = true;
    this.lastActivity = now;
    this.tools.clear();
  }
  touch(now: number) {
    if (this.active) this.lastActivity = now;
  }
  toolStart(id: string, name: string, now: number) {
    this.tools.set(id, name);
    this.touch(now);
  }
  toolEnd(id: string, now: number) {
    this.tools.delete(id);
    this.touch(now);
  }
  dialogOpened() {
    this.dialogs++;
  }
  dialogClosed() {
    this.dialogs = Math.max(0, this.dialogs - 1);
  }
  settle() {
    this.active = false;
    this.tools.clear();
  }

  status(now: number): { text: string; kind: "warning" } | undefined {
    if (!this.active || this.dialogs) return undefined;
    const age = Math.max(0, Math.floor((now - this.lastActivity) / 1000));
    if (age < 60) return undefined;
    const tool = this.tools.size > 1 ? `${this.tools.size} tools` : [...this.tools.values()][0];
    return {
      text: `Working · no updates for ${age}s${tool ? ` · ${tool}` : ""}`,
      kind: "warning",
    };
  }
}
