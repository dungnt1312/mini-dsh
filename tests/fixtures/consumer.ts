import type { Context } from 'mini-dsh'
import type { GreeterService } from './greeter.ts'

declare module 'mini-dsh' {
  interface Context {
    greeter: GreeterService
  }
}

export const name = 'consumer-fixture'

export const inject = ['greeter']

export function apply(ctx: Context): void {
  ctx.provide('consumerSaw', ctx.greeter.greet('world'))
}
