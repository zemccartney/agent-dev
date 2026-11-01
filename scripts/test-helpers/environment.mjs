import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Seed pnpm12's reviewed bootstrap lock in dependency-free offline fixtures.
 * Do not copy the real application dependency graph into the fixture.
 * @param {string} cwd */
export async function seedPackageManagerLock(cwd) {
  const lock = await readFile(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");
  const separator = lock.indexOf("\n---\n");
  if (separator < 0) throw new Error("Expected pnpm12 bootstrap and application lock documents");
  await writeFile(
    join(cwd, "pnpm-lock.yaml"),
    `${lock.slice(0, separator)}\n---\nlockfileVersion: '9.0'\nimporters: {}\n`,
  );
}

/** Keep Git's hook-time routing and hk skips out of disposable repositories.
 * Nested node --test must also shed NODE_TEST_CONTEXT or Node silently skips it.
 * @param {string} cwd @param {NodeJS.ProcessEnv} [source] */
export function fixtureEnvironment(cwd, source = process.env) {
  const inherited = Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !key.startsWith("GIT_") && !key.startsWith("HK_") && key !== "NODE_TEST_CONTEXT",
    ),
  );
  return { ...inherited, PWD: cwd, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
}
