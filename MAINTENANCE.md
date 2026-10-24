# Maintenance and compatibility

These are personal-first tools shared publicly. This policy applies to Pi-lence,
auto-caffeinator and agentlog. See [DEVELOPMENT.md](DEVELOPMENT.md) for commands and
release procedures; this document records the maintenance decisions behind them.

## Personal use sets priorities

The maintainer primarily updates these projects to keep their own workflows working.
Pi and Herdr evolve quickly; publication does not create a promise to track every
upstream release, maintain old versions, support every platform, or provide fixes
on a schedule. Other compatibility is best-effort and incidental to that use.

Tests help detect breakage and make changes safer. They are not a commitment to
expand the support matrix whenever upstream adds a platform or changes an API.
Record what actually passed, including host/runtime versions and platform, instead
of treating a broad dependency range as a compatibility guarantee.

## Linux CI is evidence, not a support obligation

Pi-lence's additional Linux target is **Ubuntu 24.04 x86-64**, with Node 22.19.0
and 24.16.0. This is a selected GitHub Actions environment, not a minimum distro
requirement derived from Pi and not a promise to support all Linux distributions.
It does not establish Alpine/musl, Linux ARM64, other terminals, or older systems.
Consult the package README and linked CI results for actual verification status.

Keep these jobs as compatibility signals. Failures remain visible and must not be
reported as passes or hidden with successful skips. Triage whether a failure is:

- a general product, packaging or safety defect relevant to the maintained use;
- an infrastructure/test-harness problem; or
- a limitation specific to an incidental environment.

A Linux-specific failure does not automatically block a release or create an
obligation to repair that environment. Record the limitation and the maintainer's
disposition. Do not make Linux compatibility jobs mandatory merge checks merely
because they exist. This policy does not waive checks for the maintained workflow,
artifact integrity, safety or explicit publication approval.

## Pi's runtime is not an extra Pi-lence setup step

Pi-lence runs inside Pi and uses its runtime. A user with a compatible working Pi
installation does not need to install a second Node runtime, a compiler or pnpm
for Pi-lence.

For the currently tested **Pi 1.3.0**, the npm package declares Node `>=22.19.0`.
The shell installer also runs the Node-based application, but can arrange Node
for the user; its managed launcher can put a private Node installation on PATH.
Thus “Node is used to execute Pi” and “the user must separately install/manage
Node” are different requirements. Pi-lence retains the aligned `engines.node`
metadata as a runtime compatibility declaration, not a separate setup instruction.

Basis reviewed on 2026-10-17: the published Pi 1.3.0 package manifest/README,
[upstream installation documentation](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/quickstart.md),
and the installed managed launcher. Recheck this distinction if Pi changes its
runtime or distribution. Do not infer compatibility with alternative executable
builds merely from Node-based test results.

This does **not** remove the separate external Node prerequisite of the current
Herdr plugin launchers. Each project must describe its actual execution route;
Pi's managed runtime cannot be assumed to supply Node to unrelated Herdr processes.

## What the host tests establish

The tests reuse the repository-pinned Pi CLI executable, start fresh processes with
private homes/settings/sessions/npm state, and install the actual Pi-lence tarball
there. They do not reinstall Pi itself. Deterministic test-provider responses avoid
personal credentials and paid inference while real Pi executes tools and renders
its UI. Interactive tests use a pseudo-terminal and inspect an emulated screen.

This verifies the extension's packaged installation and host behavior. It does not
verify Pi's own installer, public npm availability, every distribution route, or
live-provider behavior. A private HOME and `--offline` are not a security/network
sandbox. Keep SDK smoke, real-host tests and human experience separately identified.

## Updating and releasing

Upgrade hosts/dependencies deliberately when useful to the maintained workflow,
not just because a newer release exists. Retain the repository's dependency review,
reproducibility and safety rules; best-effort maintenance does not bypass them.

Before enabling or using Changesets, npm trusted publishing or release automation,
walk the maintainer through the proposed configuration, distinguish versioning from
publication, rehearse without publishing, and invite preferences. Publication,
main promotion and normal-host changes remain separate approval decisions.

## Recording further concerns

Add durable concerns here with the decision, its reason, the scope/evidence behind
it, and what would justify revisiting it. Keep transient logs and task progress out
of this document. Revisit compatibility claims when the maintainer's actual setup,
a chosen host/runtime, an installation route, or the available test evidence changes.
