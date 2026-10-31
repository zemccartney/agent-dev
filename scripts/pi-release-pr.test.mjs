import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createChangesetFixture, succeeds } from "./test-helpers/changesets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
/** @param {string} name */
async function subject(name) {
  assert.ok(existsSync(join(root, "scripts", name)), `Missing release-PR implementation: ${name}`);
  return import(new URL(name, import.meta.url).href);
}
/** @param {import('node:test').TestContext} t @param {boolean} [withNote] */
async function fixture(t, withNote = true) {
  const f = await createChangesetFixture(t);
  for (const path of ["thinking", ".superpowers", "docs"]) await mkdir(join(f.cwd, path));
  for (const path of [
    "plan.md",
    "thinking/local.md",
    ".superpowers/local.md",
    "docs/plan.md",
    "herdr/agentlog/keep.txt",
  ])
    await writeFile(join(f.cwd, path), `Keep source content: ${path}\n`);
  if (withNote)
    await writeFile(
      join(f.cwd, ".changeset/pi-note.md"),
      '---\n"@grepco/pi-lence": minor\n---\n\nInitial release.\n',
    );
  await writeFile(
    join(f.cwd, ".changeset/herdr-note.md"),
    '---\n"@grepco/agentlog": patch\n---\n\nLater Herdr release.\n',
  );
  succeeds(await f.git("add", "."));
  succeeds(await f.git("commit", "-m", "Synthetic source and release intent"));
  return f;
}

// Publishing the whole development tree or dropping Herdr instead of just scratch breaks this.
test("candidate projection preserves product source, removes only scratch, and binds exact output", async (t) => {
  const api = await subject("pi-release-candidate.mjs");
  const f = await fixture(t);
  const source = succeeds(await f.git("rev-parse", "HEAD")).trim();
  const before = await f.contents([
    "herdr/agentlog/package.json",
    "herdr/agentlog/keep.txt",
    ".changeset/herdr-note.md",
    "docs/plan.md",
    "pnpm-lock.yaml",
  ]);
  const candidate = await api.prepareCandidate(f.cwd);
  assert.equal(candidate.sourceCommit, source);
  assert.equal(candidate.targetVersion, "0.1.0");
  assert.deepEqual(candidate.changesetIds, ["pi-note"]);
  assert.deepEqual(
    candidate.fileChanges.additions.map((/** @type {{path:string}} */ x) => x.path),
    ["pi/pi-lence/CHANGELOG.md", "pi/pi-lence/package.json"],
  );
  assert.deepEqual(
    candidate.fileChanges.deletions,
    [".changeset/pi-note.md", ".superpowers/local.md", "plan.md", "thinking/local.md"].map(
      (path) => ({ path }),
    ),
  );
  assert.match(candidate.digest, /^[a-f0-9]{64}$/);
  await api.verifyCandidate(f.cwd, candidate);
  assert.deepEqual(
    await f.contents([
      "herdr/agentlog/package.json",
      "herdr/agentlog/keep.txt",
      ".changeset/herdr-note.md",
      "docs/plan.md",
      "pnpm-lock.yaml",
    ]),
    before,
  );
  succeeds(await f.run(process.execPath, [join(root, "scripts/check-release-tree.mjs")]));
  assert.equal(succeeds(await f.git("rev-parse", "HEAD")).trim(), source);
  succeeds(await f.git("reset", "--hard", source));
  await rm(join(f.cwd, "pi/pi-lence/CHANGELOG.md"));
  assert.deepEqual(
    await api.prepareCandidate(f.cwd),
    candidate,
    "Same source must regenerate the same digest/payload",
  );
  await writeFile(join(f.cwd, "herdr/agentlog/keep.txt"), "unexpected source mutation\n");
  await assert.rejects(api.verifyCandidate(f.cwd, candidate), /unexpected|changed/i);
});

