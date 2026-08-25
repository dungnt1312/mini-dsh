import type { Context } from 'mini-dsh'

export const name = 'disabled-fixture'

export function apply(ctx: Context): void {
  ctx.provide('shouldNotExist', true)
}
