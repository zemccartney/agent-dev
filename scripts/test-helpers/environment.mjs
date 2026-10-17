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
