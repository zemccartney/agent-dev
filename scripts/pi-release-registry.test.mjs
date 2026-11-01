import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";

const name = "@grepco/pi-lence";
const version = "1.0.0";
const metadata = { name, versions: { "0.0.0-stage": { name, version: "0.0.0-stage" } } };

test("published-version guard permits only validated metadata without the intended version", async () => {
  const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
  let calls = 0;
  await assertUnpublishedVersion(name, version, async (url, init) => {
    calls++;
    assert.equal(url, "https://registry.npmjs.org/@grepco%2fpi-lence");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.ok(init?.signal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("cookie"), null);
    assert.match(headers.get("cache-control") ?? "", /no-cache/);
    return Response.json(metadata);
  });
  assert.equal(calls, 1);
});

test("published target is refused even when latest points to another version", async () => {
  const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
  await assert.rejects(
    assertUnpublishedVersion(name, version, async () =>
      Response.json({
        ...metadata,
        "dist-tags": { latest: "0.0.0-stage" },
        versions: { ...metadata.versions, [version]: { name, version } },
      }),
    ),
    /already published/,
  );
});

for (const status of [301, 401, 403, 404, 429, 500, 503]) {
  test(`registry ${status} is inconclusive, never absence and never retried`, async () => {
    const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
    let calls = 0;
    await assert.rejects(
      assertUnpublishedVersion(name, version, async () => {
        calls++;
        return Response.json({ error: "Not found" }, { status });
      }),
      /cannot establish|inconclusive/i,
    );
    assert.equal(calls, 1);
  });
}

for (const body of [
  null,
  [],
  {},
  { name },
  { ...metadata, name: "other" },
  { ...metadata, error: "outage" },
  { name, versions: [] },
  { name, versions: { "0.5.0": null } },
  { name, versions: { "0.5.0": { name: "other", version: "0.5.0" } } },
  { name, versions: { "0.5.0": { name, version: "0.4.0" } } },
]) {
  test(`incomplete or inconsistent registry metadata fails closed: ${JSON.stringify(body)}`, async () => {
    const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
    await assert.rejects(
      assertUnpublishedVersion(name, version, async () => Response.json(body)),
      /inconclusive/i,
    );
  });
}

for (const failure of [
  "invalid JSON",
  "network",
  "timeout",
  "body read",
  "oversize header",
  "oversize stream",
]) {
  test(`registry ${failure} cannot authorize staging`, async () => {
    const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
    let calls = 0;
    let cancelled = false;
    await assert.rejects(
      assertUnpublishedVersion(name, version, async () => {
        calls++;
        if (failure === "network") throw new Error("offline");
        if (failure === "timeout") throw new DOMException("deadline", "TimeoutError");
        if (failure === "invalid JSON") return new Response("{incomplete");
        if (failure === "oversize header")
          return new Response("{}", { headers: { "content-length": "999999999" } });
        if (failure === "body read")
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("disconnected"));
              },
            }),
          );
        return new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
        );
      }),
      /inconclusive/i,
    );
    assert.equal(calls, 1);
    if (failure === "oversize stream") assert.equal(cancelled, true);
  });
}

for (const value of [
  "",
  "v1.0.0",
  "1.0.0\n",
  "1.0",
  "01.0.0",
  "0.0.0",
  "1.0.0-beta.1",
  "1.0.0+build",
  "9007199254740992.0.0",
  "../1.0.0",
]) {
  test(`invalid intended version is refused before network: ${JSON.stringify(value)}`, async () => {
    const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
    await assert.rejects(
      assertUnpublishedVersion(name, value, async () => {
        assert.fail("invalid input must not reach registry");
      }),
      /version/i,
    );
  });
}

test("body read failure releases the response reader", async () => {
  const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
  const body = new ReadableStream({
    start(controller) {
      controller.error(new Error("connection lost"));
    },
  });
  await assert.rejects(
    assertUnpublishedVersion(name, version, async () => new Response(body)),
    /inconclusive/,
  );
  assert.equal(body.locked, false);
});

for (const behavior of ["redirect", "hanging body"]) {
  test(
    `real HTTP ${behavior} is bounded and never followed/retried`,
    { timeout: 25_000 },
    async (t) => {
      const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
      let requests = 0;
      const server = createServer((_request, response) => {
        requests++;
        if (behavior === "redirect") response.writeHead(302, { location: "/unexpected" }).end();
        else {
          response.writeHead(200, { "content-type": "application/json" });
          response.write('{"name":"@grepco/pi-lence","versions":');
        }
      });
      t.after(() => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(() => resolve(undefined)));
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const started = Date.now();
      await assert.rejects(
        assertUnpublishedVersion(name, version, async (url, init) => {
          assert.equal(url, "https://registry.npmjs.org/@grepco%2fpi-lence");
          return fetch(`http://127.0.0.1:${address.port}/metadata`, init);
        }),
        /inconclusive/,
      );
      assert.equal(requests, 1);
      assert.ok(
        Date.now() - started < 22_000,
        "deadline must cover response body, not only headers",
      );
    },
  );
}

test("registry guard cannot be used for another package", async () => {
  const { assertUnpublishedVersion } = await import("./pi-release-registry.mjs");
  await assert.rejects(
    assertUnpublishedVersion("@other/package", version, async () => {
      assert.fail("wrong package must not reach registry");
    }),
    /package/i,
  );
});
