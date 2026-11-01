# Supply chain at a glance

**Goal:** the package people download is the package we tested—not merely one bearing the same version number.

**Boundary:** identical bytes make test results relevant; they do not guarantee correct behavior on every host, runtime or configuration, or prove the code is safe.

## Package identity: close the testing → publication gap

```text
Normal registry integrity:
    uploaded archive ── recorded hash ── downloaded archive
                         compare bytes

Pi-lence's intended end-to-end chain:
    selected source → create archive ONCE → record SHA256 + SHA512
                              │
                              ▼
                    install/test THAT archive
                              │
                    verify hashes unchanged
                              │
                    transfer + reverify archive
                              │
             pnpm stage publish EXISTING archive
                              │
                check client's receipt integrity
                              │
            owner downloads pending stage + compares hash
                              │
                   owner approves on npm / 2FA
                              │
               download PUBLIC archive + compare hash
```

**Why:** source tests can pass while a later packaging step omits files, includes stale files or changes content. A checksum created only during upload cannot show that the uploaded archive was the one tested. No repacking occurs between our archive tests and submission.

**An unpublished version can have successive candidates.** After owner inspection/rejection of an unwanted stage, reviewed corrections may be manually staged from main with the same expected version. Each new candidate needs its own tests, digest, source/run record and stage ID; old candidate evidence is not transferable. Publication commits the version. See [the last-minute change procedure](RELEASING.md#7-last-minute-change-without-an-unnecessary-version-bump).

## Mechanisms and questions answered

| Mechanism                        | Question answered                                                           | Created / recorded where                                                                                                                 | Does **not** establish                                                          |
| -------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SHA256 checksum                  | Are these the expected archive bytes?                                       | Our packer hashes the completed `.tgz`; `release.json`, CI summary and stage receipt record it                                           | Authorship, safety, or authenticity if both file and expected hash are replaced |
| npm-compatible SHA512 integrity  | Do these bytes match the package integrity record?                          | Publishing clients calculate it automatically; npm metadata uses `dist.integrity`; lockfiles can pin it; our record/receipt also uses it | That the uploaded package was tested, unless linked to our earlier hash         |
| Legacy SHA1 checksum             | Does this match the older registry checksum?                                | npm metadata: `dist.shasum`                                                                                                              | Our preferred modern integrity check                                            |
| npm registry signature (ECDSA)   | Did npm sign this name/version/integrity association?                       | npm signs `name@version:integrity`; metadata: `dist.signatures`                                                                          | Source/workflow identity or test quality                                        |
| Sigstore provenance              | Which source/workflow identity is cryptographically bound to this artifact? | CI client signs an attestation containing the digest and source/workflow details; short-lived certificate and public transparency log    | That the workflow/code is trustworthy or its tests sufficient                   |
| GitHub OIDC / npm trust          | May this particular workflow identity submit this package?                  | GitHub issues short-lived identity tokens; npm checks configured repository/workflow/environment and allowed operations                  | Byte identity, successful tests, or human publication approval                  |
| Human staging + npm 2FA approval | Did the owner authorize this candidate, then publication?                   | Deliberate release-PR merge, or explicit version-confirmed manual main staging; later npm website approval                               | Artifact correctness without inspection                                         |

**Hash ≠ signature.** Hashes need no secret key; signatures bind data to a signing identity. SHA256 and SHA512 are different hashes of the same bytes, compared separately—not against each other. Trusted expected values are essential.

**npm does hashing automatically.** Our additional work starts the identity chain **before testing**. A client receipt is not proof of what the registry stored: downloading and comparing is a separate check.

**Sigstore timing:** our pnpm client is configured to generate signed provenance before staging upload. npm also describes a registry-generated publication attestation. Signing, registry authorization and owner publication approval are distinct operations; provenance information can be public while a stage is pending.

## Repository safeguards

| Boundary           | Control                                                                                                                                                        | Limit / interpretation                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Developer tools    | Exact mise pins; platform download checksums; GitHub attestations for configured tools                                                                         | Integrity/identity are not proof that a tool is benign                                               |
| Dependencies       | One lockfile, frozen setup, seven-day cooldown, strict publication dates, no trust downgrade, blocked exotic subdependencies, explicit dependency-build policy | Cooldown is not a malware scan; reviewed exceptions remain explicit                                  |
| CI code            | SHA-pinned actions; read-only validation; fresh staging job with narrowly scoped OIDC                                                                          | Trusted workflow/runner remains part of the security boundary                                        |
| Branch/environment | Required macOS checks + strict freshness; `npm-staging` allows only branch `main`, no administrator bypass                                                     | Linux checks are visible/advisory; ordinary dev merges do not stage                                  |
| Artifact handoff   | Source/authorization/actors/run/attempt binding, expected version for manual runs, PR/head for automatic runs, record digest and archive hashes                | Same version does not make candidates interchangeable; old schemas/attempts are rejected             |
| Submission         | Existing verified archive, fixed registry, scripts disabled, private configuration, no inherited publishing token, no automatic upload retry/replacement       | Process hygiene, not a VM; upstream signing can retry before upload within the child deadline        |
| Published state    | Bounded unauthenticated metadata GET before selection/packing/verification/submission; published target or inconclusive lookup stops                           | Snapshot, not an atomic lock; cannot discover pending stages or guarantee reuse of a removed version |
| Uncertain outcome  | Owner inspects npm before any retry                                                                                                                            | A timeout does not prove that no pending stage exists                                                |

pnpm12's lockfile contains bootstrap-tool and application YAML documents. The bootstrap policy inherits workspace age/trust settings here; mise still selects the executable. Release jobs restore no dependency/build caches.

## Test environment ≠ security sandbox

```text
real pinned Pi CLI + real installed .tgz
    + temporary HOME / Pi settings / sessions / project / caches
    + deterministic local model provider (no model credentials/calls)
    + real fixture tool execution
    + JSON/RPC/print tests and pseudo-terminal keyboard/resize tests
    → terminate owned processes → delete temporary state
```

The provider supplies repeatable responses, tool calls, failures and delays. Personal Pi configuration is not loaded. This tests actual host integration without a live model; it is not container/VM/network-enforced isolation or proof of live-provider behavior.

## Project coverage — extend this table as release routes mature

| Project          | Distribution artifact / route                               | Package-identity verification                                                         | Host evidence                                                   | Live release status                                     |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| Pi-lence         | Canonical ten-file npm `.tgz`; native npm staging via pnpm  | Implemented: test/transfer/submit checks; pending/public download comparisons planned | Pi1.3.0; Node24.22.1/22.23.4; macOS ARM64 + advisory Ubuntu x64 | Bootstrap staged; real release not yet staged/published |
| auto-caffeinator | Planned Herdr GitHub/prebuilt payload; npm manifest private | Public release-chain checks not yet established                                       | Local build/launcher/Herdr fixtures; owner human trial accepted | Separate release work remains                           |
| agentlog         | Planned Herdr GitHub/prebuilt payload; npm manifest private | Public release-chain checks not yet established                                       | Local build/CLI/fixture tests; human trial outstanding          | Separate release work remains                           |

Add new projects by naming the **actual distributed artifact**, its digest/signing records, host tests, approval boundary and remaining live checks. Do not inherit Pi-lence's release evidence by association.

## Evidence checkpoint — 2026-11-01

**Owner-confirmed npm readiness:** account 2FA enabled; organization 2FA enforced; owner is the sole `grepco` member. Owner completed live bootstrap login/staging and confirmed the bootstrap remains pending. Its saved archive matches the client receipt; temporary auth state is removed. Public version metadata independently confirms the `0.0.0-stage` placeholder. This is not real-release or OIDC evidence.

**Owner-reported trust status:** stage-only GitHub configuration saved; npm shows **Pending validation**, with first-use deadline **2026-11-03 03:40 UTC**. Owner also saved and reloaded **Require two-factor authentication and disallow tokens** at package level. Saving the configuration is not proof of live authorization.

| State                  | What we know                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented / tested   | Tooling merged to dev and deliberately applied to draft release PR6; full408 checks, exact-archive Node24/22 tests and real-client loopback submission passed               |
| Configured / read back | GitHub `npm-staging`: only Branch→main, no reviewers/wait timer, administrator bypass disabled, no secrets/variables                                                        |
| Still pending          | Trust validation/live CI OIDC/Sigstore/permission enforcement, real-release staging and download comparisons                                                                |
| Release approval       | Owner merged PR6; archive validation passed, but main-only environment rejected the PR-derived deployment before submission. No real-release stage; never approve bootstrap |

This is evidence of configuration and local/CI behavior—not a claim that live publishing has succeeded. Consult current PR/run results before acting.

## Find the details

| Topic                                | Reference                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner procedures, setup and recovery | [DEVELOPMENT.md](DEVELOPMENT.md)                                                                                                                                                                                                                                                |
| Canonical package + SHA256           | `pi/pi-lence/scripts/pack.mjs`                                                                                                                                                                                                                                                  |
| Record, SHA512 and verification      | `scripts/pi-release-stage.mjs`                                                                                                                                                                                                                                                  |
| Native client and receipt validation | `scripts/pi-release-npm.mjs` (npm registry integration; executes pnpm)                                                                                                                                                                                                          |
| Private Pi test environment/provider | `pi/pi-lence/test/helpers/host-sandbox.mjs`, `test/fixtures/host-driver.ts` within Pi-lence                                                                                                                                                                                     |
| Workflow trust boundary              | `.github/workflows/stage-pi-release.yml`                                                                                                                                                                                                                                        |
| npm explanations                     | [Provenance / Sigstore](https://docs.npmjs.com/generating-provenance-statements), [registry signatures](https://docs.npmjs.com/about-registry-signatures), [trusted publishing](https://docs.npmjs.com/trusted-publishers), [staging](https://docs.npmjs.com/staged-publishing) |

To calculate a local archive's SHA256 yourself on macOS:

```sh
shasum -a 256 ./grepco-pi-lence-0.1.0.tgz
```
