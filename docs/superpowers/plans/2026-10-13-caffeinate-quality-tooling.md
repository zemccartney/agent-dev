# Caffeinate TypeScript Build and Quality Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status:** Revised for user review. Replaces the earlier `.mjs`/JSDoc proposal. No tooling dependencies have been installed and implementation has not begun.

**Goal:** Move Caffeinate to TypeScript source with a tested tsdown build and package-local quality tooling, ready for later distribution as prebuilt JavaScript.

**Architecture:** Developers use pnpm, TypeScript, tsdown, Oxlint, and Oxfmt. Consumers use supported macOS, Herdr, and their own Node installation—not pnpm or a compiler. Keep the built-in Node test runner and test the built production modules, not merely source transformations. Type-aware linting supplements a separate TypeScript executable check.

**Tech Stack:** System Node; pnpm 11; TypeScript; tsdown; Oxlint and oxlint-tsgolint; Oxfmt; `node:test`.

**Spec:** The approved direction and constraints below reflect the tooling/release discussion of 2026-10-13. Preserve the runtime behavior described in `herdr/caffeinate/docs/design.md`. The root `TODO.md` in the main checkout records deferred repository infrastructure.

## Approved Direction and Global Constraints

### Scope now

- TypeScript source, an explicit tsdown build, formatting, linting, independent typechecking, built-output tests, and clear local-build/runtime prerequisite failures.
- Keep this tooling in `herdr/caffeinate/`. No root workspace, mise, hk, Changesets setup, CI, public release automation, branch/default-branch changes, or publication in this step.
- Preserve the existing functional/UX work and live monitor/leases. Do not restart Herdr or the monitor to perform this migration.
- User revision during implementation: require Node >=24.0.0 (Node 24 LTS major baseline), aligned with Node 24 types. Do not require our exact development patch version or version manager. Caffeinate does not use SQLite.
- No runtime npm dependencies. No installer may provision Node, pnpm, Bun, Herdr, modify shell profiles, or perform global installation.

### Quality and dependency security

- Oxlint plugins: `eslint`, `typescript`, `unicorn`, `oxc`, `import`, and `node`. Explicit plugin lists replace defaults, so retain all six.
- Enable type-aware linting through `oxlint-tsgolint`; independently run `tsc --noEmit`. tsdown is a build tool, not the typechecking gate.
- Use strict TypeScript across production code, tests, scripts, and build configuration. No blanket `any`, `@ts-nocheck`, broad test exclusions, or disabling problematic rule categories to manufacture a pass.
- Pin the pnpm version and direct devDependency versions; retain a checked-in lockfile. Resolve compatible versions under the policy below rather than unconditionally installing latest tags.
- pnpm policy: `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `minimumReleaseAgeIgnoreMissingTime: false`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`, `trustLockfile: false`, `strictDepBuilds: true`, `allowBuilds: {}`.
- Do not introduce age/trust exclusions or automatically approve dependency build scripts. Report blockers instead of weakening policy.

### Distribution contract for the later packaging stage

- Herdr's native GitHub installation remains the user-facing path. GitHub Releases host versioned prebuilt JavaScript; npm publication is deferred.
- Keep a small reviewed installer in the repository. Generate the runtime artifact and pinned release metadata/checksum, not arbitrary remote installer scripts.
- Verify prerequisites during installation and again at launch. Installation errors must be actionable; host dependencies remain the user's responsibility. Git is additionally required by Herdr's GitHub installer.
- An artifact is published and verified before its matching manifest/installer metadata is promoted to the public/default `main` branch. Do not advertise missing artifacts or fetch mutable `latest` URLs.
- Keep release metadata outside the payload whose checksum it records. The release tag's checkout must contain metadata matching that release.
- `dev` is the integration branch; `main` is release-aligned. Packages have independent versions and namespaced release tags/assets. Multiple ready packages may be reviewed/released together.
- Changesets will later record release intent and generate proposed versions/changelogs. They do not filter Git merge contents or prove feature completeness. Initially rely on release-ready integration, automated gates, and review of all affected packages; do not build selective-promotion machinery prematurely.

## Future-Friendly Boundaries

- Expose ordinary package scripts: `build`, `lint`, `lint:fix`, `typecheck`, `format`, `format:check`, `test`, `test:integration`, and `check`. Future mise/hk/CI should reuse these implementations.
- Prefer Node's standard module resolution over custom runtime loaders or root-specific filesystem assumptions.
- Keep runtime requirements/package entrypoints local. Later extract shared TypeScript/lint/format settings and deliberately replace the nested pnpm workspace/lockfile with root equivalents.
- Keep check implementations separate from future file-selection policy. Project-wide type checking and dependent tests cannot safely be reduced to arbitrary changed-file lists.
- Preserve `node:test`; no new testing framework is needed.

