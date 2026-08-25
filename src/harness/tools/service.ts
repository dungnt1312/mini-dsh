import { Service, type Context } from '../../kernel/index.ts'
import type { ToolCall, ToolSchema } from '../llm/types.ts'
import type { PreExecuteDecision, ToolDefinition, ToolResult } from './types.ts'

declare module 'mini-dsh' {
  interface Context {
    tools: ToolsService
  }
}

/**
 * The scoped tool registry and guarded execution pipeline. Tools register
 * as effects; execution runs the `tools/pre-execute` waterfall (policy and
 * rewriting), then the tool body, then `tools/post-execute` (result
 * transformation). A denied or throwing call becomes a failed `ToolResult`
 * the model can see — never an exception into the loop.
 */
export class ToolsService extends Service {
  private tools = new Map<string, ToolDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'tools')
  }

  /**
   * Register a tool. The registration is an effect: it unwinds when the
   * owning fiber unloads, so the schema leaves request assembly too.
   *
   * @returns a disposer removing the tool.
   */
  register(tool: ToolDefinition): () => void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tools: '${tool.name}' is already registered`)
    }
    this.tools.set(tool.name, tool)
    const dispose = this.ctx.effect(() => () => {
      this.tools.delete(tool.name)
    }, `tools.register(${tool.name})`)
    return () => {
      void dispose()
    }
  }

  /** Every registered tool's schema, for request assembly. */
  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
  }

  /**
   * Run one call through the guarded pipeline. The durable `tool/call` and
   * `tool/result` events belong to the agent loop; this method only decides
   * and executes.
   *
   * @returns the (possibly transformed) result; denied calls fail with the
   * denial reason.
   */
  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name)
    if (tool === undefined) {
      return { ok: false, output: `unknown tool '${call.name}' (registered: ${[...this.tools.keys()].join(', ') || 'none'})` }
    }

    const decision: PreExecuteDecision = await this.ctx.waterfall(
      'tools/pre-execute',
      { call },
      (replacement) =>
        Promise.resolve(
          replacement === undefined
            ? { kind: 'allow', call }
            : { kind: 'allow', call: replacement.call },
        ),
    )
    if (decision.kind === 'deny') {
      return this.postExecute(call, { ok: false, output: `denied: ${decision.reason}` })
    }

    let output: string
    try {
      output = await tool.execute(decision.call.args)
    } catch (error) {
      return this.postExecute(call, { ok: false, output: `error: ${String(error)}` })
    }
    return this.postExecute(call, { ok: true, output })
  }

  private async postExecute(call: ToolCall, result: ToolResult): Promise<ToolResult> {
    return this.ctx.waterfall(
      'tools/post-execute',
      { call, result },
      (replacement) => Promise.resolve(replacement?.result ?? result),
    )
  }
}
