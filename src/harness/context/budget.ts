/**
 * Budget arithmetic for context assembly. Token counts are ESTIMATES
 * (chars/4) — honest, labeled as such, and configurable per model. The
 * budget is the context window minus the output reserve and a safety
 * margin; tool schemas are part of the cost.
 */
export interface BudgetConfig {
  /** The model's context window (an estimate unless verified). */
  readonly contextLimitTokens: number
  /** Reserved for the model's reply. */
  readonly outputReserveTokens: number
  /** Safety margin absorbing estimation error. */
  readonly marginTokens: number
}

/** Budget config plus the honesty flag for the estimate. */
export type ResolvedBudget = BudgetConfig & { readonly verified?: boolean }

export const DEFAULT_BUDGET: ResolvedBudget = {
  // Matches the model catalog's DEFAULT_CONTEXT_LIMIT (256k): modern
  // chat/reasoning windows are 128k–1M, and a 32k fallback rejected
  // requests whose fixed cost alone exceeded it.
  contextLimitTokens: 256_000,
  outputReserveTokens: 4_096,
  marginTokens: 1_024,
  verified: false,
}

/** Estimate one string's token cost (chars/4, rounded up). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** The tokens available for assembled content after reserve and margin. */
export function budgetFor(config: BudgetConfig): number {
  return Math.max(config.contextLimitTokens - config.outputReserveTokens - config.marginTokens, 0)
}

/** The schema overhead for one request, in estimated tokens. */
export function schemaCost(schemas: readonly { name: string; description: string; parameters: unknown }[]): number {
  return estimateTokens(JSON.stringify(schemas))
}

/** The truthful failure when trimming cannot make a request fit. */
export class ContextBudgetError extends Error {
  constructor(
    readonly neededTokens: number,
    readonly availableTokens: number,
  ) {
    super(`context budget exceeded: assembled content needs ~${neededTokens} tokens, budget allows ~${availableTokens} after reserve and margin; reduce history/skills/memory or raise the model limit`)
    this.name = 'ContextBudgetError'
  }
}
