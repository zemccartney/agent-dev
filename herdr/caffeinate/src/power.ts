import { execFile as exec } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(exec);
export type Power = "ac" | "battery" | "unknown";
type PowerCommand = (
  command: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: unknown }>;
export function parsePower(text: unknown): Power {
  const source = String(text).match(/^Now drawing from '(AC Power|Battery Power)'\s*$/m)?.[1];
  return source === "AC Power" ? "ac" : source === "Battery Power" ? "battery" : "unknown";
}
export async function readPower({
  execFile = run,
}: { execFile?: PowerCommand } = {}): Promise<Power> {
  try {
    return parsePower(
      (await execFile("/usr/bin/pmset", ["-g", "batt"], { timeout: 1500, maxBuffer: 65536 }))
        .stdout,
    );
  } catch {
    return "unknown";
  }
}