test("candidate with no Pi intent neither removes scratch nor versions Herdr", async (t) => {
  const api = await subject("pi-release-candidate.mjs");
  const f = await fixture(t, false);
  const candidate = await api.prepareCandidate(f.cwd);
  assert.equal(candidate.targetVersion, null);
  assert.deepEqual(candidate.fileChanges, { additions: [], deletions: [] });
  assert.equal(succeeds(await f.git("status", "--porcelain")), "");
  await api.verifyCandidate(f.cwd, candidate);
});

const source = "a".repeat(40);
const prepared = "b".repeat(40);
const repo = "zemccartney/agent-dev";
const context = {
  repository: repo,
  eventName: "workflow_dispatch",
  ref: "refs/heads/dev",
  sha: source,
  workflowSha: source,
  workflowRef: `${repo}/.github/workflows/prepare-pi-release.yml@refs/heads/dev`,
  actor: "owner",
  triggeringActor: "owner",
  serverUrl: "https://github.com",
  apiUrl: "https://api.github.com",
};
function candidate() {
  const data = {
    sourceCommit: source,
    targetVersion: "0.1.0",
    changesetIds: ["pi-note"],
    fileChanges: {
      additions: [
        {
          path: "pi/pi-lence/CHANGELOG.md",
          contents: Buffer.from("# Pi\n\n## 0.1.0\n").toString("base64"),
        },
        {
          path: "pi/pi-lence/package.json",
          contents: Buffer.from('{"name":"@grepco/pi-lence","version":"0.1.0"}\n').toString(
            "base64",
          ),
        },
      ],
      deletions: [{ path: ".changeset/pi-note.md" }],
    },
  };
  return { ...data, digest: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}

/** Only the external HTTP boundary is simulated; serialization, guards, and orchestration are real.
 * @param {{branch?:string, pr?:boolean, permission?:string, fail?:string, race?:boolean, moved?:boolean, graphqlError?:boolean}} [options] */
function github(options = {}) {
  /** @type {{method:string,path:string,body:any}[]} */
  const requests = [];
  let branch = options.branch;
  /** @type {typeof fetch} */
  const fetcher = async (input, init) => {
    assert.ok(typeof input === "string", "Use an explicit GitHub URL");
    const url = new URL(input);
    assert.equal(url.origin, "https://api.github.com", "Credentials must never leave GitHub");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-test-token");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const method = init?.method ?? "GET";
    const path = url.pathname;
    assert.ok(
      init?.body === undefined || typeof init.body === "string",
      "Serialize JSON explicitly",
    );
    const body = init?.body ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, body });
    const reply = (/** @type {unknown} */ data, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(data), { status }));
    if (options.fail === `${method} ${path}`) return reply({ message: "fixture API failure" }, 403);
    if (method === "GET" && path === `/repos/${repo}`)
      return reply({ full_name: repo, default_branch: "main", fork: false });
    if (method === "GET" && path.startsWith(`/repos/${repo}/collaborators/`))
      return reply({ permission: options.permission ?? "admin" });
    if (method === "GET" && path === `/repos/${repo}/git/ref/heads/changeset-release/main`)
      return branch ? reply({ object: { sha: branch } }) : reply({ message: "Not Found" }, 404);
    if (method === "GET" && path === `/repos/${repo}/pulls`) {
      assert.equal(url.searchParams.get("state"), "open");
      assert.equal(url.searchParams.get("head"), "zemccartney:changeset-release/main");
      return reply(options.pr ? [{ number: 8 }] : []);
    }
    if (method === "POST" && path === `/repos/${repo}/git/refs`) {
      assert.deepEqual(body, { ref: "refs/heads/changeset-release/main", sha: source });
      if (branch || options.race) return reply({ message: "Reference already exists" }, 422);
      branch = source;
      return reply({ ref: body.ref, object: { sha: source } }, 201);
    }
    if (method === "POST" && path === "/graphql") {
      if (options.graphqlError)
        return reply({ errors: [{ message: "Expected head does not match" }] });
      assert.equal(body.variables.input.expectedHeadOid, source);
      assert.deepEqual(body.variables.input.branch, {
        repositoryNameWithOwner: repo,
        branchName: "changeset-release/main",
      });
      assert.deepEqual(body.variables.input.fileChanges, candidate().fileChanges);
      assert.match(body.query, /createCommitOnBranch/);
      branch = options.moved ? "c".repeat(40) : prepared;
      return reply({ data: { createCommitOnBranch: { commit: { oid: prepared } } } });
    }
    if (method === "POST" && path === `/repos/${repo}/pulls`) {
      assert.equal(body.base, "main");
      assert.equal(body.head, "changeset-release/main");
      assert.equal(body.draft, true);
      return reply(
        { number: 7, html_url: `https://github.com/${repo}/pull/7`, head: { sha: prepared } },
        201,
      );
    }
    throw new Error(`Unexpected GitHub operation: ${method} ${url}`);
  };
  return { fetcher, requests, branch: () => branch };
}

