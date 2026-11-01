const packageName = "@grepco/pi-lence";
const registryUrl = "https://registry.npmjs.org/@grepco%2fpi-lence";
const maximumBytes = 8 * 1024 * 1024;

/** @param {unknown} value @returns {value is string} */
export function isReleaseVersion(value) {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    value === value.trim() &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value !== "0.0.0" &&
    value.split(".").every((part) => Number.isSafeInteger(Number(part)))
  );
}

/** A public metadata snapshot, not a pending-stage inspection or an atomic registry lock.
 * No credentials, configurable endpoint, redirects or retries. Tests replace only HTTP.
 * @param {string} name @param {string} version @param {typeof fetch} [fetcher] */
export async function assertUnpublishedVersion(name, version, fetcher = fetch) {
  if (name !== packageName) throw new Error("Unexpected release package");
  if (!isReleaseVersion(version))
    throw new Error("Expected a canonical stable nonzero release version");
  let metadata;
  try {
    const response = await fetcher(registryUrl, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json", "cache-control": "no-cache, no-store" },
    });
    // Even404 is not sufficient evidence of absence (package lookup/outage/auth ambiguity).
    if (
      response.status !== 200 ||
      !response.body ||
      Number(response.headers.get("content-length")) > maximumBytes
    ) {
      await response.body?.cancel();
      throw new Error("Unusable registry response");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maximumBytes) throw new Error("Registry metadata exceeds size bound");
        chunks.push(value);
      }
    } finally {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }
    metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (
      !metadata ||
      Array.isArray(metadata) ||
      metadata.name !== packageName ||
      Object.hasOwn(metadata, "error") ||
      !metadata.versions ||
      typeof metadata.versions !== "object" ||
      Array.isArray(metadata.versions) ||
      Object.entries(metadata.versions).some(([key, value]) => {
        const entry = /** @type {any} */ (value);
        return (
          !entry || Array.isArray(entry) || entry.name !== packageName || entry.version !== key
        );
      })
    )
      throw new Error("Invalid package metadata");
  } catch {
    throw new Error(
      "npm published-version lookup is inconclusive; cannot establish absence. No staging attempt authorized by this check.",
    );
  }
  if (Object.hasOwn(metadata.versions, version))
    throw new Error(`${packageName}@${version} is already published; do not stage it again`);
}
