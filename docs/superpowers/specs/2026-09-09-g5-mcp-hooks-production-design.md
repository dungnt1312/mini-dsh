# G5 — MCP & Hooks (Production)

Status: scope approved 2026-09-09 (Option B). Design only; not implemented.
Depends on: [G1](2026-09-09-g1-reliable-harness-design.md), [G2](2026-09-09-g2-workspace-isolation-design.md), [G3](2026-09-09-g3-modes-context-skills-memory-design.md), [G4](2026-09-09-g4-agents-tools-compatibility-design.md).

## Outcome

Workspace-scoped MCP (stdio + Streamable HTTP with auth) and hooks (observe → block/rewrite/validate/inject) that pass through the same G1 gates, lifecycle, and audit as built-in tools. No plugin marketplace in G5. Stdio covers local servers; HTTP covers hosted/remote servers with OAuth/Bearer. Production hardening: secrets isolation, health/retry/circuit breaker, resource limits, permission model, audit/observability.

## MCP — transports

- **stdio** — required. Subprocess per (workspace, server). newline-delimited JSON-RPC, stderr = logs.
- **Streamable HTTP** — required for production. JSON-RPC over POST, optional SSE stream, session handling.
- **HTTP+SSE legacy** — not built (deprecated by spec 2025-06-18).
- **In-process/bundled** — not built (would be plugin marketplace).

