import { isPromise } from '@tanstack/router-core'
import { createMiddleware } from './createMiddleware'
import type { TSS_SERVER_FUNCTION } from './constants'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  CreateMiddlewareFn,
} from './createMiddleware'
import type { CustomFetch } from './createServerFn'
import type { AnyStartModule, WithStartModules } from './createStartModule'
import type { StartOptionList } from './startOptionList'
import type {
  AnySerializationAdapter,
  Register,
  SSROption,
} from '@tanstack/router-core'

export interface StartInstanceOptions<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
  in out TStartModules = [],
  in out TOwnRequestMiddlewares = TRequestMiddlewares,
  in out TOwnFunctionMiddlewares = TFunctionMiddlewares,
> {
  '~types': StartInstanceTypes<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares,
    TStartModules,
    TOwnRequestMiddlewares,
    TOwnFunctionMiddlewares
  >
  serializationAdapters?: TSerializationAdapters
  defaultSsr?: TDefaultSsr
  requestMiddleware?: TRequestMiddlewares
  functionMiddleware?: TFunctionMiddlewares
  /**
   * Configuration options for server functions.
   */
  serverFns?: {
    /**
     * A custom fetch implementation to use for all server function calls.
     * This can be overridden by middleware or at the call site.
     *
     * Precedence (highest to lowest):
     * 1. Call site: `serverFn({ fetch: customFetch })`
     * 2. Later middleware: Last middleware in chain that provides `fetch`
     * 3. Earlier middleware: First middleware in chain that provides `fetch`
     * 4. createStart: `createStart({ serverFns: { fetch: customFetch } })`
     * 5. Default: Global `fetch` function
     *
     * @note Only applies on the client side. During SSR, server functions are called directly.
     */
    fetch?: CustomFetch
  }
}

export interface StartInstance<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
  in out TStartModules = [],
  in out TOwnRequestMiddlewares = TRequestMiddlewares,
  in out TOwnFunctionMiddlewares = TFunctionMiddlewares,
> {
  getOptions: () =>
    | Promise<
        StartInstanceOptions<
          TSerializationAdapters,
          TDefaultSsr,
          TRequestMiddlewares,
          TFunctionMiddlewares,
          TStartModules,
          TOwnRequestMiddlewares,
          TOwnFunctionMiddlewares
        >
      >
    | StartInstanceOptions<
        TSerializationAdapters,
        TDefaultSsr,
        TRequestMiddlewares,
        TFunctionMiddlewares,
        TStartModules,
        TOwnRequestMiddlewares,
        TOwnFunctionMiddlewares
      >
  createMiddleware: CreateMiddlewareFn<Register>
}

export interface StartInstanceTypes<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
  in out TStartModules = [],
  in out TOwnRequestMiddlewares = TRequestMiddlewares,
  in out TOwnFunctionMiddlewares = TFunctionMiddlewares,
> {
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr
  requestMiddleware: TRequestMiddlewares
  functionMiddleware: TFunctionMiddlewares
  startModules: TStartModules
  ownRequestMiddleware: TOwnRequestMiddlewares
  ownFunctionMiddleware: TOwnFunctionMiddlewares
}

function dedupeSerializationAdapters(
  deduped: Set<AnySerializationAdapter>,
  serializationAdapters: Array<AnySerializationAdapter>,
): void {
  for (let i = 0, len = serializationAdapters.length; i < len; i++) {
    const current = serializationAdapters[i]!
    if (!deduped.has(current)) {
      deduped.add(current)
      if (current.extends) {
        dedupeSerializationAdapters(deduped, current.extends)
      }
    }
  }
}

const startModuleOptionKeys = [
  'serializationAdapters',
  'requestMiddleware',
  'functionMiddleware',
] as const

/**
 * Returns the options with the contributions of the installed route modules
 * appended: the application's own entries first, each entry once. Middleware
 * requirements are type-only. The factory's options object is not changed, so
 * repeated `getOptions()` calls never accumulate.
 */
function installStartModules<T extends Record<string, any>>(
  options: T,
  modules: ReadonlyArray<AnyStartModule>,
): T {
  const installed: Record<string, any> = { ...options }
  const fragments = Array.from(new Set(modules), (module) =>
    module.getOptions(),
  )
  for (const key of startModuleOptionKeys) {
    const merged = new Set<any>(options[key])
    for (const fragment of fragments) {
      fragment[key]?.forEach((entry: any) => merged.add(entry))
    }
    installed[key] = Array.from(merged)
  }
  return installed as T
}

