# Agentlog Review Repairs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these approved repairs with test-first verification.

**Goal:** Correct AL-01, AL-02 and AL-03 from the independent review without expanding v0.

**Architecture:** Serialize popup refresh and interaction. Treat filesystem availability as an observation, preserving durable user organization. Normalize filesystem identities in the tooling coverage test.

**Tech Stack:** Existing Node 24.15+ / TypeScript / pi-tui / SQLite / pnpm tooling; no dependency changes.

**Spec:** `/Users/enlow/proj/pi-ext/thinking/code-review-20261015T000003Z.md`, Crit session `1e9b95b10eb3`, round 3: all three fixes authorized; whole-popup loading explicitly confirmed. These decisions supersede the original cache-first interaction in the package design/plan.

## Global Constraints

- Work only in the existing `feat/herder-agentlog` worktree; no merge, push, installation or branch configuration.
- Keep recovery safe: current-namespace focus precedence, original cwd, no prompt submission, no occupied-pane replacement, no automatic splits.
- No periodic refresh, polling, cache TTL or new dependency. Preserve labels, pins, archive state and unavailable records.
- Initial/manual refresh blocks interaction until the attempt finishes; errors end loading visibly; Escape remains usable. No refresh during an editor/open/choice interaction.
- Preserve existing runtime/dependency policy, including external Node and experimental SQLite disclosure.

## Review Focus

- Input before first paint or while loading must not become a delayed action (Task 1).
- Mouse and keyboard must obey the same loading gate (Task 1).
- Refresh failure/cancellation must not trap the terminal or imply fresh data (Task 1).
- Permission loss after a successful refresh must fail Open without creating a destination (Task 2).
- A symlink-path workaround must not weaken actual compiler coverage checks (Task 3).

### Task 1: Serialize loading and popup interaction (AL-01)

**Files:** `herdr/herder-agentlog/src/{popup,ui-view}.ts`, `test/popup.test.ts`, and package `DESIGN.md`, `PLAN.md`, `README.md`, `DISCUSSION.md` where cached-interaction claims occur.

**Interfaces:** Keep `runPopup` unchanged; add `loading: boolean` to internal `ViewState`. A loading view replaces list/editor actions. Mark loading before the first input can arrive; clear it only when refresh settles. Prevent refresh during an editor, destination choice or open.

- [x] Replace the obsolete cached-interaction test with a deferred-refresh test: cached rows/actions hidden, mutation/open keys and mouse ignored, no buffered search/edit applied after completion; normal edits work afterward. Add manual refresh, changed-filter/neighbor, failure, cancellation and editor-isolation coverage.
- [x] Run `pnpm build && node --test test/popup.test.ts`; expect failures proving missing gating before code changes.
- [x] Implement the smallest loading state/view and action guards; use a visible loading message without timers. Preserve error information and reload committed cached data if refresh fails.
- [x] Update earlier UX requirements to the approved serial interaction. Run popup tests, then `pnpm check`; expect all tests passing.
- [x] Commit this task only after its checks pass.

### Task 2: Recheck access without an invented cache policy (AL-02)

**Files:** `herdr/herder-agentlog/src/discovery.ts`, `src/pi-session.ts` (permission-error clarity), `test/discovery.test.ts`, `test/resume.test.ts`; README for the access-observation contract.

**Interfaces:** Keep discovery/resume signatures and registry schema unchanged. On cache hits, check transcript readability before reporting available. Reuse parser/error classification for unreadable files where possible; never erase organization fields.

- [x] Add a real permission-loss regression: index, preserve pin/archive/label, remove read permission without changing size/mtime, refresh, assert unreadable and useful error; restore and assert recovery. Add Open-after-refresh permission loss and existing-pane focus tests.
- [x] Run `pnpm build && node --test test/discovery.test.ts test/resume.test.ts`; expect the cache-hit availability regression to fail before the fix. Existing operation-time safety may already pass; record that distinction.
- [x] Implement readability validation on cache hits; retain actual access errors, without polling or schema expansion.
- [x] Run focused tests and `pnpm check`; expect all passing. Commit this task after verification.

### Task 3: Canonicalize tooling-test file identities (AL-03)

**Files:** `herdr/herder-agentlog/test/tooling.test.ts`.

**Interfaces:** No production change. Preserve compiler coverage assertions for source, tests and build config.

- [x] Run the quality coverage test through a temporary symlink with logical `PWD`; expect the demonstrated path assertion failure before changes.
- [x] Canonicalize compiler-listed paths before comparison, and exercise the coverage check with a controlled symlink cwd so it remains a regression test.
- [x] Run the same command; expect passing from both logical and physical paths. Run `pnpm check` and the opt-in isolated live integration suite; expect all passing, no real-user configuration/pane changes.
- [x] Commit verified changes. Capture a new immutable snapshot; use one remaining targeted independent review pass for repair interactions, and return new evidence and explicit decisions to the existing Crit report.

## Execution evidence

- AL-01: four expected popup regression failures before implementation; 14/14 popup tests and 62/62 package tests afterward. Commit `13eec6b`.
- AL-02: cached permission-loss test failed with `available` instead of `unreadable`; 65/65 package tests afterward. Existing Open-time safety already passed its new tests. Commit `25218f6`.
- AL-03: controlled symlink/compiler test failed on `src/cli.ts` before canonicalization, passed afterward. Commit `e98c58b`. Full `pnpm check` also passed through a temporary symlink.
- Isolated real integration: 1/1 passing with Node 24.16.0, Herdr 0.9.3 and Pi 1.2.0, including all three shutdown/recovery orders and unchanged real-user configuration fingerprints.
- Fresh read-only follow-up reviewed immutable `e98c58b`: no consequential production defect found. Its static AL-F1 concern that the symlink regression might not exercise different spellings was adjudicated using a disposable-copy mutation: original test PASS, remove canonicalization FAIL on `src/cli.ts`, restore PASS. The regression protects the current pinned compiler; reassess when changing that toolchain.
- One targeted follow-up used, one remains in the original review budget. Human Crit review continues in session `1e9b95b10eb3`; no merge/push/install/branch configuration performed.
