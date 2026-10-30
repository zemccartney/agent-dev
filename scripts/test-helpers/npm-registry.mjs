import assert from "node:assert/strict";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { packCandidate } from "../../pi/pi-lence/scripts/pack.mjs";

/** @param {import('node:test').TestContext} t @param {string} [source] */
export async function stageFixture(
  t,
  source = fileURLToPath(new URL("../../pi/pi-lence/", import.meta.url)),
) {
  const root = await mkdtemp(join(tmpdir(), "npm-stage-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const producer = join(root, "producer/pi/pi-lence");
  await mkdir(join(producer, "src"), { recursive: true });
  // Root quality tests temporarily add source canaries concurrently. Copy fixture inputs,
  // not the mutable directory inventory; production packer validation stays strict.
  for (const file of [
    "README.md",
    "package.json",
    "src/quiet-mode.ts",
    "src/quiet-renderers.ts",
    "src/quiet-state.ts",
    "src/reference-browser.ts",
    "src/reference-state.ts",
    "src/reference-ui.ts",
    "src/reference-widgets.ts",
  ])
    await cp(join(source, file), join(producer, file));
  await cp(new URL("../../LICENSE", import.meta.url), join(root, "producer/LICENSE"));
  const manifest = JSON.parse(await readFile(join(producer, "package.json"), "utf8"));
  manifest.version = "0.1.0";
  await writeFile(join(producer, "package.json"), JSON.stringify(manifest));
  const artifact = await packCandidate(producer, join(root, "packed"));
  const bytes = await readFile(artifact.tarballPath);
  return {
    root,
    bytes,
    artifact: {
      ...artifact,
      name: "@grepco/pi-lence",
      version: "0.1.0",
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    },
  };
}

/** Real pinned CLI, fake HTTP only. No production registry or credentials are available.
 * @param {import('node:test').TestContext} t
 * @param {{status?:number, reply?:unknown, hang?:boolean}} [behavior] */
export async function registryFixture(t, behavior = {}) {
  /** @type {Array<{method:string,url:string,body:any}>} */
  const requests = [];
  const stageId = "11111111-1111-4111-8111-111111111111";
  const server = createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(part);
    const raw = Buffer.concat(parts);
    const body = raw.length
      ? JSON.parse(
          (request.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw).toString(),
        )
      : null;
    requests.push({ method: request.method ?? "", url: request.url ?? "", body });
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/@grepco%2fpi-lence") {
      response.end(JSON.stringify({ name: "@grepco/pi-lence", versions: {} }));
    } else if (request.method === "POST" && request.url === "/-/stage/package/@grepco%2fpi-lence") {
      if (behavior.hang) return;
      response.statusCode = behavior.status ?? 200;
      response.end(JSON.stringify(behavior.reply ?? { stageId }));
    } else {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: "Unexpected fixture request" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(() => resolve(undefined)));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const registry = `http://127.0.0.1:${address.port}/`;
  /** @type {Array<{args:string[],env:NodeJS.ProcessEnv,cwd:string}>} */
  const calls = [];
  /** @type {typeof import('../pi-release-npm.mjs').executeNpm} */
  const execute = async (cli, args, options) => {
    calls.push({ args, env: { ...options.env }, cwd: options.cwd });
    assert.ok(args.includes("--registry=https://registry.npmjs.org"));
    assert.ok(args.includes("--provenance"));
    // This adapter lives only in tests: change transport, not command/payload.
    const local = args.map((arg) =>
      arg === "--registry=https://registry.npmjs.org"
        ? `--registry=${registry}`
        : arg === "--provenance"
          ? "--provenance=false"
          : arg,
    );
    assert.ok(options.env.npm_config_userconfig);
    await writeFile(
      options.env.npm_config_userconfig,
      `//127.0.0.1:${address.port}/:_authToken=fixture-only\n`,
    );
    const env = { ...options.env };
    delete env.GITHUB_ACTIONS;
    return promisify(execFile)(process.execPath, [cli, ...local], {
      ...options,
      env,
      timeout: behavior.hang ? 2500 : options.timeout,
      encoding: "utf8",
    });
  };
  return { requests, calls, execute, stageId };
}
