import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/** @typedef {{packages: string[], reason: string, approvedOn: string}} Approval */
/** @param {string} selector */
function exact(selector) {
  if (
    typeof selector !== "string" ||
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(
      selector,
    )
  ) {
    throw new Error(`Exception must name an exact package version: ${selector}`);
  }
  const split = selector.lastIndexOf("@");
  return { name: selector.slice(0, split), version: selector.slice(split + 1) };
}
/** @param {string[]} selectors @param {Approval[]} approvals */
function review(selectors, approvals) {
  if (!Array.isArray(selectors) || !Array.isArray(approvals))
    throw new Error("Invalid reviewed exception lists");
  const allowed = new Set();
  for (const approval of approvals) {
    if (!approval.reason?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedOn)) {
      throw new Error("Every exception needs a review reason and approval date");
    }
    if (!Array.isArray(approval.packages)) throw new Error("Invalid reviewed package list");
    for (const selector of approval.packages) {
      exact(selector);
      if (allowed.has(selector)) throw new Error(`Duplicate reviewed selector: ${selector}`);
      allowed.add(selector);
    }
  }
  for (const selector of selectors) {
    exact(selector);
    if (!allowed.has(selector)) throw new Error(`Exception is not reviewed: ${selector}`);
  }
}
/** Read-only policy audit. Registry access is isolated at lookup, never a fallback to cached guesses.
 * @param {{age: string[], trust: string[], minimumReleaseAge: number}} policy
 * @param {{releaseAge: Approval[], trust: Approval[]}} approvals
 * @param {(name: string) => Promise<Record<string, unknown>>} lookup
 * @param {number} [now] */
export async function auditExceptions(policy, approvals, lookup, now = Date.now()) {
  review(policy.age, approvals.releaseAge);
  review(policy.trust, approvals.trust);
  if (
    !Number.isFinite(policy.minimumReleaseAge) ||
    policy.minimumReleaseAge <= 0 ||
    !Number.isFinite(now)
  ) {
    throw new Error("Invalid minimum release age or clock");
  }
  return Promise.all(
    policy.age.map(async (selector) => {
      const { name, version } = exact(selector);
      const metadata = await lookup(name);
      const value = metadata?.[version];
      const published = typeof value === "string" ? Date.parse(value) : NaN;
      if (
        typeof value !== "string" ||
        !Number.isFinite(published) ||
        published > now ||
        new Date(published).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")
      ) {
        throw new Error(`Invalid or missing publication time for ${selector}`);
      }
      const expiresAt = new Date(published + policy.minimumReleaseAge * 60_000).toISOString();
      if (now >= Date.parse(expiresAt))
        throw new Error(
          `Expired age exception: ${selector}; eligible since ${expiresAt}. Remove its age exclusion.`,
        );
      return { selector, expiresAt };
    }),
  );
}
/** @param {string} key @param {string} cwd */
function setting(key, cwd) {
  const result = spawnSync("pnpm", ["config", "get", key, "--json"], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Cannot read pnpm ${key}: ${result.stderr}`);
  const value = result.stdout.trim();
  return value === "" || value === "undefined" ? undefined : JSON.parse(value);
}
async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const approvals = JSON.parse(
    readFileSync(new URL("../dependency-exceptions.json", import.meta.url), "utf8"),
  );
  const policy = {
    age: setting("minimumReleaseAgeExclude", root) ?? [],
    trust: setting("trustPolicyExclude", root) ?? [],
    minimumReleaseAge: setting("minimumReleaseAge", root),
  };
  const report = await auditExceptions(policy, approvals, async (name) => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Registry metadata unavailable for ${name}: HTTP ${response.status}`);
    return (await response.json()).time;
  });
  for (const entry of report)
    console.log(`${entry.selector}: remove age exclusion at ${entry.expiresAt}`);
  console.log(
    `Reviewed ${report.length} active age exceptions; ${policy.trust.length} trust exceptions require separate replacement/removal review.`,
  );
}
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
