/**
 * Opaque cross-boundary ids: branded so a `SessionId` never flows where a
 * `TurnId` is expected, mirroring the upstream `dsh-brand` utility.
 */
declare const brand: unique symbol

/** A `T` that carries a phantom `B` tag, statically distinct from plain `T`. */
export type Branded<T, B extends string> = T & { readonly [brand]: B }

/** Identifies one durable conversation log. */
export type SessionId = Branded<string, 'SessionId'>
/** Identifies one turn inside a session. */
export type TurnId = Branded<string, 'TurnId'>
/** Identifies one model request inside a turn. */
export type StepId = Branded<string, 'StepId'>

let nextId = 0

/** Mint a fresh session id; unique within this process. */
export function newSessionId(): SessionId {
  return `session-${++nextId}` as SessionId
}

/** Mint a fresh turn id; unique within this process. */
export function newTurnId(): TurnId {
  return `turn-${++nextId}` as TurnId
}

/** Mint a fresh step id; unique within this process. */
export function newStepId(): StepId {
  return `step-${++nextId}` as StepId
}
