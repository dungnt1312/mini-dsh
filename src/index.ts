/**
 * mini-dsh kernel: a miniature Cordis-shaped plugin runtime.
 *
 * Everything mounts as a plugin into a shared context: capabilities claim
 * service names (`ctx.<name>`), communicate through typed events with five
 * dispatch modes, and register reversible effects that unwind on unload.
 */
export { EventBus, type Events, type DispatchMode, type EventOptions } from './kernel/events.ts'
export {
  Fiber,
  assertNever,
  type Effect,
  type EffectMeta,
  type FiberState,
} from './kernel/fiber.ts'
export { ServiceStore, type ServiceChange } from './kernel/store.ts'
export { Context, createContext } from './kernel/context.ts'
export { Service } from './kernel/service.ts'
export {
  Kernel,
  resolvePlugin,
  type PluginTarget,
  type ResolvedPlugin,
} from './kernel/registry.ts'
export {
  boot,
  bootFromFile,
  loadPluginModule,
  parseConfig,
  type ConfigEntry,
} from './kernel/loader.ts'