test("create-only PR uses CAS, targets main and explains the actual approval boundary", async () => {
  const api = await subject("pi-release-github.mjs");
  const fake = github();
  const client = api.githubClient("synthetic-test-token", fake.fetcher);
  const data = candidate();
  const result = await api.openReleasePr(context, client, data, data.digest);
  assert.equal(result.url, `https://github.com/${repo}/pull/7`);
  assert.equal(result.commit, prepared);
  const writes = fake.requests.filter((r) => r.method !== "GET");
  assert.deepEqual(
    writes.map((r) => r.path),
    [`/repos/${repo}/git/refs`, "/graphql", `/repos/${repo}/pulls`],
  );
  const body = writes.at(-1)?.body.body;
  assert.match(body, /merge authorizes staging only/i);
  assert.match(body, /environment, bootstrap and.*trust setup/i);
  assert.match(body, /release branch/i);
  assert.match(body, /Approve workflows to run/);
  assert.match(body, /Do not merge/i);
  assert.ok(body.includes(source) && body.includes(prepared) && body.includes(data.digest));
  assert.doesNotMatch(body, /will be published.*automatically/);
  // The second request must protect the existing candidate, not refresh it.
  await assert.rejects(api.openReleasePr(context, client, data, data.digest), /existing|active/i);
  assert.equal(fake.requests.filter((r) => r.method !== "GET").length, 3);
});

for (const patch of [
  { eventName: "push" },
  { eventName: "pull_request_target" },
  { repository: "attacker/fork" },
  { ref: "refs/heads/main" },
  { ref: "refs/heads/feature" },
  { sha: "bad" },
  { workflowSha: "c".repeat(40) },
  { workflowRef: `${repo}/.github/workflows/other.yml@refs/heads/dev` },
  { apiUrl: "https://attacker.invalid" },
  { actor: "bad/actor" },
]) {
  test(`untrusted dispatch is refused before HTTP: ${JSON.stringify(patch)}`, async () => {
    const api = await subject("pi-release-github.mjs");
    const fake = github();
    await assert.rejects(
      api.inspectRemote(
        { ...context, ...patch },
        api.githubClient("synthetic-test-token", fake.fetcher),
      ),
      /trusted|manual|dev|context/i,
    );
    assert.deepEqual(fake.requests, []);
  });
}
for (const options of [
  { branch: source },
  { pr: true },
  { permission: "read" },
  { fail: `GET /repos/${repo}/git/ref/heads/changeset-release/main` },
]) {
  test(`preflight blocks without writes: ${JSON.stringify(options)}`, async () => {
    const api = await subject("pi-release-github.mjs");
    const fake = github(options);
    await assert.rejects(
      api.inspectRemote(context, api.githubClient("synthetic-test-token", fake.fetcher)),
      /active|existing|permission|GitHub/i,
    );
    assert.equal(
      fake.requests.some((r) => r.method !== "GET"),
      false,
    );
  });
}
for (const options of [
  { race: true },
  { graphqlError: true },
  { moved: true },
  { fail: `POST /repos/${repo}/pulls` },
]) {
  test(`partial failure never overwrites or removes candidate: ${JSON.stringify(options)}`, async () => {
    const api = await subject("pi-release-github.mjs");
    const fake = github(options);
    const data = candidate();
    await assert.rejects(
      api.openReleasePr(
        context,
        api.githubClient("synthetic-test-token", fake.fetcher),
        data,
        data.digest,
      ),
      /GitHub|changed|candidate/i,
    );
    assert.equal(
      fake.requests.some((r) => ["PATCH", "PUT", "DELETE"].includes(r.method)),
      false,
    );
    if (!options.race) assert.ok(fake.branch(), "Keep a partial candidate for owner inspection");
    if (options.graphqlError || options.moved || options.race)
      assert.equal(
        fake.requests.some((r) => r.method === "POST" && r.path.endsWith("/pulls")),
        false,
      );
  });
}

