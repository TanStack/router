// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DehydrateOption<TValue = unknown, TWire = unknown> =
  | boolean
  | ((ctx: { data: TValue }) => TWire)

export type HydrateOption<TValue = unknown, TWire = unknown> = (ctx: {
  data: TWire
}) => TValue

/**
 * Lifecycle methods (context/beforeLoad/loader) accept either a plain handler
 * function or an object form with additional capabilities.
 */
export type LifecycleOption<
  TFn,
  TValue = unknown,
  TWire = unknown,
  TRevalidateCtx = unknown,
> =
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
            ctx: TRevalidateCtx & { prev: TValue | undefined },
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
          dehydrate: (ctx: { data: TValue }) => TWire
          hydrate: HydrateOption<TValue, TWire>
        }
    ))

type AnyLifecycleFunction = (...args: Array<any>) => any

type AnyLifecycleObject = {
  handler: AnyLifecycleFunction
  revalidate?: boolean | ((ctx: any) => any)
  dehydrate?: boolean | ((ctx: { data: any }) => any)
  hydrate?: (ctx: { data: any }) => any
}

type AnyLifecycleOption = AnyLifecycleFunction | AnyLifecycleObject

type ResolveHandlerFromOption<TOption> = TOption extends {
  handler: infer THandler
}
  ? THandler
  : TOption

type ResolveDehydrateFromOption<TOption> = TOption extends {
  dehydrate: infer TDehydrate
}
  ? TDehydrate extends AnyLifecycleFunction
    ? TDehydrate
    : never
  : never

type ResolveHydrateFromOption<TOption> = TOption extends {
  hydrate: infer THydrate
}
  ? THydrate extends AnyLifecycleFunction
    ? THydrate
    : never
  : never

type ResolveRevalidateFromOption<TOption> = TOption extends {
  revalidate: infer TRevalidate
}
  ? TRevalidate extends AnyLifecycleFunction
    ? TRevalidate
    : never
  : never

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
export function resolveHandler<TOption extends AnyLifecycleOption>(
  option: TOption | undefined,
): ResolveHandlerFromOption<TOption> | undefined {
  if (option === undefined) return undefined
  if (typeof option === 'function')
    return option as ResolveHandlerFromOption<TOption>
  return option.handler as ResolveHandlerFromOption<TOption>
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
export function shouldDehydrate<TOption extends AnyLifecycleOption>(
  option: TOption,
  routerDefault: boolean | undefined,
  builtinDefault: boolean,
): boolean {
  if (typeof option !== 'function') {
    const d = option.dehydrate
    if (typeof d === 'boolean') return d
    if (typeof d === 'function') return true
  }
  return routerDefault ?? builtinDefault
}

export function getDehydrateFn<TOption extends AnyLifecycleOption>(
  option: TOption | undefined,
): ResolveDehydrateFromOption<TOption> | undefined {
  if (!option || typeof option === 'function') return undefined
  const d = option.dehydrate
  return (typeof d === 'function' ? d : undefined) as
    | ResolveDehydrateFromOption<TOption>
    | undefined
}

export function getHydrateFn<TOption extends AnyLifecycleOption>(
  option: TOption | undefined,
): ResolveHydrateFromOption<TOption> | undefined {
  if (!option || typeof option === 'function') return undefined
  const h = option.hydrate
  return (typeof h === 'function' ? h : undefined) as
    | ResolveHydrateFromOption<TOption>
    | undefined
}

export function getRevalidateFn<TOption extends AnyLifecycleOption>(
  option: TOption | undefined,
): ResolveRevalidateFromOption<TOption> | undefined {
  if (!option || typeof option === 'function') return undefined
  const r = option.revalidate
  return (typeof r === 'function' ? r : undefined) as
    | ResolveRevalidateFromOption<TOption>
    | undefined
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