function dedupeOptions<
  T extends {
    serializationAdapters?: ReadonlyArray<AnySerializationAdapter>
    extends?: ReadonlyArray<AnyStartModule>
  },
>(options: T): T {
  if (options.extends) {
    options = installStartModules(options, options.extends)
  }
  if (options.serializationAdapters) {
    const deduped = new Set<AnySerializationAdapter>()
    dedupeSerializationAdapters(
      deduped,
      options.serializationAdapters as Array<AnySerializationAdapter>,
    )
    options.serializationAdapters = Array.from(deduped)
  }
  return options
}

/**
 * Options of `createStart`: the Start instance options plus the Start
 * fragments of installed route modules (`extends`).
 */
export type CreateStartOptions<
  TSerializationAdapters,
  TDefaultSsr,
  TRequestMiddlewares,
  TFunctionMiddlewares,
  TStartModules,
> = Omit<
  StartInstanceOptions<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >,
  '~types'
> & {
  /**
   * Start fragments of route modules to install, usually `startModules` from
   * the generated `startModules.gen.ts`. Their serialization adapters and
   * middleware run after the application's own.
   */
  extends?: TStartModules
}

type AnyCreateStartOptions = CreateStartOptions<
  ReadonlyArray<AnySerializationAdapter>,
  SSROption,
  ReadonlyArray<AnyRequestMiddleware>,
  ReadonlyArray<AnyFunctionMiddleware>,
  ReadonlyArray<AnyStartModule>
>

export const createStart = <
  const TSerializationAdapters extends ReadonlyArray<AnySerializationAdapter> =
    [],
  TDefaultSsr extends SSROption = SSROption,
  const TRequestMiddlewares extends ReadonlyArray<AnyRequestMiddleware> = [],
  const TFunctionMiddlewares extends ReadonlyArray<AnyFunctionMiddleware> = [],
  const TStartModules extends ReadonlyArray<AnyStartModule> = [],
  const TOptions extends
    | AnyCreateStartOptions
    | Promise<AnyCreateStartOptions> =
    | AnyCreateStartOptions
    | Promise<AnyCreateStartOptions>,
>(
  getOptions: (() =>
    | Promise<
        CreateStartOptions<
          TSerializationAdapters,
          TDefaultSsr,
          TRequestMiddlewares,
          TFunctionMiddlewares,
          TStartModules
        >
      >
    | CreateStartOptions<
        TSerializationAdapters,
        TDefaultSsr,
        TRequestMiddlewares,
        TFunctionMiddlewares,
        TStartModules
      >) &
    (() => TOptions),
): StartInstance<
  WithStartModules<
    StartOptionList<
      Awaited<TOptions>,
      'serializationAdapters',
      TSerializationAdapters
    >,
    StartOptionList<Awaited<TOptions>, 'extends', TStartModules>,
    'serializationAdapters'
  >,
  TDefaultSsr,
  WithStartModules<
    StartOptionList<
      Awaited<TOptions>,
      'requestMiddleware',
      TRequestMiddlewares
    >,
    StartOptionList<Awaited<TOptions>, 'extends', TStartModules>,
    'requestMiddleware'
  >,
  WithStartModules<
    StartOptionList<
      Awaited<TOptions>,
      'functionMiddleware',
      TFunctionMiddlewares
    >,
    StartOptionList<Awaited<TOptions>, 'extends', TStartModules>,
    'functionMiddleware'
  >,
  StartOptionList<Awaited<TOptions>, 'extends', TStartModules>,
  StartOptionList<Awaited<TOptions>, 'requestMiddleware', TRequestMiddlewares>,
  StartOptionList<Awaited<TOptions>, 'functionMiddleware', TFunctionMiddlewares>
> => {
  return {
    // A synchronous factory returns synchronously so callers can skip a
    // microtask per request.
    getOptions: () => {
      const options = getOptions()
      // Promise.resolve adopts any thenable and returns a native promise as is.
      return isPromise(options)
        ? Promise.resolve(options).then(dedupeOptions)
        : dedupeOptions(options)
    },
    createMiddleware: createMiddleware,
  } as StartInstance<any, any, any, any, any, any, any>
}

export type AnyStartInstance = StartInstance<any, any, any, any, any, any, any>
export type AnyStartInstanceOptions = StartInstanceOptions<
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

declare module '@tanstack/router-core/extensions' {
  interface SerializableExtensions {
    serverFn: { [TSS_SERVER_FUNCTION]: true }
  }
}
