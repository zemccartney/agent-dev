import { HerdrError, type HerdrClient, type HerdrState, type Pane } from "#agentlog/herdr";

export function makeFakeHerdr(initial: HerdrState) {
  let state = structuredClone(initial);
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const startedPaths: string[] = [];
  const createdCwds: string[] = [];
  const api: HerdrClient = {
    state(signal) {
      signal?.throwIfAborted();
      calls.push({ method: "state", args: [] });
      return Promise.resolve(structuredClone(state));
    },
    pane(id, signal) {
      signal?.throwIfAborted();
      calls.push({ method: "pane", args: [id] });
      const p = state.panes.find((p) => p.paneId === id);
      return p
        ? Promise.resolve(structuredClone(p))
        : Promise.reject(new HerdrError("pane_not_found", "gone"));
    },
    createDestination(cwd, workspaceId, signal) {
      signal?.throwIfAborted();
      calls.push({ method: "createDestination", args: [cwd, workspaceId] });
      createdCwds.push(cwd);
      const id = workspaceId ?? `new-workspace-${state.workspaces.length}`;
      if (!workspaceId) state.workspaces.push({ workspaceId: id });
      const p: Pane = {
        paneId: `new-pane-${state.panes.length}`,
        workspaceId: id,
        tabId: `new-tab-${state.panes.length}`,
        cwd,
        agent: null,
        session: null,
      };
      state.panes.push(p);
      return Promise.resolve(structuredClone(p));
    },
    startPi(id, path, name, signal) {
      signal?.throwIfAborted();
      calls.push({ method: "startPi", args: [id, path, name] });
      startedPaths.push(path);
      const p = state.panes.find((p) => p.paneId === id);
      if (p) {
        p.agent = "pi";
        p.session = { agent: "pi", kind: "path", value: path };
      }
      return Promise.resolve();
    },
    focus(id, signal) {
      signal?.throwIfAborted();
      calls.push({ method: "focus", args: [id] });
      return Promise.resolve();
    },
    openPopup(signal) {
      signal?.throwIfAborted();
      calls.push({ method: "openPopup", args: [] });
      return Promise.resolve();
    },
  };
  return {
    api,
    calls,
    startedPaths,
    createdCwds,
    setState(next: HerdrState) {
      state = structuredClone(next);
    },
  };
}
