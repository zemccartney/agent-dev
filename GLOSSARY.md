# Agent Tooling

## Language

**Agent session**:
A continuing conversation with an agent, distinct from the process displaying it. A saved agent session can be resumed across process lifetimes and contain multiple agent runs.

**Agent run**:
An interval of autonomous agent work, distinct from the lifetime of the session containing it.
_Avoid_: Agent process lifetime

**Recovery registry**:
A catalog of saved agent sessions available for rediscovery and resumption, including sessions that are no longer running. Closing an agent or its pane does not itself retire its registry record.

**Pinned session**:
An agent session explicitly marked for preferential placement in the recovery registry. Pinning does not itself request automatic resumption.

**Archived session**:
An agent session explicitly set aside from the recovery registry's everyday list while remaining available for search and resumption. Archival does not delete the conversation or mean that its process has stopped.

**Registry label**:
An optional display name for an agent session within the recovery registry, separate from its native name and session identifier.

**Caffeination**:
Keeping the machine from idle sleeping on behalf of autonomous agent work. A session is caffeinated only while that protection is active.
_Avoid_: Sleep protection (in user-facing UI)

**Wake lease**:
The technical term for a time-bounded entitlement for an agent run to caffeination, subject to the applicable power policy. Expiration ends that entitlement, not the agent's work.
_Avoid_: Execution timeout
