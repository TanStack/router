// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DehydrateOption<TValue = any, TWire = any> =
  | boolean
  | ((value: TValue) => TWire)

export type HydrateOption<TValue = any, TWire = any> = (wire: TWire) => TValue

/**
 * Lifecycle methods (context/beforeLoad/loader) accept either a plain handler
 * function or an object form with additional capabilities.
 */
export type LifecycleOption<TFn, TValue = any, TWire = any> =
  | TFn
  | ({
      handler: TFn
      /**
       * Context-only: Controls invalid/stale behavior.
       * - true: handler can re-run on invalid/stale
       * - function: called instead of handler on invalid/stale
       */
      revalidate?:
        | boolean
        | ((
            ctx: any & { prev: TValue | undefined },
          ) => TValue | Promise<TValue>)
    } & (
      | {
          dehydrate?: undefined | false
          hydrate?: HydrateOption<TValue, TWire>
        }
      | {
          dehydrate: true
          hydrate?: HydrateOption<TValue, TWire>
        }
      | {
          dehydrate: (value: TValue) => TWire
          hydrate: HydrateOption<TValue, TWire>
        }
    ))

export interface DefaultDehydrateConfig {
  beforeLoad?: boolean
  loader?: boolean
  context?: boolean
}

/**
 * Built-in default SSR dehydration behavior.
 * Used as the final fallback when neither the method nor the router provides a value.
 */
export const builtinDefaultDehydrate: Required<DefaultDehydrateConfig> = {
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
 * Determine whether a lifecycle method's return value should be dehydrated
 * (included in the dehydrated SSR payload).
 *
 * Three-level priority:
 *   method-level object form  >  router-level defaultDehydrate  >  built-in default
 *
 * Only call this when the lifecycle option actually exists on the route.
 *
 * @param option  The lifecycle option (function or object form)
 * @param routerDefault  The router-level default for this specific method
 * @param builtinDefault  The built-in default for this method
 */
export function shouldDehydrate(
  option: LifecycleOption<any>,
  routerDefault: boolean | undefined,
  builtinDefault: boolean,
): boolean {
  if (typeof option !== 'function') {
    const d = (option as { dehydrate?: boolean | ((value: any) => any) })
      .dehydrate
    if (typeof d === 'boolean') return d
    if (typeof d === 'function') return true
  }
  return routerDefault ?? builtinDefault
}

export function getDehydrateFn(
  option: LifecycleOption<any> | undefined,
): ((value: any) => any) | undefined {
  if (!option || typeof option === 'function') return undefined
  const d = option.dehydrate
  return typeof d === 'function' ? d : undefined
}

export function getHydrateFn(
  option: LifecycleOption<any> | undefined,
): ((wire: any) => any) | undefined {
  if (!option || typeof option === 'function') return undefined
  const h = option.hydrate
  return typeof h === 'function' ? h : undefined
}

export function getRevalidateFn(
  option: LifecycleOption<any> | undefined,
): ((ctx: any & { prev: any }) => any) | undefined {
  if (!option || typeof option === 'function') return undefined
  const r = option.revalidate
  return typeof r === 'function' ? r : undefined
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
