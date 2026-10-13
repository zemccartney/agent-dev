# herder-agentlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local Herdr popup that finds, organizes, and safely reopens saved Pi conversations after ordinary closure or restart.

**Architecture:** Pi JSONL files remain authoritative for conversations. Short Herdr hooks remember session paths; on-demand refresh combines those paths with known storage roots into a SQLite catalog whose user-owned pin/archive/label fields survive reindexing. The popup reads current Herdr state before navigating or launching.

**Tech Stack:** TypeScript, Node 24+, built-in `node:sqlite`, standalone `@earendil-works/pi-tui@1.1.0`, TypeScript 5.9.3, `@types/node@24.10.1`, Node's test runner; `@xterm/headless@5.5.0` for terminal tests only.

**Spec:** [DESIGN.md](DESIGN.md), at `herdr/herder-agentlog/DESIGN.md`. Also read [DISCUSSION.md](DISCUSSION.md) and [FOLLOW-UPS.md](FOLLOW-UPS.md).

## Global Constraints

- Target macOS first, Herdr 0.9.3 and Pi 1.1.0; separately installed Node 24+.
- **Do not bundle a JavaScript runtime.** No daemon, Pi extension, plugin-initiated model calls, or network service.
- **No startup toast, attachment polling, or startup hook in v0.** Loading, refreshing, and errors belong inside the popup.
- **Recency is the latest submitted user-message timestamp only.** Never update it for opening, viewing, importing, or background output.
- Closing agents/panes never removes records; no automatic pruning or transcript deletion.
- Pins sort first; Archive retains pins and does not stop processes; successful Open unarchives.
- Registry labels do not rename native sessions. Exact editor explanation: “Registry only — does not rename the Pi session.”
- Resume the same conversation in its original cwd, never an invented directory or occupied pane. “Open here” covers only the current Herdr namespace.
- Respect existing work. Do not modify root tooling, another plugin, Pi transcripts, user configuration, or shared `GLOSSARY.md` during implementation without a specific need/approval.
- Use an isolated git worktree at execution time. Integration tests isolate Herdr's **global plugin registry**, not just session names.

## Review Focus

Each concern has tests assigned below; these are ordinary correctness boundaries, not invitations to build defensive subsystems.

1. **Paths/names with spaces, apostrophes, Unicode, or terminal escapes:** preserve real paths, pass argv safely, and never render data as terminal commands — Tasks 1, 3, 5, 6.
2. **A live transcript with an incomplete final write, followed by disappearance:** preserve last good metadata and user edits, retry unfinished scans, and show unavailable rather than delete — Tasks 1, 2, 4.
3. **Pin/label/archive changes during reindexing or filtered selection:** keep user fields and stable selected identity, so an action never edits the neighboring row — Tasks 2, 4, 6.
4. **A matching pane is restoring, blocked, or no longer an agent:** do not start a duplicate, send approval input, or blindly retry an ambiguous launch — Tasks 3, 5, 7.
5. **Popup closes/resizes during slow refresh or a launch wait:** remain responsive, restore terminal input, and never kill the user's agent or perform late focus changes — Tasks 4, 5, 6, 7.

---

## Layout and package decisions

All paths below are relative to **`herdr/herder-agentlog/`**. Commands run from that directory unless explicitly prefixed with a repository-root path.