test("digest mismatch and changed candidate content are rejected before writes", async () => {
  const api = await subject("pi-release-github.mjs");
  for (const mutate of [false, true]) {
    const fake = github();
    const data = candidate();
    if (mutate) data.fileChanges.additions[0].contents = "tampered";
    await assert.rejects(
      api.openReleasePr(
        context,
        api.githubClient("synthetic-test-token", fake.fetcher),
        data,
        mutate ? data.digest : "0".repeat(64),
      ),
      /digest/i,
    );
    assert.equal(
      fake.requests.some((r) => r.method !== "GET"),
      false,
    );
  }
});

test("rerunning actor permission is checked independently of the initiating actor", async () => {
  const api = await subject("pi-release-github.mjs");
  const fake = github();
  await api.inspectRemote(
    { ...context, triggeringActor: "reviewer" },
    api.githubClient("synthetic-test-token", fake.fetcher),
  );
  assert.ok(fake.requests.some((r) => r.path.endsWith("/collaborators/reviewer/permission")));
});

test("operator CLI rejects local/unknown invocation without touching a real remote", async (t) => {
  await subject("prepare-pi-release-pr.mjs");
  const f = await fixture(t);
  const result = await f.run(process.execPath, [
    join(root, "scripts/prepare-pi-release-pr.mjs"),
    "--preview",
    join(dirname(f.cwd), "candidate.json"),
  ]);
  assert.equal(result.code, 1);
  assert.match(result.output, /trusted|context|workflow_dispatch|manual/i);
  assert.equal(succeeds(await f.git("status", "--porcelain")), "");
});

test("preview and post-check verification bind outside-checkout metadata to checked bytes", async (t) => {
  const command = await subject("prepare-pi-release-pr.mjs");
  const transport = await subject("pi-release-github.mjs");
  const f = await fixture(t);
  const sha = succeeds(await f.git("rev-parse", "HEAD")).trim();
  const fake = github();
  const options = {
    cwd: f.cwd,
    context: { ...context, sha, workflowSha: sha },
    api: transport.githubClient("synthetic-test-token", fake.fetcher),
    metadataPath: join(dirname(f.cwd), "candidate.json"),
  };
  const preview = await command.runReleaseCommand("--preview", options);
  assert.equal(preview.hasRelease, true);
  const verified = await command.runReleaseCommand("--verify", {
    ...options,
    expectedDigest: preview.digest,
  });
  assert.equal(verified.digest, preview.digest);
  const metadata = JSON.parse(await readFile(options.metadataPath, "utf8"));
  metadata.fileChanges.additions[0].contents = "tampered";
  await writeFile(options.metadataPath, JSON.stringify(metadata));
  await assert.rejects(
    command.runReleaseCommand("--verify", { ...options, expectedDigest: preview.digest }),
    /digest/i,
  );
  assert.equal(
    fake.requests.some((r) => r.method !== "GET"),
    false,
  );
});

