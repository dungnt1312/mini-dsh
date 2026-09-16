/**
 * UI-side view over the shared model catalog (`src/harness/llm/model-catalog.ts`):
 * capability badges, effective context windows, and thinking-level
 * resolution. The web bundles the same pure module the server resolves
 * budgets with — never a divergent copy.
 */
import {
  defaultThinkingLevel,
  formatContextLimit,
  getModelInfo,
  getReasoningCapability,
  resolveContextLimit,
  supportsReasoningControl,
  type ReasoningCapability,
  type ThinkingLevel,
} from '../../src/harness/llm/model-catalog.ts'
import type { ModelSettings } from './types.ts'

export { defaultThinkingLevel, formatContextLimit, getModelInfo, getReasoningCapability, resolveContextLimit, supportsReasoningControl }
export type { ReasoningCapability, ThinkingLevel }

export const THINKING_LABELS: Readonly<Record<ThinkingLevel, string>> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
}

/** Effective vision: operator override first, then the catalog value. */
export function modelVision(modelId: string, settings?: ModelSettings): boolean | 'unknown' {
  if (settings?.vision !== undefined) return settings.vision
  return getModelInfo(modelId)?.vision ?? 'unknown'
}

/**
 * The context window shown in settings: the operator override when set,
 * else the catalog resolution — with the label marking which one.
 */
export function modelContext(modelId: string, settings?: ModelSettings): { tokens: number; overridden: boolean; label: string } {
  if (settings?.contextTokens !== undefined && settings.contextTokens > 0) {
    return { tokens: settings.contextTokens, overridden: true, label: formatContextLimit(settings.contextTokens) }
  }
  const tokens = resolveContextLimit(modelId)
  return { tokens, overridden: false, label: formatContextLimit(tokens) }
}

/** Row badges: Text/Vision/Reasoning — catalog data and overrides, never name guesses. */
export function capabilityBadges(modelId: string, settings?: ModelSettings): { label: string; tone: 'gray' | 'blue' | 'green' }[] {
  const badges: { label: string; tone: 'gray' | 'blue' | 'green' }[] = []
  if (modelVision(modelId, settings) === true) badges.push({ label: 'vision', tone: 'blue' })
  if (getReasoningCapability(modelId) !== null) badges.push({ label: 'reasoning', tone: 'green' })
  if (badges.length === 0) badges.push({ label: 'text', tone: 'gray' })
  return badges
}

/**
 * The thinking level the NEXT request would carry: workspace override →
 * the provider entry's per-model default → the catalog default. Null when
 * the model exposes no usable control.
 */
export function effectiveThinking(modelId: string, workspaceOverride: string | null | undefined, settings?: ModelSettings): { level: ThinkingLevel; fromOverride: boolean } | null {
  const capability = getReasoningCapability(modelId)
  if (capability === null || !supportsReasoningControl(modelId)) return null
  if (workspaceOverride !== undefined && workspaceOverride !== null && workspaceOverride in THINKING_LABELS) {
    return { level: workspaceOverride as ThinkingLevel, fromOverride: true }
  }
  const configured = settings?.thinkingLevel
  if (configured !== undefined && configured in THINKING_LABELS) {
    return { level: configured as ThinkingLevel, fromOverride: false }
  }
  return { level: defaultThinkingLevel(capability), fromOverride: false }
}
