# TODO

## Repository infrastructure

Establish shared tooling, documentation, and release conventions for all three projects before the first public rollout; publish packages sequentially as they become ready. Pi-lence and auto-caffeinator already have a week of successful owner use; do not impose another trial period. Keep developer tooling separate from consumer prerequisites: installers must never install runtimes/package managers or alter users' shell configuration. The approved scope and current foundation tasks are in `plan.md` until distilled into maintained documentation.

- [ ] **Manage developer tools and tasks with mise.**
  - Pin/manage Node, pnpm, and repository maintenance tools.
  - Wrap package-owned build/check/test scripts rather than duplicating their logic in a task runner.
  - Keep the developer's pinned Node version separate from each plugin's documented/tested minimum runtime version; end users choose their own installation method.
- [ ] **Consolidate pnpm into a root workspace and lockfile.**
  - Move the initial Caffeinate-local supply-chain policy to the root: seven-day release cooldown, blocked exotic subdependencies, no trust downgrades, and dependency build-script approval.
  - Preserve fail-closed publication-date checks and lockfile verification; no silent policy exceptions during migration.
  - Remove superseded nested workspace/lockfile configuration deliberately, and verify effective policy for every package.
- [ ] **Share JavaScript/TypeScript quality configuration.**
  - Add a root Node-library TypeScript base configuration that individual projects can extend/override intentionally.
  - Centralize common Oxlint/Oxfmt configuration where useful; retain independent TypeScript executable checks alongside type-aware linting.
  - Keep runtime requirements, entrypoints, and package-specific build/output choices local.
  - Use an active-LTS development / supported maintenance-LTS consumer policy. Isolate core and tooling/test Node types with separate tsconfigs/projects; check core independently against its oldest supported Node API. Changing tsdown's syntax target alone does not establish runtime compatibility.
  - Keep declaration-only outputs and incremental build metadata in a disposable leading-dot directory under `node_modules` rather than cluttering source directories; regenerate before dependent checks and exclude these developer artifacts from distributions.
  - Add CI coverage that executes built output on the oldest supported runtime and other supported Node lines.
  - Use consumer-facing `engines`, explicit developer requirements (`devEngines.runtime` with error-only behavior), and `engineStrict`; do not hide the distinction in publishing overrides or adopt automatic runtime downloads.
  - For Node 22 types, the previously discussed narrow `undici-types` override is acceptable subject to compatibility and supply-chain verification; this is not approval to disable trust-downgrade protection.
- [ ] **Validate infrastructure configuration.**
  - Use zizmor for GitHub Actions security auditing; pin/manage it with mise.
  - Use taplo for TOML validation and formatting; pin/manage it with mise and apply tool-specific schema validation where available.
  - Consider actionlint for additional GitHub Actions syntax/semantic checks.
  - Audit the first release workflow before publication even if shared installation/task configuration for these tools is deferred.
- [ ] **Coordinate pre-commit and CI checks with hk.**
  - Reuse the same check implementations locally and in CI, varying scope rather than maintaining divergent command definitions.
  - Support changed-file formatting/linting where valid; run type/project-dependent checks and tests over affected packages/dependency closures, not arbitrary individual files.
  - Keep a full-repository verification path and do not rely on bypassable local hooks as the only gate.
- [ ] **Introduce Changesets for versions, changelogs, and release coordination.**
  - Publish `@grepco/pi-lence` through npm and the Herdr plugins through version-specific GitHub Releases artifacts. Changesets coordinates versions/changelogs across both channels; the Herdr workspace packages remain private to npm.
  - Use independent package versions and namespaced tags/assets; multiple packages may still be reviewed/released together.
  - Require a Changeset for release-affecting changes landing on `dev`, with explicit review of intentional non-release changes. Review the proposed package versions and changelogs before publishing.
  - Changesets describe release intent, not feature completeness or Git merge contents. Keep unfinished work on feature branches; combine automated gates with human release-readiness review.
  - Preserve explicit release approval and a clear release identity/source revision.
- [ ] **Establish the agreed public/integration branch policy.**
  - `main` is the default/public, release-aligned branch; `dev` is the integration branch.
  - Publish and verify immutable/version-specific artifacts before promoting their installer/checksum/manifest metadata to `main`.
  - Initially, promote `dev` only after reviewing all affected packages for release readiness. Independent versioning does not require a custom selective-promotion system; revisit that only if parallel package development demonstrates a need.
  - Protect release jobs with least-privilege credentials, pinned action revisions, and separation from untrusted pull-request execution.