for (const jobName of ["validate", "open"]) {
  test(`${jobName} prepares the selected SHA without local dev even after remote dev advances`, async (t) => {
    const api = await subject("pi-release-candidate.mjs");
    const cli = createRequire(import.meta.resolve("@changesets/cli/bin.js"));
    const { parse } = createRequire(cli.resolve("@changesets/config"))("yaml");
    const workflow = parse(
      await readFile(join(root, ".github/workflows/prepare-pi-release.yml"), "utf8"),
    );
    const steps = workflow.jobs[jobName].steps;
    const prepareIndex = steps.findIndex((/** @type {any} */ step) =>
      step.run?.includes("scripts/prepare-pi-release-pr.mjs"),
    );
    assert.ok(prepareIndex > 0);
    const f = await fixture(t);
    const selected = succeeds(await f.git("rev-parse", "HEAD")).trim();
    succeeds(await f.git("update-ref", "refs/remotes/origin/main", "HEAD~1"));
    await writeFile(join(f.cwd, "later.txt"), "Later dev source must not enter this release.\n");
    await writeFile(
      join(f.cwd, ".changeset/later-note.md"),
      '---\n"@grepco/pi-lence": major\n---\n\nLater release intent.\n',
    );
    succeeds(await f.git("add", "."));
    succeeds(await f.git("commit", "-m", "Later development, after dispatch"));
    const later = succeeds(await f.git("rev-parse", "HEAD")).trim();
    succeeds(await f.git("update-ref", "refs/remotes/origin/dev", later));
    succeeds(await f.git("checkout", "--detach", selected));
    // Reproduce checkout@SHA: remote-tracking refs exist, but no local dev branch.
    succeeds(await f.git("update-ref", "-d", "refs/heads/dev", later));
    assert.notEqual((await f.git("rev-parse", "--verify", "refs/heads/dev")).code, 0);
    for (const step of steps.slice(0, prepareIndex)) {
      if (["main-base", "changesets-base"].includes(step.id))
        succeeds(await f.run("env", [`GITHUB_SHA=${selected}`, "bash", "-e", "-c", step.run]));
    }
    const preparedRelease = await api.prepareCandidate(f.cwd);
    assert.equal(preparedRelease.sourceCommit, selected);
    assert.equal(preparedRelease.targetVersion, "0.1.0");
    assert.deepEqual(preparedRelease.changesetIds, ["pi-note"]);
    assert.equal(succeeds(await f.git("rev-parse", "HEAD")).trim(), selected);
    assert.equal(succeeds(await f.git("rev-parse", "refs/heads/dev")).trim(), selected);
    assert.equal(succeeds(await f.git("rev-parse", "refs/remotes/origin/dev")).trim(), later);
    assert.equal(existsSync(join(f.cwd, "later.txt")), false);
    assert.equal(existsSync(join(f.cwd, ".changeset/later-note.md")), false);
    assert.ok(existsSync(join(f.cwd, ".changeset/herdr-note.md")));
  });
}

test("registration must be integrated into dev before either job prepares a candidate", async (t) => {
  const cli = createRequire(import.meta.resolve("@changesets/cli/bin.js"));
  const { parse } = createRequire(cli.resolve("@changesets/config"))("yaml");
  const workflow = parse(
    await readFile(join(root, ".github/workflows/prepare-pi-release.yml"), "utf8"),
  );
  const step = workflow.jobs.validate.steps.find((/** @type {any} */ s) => s.id === "main-base");
  assert.ok(step, "Missing registration/main ancestry guard");
  assert.equal(
    workflow.jobs.open.steps.find((/** @type {any} */ s) => s.id === "main-base").run,
    step.run,
  );
  const f = await fixture(t);
  succeeds(await f.git("update-ref", "refs/remotes/origin/main", "HEAD"));
  succeeds(await f.run("bash", ["-e", "-c", step.run]));
  succeeds(await f.git("checkout", "-b", "main-registration", "HEAD~1"));
  await writeFile(join(f.cwd, ".github/registration.yml"), "name: Registration\n");
  succeeds(await f.git("add", ".github/registration.yml"));
  succeeds(await f.git("commit", "-m", "Synthetic main registration"));
  succeeds(await f.git("update-ref", "refs/remotes/origin/main", "HEAD"));
  succeeds(await f.git("checkout", "dev"));
  const blocked = await f.run("bash", ["-e", "-c", step.run]);
  assert.equal(blocked.code, 1, blocked.output);
  assert.match(blocked.output, /registration/);
  succeeds(await f.git("merge", "--no-edit", "main-registration"));
  succeeds(await f.run("bash", ["-e", "-c", step.run]));
});