Spec refs: [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle), [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [Claude Code MCP](https://code.claude.com/docs/en/mcp).

## Config — file-first, workspace-owned

```text
workspaces/<workspace-id>/mcp.json      # servers, tool allowlists, timeouts
workspaces/<workspace-id>/secrets.json  # encrypted — never plain in mcp.json
workspaces/<workspace-id>/hooks.json    # hook bindings
```

```json
{
  "version": 1,
  "servers": {
    "notion": {
      "transport": "http",
      "url": "https://mcp.notion.com/mcp",
      "auth": { "type": "oauth", "provider": "notion" },
      "headers": { "X-Custom": "${MY_TOKEN}" },
      "enabled": true,
      "timeoutMs": 15000,
      "allowedTools": ["mcp__notion__query"]
    },
    "local-fs": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@example/fs-mcp"],
      "env": { "API_KEY": "${API_KEY}" },
      "enabled": false,
      "timeoutMs": 10000
    }
  }
}
```

Rules:
- Workspace-owned only. No global/user-level fallback in G5. Import from Claude `.mcp.json` / Codex TOML writes provenance, does not auto-enable or spawn.
- Secrets: `secrets.json` encrypted at rest (OS keychain or file encryption — impl detail), referenced via `${VAR}`. Never commit plain API keys. Rotation: update secrets file, server reconnects.
- Validation strict: invalid file → surfaced error, no partial execution.
- Isolation: server of Work never callable from Life, even if config copied.
- Naming: `mcp__<server>__<tool>` (Claude convention). Server name `[A-Za-z0-9_-]`. Built-in names (`Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Skill`, `memory_*`, `Agent`) reserved.

## MCP lifecycle — production

```
discover → initialize (pin 2025-06-18) → tools/list snapshot
  → register via ToolsService.register() (effect-disposed)
  → tools/call per invocation
  → notifications/cancelled on AbortSignal
  → health check every 30s
  → retry: 3× with backoff (only before output)
  → circuit breaker: 5 fails → disable 5 min → auto-reconnect with jitter
  → disconnect: close stdin / HTTP session, wait, terminate orphans
```

- Capability: **tools only** in G5. Resources/prompts/sampling deferred.
- Timeouts per call (default 15s, configurable). Output bounded + truncated marker.
- Failure → `ToolResult.ok=false` with truthful error, never hang. No auto-restart of server mid-Turn; server stays failed until user re-enables or breaker recovers. Stop/restart cleans subprocesses (verified no orphans on Windows — same gate as G1 Bash).
- Tool `inputSchema` → parameters; `isError` → `ok=false`; `readOnlyHint` display-only, never auto-allow (spec says hints must not drive safety decisions).
- Mode ceiling: Chat sends no MCP schemas; Plan exposes none unless user allowlists specific read-safe tools; Explorer has zero MCP tools regardless of grant/mode; Worker sees only tools in its explicit spawn grant intersect parent policy.

## Permissions — production

- Every MCP tool through `tools/pre-execute` waterfall. Policy key = full `mcp__server__tool` or wildcard `mcp__<server>__*`.
- Default: **ask** for all MCP tools (safer than built-in reads — cannot prove read-only).
- Per-tool: `allow / ask / deny`. Host-level `blockedTools` (e.g. `mcp__*__delete_*`) cannot be widened by workspace/mode/child/approval.
- `requiresUserInteraction` annotation → always `ask`.
- `allowedTools` in `mcp.json` is an exposure filter, not a permission bypass — still needs policy `allow`.
- Approvals are bound to the exact tool execution and fixed arguments per [G1](2026-09-09-g1-reliable-harness-design.md). Re-evaluation on mode/permission change follows [G3](2026-09-09-g3-modes-context-skills-memory-design.md) serialized final gate semantics. Durable per-tool `allow` in `mcp.json` is the workspace policy design referenced by G1; it is not a blanket bypass — `deny` and host `blockedTools` always win.

## Isolation & limits

Application-level isolation only — not an OS/container security sandbox. Shell, MCP subprocesses and hooks run with host process privileges; file-tool gates and permission checks are application controls.

- One OS process per (workspace, server) with cgroup-like limits: CPU, memory, wall-time. Kill on limit breach → failed result + breaker.
- Workspace isolation absolute: no cross-workspace tool resolution even via history import.
- App-coordinated writer lease (G4) does not cover side effects performed by MCP server itself — documented as out-of-app guarantee.
- Child agents: server set pinned per Turn; Explorer sees none; Worker sees only explicitly granted tools; children cannot add/remove servers.

## Hooks — production

| Event | G5 command type | Capability |
|---|---|---|
| `PreToolUse` | `command` | **block / ask / allow**, optional `updatedInput` rewrite |
| `PostToolUse` | `command` | **validate** output (secret scan, policy), fail-open with audit |
| `UserPromptSubmit` | `command` | **inject** context before model request |
| `SessionStart` / `SessionEnd` | `command` | **audit** lifecycle |
| `PreCompact` | `command` | **gate** compaction decision |
| `Stop` / `SubagentStop` | `command` | deferred (needs seam beyond G1) |

```json
{
  "version": 1,
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "type": "command",
      "command": "./hooks/block-dangerous.sh",
      "timeoutMs": 3000,
      "onFailure": "deny"
    }],
    "PostToolUse": [{
      "matcher": "mcp__*__*",
      "type": "command",
      "command": "./hooks/scan-secrets.sh",
      "timeoutMs": 2000,
      "onFailure": "allow"
    }]
  }
}
```

Rules:
- Payload JSON via stdin: `sessionId`, `tool`, `args` (Pre) / `result` (Post) / `prompt` (UserPromptSubmit). Stdout = optional structured decision; stderr = diagnostics; exit codes follow Claude convention (0 allow, 2 block where supported, 1 non-blocking).
- `updatedInput` rewrites in PreToolUse re-bind the approval to the rewritten exact arguments and re-enter the serialized final gate in [G3](2026-09-09-g3-modes-context-skills-memory-design.md). Rewritten inputs must still pass mode exposure, host `blockedTools` and all workspace policy gates; a hook cannot escalate authority or turn an unexposed/denied tool into an allowed one.
- Hooks run as direct `command+args` spawn — not via Bash tool, not dependent on shell adapter.
- Timeouts strict (default 3s Pre, 2s Post). `command` hooks must not call MCP/model recursively (prevent loops).
- `hooks.json` itself grants no permission; a hook cannot escalate authority beyond the existing gate.
- Failure policy: security hooks `onFailure: deny` (fail-closed); observation hooks `onFailure: allow` (fail-open) with bounded audit event.

## Audit & observability

Every MCP call and hook run is durably recorded:

```
workspaces/<id>/sessions/<session>/events.jsonl
  → { type: "mcp/call", server, tool, argsHash, resultHash, durationMs, isError }
  → { type: "hook/run", event, matcher, exitCode, durationMs, decision }
```

- `who` = workspace/session/Turn identity (no multi-user in base, but identity preserved).
- `when` = monotonic timestamp.
- `argsHash`/`resultHash` — never raw secrets. Full args only in debug mode with explicit opt-in.
- Metrics: latency p50/p95, error rate per server, breaker state. Surfaced in UI server list.
- Log retention bounded; truncation explicit.

## UI — minimal production

- Server list: name, transport, status (connecting/ready/failed/disabled), breaker state, enable/disable, error detail, reconnect button.
- Tool exposure matrix: which tools visible per mode, per server.
- Hook bindings: event, matcher, command, last run status/latency, failure count.
- Approval banner for MCP `ask` — same as built-in, with server/tool identity.
- Secrets management: separate UI for `secrets.json` (masked display, rotate, never plain export).
- Inspector/manifest includes MCP source hashes and hook decisions.

## Non-goals (→ G6)

Plugin marketplace, registry, signature verification, bundle distribution, LSP servers, SSE legacy transport, in-process plugin code execution, hook `http`/`mcp_tool`/`prompt`/`agent` types, `PostToolUseFailure`/`PostToolBatch` fine-grained events, global/user-level server inheritance.

## Acceptance criteria

1. One stdio + one HTTP server: both initialize, list tools as `mcp__server__tool`, appear in request schemas; disabling in `mcp.json` removes them next assembly.
2. Same MCP tool respects `mcp__server__tool` and `mcp__server__*` policies; `deny` not widenable by mode/child/approval; default `ask` enforced.
3. Timeout/server death → truthful failed `ToolResult`, no hang; Stop/restart leaves no orphan subprocess (verified on Windows).
4. Duplicate/collision names rejected; server charset validated; built-in names reserved.
5. Explorer has zero MCP tools under any grant/mode; Worker only sees explicitly granted tools; child cannot add/remove servers; server side effects documented as outside app lease.
6. PreToolUse hook can block a dangerous Bash; PostToolUse hook can flag secret in output; UserPromptSubmit hook can inject context; failures follow `onFailure` policy and are audited.
7. Hook execution independent of Bash tool/shell adapter; missing env → surfaced error, never blocks silently.
8. Secrets not in `mcp.json` plain; `${VAR}` resolves from encrypted store; rotation reconnects without restart of app.
9. Retry (3× backoff) + circuit breaker (5 fails → 5 min disable) + health check work; breaker recovery re-registers tools.
10. Chat sends no MCP schemas; Plan exposes none unless allowlisted read-safe; Full still under host/workspace restrictions.
11. Restart does not auto-recover failed servers; interrupted calls marked `interrupted`; history auditable.
12. Invalid `mcp.json`/`hooks.json`/`secrets.json` surfaced, no partial execution; import from Claude/Codex records provenance without spawning.
13. Audit events contain hashed args/results, duration, identity; no raw secrets in logs.

## Implementation gates

- Pin MCP spec version `2025-06-18` and fixture-verify framing, `initialize`/`tools/list`/`tools/call`/`notifications/cancelled`, pagination, `tools/list_changed`.
- Pin hook stdin/stdout/exit-code contract on fixtures matching Claude docs (command type only).
- Verify subprocess cleanup and timeout on Windows (same gate as G1 Bash).
- Verify `secrets.json` encryption/keychain integration before claiming at-rest protection.
- Verify Streamable HTTP session handling and OAuth flow on fixtures — not just stdio.
