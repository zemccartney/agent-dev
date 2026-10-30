import { verifyDigest } from "./pi-release-candidate.mjs";

const repository = "zemccartney/agent-dev";
const branch = "changeset-release/main";
const prefix = `/repos/${repository}`;
/** @typedef {{repository:string,eventName:string,ref:string,sha:string,workflowSha:string,workflowRef:string,actor:string,triggeringActor:string,serverUrl:string,apiUrl:string}} Context */
/** @typedef {(method:string,path:string,body?:unknown)=>Promise<any>} Api */
/** @param {Context} context */
export function assertTrustedContext(context) {
  if (
    context.repository !== repository ||
    context.eventName !== "workflow_dispatch" ||
    context.ref !== "refs/heads/dev" ||
    !/^[a-f0-9]{40}$/.test(context.sha) ||
    context.workflowSha !== context.sha ||
    context.workflowRef !==
      `${repository}/.github/workflows/prepare-pi-release.yml@refs/heads/dev` ||
    context.serverUrl !== "https://github.com" ||
    context.apiUrl !== "https://api.github.com" ||
    ![context.actor, context.triggeringActor].every((actor) =>
      /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(actor),
    )
  )
    throw new Error(
      "Untrusted release context: use manual workflow_dispatch from this repository's dev branch",
    );
}
class GithubFailure extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
/** No configurable host, redirects, retries, or token persistence. Tests replace only HTTP.
 * @param {string} token @param {typeof fetch} [fetcher] @returns {Api} */
export function githubClient(token, fetcher = fetch) {
  if (!token) throw new Error("GitHub job token is required");
  return async (method, path, body) => {
    if (path !== "/graphql" && !path.startsWith(`${prefix}/`) && path !== prefix)
      throw new Error("Unsupported GitHub endpoint");
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new GithubFailure(
        `GitHub ${method} ${path} failed (${response.status}); inspect any partial release branch before retrying`,
        response.status,
      );
    const data = await response.json();
    if (data.errors?.length)
      throw new GithubFailure(
        "GitHub commit rejected; release branch may have changed. Keep it for owner inspection",
        response.status,
      );
    return data;
  };
}
/** @param {Api} api */
async function candidateRef(api) {
  try {
    return await api("GET", `${prefix}/git/ref/heads/${branch}`);
  } catch (error) {
    if (error instanceof GithubFailure && error.status === 404) return null;
    throw error;
  }
}
/** Refuse any existing branch (including orphaned/closed-PR branches) or open PR on any base.
 * @param {Context} context @param {Api} api */
export async function inspectRemote(context, api) {
  assertTrustedContext(context);
  const repo = await api("GET", prefix);
  if (repo.full_name !== repository || repo.default_branch !== "main" || repo.fork !== false)
    throw new Error("Unexpected GitHub repository identity/default branch");
  for (const actor of new Set([context.actor, context.triggeringActor])) {
    const permission = await api(
      "GET",
      `${prefix}/collaborators/${encodeURIComponent(actor)}/permission`,
    );
    if (!["admin", "maintain", "write"].includes(permission.permission))
      throw new Error(`Release permission required for ${actor}`);
  }
  if (await candidateRef(api))
    throw new Error(
      `Existing release branch ${branch}; inspect it instead of refreshing. Abandonment requires an explicit owner decision`,
    );
  const prs = await api(
    "GET",
    `${prefix}/pulls?state=open&head=${encodeURIComponent(`zemccartney:${branch}`)}&per_page=1`,
  );
  if (!Array.isArray(prs) || prs.length)
    throw new Error(
      "Active release PR exists; inspect it rather than preparing another release branch",
    );
}
/** @param {import('./pi-release-candidate.mjs').Candidate} candidate @param {string} commit */
function prBody(candidate, commit) {
  return `## Prepared Pi-lence release

**Do not merge until review, current required checks, and staging readiness are complete.**
Before the first release, complete the owner-controlled environment, bootstrap and npm trust setup
in DEVELOPMENT.md. A local workflow file does not configure that access.
This draft is ready for behavioral review only after its preparation run succeeds.

- Package: @grepco/pi-lence ${candidate.targetVersion}
- Selected dev commit: \`${candidate.sourceCommit}\`
- Prepared commit: \`${commit}\`
- Version-payload SHA-256 (not an npm tarball digest): \`${candidate.digest}\`
- Consumed notes: ${candidate.changesetIds.map((id) => JSON.stringify(id)).join(", ")}

Later dev commits do not automatically update this release branch. Deliberate release fixes
are allowed, with renewed checks. Review the full diff against main, not just the version changes. Herdr source can be included; Herdr versions and separate
notes are unchanged. Only work-branch plan.md, thinking/ and .superpowers/ scratch is omitted.

GitHub may require **Approve workflows to run** for this bot-created PR's read-only CI.
That starts checks; it does not approve a release. Review CI for the actual main merge tree
and revalidate if main or this release branch changes. Do not add force updates to refresh it.

Manual merge authorizes staging only, never direct publication. The dedicated staging workflow
checks the accepted main source and exact consumer archive before submitting a pending package.
Your npm website/2FA approval is the final publication decision. On an uncertain submission,
inspect npm before retrying; CI cannot inspect, reject or replace pending stages.
Accepted versions, changelogs, note deletions and release fixes need selective back-sync to dev;
do not back-sync the scratch omissions or erase newer dev work.
`;
}
/** Create-only reservation + GitHub CAS commit. Partial failures are deliberately left for inspection.
 * @param {Context} context @param {Api} api @param {import('./pi-release-candidate.mjs').Candidate} candidate @param {string} expectedDigest */
export async function openReleasePr(context, api, candidate, expectedDigest) {
  assertTrustedContext(context);
  verifyDigest(candidate, expectedDigest);
  if (candidate.sourceCommit !== context.sha)
    throw new Error("Prepared source differs from selected workflow SHA");
  if (candidate.targetVersion === null)
    throw new Error("No Pi-lence release intent; no release branch may be created");
  await inspectRemote(context, api);
  // createRef is atomic: a candidate that appears after inspection causes422, never an update.
  await api("POST", `${prefix}/git/refs`, { ref: `refs/heads/${branch}`, sha: context.sha });
  const title = `Release @grepco/pi-lence ${candidate.targetVersion}`;
  const response = await api("POST", "/graphql", {
    query:
      "mutation PreparePiRelease($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }",
    variables: {
      input: {
        branch: { repositoryNameWithOwner: repository, branchName: branch },
        expectedHeadOid: context.sha,
        message: { headline: title },
        fileChanges: candidate.fileChanges,
      },
    },
  });
  const commit = response.data?.createCommitOnBranch?.commit?.oid;
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit))
    throw new Error("GitHub returned an invalid prepared commit; inspect the release branch");
  if ((await candidateRef(api))?.object?.sha !== commit)
    throw new Error("Release branch changed before PR creation; keep it for inspection");
  const pr = await api("POST", `${prefix}/pulls`, {
    base: "main",
    head: branch,
    title,
    body: prBody(candidate, commit),
    draft: true,
  });
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0 || pr.head?.sha !== commit)
    throw new Error(
      "GitHub PR does not match the prepared release commit; inspect it before any further action",
    );
  return { number: pr.number, url: `https://github.com/${repository}/pull/${pr.number}`, commit };
}
