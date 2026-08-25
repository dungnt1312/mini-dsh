import type { Context } from 'mini-dsh'

export const name = 'hello-fixture'

export function apply(ctx: Context): void {
  ctx.provide('helloValue', 'hello from fixture')
}