- [ ] **Evaluate repository/package security validation.**
  - Consider Trivy, Socket, and alternatives; no tool selected yet.
  - Evaluate coverage of known dependency vulnerabilities, suspicious package/install-script behavior, leaked secrets, and release artifacts; distinguish this from GitHub Actions auditing.
  - Define actionable CI/release gates, exception review, and ongoing rescanning rather than relying only on checks at dependency installation.
  - Complement, rather than replace, pnpm's cooldown/trust policies and human review.
- [ ] **Build and verify the release/install flows for all projects.**
  - Pi-lence: TypeScript source with an explicit Pi manifest and host-provided peer dependencies, distributed as a public npm package.
  - Herdr: tsdown-built JavaScript, GitHub-hosted prebuilt artifacts, and small inspectable manifest build commands with checksums anchored in versioned repository metadata. Keep the cloned source/manifest intact; install the payload into its own runtime directory.
  - Keep normal installations independent of pnpm/compiler/build tools; declare host prerequisites prominently and fail clearly when they are absent/incompatible.
  - Verify artifacts in a clean consumer environment without developer dependencies; test install, update, failure, and removal behavior.
  - Keep release metadata out of the payload it hashes, avoid mutable `latest` downloads, and preserve the previous public release when publication fails.
  - Keep one canonical root `LICENSE` covering repository-owned packages; copy it into every independently distributed plugin/extension artifact during packaging, and verify its presence/content in artifact tests. Include any required third-party notices for bundled dependencies or embedded runtimes.
  - Before the first release, arrange fresh-context code review by another agent or agents. Author self-review is not that release gate; review lifecycle/safety and packaging/install behavior explicitly.
- [ ] **Research simpler standalone distribution for Herdr plugins.**
  - Compare the current prebuilt JS + user-installed Node approach with a native Rust implementation and Node Single Executable Applications (SEA), including tsdown's experimental `exe` support: https://tsdown.dev/options/exe.
  - Defer adopting SEA/`exe` until its stability and support policy are acceptable. Verify requirements for the pinned tool versions; current tsdown documentation requires Node >=25.7.0 to build executables. Do not install a new runtime or migrate implementations as part of this research item.
  - Understand the model: SEA packages JavaScript with a Node runtime; it does not translate application logic into Rust-like native machine code. Compare artifact size, startup, memory, update/security responsibility, and removal of the consumer Node prerequisite.
  - Investigate macOS arm64/x64 artifacts, signing/notarization, licenses/notices, embedded assets, dynamic imports, and detached child self-launch. Existing `process.execPath` + JS-entrypoint assumptions need explicit validation for a standalone executable.
  - Keep the current readable, unbundled JavaScript build. No standalone bundling/minification optimization project is planned; revisit bundling only as needed for a future executable distribution.

## Package follow-ups

- [ ] **Verify closing a caffeinated agent in a live, isolated Herdr session.**
  - Start an active lease, close/exit that agent, and verify its native assertion disappears while another agent's independent lease remains active. Cover Pi and Claude separately.
  - Existing model/helper tests and live monitor/server shutdown checks are related evidence, not a substitute for this exact acceptance case. Strengthen the combined disappearance regression so removal occurs while the agent still owns an active assertion.

- [ ] **Add proper development tooling; manage pi-lence as a full project.**
  - Set up pnpm and a project-local `tsconfig.json`.
  - Add consistent verification scripts, proper automated tests, linting, and formatting.
  - Apply the same verification standards to other projects, using tooling appropriate to each project's language.

- [ ] **Make agent messages more visually distinct in pi-lence.**
  - Assistant messages currently feel too subtle as plain text beside user messages with colored backgrounds.
  - Revisit clear, restrained markings that make speaker boundaries easier to scan.

- [ ] **Revisit the visibility of recoverable tool errors after a week of use.**
  - Shell commands often exit with an error, but the agent recovers and continues; displaying every failure may mostly add noise.
  - Treat this as an open question, not a decision to hide errors. Gather trial feedback before changing the current behavior.
  - Distinguish recovered intermediate failures from unresolved problems that require attention; keep details retrievable.

- [ ] **Explore hiding routine thinking summaries and process narration.**
  - Examples: “Checking commit signing” and “Verifying installed CLI.” These examples are model-generated thinking blocks, not tool output or pi-generated logs.
  - Pi's default Ctrl+T shortcut collapses thinking blocks; pi-lence currently leaves thinking visibility unchanged.
  - Consider a quieter presentation while preserving useful questions, decisions, warnings, and results. Ordinary assistant progress messages are a separate category from thinking blocks.
