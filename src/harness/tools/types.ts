import type { ToolCall, ToolSchema } from '../llm/types.ts'

/** What one tool run answers: success text, or a failure the model must see. */
export interface ToolResult {
  readonly ok: boolean
  readonly output: string
}

/**
 * A model-facing tool: schema for request assembly, `execute` for the
 * pipeline. Arguments arrive as a JSON object validated at the model-JSON
 * boundary; tools validate their own fields and fail through `ToolResult`
 * rather than throwing.
 */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: ToolSchema['parameters']
  execute(args: Record<string, unknown>): Promise<string>
}

/**
 * The `tools/pre-execute` waterfall decision: allow (optionally with the
 * call rewritten) or deny with a reason the model sees as the tool result.
 */
export type PreExecuteDecision =
  | { readonly kind: 'allow'; readonly call: ToolCall }
  | { readonly kind: 'deny'; readonly reason: string }

declare module 'mini-dsh' {
  interface Events {
    /**
     * Around-middleware before a tool runs: listeners may rewrite the call
     * by forwarding a replacement through `next()`, or deny it by returning
     * `{ kind: 'deny' }` without calling `next()`. Approval policies hook
     * here. The default allows the call unchanged.
     */
    'tools/pre-execute'(
      payload: { readonly call: ToolCall },
      next: (replacement?: { readonly call: ToolCall }) => Promise<PreExecuteDecision>,
    ): Promise<PreExecuteDecision>

    /**
     * Around-middleware after a tool ran (or was denied): listeners may
     * transform the result the model sees by forwarding a replacement
     * through `next()`. The default passes the result through.
     */
    'tools/post-execute'(
      payload: { readonly call: ToolCall; readonly result: ToolResult },
      next: (replacement?: { readonly result: ToolResult }) => Promise<ToolResult>,
    ): Promise<ToolResult>
  }
}