test("workflow is manual, gated, cache-free, and separates checked payload from write authority", async () => {
  const path = join(root, ".github/workflows/prepare-pi-release.yml");
  assert.ok(existsSync(path), "Missing manual release workflow");
  const cli = createRequire(import.meta.resolve("@changesets/cli/bin.js"));
  const { parse } = createRequire(cli.resolve("@changesets/config"))("yaml");
  const workflow = parse(await readFile(path, "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.concurrency, {
    group: "prepare-pi-lence",
    "cancel-in-progress": false,
  });
  const jobs = workflow.jobs;
  assert.deepEqual(jobs.validate.permissions, { contents: "read", "pull-requests": "read" });
  assert.deepEqual(jobs.open.permissions, { contents: "write", "pull-requests": "write" });
  assert.equal(jobs.open.needs, "validate");
  assert.match(jobs.open.if, /needs\.validate\.outputs\.has-release == 'true'/);
  for (const job of Object.values(jobs)) {
    const typed = /** @type {{steps:any[],if:string}} */ (job);
    assert.match(typed.if, /github\.repository == 'zemccartney\/agent-dev'/);
    assert.match(typed.if, /github\.ref == 'refs\/heads\/dev'/);
    const uses = typed.steps.filter((s) => s.uses);
    assert.deepEqual(
      uses.map((s) => s.uses),
      [
        "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "jdx/mise-action@2d8d4cafcbd33be2ea37d2b6f5ad595363d1f1ca",
      ],
    );
    assert.deepEqual(uses[0].with, {
      ref: "${{ github.sha }}",
      "fetch-depth": 0,
      "persist-credentials": false,
    });
    assert.equal(uses[1].with.cache, false);
    assert.equal(uses[1].with.persist_github_token, false);
    assert.ok(typed.steps.some((s) => s.run === "mise run setup"));
    const checkoutIndex = typed.steps.findIndex((s) => s.uses?.startsWith("actions/checkout@"));
    const baseIndex = typed.steps.findIndex((s) => s.id === "changesets-base");
    const prepareIndex = typed.steps.findIndex((s) =>
      s.run?.includes("scripts/prepare-pi-release-pr.mjs"),
    );
    assert.ok(checkoutIndex < baseIndex && baseIndex < prepareIndex);
  }
  const validateRuns = jobs.validate.steps.map((/** @type {any} */ s) => s.run ?? "");
  assert.ok(validateRuns.includes("mise run check"));
  assert.ok(
    validateRuns.findIndex((/** @type {string} */ r) => r.includes("--preview")) <
      validateRuns.indexOf("mise run check"),
  );
  assert.ok(
    validateRuns.findIndex((/** @type {string} */ r) => r.includes("--verify")) >
      validateRuns.indexOf("mise run check"),
  );
  const open = jobs.open.steps.find((/** @type {any} */ s) => s.run?.includes("--open"));
  assert.equal(open.env.EXPECTED_CANDIDATE_DIGEST, "${{ needs.validate.outputs.digest }}");
  const stub = parse(
    await readFile(
      join(root, ".github/workflow-templates/prepare-pi-release.registration.yml"),
      "utf8",
    ),
  );
  assert.deepEqual(stub.on, workflow.on);
  assert.deepEqual(stub.permissions, {});
  assert.equal(Object.keys(stub.jobs).length, 1);
  assert.ok(stub.jobs.registration.steps.every((/** @type {any} */ step) => !step.uses));
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.match(manifest.scripts["check:infra"], /zizmor --offline \.github\/workflows(?: |$)/);
});