| Files | Responsibility |
|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `.gitignore` | Package-local, reproducible development/build; ignore `node_modules/`, `dist/`, test artifacts |
| `src/model.ts`, `src/pi-session.ts` | Shared session metadata and streaming, read-only Pi adapter |
| `src/store.ts`, `src/catalog.ts` | SQLite persistence; pure filtering, ordering, and display-text sanitization |
| `src/herdr.ts`, `src/capture.ts` | CLI transport/DTO normalization; small lifecycle path-capture operation |
| `src/discovery.ts` | Known-root discovery, changed-file refresh, availability/error reporting |
| `src/resume.ts` | Existing-pane selection and new-session launch workflow |
| `src/ui-view.ts`, `src/popup.ts` | pi-tui components and async popup/controller lifecycle |
| `src/cli.ts`, `herdr-plugin.toml` | Three commands: `sessions` opens the popup, `ui` runs it, `capture` processes one event |
| `test/*.test.ts`, `test/helpers/` | Deterministic unit/component tests and fixtures |
| `test/integration/herdr.test.ts`, `test/helpers/herdr-sandbox.ts` | Opt-in live Herdr/Pi tests, private fixture state, cleanup |
| `README.md` | Honest prerequisites, local setup, optional binding, usage, limitations, verification |

Use package-local **npm scripts/lockfile** for this first implementation: npm comes with the required Node; the current pnpm shim has no installed backing tool. This is not a root-tooling decision. Standard scripts and a standalone package keep a later pnpm workspace migration straightforward. Do not install pnpm/mise/linters globally as a side effect.

Use ESM and compile to `dist/` with `tsc`, not a bundler. Tests execute source TypeScript with Node 24 type stripping. Source imports may end in `.ts`; build with `rewriteRelativeImportExtensions: true`. No enums or parameter properties requiring runtime TS transformation. `tsconfig.json`: strict, NodeNext module/resolution, ES2023 target, `noEmit`, `allowImportingTsExtensions`, include source/tests. Build config overrides emission, uses `rootDir: src`, `outDir: dist`, and excludes tests.

Scripts: `test = node --test test/*.test.ts`; `typecheck = tsc --noEmit`; `build = tsc -p tsconfig.build.json`; `check = npm run typecheck && npm test`; `test:integration = node --test --test-concurrency=1 test/integration/*.test.ts`. Pin dependencies above and commit the generated lockfile. No Vitest/bats/root lint migration in this task.

### Verified planning facts

