import type { Meta, ProviderSummary } from './types.ts'

/** One selector row: value is an unambiguous `provider:model` pair. */
export interface ModelOption {
  readonly value: string
  readonly label: string
  readonly provider: string
  readonly model: string
}

export function encodeModelChoice(provider: string, model: string): string {
  return `${provider}:${model}`
}

export function decodeModelChoice(value: string): { readonly provider: string; readonly model: string } | null {
  const boundary = value.indexOf(':')
  if (boundary <= 0 || boundary === value.length - 1) return null
  return { provider: value.slice(0, boundary), model: value.slice(boundary + 1) }
}

/** Flatten enabled provider/model sets for the composer and Environment panel. */
export function modelOptions(meta: Meta | null): readonly ModelOption[] {
  if (meta === null) return []
  const options: ModelOption[] = []
  for (const provider of meta.providers) {
    if (!provider.enabled) continue
    for (const model of provider.models) {
      options.push({
        value: encodeModelChoice(provider.id, model),
        label: `${provider.name} / ${model}`,
        provider: provider.id,
        model,
      })
    }
  }
  // Injection-only providers (test seams) have no public config row.
  if (options.length === 0) {
    for (const model of meta.models) {
      options.push({
        value: encodeModelChoice(meta.provider, model),
        label: `${meta.provider} / ${model}`,
        provider: meta.provider,
        model,
      })
    }
  }
  return options
}

export function activeModelValue(meta: Meta | null): string | null {
  if (meta === null || meta.provider === '' || meta.model === '') return null
  return encodeModelChoice(meta.provider, meta.model)
}

export function providerById(providers: readonly ProviderSummary[], id: string): ProviderSummary | undefined {
  return providers.find((provider) => provider.id === id)
}
