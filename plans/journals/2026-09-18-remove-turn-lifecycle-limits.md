---
title: Remove turn lifecycle limits
date: 2026-09-18
summary: Removed turn deadline and step budgets while preserving legacy compatibility.
---

# Remove turn lifecycle limits

## What happened
The runtime emitted `turn deadline exceeded` from a ten-minute timer in `src/harness/agent/agent.ts`; child agents also inherited an enforced 12-step default through `agent-step-budgets`.

## Decision
Removed the wall-clock turn deadline and model-step budget for root and child turns. Turns now continue until the model returns no tool calls or the user explicitly stops them. Kept provider inactivity, Bash/MCP timeouts, approval expiry, capacity limits, and resource watchdogs because they protect infrastructure rather than cap turn lifecycle.

## Compatibility
`maxSteps` and `turnDeadlineMs` remain accepted as deprecated ignored TypeScript options. Claude/workspace `maxTurns` metadata remains readable but is not enforced. Legacy durable `turn/error: limit` and `turn/end: limit` records remain supported and have restart coverage.

## Verification
Focused lifecycle/child/storage/web tests: 50/50 passed. Typecheck passed. Web build passed. Full suite exposed two unrelated pre-existing defects: Windows Laragon Git Bash descendants can escape `taskkill /T`, and MCP stdio can emit intermittent unhandled `EPIPE` after a watchdog kills the subprocess.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
