# G2 — Multiple Workspaces & Isolation (file-first)

Status: approved by user on 2026-09-09. Design only; implementation not started.
Depends on: [G1 reliable harness](2026-09-09-g1-reliable-harness-design.md), amended to file-first with this approval.

## Outcome

One user has independent workspace environments such as Work and Life. Each workspace owns its settings, instructions, provider configuration, skills, agent definitions, memory, sessions and projects. Workspace is not a profile preset or a repository folder. Do not introduce a duplicate Profile entity. No dntspace architecture compatibility requirement.

## Domain and ownership

- A project belongs to exactly one workspace and can reference an external working folder.
- A session belongs to exactly one workspace and optionally one project in that workspace. No project means no implicit filesystem access to every workspace project.
- Session/project ownership is fixed in this goal; no cross-workspace move or automatic context sharing.
- Future child agents inherit workspace identity and cannot gain permissions by choosing another workspace.
- Stable IDs identify workspaces; names are display metadata. Renaming never requires moving the data tree.
- One-user model does not require authentication/multi-user implementation in G2.

## Isolation contract

- Scope list/search/direct-ID reads and all writes at the service boundary, not only in UI filters. Missing/mismatched scope fails closed.
- Runtime supplies trusted workspace/session/turn/project scope. Agent-supplied arguments cannot choose a different workspace.
- No implicit cross-workspace retrieval of memory, history, skills, agents, provider connections or artifacts.
- Built-in filesystem tools must not expose or mutate application-internal storage. Managed resources are read/written through their dedicated services. Human editing of supported Markdown files remains allowed.
- File tools use an explicit project root; canonical containment checks must account for traversal and symlinks/junctions, including creation paths.
- Reject overlapping/nested project roots across workspaces by default. Do not silently claim independent files when the roots are shared.
- Logical isolation is not OS isolation: shell and trusted executable plugins can bypass application path scopes with host process privileges. No container/VM/security sandbox claim in G2.

## Configuration and execution

- Workspace-local resources and provider configuration/credentials are the default. Shared provider connections are deferred. Bundled read-only resources and runtime implementations may be shared, with independent workspace enablement.
- One layer of application defaults plus workspace overrides; no workspace inheritance tree. Defaults are distinct from mandatory host restrictions.
- Permissions are allow/ask/deny. Host restrictions, workspace policy and narrower session/agent restrictions cannot be widened by approval. Approval only authorizes an ask operation, never a deny.
- Suggested presets: Read-only (file reads allowed, writes/shell denied), Review changes (reads allowed, writes/shell ask), Edit files (file writes allowed, shell ask). Unrestricted executable capabilities invalidate a read-only assurance.
- Pin workspace identity and project root for the Turn; switching tabs never changes execution scope. Do not freeze mode, model or permissions for the whole Turn: the narrow live controls below supersede that earlier design. Other instructions/resources have no promised hot reload into an active Turn.
- Workspace selection is tab/navigation state, not server-global execution identity. Switching Work/Life does not change or stop an existing Turn. Show activity/approval badges for other workspaces.
- Project folder changes require idle execution with pending work resolved. Never move user repository files implicitly.
- App-local writer coordination prevents overlapping write-capable Turns on the same/overlapping project roots. It does not control external editors or unrestricted shell writes elsewhere.

## Narrow live controls (amended 2026-09-09 with the G3 approval)

This is execution control, not a general hot-reload framework. Exactly three live controls exist; composer input is not a live control.

1. **Change model:** select an already configured provider/model. The current request finishes; the next request in the same Turn uses the new selection. Preserve history and tool results. No request interruption, automatic retry/replay or silent model fallback. Scope selection to the session/workspace, never an application-global active pointer.
2. **Change permission:** check the latest effective policy at every tool-start gate, including unstarted calls in an existing batch. Re-evaluate pending approvals; stale approval cannot override deny. Do not automatically kill an already running tool; explicit Stop remains the cancellation mechanism. Relaxing policy does not resurrect calls already denied/cancelled.
3. **Change mode:** selecting a validated mode is live per [G3](2026-09-09-g3-modes-context-skills-memory-design.md). The current request/tool finishes; the next tool-start gate enforces the new mode's exposure and permission defaults — including unstarted calls from an existing batch — and the next model request is assembled under the new mode. Pending approvals are re-evaluated: newly denied or newly unexposed calls cancel; newly allowed pending calls may proceed only after a serialized final gate confirms all host/workspace restrictions permit; calls still requiring ask remain pending. Denied/cancelled calls never resurrect and nothing executes twice. No automatic kill/rollback/replay; mode definition files are not hot-reloaded.
Input received while running or awaiting approval is durably queued for a subsequent Turn and never injected into the active Turn's context; pending approvals are not superseded by messages. The G1 runtime contract owns the durable input queue; G2 owns scoped controls/UI; G3 integrates queued input into context assembly when its Turn starts.

UI must show queued input in order with pending/consumed status. Show which mode/model/policy revision was actually used per operation; 'included in context' does not mean the model complied. Workspace selector shows activity/approval badges; header shows workspace/project/model, with mode, model and permission controls available while running.

Excluded: live skill/memory/agent-definition/mode-definition/plugin file reload, live project-root changes, provider-registry rebuilds and interrupt-and-retry for immediate model switching.

## File-first source of truth

Illustrative layout (exact schema finalized in implementation planning):

```text
<dsh-home>/
  app.json
  workspaces/<workspace-id>/
    workspace.json
    skills/<skill-name>/SKILL.md
    agents/<agent-name>.md
    memory/workspace/<topic>.md
    memory/projects/<project-id>/<topic>.md
    projects/<project-id>/project.json
    sessions/<session-id>/
      events.jsonl
      summary.json
      checkpoints/
      artifacts/
    cache/
```