## Review Focus

1. Generated paths break detached monitor launch, dynamic imports, or test fixtures: verify real built entrypoints and child launches from outside the package working directory.
2. Tests accidentally execute TypeScript source while consumers receive different JavaScript: ensure test runtime imports resolve to `dist/`, with an isolated consumer smoke test that has no source or node_modules.
3. Missing/old Node produces a cryptic parser/module error before diagnostics: keep the host launcher and version check small and compatible with older Node syntax; test missing and incompatible runtime cases before loading built code.
4. Security policy, compiler coverage, or type-aware rules are silently inactive: inspect effective pnpm settings and use isolated negative checker canaries; never inject broken files into the checkout.
5. The existing linked trial stops working during cutover: build before changing execution paths, preserve a temporary compatibility entrypoint for the cached manifest, and leave the running monitor and IPC contract intact.

## File Structure

Paths below are relative to `herdr/caffeinate/`.

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`: package-local toolchain, scripts, security, generated-artifact exclusions.
- `.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig.json`, `tsdown.config.ts`: lint, formatting, strict independent type checking, and ESM build.
- `src/*.ts`: migrated production modules, retaining their responsibilities and public behavior. Declare shared types only where contracts cross module boundaries.
- `dist/*.js`: generated runtime output; not hand-edited or committed as ordinary source in this step.
- `test/*.test.ts`, `test/fixtures/runtime-child.ts`, `scripts/probe-*.ts`: migrated tests, fixture, and developer probes.
- `scripts/check-node.cjs`, `scripts/run.sh`: minimal compatibility/preflight glue; production application logic remains TypeScript.
- `src/main.mjs`: temporary forwarding compatibility entrypoint for the already-linked trial; not the new application implementation.
- `herdr-plugin.toml`: entrypoints routed through the validated built launcher once the output is verified.
- `test/tooling.test.ts`, `test/launcher.test.ts`, `test/build.test.ts`: configuration/canary, prerequisite, and built-consumer regression coverage.
- `README.md`, `docs/demo.md`, `docs/validation.md`: distinguish contributor builds from consumer requirements, update commands, record exact evidence.

## Task 1: Establish the secure local toolchain

**Produces:** locked developer dependencies and independently invokable lint/typecheck/format/build commands, with the requested policies demonstrably active.

- [ ] Capture the current `node --test test/*.test.mjs` baseline. Preserve all existing uncommitted UX work; do not clean/reset this worktree.
- [ ] Add tooling contract tests for the explicit security settings, six-plugin list, type-aware mode, strict/noEmit TypeScript coverage, independent `tsc` command, and absence of runtime dependencies. Demonstrate failure on missing configuration before adding it.
- [ ] Create the package-local pnpm policy before installing dependencies. Pin a compatible package-manager version. Inspect only the relevant effective settings, not unrelated global registry credentials.
- [ ] Install exact cooldown-eligible compatible versions of `typescript`, `tsdown`, `@types/node@22`, `oxlint`, `oxlint-tsgolint`, and `oxfmt`. Resolve/inspect failures without bypassing supply-chain protections.
- [ ] Configure strict TypeScript with NodeNext module resolution, ES2023 target, Node types, and no emit. Cover source, tests, scripts, and build config. Include/check the minimal JS preflight/compatibility glue rather than broadly adopting checked-JS application code.
- [ ] Configure Oxlint's six plugins, correctness errors, explicit `typescript/no-floating-promises` and `typescript/no-misused-promises` errors, type-aware mode, and failure on warnings.
- [ ] Configure Oxfmt without introducing import reordering. Ignore generated output and lock/dependency artifacts, not ordinary source/config/docs.
- [ ] Define package scripts. `check` runs non-fixing checks and the regression tests; `test` builds the current runtime before invoking Node's test runner. Existing real-OS probes remain separately opt-in.
- [ ] Verify the contract tests and `pnpm install --frozen-lockfile`. Record initial lint/type diagnostics; do not weaken coverage to hide migration work.

## Task 2: Migrate to TypeScript and exercise the actual build

**Consumes:** Task 1's toolchain.

**Produces:** typed source, stable runnable ESM output, and the existing behavioral tests running against built production modules.

- [ ] Add a build smoke test that expects `dist/main.js` and production modules to exist and `node dist/main.js --help` to work without a Herdr connection; demonstrate failure before implementing the build.
- [ ] Use tsdown with explicit ESM/Node output, stable `.js` names, `root: src`, and unbundle mode over the production entrypoints. Preserve the module layout so `import.meta.url`-relative child entrypoints do not unexpectedly move into shared chunks. Do not bundle Node built-ins or a Node runtime.
- [ ] Migrate production `.mjs` modules to `.ts`, using Node-compatible relative `.js` import specifiers. Type model states/events, observations/commands, monitor snapshots, injected ports, and popup I/O. Treat untrusted JSON/errors as `unknown` and narrow at the boundary.
- [ ] Update detached monitor and dynamic-import paths to the built layout; explicitly test built child execution. Keep IPC messages, lease state transitions, power behavior, and native assertion arguments unchanged.
- [ ] Migrate tests/developer probes to TypeScript while retaining `node:test`. Use a package-internal Node `imports` mapping such as `#caffeinate/*`, with a `types` condition pointing to source and the normal runtime condition pointing to `dist/*.js`. This lets TypeScript inspect source contracts while tests execute the built modules without a custom loader.
- [ ] Use Node's native TypeScript stripping for the developer test/probe files, with erasable TypeScript syntax enforced. `pnpm test` builds first, then invokes `node --test test/*.test.ts`. Migrate dynamic fixture paths and verify them under the supported Node baseline; consumers never execute these `.ts` files.
- [ ] Add an assertion that runtime test imports resolve to `dist/`, not `src/`. Add a clean temporary consumer-layout smoke test containing only the required built runtime/package metadata: no source, TypeScript, pnpm, or node_modules may be needed to run the built help entrypoint.
- [ ] Apply formatting and resolve lint/type errors without changing semantics. Any discovered behavioral defect gets its own failing regression before a fix; avoid broad casts/suppressions.
- [ ] Verify TypeScript's file list covers all owned source/test/script/config files. Use isolated temporary projects inheriting the real configuration for negative canaries: a deliberate assignment error must fail TypeScript; an unhandled Promise must trigger the actual type-aware Oxlint rule; handled/correct variants must pass. Clean fixtures in `finally` and never execute deliberately broken code.

## Task 3: Guard host prerequisites and finish the local cutover

**Consumes:** Task 2's verified distribution layout.

**Produces:** clear prerequisite/build errors, working manifest launch commands, and a documented development workflow ready for later release packaging.

- [ ] Write failing launcher tests for missing Node, versions below 24.0.0, accepted version boundaries, and missing built output. Assert actionable stderr, nonzero exit, and no attempt to install dependencies or launch the monitor on failure.
- [ ] Implement a small POSIX launcher and old-syntax-compatible Node version check. Resolve the user's Node from the launch environment, report the required/found version, validate output existence, then `exec` the built entrypoint with arguments preserved. Do not source shell profiles, choose a version manager, or install anything.
- [ ] Use the same Node floor for developer build preflight and runtime launch. Developer compilation must not require a running Herdr server; later installation will also validate supported host OS/Herdr requirements. Keep build-time tool requirements out of consumer runtime checks.
- [ ] Retain a minimal forwarding `src/main.mjs` for the currently cached manifest while moving manifest entrypoints to the built launcher. Verify both paths after the build exists; do not automatically restart/relink the user's live server or discard its monitor state.
- [ ] Test launches from an unrelated cwd, safe argument forwarding, and the standalone consumer layout. Test dependency/parser-version failures before loading application output, and ensure failures never acquire an OS assertion.
- [ ] Put consumer prerequisites prominently in the README, separately from developer setup. Document `pnpm install --frozen-lockfile`, build/check/test commands, native test-runner output, and the temporary compatibility entrypoint. Do not advertise an unimplemented public installer or release URL.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:integration`, built help/launcher smoke tests, and `git diff --check`. Record test counts, installed tool versions, tested Node versions, and limitations honestly. Do not claim the minimum Node version was exercised if only the system Node was available.
- [ ] Hand off for review. Actual release workflow, artifact packing/downloading/checksum verification, install/update/uninstall acceptance, Changesets, branch promotion, and publication remain the subsequent packaging stage.

## References and Deferred Work

- https://pnpm.io/supply-chain-security
- https://pnpm.io/settings/dependency-resolution
- https://pnpm.io/settings/build
- https://oxc.rs/docs/guide/usage/linter/plugins.html
- https://oxc.rs/docs/guide/usage/linter/type-aware.html
- https://oxc.rs/docs/guide/usage/formatter.html
- https://tsdown.dev/options/unbundle

Root `TODO.md` records future mise, shared pnpm/TypeScript/quality configuration, hk/CI alignment, Changesets, zizmor, taplo, and evaluation of security tools such as Trivy or Socket. Security scanning is not a substitute for release-readiness judgment, and no particular scanner is selected yet.
