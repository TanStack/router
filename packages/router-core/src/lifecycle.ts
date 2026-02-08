// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A lifecycle option can be either a plain handler function or an object
 * `{ handler, serialize? }`.  The serialize flag controls whether the
 * method's return value is included in the dehydrated SSR payload.
 */
export type LifecycleOption<TFn> = TFn | { handler: TFn; serialize?: boolean }

/**
 * The `context` route option supports an additional `invalidate` flag
 * that controls whether the handler re-runs on `router.invalidate()`.
 *
 * This is a structural superset of `LifecycleOption<TFn>` — the existing
 * `resolveHandler()` and `shouldSerialize()` helpers accept it without
 * any signature changes.
 */
export type ContextLifecycleOption<TFn> =
  | TFn
  | { handler: TFn; serialize?: boolean; invalidate?: boolean }

export interface DefaultSerializeConfig {
  beforeLoad?: boolean
  loader?: boolean
  context?: boolean
}

/**
 * Built-in default SSR serialization behavior.
 * Used as the final fallback when neither the method nor the router provides a value.
 */
export const builtinDefaultSerialize: Required<DefaultSerializeConfig> = {
  beforeLoad: true,
  loader: true,
  context: false,
}

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/**
 * Extract just the handler from either the function form or object form.
 * Zero allocations — no intermediate object created.
 */
export function resolveHandler<TFn>(
  option: LifecycleOption<TFn> | undefined,
): TFn | undefined {
  if (option === undefined) return undefined
  if (typeof option === 'function') return option
  return (option as { handler: TFn }).handler
}

/**
 * Determine whether a lifecycle method's return value should be serialized
 * (included in the dehydrated SSR payload).
 *
 * Three-level priority:
 *   method-level object form  >  router-level defaultSerialize  >  built-in default
 *
 * Only call this when the lifecycle option actually exists on the route.
 *
 * @param option  The lifecycle option (function or object form)
 * @param routerDefault  The router-level default for this specific method
 * @param builtinDefault  The built-in default for this method
 */
export function shouldSerialize(
  option: LifecycleOption<any>,
  routerDefault: boolean | undefined,
  builtinDefault: boolean,
): boolean {
  // Object form — check method-level serialize flag first
  if (typeof option !== 'function') {
    const s = (option as { serialize?: boolean }).serialize
    if (s !== undefined) return s
  }
  // Fall through to router default, then built-in default
  return routerDefault ?? builtinDefault
}

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

/**
 * Extract the handler function from either the function form or object form.
 * Used by context-flow types (ContextReturnType, ContextAsyncReturnType, etc.)
 * to correctly infer return types regardless of the form used.
 */
export type ExtractHandler<T> = T extends { handler: infer H } ? H : T