- pi-tui 1.1.0 is published and provides standalone `ProcessTerminal`, `TuiAltScreen`, `Input`, `SelectList`, layout/mouse helpers, and width-aware rendering. Do **not** import Pi's agent SDK or use `ctx.ui`; this is a separate terminal process inside a Herdr popup.
- `SelectList` has `setSelectedIndex` but no `setItems`: recreate it when rows change and preserve the selected record key. `Input` has no documented `onChange`; wrap/forward input and compare `getValue()` before/after.
- Herdr `WorkspaceInfo` has no ordinary cwd field. Match workspaces using their panes' `cwd` or a worktree's `checkout_path`, not display labels or `foreground_cwd`.
- `pane.updated` is not a manifest hook. `pane.agent_detected` and `pane.agent_status_changed` are allowed; events contain `data.pane_id` but not the saved session reference, so query the pane.
- The manifest supports `placement = "popup"`; open its entrypoint **without** the CLI placement override, which does not advertise popup in this version.
- Focus a live agent with `herdr agent focus <pane-id>`. `herdr pane focus` is directional, not an arbitrary-pane selector; pending references are deliberately not focused through it.
- `/usr/bin/script -q /dev/null <command> ...` was verified to provide a PTY on this Mac. Use it for live tests instead of adding `node-pty`, Python scripts, or a native-addon build requirement.
- Reference source/docs: [Herdr v0.9.3 index](https://herdr.dev/llms.txt), installed pi-tui README/types, and Pi's `docs/session-format.md`, `docs/sessions.md`, `docs/settings.md`. Resolve Pi docs through the installed package, not a hardcoded user path.

## Task 1: Read saved Pi metadata without changing it

**Files:** create package/config files above, `src/model.ts`, `src/pi-session.ts`, `test/parser.test.ts`, `test/helpers/fixtures.ts`.

**Interfaces produced:**

```ts
type SessionMeta = {
  harness: 'pi'; sessionId: string; sessionPath: string; cwd: string;
  nativeName: string | null; excerpt: string | null; lastUserAt: number | null;
};
type FileStamp = { size: number; mtimeMs: number };
type ReadPiResult =
  | { ok: true; meta: SessionMeta; stamp: FileStamp; cacheable: boolean }
  | { ok: false; path: string; code: 'missing-file' | 'unreadable' | 'invalid'; message: string };
readPiSession(path: string, signal?: AbortSignal): Promise<ReadPiResult>;
```

`makeFixture(t, options?)` in test helpers returns `{root, cwd, file}` and registers cleanup with `t.after`. Options: `userTimes?: number[]`, `assistantTime?: number`, `nativeNames?: string[]`, `cwdName?: string`, `userContent?: string | Array<{type: string; text?: string}>`. Defaults: user timestamps `[1000, 3000]`, assistant timestamp `9999`, native names `['Old', 'Current']`, first text `First prompt`. Headers/entries are valid Pi v3 JSONL; also support a header/custom-message-only fixture with `userTimes: []`.

- [ ] **1. Establish package-local scripts/configuration and fixture helper** as specified above. Initially only TypeScript and Node types are dev dependencies.
- [ ] **2. Install those local dependencies:** `npm install --ignore-scripts`. Expect a local lockfile and no changes outside this package.
- [ ] **3. Write failing parser tests**, beginning with `reads the latest user timestamp without rewriting the transcript`. Save `originalBytes` before reading; assert:

```ts
const { file, cwd } = await makeFixture(t);
const r = await readPiSession(file);
assert.ok(r.ok);
assert.equal(r.meta.cwd, cwd);
assert.equal(r.meta.nativeName, 'Current');
assert.equal(r.meta.lastUserAt, 3000); // not assistant activity or mtime
assert.equal(r.meta.excerpt, 'First prompt');
assert.equal((await readFile(file, 'utf8')), originalBytes);
```

Add named cases: string/array user content; no-user timestamp is null; metadata across branches uses maximum valid user-message timestamp; spaces/apostrophes in cwd survive; latest session name wins; incomplete trailing JSON has `cacheable:false`; malformed complete lines return invalid; missing/unreadable files produce explicit errors; aborted read rejects with AbortError.

- [ ] **4. Run red:** `node --test test/parser.test.ts`. Expect missing adapter/export before implementation, then assertion failures rather than fixture mistakes.
- [ ] **5. Implement the adapter.** Stream JSONL, use the header's absolute cwd and ID, canonicalize existing file paths, and retain at most 120 Unicode code points of the first user text as fallback. Ignore irrelevant entry types. Re-stat after parsing; changed files and incomplete tails are not cacheable. Never use file mtime as conversation recency or write to source files.
- [ ] **6. Run green:** `npm run check && npm run build`. All parser tests and strict compilation pass.
- [ ] **7. Commit:** `feat(agentlog): read Pi session metadata` — stage only this task's package files, source, and tests.

## Task 2: Persist user choices and query the catalog

**Files:** create `src/store.ts`, `src/catalog.ts`, `test/store.test.ts`, `test/catalog.test.ts`.

**Consumes:** Task 1 metadata/stamps.

**Produces:** `SessionKey = string`, stable `sessionKey(meta) = 'pi:' + canonicalPath`; `Availability = 'available' | 'missing-file' | 'missing-directory' | 'unreadable' | 'invalid'`.

`SessionRecord` extends metadata with `key`, `stamp: FileStamp|null`, `pinned`, `archived`, `labelOverride:string|null`, `availability`, and `error:string|null`.

`openStore(stateDir:string): RegistryStore` exposes synchronous `list()`, `get(key)`, `upsert(meta, stamp)`, `setPinned(key,value)`, `setArchived(key,value)`, `setLabel(key,string|null)`, `setAvailability(key,status,error)`, `rememberPath(absolutePath)`, `knownPaths()`, and `close()`. `get(key)` returns a SessionRecord or throws for an unknown key; edits likewise fail clearly for unknown keys. `queryCatalog(records,{query:string,archived:boolean}): SessionRecord[]`; `displayTitle(record):string`; `safeDisplay(text):string` strip terminal escapes/control characters for presentation only.

- [ ] **1. Write failing persistence/query tests**, beginning with `reindexing preserves committed user choices`:

```ts
store.upsert(meta, stamp);
store.setPinned(key, true); store.setArchived(key, true); store.setLabel(key, 'My label');
store.upsert({ ...meta, lastUserAt: 4000, nativeName: 'Renamed in Pi' }, nextStamp);
assert.equal(store.get(key).labelOverride, 'My label');
assert.equal(store.get(key).pinned, true); assert.equal(store.get(key).archived, true);
assert.equal(queryCatalog(store.list(), { query: '', archived: false }).length, 0);
```

Also assert persistence after close/reopen; empty labels clear overrides; native-name/excerpt/short-ID fallback; pins then user timestamp descending, nulls last within each pin group, stable key tie-break; case-insensitive AND matching of whitespace-separated terms across override/native title/excerpt/cwd; no transcript-body search; archive preserves pins. A separate SQLite connection holding a write lock must make an edit fail, not falsely acknowledge it or erase existing data.

- [ ] **2. Run red:** `node --test test/store.test.ts test/catalog.test.ts`.
- [ ] **3. Implement `agentlog.sqlite3` and catalog helpers.** Use schema version 1, separate source/user columns and remembered-path storage; atomic upserts update only source fields. Set `journal_mode=DELETE`, `synchronous=FULL`, `busy_timeout=2000`; private state directory 0700/file 0600. Reject unsupported newer schemas without resetting them. No delete/prune API. Strip ANSI/control sequences from displayed values, never from real filesystem paths or API argv.
- [ ] **4. Run green:** `npm run check && npm run build`; close/reopen and contention tests pass using real temporary SQLite files.
- [ ] **5. Commit:** `feat(agentlog): persist registry choices and catalog ordering`.

## Task 3: Add a current-namespace Herdr bridge and path capture

**Files:** create `src/herdr.ts`, `src/capture.ts`, `test/herdr.test.ts`, `test/helpers/fake-herdr.ts`.

**Consumes:** `RegistryStore.rememberPath`.

**Produces:** normalized `Pane` with `paneId`, `workspaceId`, `tabId`, `cwd:string|null`, `agent:string|null`, `session:{agent:string;kind:'path'|'id';value:string}|null`; `Workspace` with `workspaceId` and optional `checkoutPath`; `HerdrState={panes:Pane[];workspaces:Workspace[]}`. Unknown response fields are ignored, required identifiers validated.

`HerdrClient` methods: `state(signal?):Promise<HerdrState>`, `pane(id,signal?):Promise<Pane>`, `createDestination(cwd,workspaceId?,signal?):Promise<Pane>`, `startPi(paneId,sessionPath,internalName,signal?):Promise<void>`, `focus(paneId,signal?):Promise<void>`, `openPopup(signal?):Promise<void>`.

`createHerdrClient(env:NodeJS.ProcessEnv, exec?:Exec):HerdrClient`. `Exec` accepts executable, readonly argv, and `{env,signal?,timeout,maxBuffer}` and returns stdout/stderr. Default uses `execFile`, never a shell. `captureEvent(eventJson:string, client:HerdrClient, store:RegistryStore):Promise<void>`.

Test helper `makeFakeHerdr(initial:HerdrState)` returns `{api:HerdrClient, startedPaths:string[], createdCwds:string[], calls:Array<{method:string,args:unknown[]}>, setState(state:HerdrState):void}`; tests can override methods for errors or deferred results.

- [ ] **1. Write failing bridge/capture tests.** Begin with `session paths remain one argv element`: record calls in the injected Exec and assert `assert.deepEqual(execCalls[0].args.slice(-3), ['--', '--session', "/tmp/Alice's work/session.jsonl"])`. Assert exact commands for pane/workspace list/get, workspace/tab creation with explicit cwd and `--no-focus`, `agent start <generated-name> --kind pi --pane <id> --timeout 30000 -- --session <path>`, `agent focus <pane-id>`, and popup entrypoint. A path like `/tmp/Alice's work/session.jsonl` must be exactly one argv element. Preserve API error codes from JSON stderr. A capture event must query `data.pane_id`, never whichever pane is focused, and remember only absolute Pi path references. Exit/missing panes and ID-only/other-agent references do not delete anything.
- [ ] **2. Run red:** `node --test test/herdr.test.ts`.
- [ ] **3. Implement transport and capture.** Require plugin-supplied `HERDR_BIN_PATH`/`HERDR_SOCKET_PATH`; preserve that namespace and never attach/start a server. Use 5-second reads and 35-second client timeouts for managed launch (Herdr's own launch timeout remains 30 seconds), bounded output, and AbortSignal. `openPopup` calls `plugin pane open --plugin herder-agentlog --entrypoint registry --focus` with **no placement override**. Decode documented `.result.panes`, `.result.workspaces`, `.result.pane`, and creation `.result.root_pane`; do not invent a workspace cwd field.
- [ ] **4. Run green:** `npm run check`. Mocked command errors, captures, and hostile-looking argv all pass; no live namespace was contacted.
- [ ] **5. Commit:** `feat(agentlog): add scoped Herdr transport and path capture`.

## Task 4: Refresh from disk without overwriting user intent

**Files:** create `src/discovery.ts`, `test/discovery.test.ts`; extend `test/helpers/fixtures.ts` with `appendUserMessage(file:string,timestamp:number):Promise<void>` for synthetic JSONL fixtures.

**Consumes:** parser, store, normalized Herdr state.

**Produces:** `DiscoveryContext={home:string;env:NodeJS.ProcessEnv;projectCwds:string[];livePaths:string[]}`; `discoverSources(context,knownPaths:string[]):Promise<{files:string[];issues:string[]}>`; `refreshCatalog(store,context,signal?):Promise<{records:SessionRecord[];issues:string[]}>`.

- [ ] **1. Write failing discovery tests**, beginning with `refresh advances user recency but retains labels and pins`, plus tests for default and alternative agent-directory sessions; absolute environment/global-settings `sessionDir`; relative settings resolved against known project cwd, not plugin cwd; explicitly remembered outside paths; existing sessions never previously running in Herdr. No traversal outside known roots or following directory symlinks into arbitrary trees. Opening/importing must not modify lastUserAt.

```ts
store.setPinned(key, true); store.setLabel(key, 'Keep');
await appendUserMessage(file, 5000); // fixture helper, writes only synthetic files
await refreshCatalog(store, context);
assert.equal(store.get(key).lastUserAt, 5000);
assert.equal(store.get(key).labelOverride, 'Keep');
assert.equal(store.get(key).pinned, true);
await unlink(file); await refreshCatalog(store, context);
assert.equal(store.get(key).availability, 'missing-file');
```

Add: unchanged files skip parsing; unfinished tails and parse errors remain retryable; a failed scan retains prior metadata; absent cwd is distinguished from absent file; abort after one completed file preserves prior commits; a concurrent user edit survives refresh. A large synthetic transcript must allow a scheduled UI/timer callback and cancellation before the whole scan completes.

- [ ] **2. Run red:** `node --test test/discovery.test.ts`.
- [ ] **3. Implement bounded-root refresh.** Remember current `livePaths` before scanning, including references whose files do not exist yet. Discover `.jsonl` files only within known roots plus explicit paths. Read global Pi settings as data, never execute config. Derive known project cwds from stored records and current pane cwds. Include both historic default roots and visible overrides. Use fingerprints only after complete, stable reads; recheck availability even for cached files. Commit per file, yield between batches, and check cancellation before DB writes. Keep issue messages concise; do not log transcript content. New invalid files yield issues, not fabricated session identities.
- [ ] **4. Run green:** `npm run check && npm run build`.
- [ ] **5. Commit:** `feat(agentlog): refresh saved conversations on demand`.

## Task 5: Focus or resume exactly the selected conversation

**Files:** create `src/resume.ts`, `test/resume.test.ts`.

**Consumes:** `SessionRecord`, `RegistryStore`, `HerdrClient`.

**Produces:** `OpenResult = {kind:'opened';paneId:string} | {kind:'choose';panes:Pane[]} | {kind:'pending';panes:Pane[]} | {kind:'error';message:string;paneId?:string}`; `openSession(key:SessionKey,deps:{store:RegistryStore;herdr:HerdrClient},options?:{paneId?:string;signal?:AbortSignal}):Promise<OpenResult>`.

- [ ] **1. Write failing workflow tests**, beginning with `closed session resumes in its original cwd and unarchives only after focus`: matching paths/IDs focus existing agents and never call start; multiple matches return choices and require a fresh match check after selection; saved references with no ready agent return pending, never start. Check a live match before rejecting a missing file/cwd: a still-running process may remain visitable. Closed-session missing paths create no destination. Workspace matching uses exact canonical pane cwd/worktree checkout; zero or multiple matching workspaces create a new one. Existing unique match creates one new tab.

```ts
const outcome = await openSession(key, { store, herdr: fake.api });
assert.equal(outcome.kind, 'opened');
assert.deepEqual(fake.startedPaths, [record.sessionPath]);
assert.equal(fake.createdCwds[0], record.cwd);
assert.equal(store.get(key).archived, false);
assert.equal(store.get(key).lastUserAt, previousLastUserAt);
```

Also test wrong/missing post-launch reference, blocked startup, timeout, vanished destination, and focus failure: retain archive state, return destination/error, never retry launch or send prompts. Cancellation must not kill Pi or perform a later focus/unarchive.
- [ ] **2. Run red:** `node --test test/resume.test.ts`.
- [ ] **3. Implement the workflow.** Read live state at click time. Compare canonical paths, or exact native IDs only when unambiguously resolved. Verify closed-session paths, create a no-focus destination, generate `agentlog-<12 hex chars>` as an internal name, and invoke managed start. Re-read and confirm the expected reference before focusing. Commit unarchive only after success. Abort CLI waits, not server/agent processes; an already-accepted request may still have launched Pi, so return without blind retry. Leave created destinations intact on failure.
- [ ] **4. Run green:** `npm run check && npm run build`.
- [ ] **5. Commit:** `feat(agentlog): focus or resume saved Pi conversations`.

## Task 6: Build the responsive popup on pi-tui

**Files:** create `src/ui-view.ts`, `src/popup.ts`, `test/popup.test.ts`, `test/helpers/terminal.ts`; modify package metadata/lockfile for pi-tui and test-only xterm.

**Consumes:** catalog helpers, store, refresh, Herdr bridge, `openSession`.

**Produces:** `runPopup({store,herdr,context,terminal?,signal?}):Promise<void>`; injected terminal implements pi-tui's `Terminal`. Keep UI state/view internal to these two files; no second public state-machine framework. Test helper `makeTestTerminal({columns:number,rows:number})` returns `{terminal:Terminal, send(data:string):void, resize(columns:number,rows:number):void, frame():string, waitFor(text:string):Promise<void>, stopped:boolean}`. It wraps xterm's headless parser, records frames, feeds keys/mouse, and simulates resize. Do not import an unexported pi-tui `VirtualTerminal`.

- [ ] **1. Write failing component/lifecycle tests.** Begin with `Escape stops a loading popup`: start `const done = runPopup({...deps, terminal:screen.terminal})`, `await screen.waitFor('Loading sessions…')`, `screen.send('\u001b')`, `await done`, then `assert.equal(screen.stopped, true)`. Assert initial `Loading sessions…`, cached `Refreshing…`, error presentation, search across native/override/project fields, archived filter, keyboard/mouse activation of all four actions, and exact label disclaimer. Rows without user messages say exactly “No submissions.” Pin/label/archive changes persist before reflecting success. Filter/refresh selection stays attached to a SessionKey, not a shifting numeric index. Closing during refresh aborts work and stops the terminal; Open closes only after success; pending/errors/duplicate choices remain actionable.

For terminal correctness, assert rendered visible widths at 40/80/120 columns, emoji/combining characters and ANSI-looking labels, resize during selection, and Escape from a label editor cancelling only that editor before a second Escape closes the popup.
- [ ] **2. Run red:** `node --test test/popup.test.ts` before implementing the popup.
- [ ] **3. Add exact dependencies:** runtime pi-tui 1.1.0; dev-only xterm/headless 5.5.0; run `npm install --ignore-scripts` locally.
- [ ] **4. Implement standalone `TuiAltScreen` + `ProcessTerminal`.** Use Input, SelectList, MouseRegion, layout and width helpers; default terminal palette, no Pi-agent theme/SDK. Keep a fixed search/header/footer and a bounded list. Recreate the list on data/size changes, preserving selected key. Show full selected path in a detail line if truncated. Forward keyboard input to the existing Input and compare values rather than assigning nonexistent `onChange`.

Keyboard: printable input searches; Up/Down navigate; Enter opens; Tab toggles Saved/Archived; Ctrl+P pin, Ctrl+L label, Ctrl+X archive/unarchive, Ctrl+R refresh; Esc/Ctrl+C close (or cancel the label/duplicate-choice subview first). Provide clickable equivalents. Disable repeated Open while its request is outstanding. Do not auto-copy selections to the clipboard. Render once before starting refresh. Every refresh obtains a fresh Herdr state, updates discovery's project cwds/live paths, and captures those paths; if Herdr is unavailable, retain the disk-backed list with an error rather than inventing live status. On close, abort outstanding waits, prevent late rendering/focus, settle cleanup, and restore terminal modes. Show “Terminal too small” with a working Escape path if controls cannot fit.
- [ ] **5. Run green:** `npm run check && npm run build`. Test real renderer output via the fake terminal, not merely a pure string snapshot disconnected from input handlers.
- [ ] **6. Commit:** `feat(agentlog): add on-demand session registry popup`.

## Task 7: Wire the actual plugin and prove restart recovery

**Files:** create `src/cli.ts`, `herdr-plugin.toml`, `test/cli.test.ts`, `test/integration/herdr.test.ts`, `test/helpers/herdr-sandbox.ts`; modify `README.md` and package scripts only as specified above.

**Consumes:** all previous interfaces.

**Produces:** executable compiled `dist/cli.js`; commands `sessions`, `ui`, `capture`; manifest ID `herder-agentlog`, action `sessions`, popup entrypoint `registry`.

- [ ] **1. Write failing CLI/manifest tests.** Begin with `manifest has an on-demand popup and no startup command`: read the TOML and assert `assert.match(manifest, /placement = "popup"/)` and `assert.doesNotMatch(manifest, /^\[startup\]/m)`; live linking later validates the full TOML schema. `--help` must not create state or call Herdr. Reject missing plugin context for active commands; `sessions` opens only the registered popup; `capture` consumes `HERDR_PLUGIN_EVENT_JSON`; `ui` owns its store/terminal cleanup. Assert the manifest has **no startup section**, exactly the two approved event hooks, and popup placement/size (90% width, 80% height). Initially tests fail because wiring is absent.
- [ ] **2. Run red:** `node --test test/cli.test.ts`.
- [ ] **3. Implement CLI and manifest.** Use environment state/config/socket paths provided by Herdr. Commands are `['node','dist/cli.js',<command>]`. Build entries run `npm ci --ignore-scripts` then `npm run build`; no startup or notification command. Action contexts include workspace and pane; resolve callback IDs explicitly, never guess `--current` inside the identity-less popup. A missing Node/bad context produces a concise diagnostic, no fallback installation. Optional keybinding remains opt-in documentation, not automatic config mutation.
- [ ] **4. Run green:** `npm run check && npm run build`.
- [ ] **5. Write the opt-in live suite and sandbox helper.** Normal `npm test` must never connect to live Herdr. `AGENTLOG_RUN_HERDR_TESTS=1` enables integration; missing required binaries then fail clearly instead of a misleading pass. Resolve real binary paths before isolating environment.

Sandbox requirements: a short private temp directory; isolated `HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `PI_CODING_AGENT_DIR`; remove inherited HERDR/PI routing variables and credentials. Start explicit uniquely named test servers with networking checks off and a simple non-login shell. Link the plugin **only after asserting its resolved config/state roots are inside the sandbox**; Herdr's global plugin registry must not touch the real user's config. Install the official Pi integration only into the sandbox agent directory. Set Pi offline, use synthetic saved conversations with a visible custom-message marker, and never send model prompts.

Use macOS `script` from a TypeScript child-process helper to attach a client via a PTY; set dimensions with `stty` in a fixed wrapper using positional argv, not interpolated user paths. Capture output through xterm, respond to necessary terminal queries, and detach with the real prefix sequence. Every live operation uses sandbox env and explicit session selection. Cleanup in `finally` stops only recorded test servers, unlinks only the sandbox plugin, and retains failure diagnostics without transcripts/credentials. Assert the real default socket and configuration were untouched.
- [ ] **6. Run live acceptance:** `AGENTLOG_RUN_HERDR_TESTS=1 npm run test:integration`.

Required scenarios: popup open/search/pin/archive/label/escape with draft preservation; reopening into the original cwd; repeat Open focuses without increasing Pi process count; Herdr-first restart restores natively; Pi-SIGTERM-first and Pi-SIGKILL-first then Herdr restart lose the native reference but still allow registry recovery. Confirm a real new Pi foreground process and original visible marker. Validate no startup popup/toast, unchanged recency after reopen, and committed metadata surviving a killed importer/UI process. Exercise the actual plugin action and mouse/key input, not only direct service calls. Fix any integration gaps under these tests before claiming usability; no Mac reboot is required.
- [ ] **7. Finish README and manual checklist.** Document Node prerequisite, no bundled runtime, Rust/native follow-up, Node-supplied npm source-build instructions, `herdr plugin link <absolute-path>`, public action invocation, optional conflict-checked `prefix+a` snippet, “open here” scope, known-root limitations, and test commands. State that archives/labels are not transcript backups/native renames. Do not link/install into the user's actual Herdr namespace until they approve a hands-on trial.
- [ ] **8. Final verification:** `npm ci --ignore-scripts && npm run check && npm run build`, then rerun the explicit live suite. Record commands/results, versions, and any manual-only checks honestly. Inspect the package diff for accidental root-tooling/config changes.
- [ ] **9. Commit:** `feat(agentlog): wire plugin and verify restart recovery`.

## Plan self-review / handoff

- Spec coverage: metadata/recency Task 1; durable organization/search Task 2; namespace transport/capture Task 3; historical discovery/freshness Task 4; restoration/navigation Task 5; popup/readiness Task 6; manifest, installation docs, and real restart proof Task 7.
- All five Review Focus classes have explicit tests in their owning tasks. Signatures above are the shared contracts; keep them consistent rather than inventing parallel services during execution.
- No product code, dependencies, global configuration, or root tooling were changed while writing this plan. Registry and PTY boundaries were inspected; the future integration suite has not been run.
- Review the plan before execution. This session currently has no subagent/reviewer tool; native execution with explicit self-review is available. Independent agent review requires an additional tool or separately supplied reviewer.