- Canonical sessions: append-only JSONL under the G1 writer/durability/recovery contract. summary.json is derived; canonical metadata changes must remain rebuildable from source records.
- Skills/agents: Markdown/frontmatter plus resource files, file-native and editable by humans. Metadata and resource paths are validated. Pin loaded content/hash for active execution; edits apply to future resolutions, not silent mid-Turn replacement.
- Memory: Markdown entries by fact/topic with stable ID, workspace/project scope, timestamps and optional provenance. Session summaries remain session data, not a separate duplicated memory store.
- JSON is used for application/workspace/project metadata. Schema versions and explicit validation are required.
- Credential storage is a separate implementation security decision. File-first is not authorization to put secrets into portable skill/memory/session files or export bundles; no encryption guarantee is claimed by this document.
- No mandatory SQLite initially. In-memory catalogs and lazy history loading suffice until measurement justifies indexing. Any later SQLite search/index is fully rebuildable from workspace files; no durable intent exists only in the index and no dual authoritative writes.

## Read/write behavior

### Sessions

Harness writes inputs, messages, tools, approvals and lifecycle. UI and model consume separate projections. No agent tool edits past history. Compaction preserves original events; fork/edit-message is not automatically part of G2. Recovery never replays side effects.

### Skills and agents

Discover enabled resource metadata first; load full instructions/resources on demand through scoped services. Skill instructions do not grant tool permissions. Bundled content is read-only; customization creates workspace-local content. App writes compare expected content hash, validate, stage and replace safely. External edits refresh through watcher plus read-time validation. Invalid files are surfaced, not silently executed. No heavy immutable revision subsystem or marketplace is required initially; capture enough loaded content/provenance for execution traceability.

### Memory

Read pinned/bounded entries and keyword search within workspace/project scope. No implicit read of unrelated project memories. Create/update/forget are explicit scoped operations; agent writes default to ask, not background automatic extraction. Update checks expected hash to avoid clobbering human edits. Forget removes entries from subsequent active retrieval; it does not erase historical messages, prior provider requests or backups. No vector DB, auto-learning or cross-workspace memory engine in the base.

### Shared writer rules

Agent operations go through services even though canonical data is file-backed. Human editing is supported for skill/agent/memory Markdown, not arbitrary edits of live session logs. Session writes serialize; replacement-file writes validate/hash-check and use staging/sync/replacement with platform limits verified. Watchers are hints, never the sole consistency mechanism. Approval decisions cover exact proposed mutation, not unknown future content.

## Workspace lifecycle and migration

- Create, rename, switch and archive workspaces. Duplicate settings does not copy sessions/history/memory or secrets implicitly.
- Archive preserves history; settle/stop active execution and pending work first. Restore is supported.
- Permanent deletion initially only for empty workspaces; no cascade deletion of populated workspaces.
- Never delete external project folders when archiving/deleting workspace metadata.
- Migrate existing data to Default workspace idempotently, preserving ownership and user project files. G1 and G2 are approved designs, not evidence that such persistent data already exists in the current app.

## Scope by goal

G2 builds workspace/project ownership, configuration, persistence namespaces, service/API/runtime scoping, permissions, minimal project binding and UI. The file formats/read-write contracts guide later goals but do not mean all skill/memory/agent features are implemented in G2.

- G3: bundled modes replacing the generic Agent preset, mode-driven context assembly, budgeting, compaction, skill loading and detailed memory behavior.
- G4: agent definitions and bounded multi-agent execution.
- G5: workspace-scoped MCP (stdio + Streamable HTTP with OAuth/secrets) and hooks (PreToolUse block/ask/rewrite, PostToolUse validate, UserPromptSubmit inject); plugin marketplace deferred to G6.

Non-goals: accounts/multi-tenancy, OS sandbox, shared connections, cross-workspace search/move, external-path grants, profile inheritance, cascade data deletion, workflow/scheduler, marketplace (→ G6), RAG/vector search, autonomous memory extraction.

## Acceptance criteria

1. Work and Life listings, searches, direct-ID accesses and writes enforce ownership.
2. A Work session cannot bind a Life project or load Life resources/context.
3. Two tabs can select different workspaces without changing one another's runtime state.
4. Switching workspace never changes the running Turn's ownership/root. Explicit model changes apply to its next request; mode and permission changes gate the next tool start (mode also reassembles the next request's context), without global state leaking between workspaces.
5. Built-in file tools reject out-of-root traversal/symlink paths and internal app storage access.
6. Deny cannot be widened by approval or a narrower execution scope.
7. Cross-workspace overlapping project roots are rejected; app-coordinated writers do not overlap protected roots.
8. Restart restores ownership/history under G1, without resuming side effects.
9. Archive/delete preserves external project files and leaves no unhandled active work.
10. Files remain canonical: deleting derived cache cannot lose sessions, skills, agents or memory.
11. Human Markdown edits load after validation; stale app writes detect conflicts rather than overwrite them.
12. Data migration is idempotent and does not move/delete user repositories.
13. UI states isolation limits honestly when shell/trusted code is enabled.
14. Input accepted while running is durably accepted in order and queued for a subsequent Turn; it never enters the active Turn's context and does not supersede pending approvals.
15. Pending approval re-evaluation cannot bypass policy, and no live control replays/undoes side effects or grants extra permissions.
16. UI reports queued-input status and control application accurately; an input arriving at Turn completion is not lost. General resource hot reload is not required.

## Implementation details to resolve

Exact schemas, credentials storage/export exclusions, path canonicalization and locking/durability behavior on the supported platform, resource snapshot representation and measured indexing threshold. These details do not reopen the approved file-first/workspace ownership direction.
