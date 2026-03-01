import { createMiddleware } from './createMiddleware'
import { createServerFn } from './createServerFn'
import type { TSS_SERVER_FUNCTION } from './constants'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  CreateMiddlewareFn,
} from './createMiddleware'
import type { CreateServerFn, CustomFetch } from './createServerFn'
import type { AnySerializationAdapter, SSROption } from '@tanstack/router-core'

export interface StartInstanceOptions<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> {
  '~types': StartInstanceTypes<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
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
> {
  getOptions: () =>
    | Promise<
        StartInstanceOptions<
          TSerializationAdapters,
          TDefaultSsr,
          TRequestMiddlewares,
          TFunctionMiddlewares
        >
      >
    | StartInstanceOptions<
        TSerializationAdapters,
        TDefaultSsr,
        TRequestMiddlewares,
        TFunctionMiddlewares
      >
  /**
   * A pre-typed `createMiddleware` that carries the global middleware context
   * types from this Start instance. Middleware created through this method
   * will see the accumulated context from all global request and function
   * middleware in their `.server()` callbacks, without requiring the app's
   * module augmentation of `Register`.
   *
   * @example
   * ```ts
   * // In an external package, import the start instance:
   * import { startInstance } from '@myapp/start-config'
   *
   * // The middleware's server callback sees context.locale from global middleware
   * export const authMiddleware = startInstance
   *   .createMiddleware({ type: 'function' })
   *   .server(({ next, context }) => {
   *     // context.locale is fully typed from global request middleware!
   *     console.log(context.locale)
   *     return next({ context: { user: getUser() } })
   *   })
   * ```
   */
  createMiddleware: CreateMiddlewareFn<{
    config: StartInstanceOptions<
      TSerializationAdapters,
      TDefaultSsr,
      TRequestMiddlewares,
      TFunctionMiddlewares
    >
  }>
  /**
   * A pre-typed `createServerFn` that carries the global middleware context
   * types from this Start instance. Use this to create server functions in
   * external packages that need access to middleware-provided context without
   * requiring the app's module augmentation of `Register`.
   *
   * @example
   * ```ts
   * // In your app's start.ts, export the start instance:
   * export const startInstance = createStart(() => ({
   *   requestMiddleware: [localeMiddleware],
   * }))
   *
   * // In an external package, import and use it:
   * import { startInstance } from '@myapp/start-config'
   *
   * export const getLocale = startInstance
   *   .createServerFn({ method: 'GET' })
   *   .handler(({ context }) => {
   *     // context.locale is fully typed!
   *     return { locale: context.locale }
   *   })
   * ```
   */
  createServerFn: CreateServerFn<{
    config: StartInstanceOptions<
      TSerializationAdapters,
      TDefaultSsr,
      TRequestMiddlewares,
      TFunctionMiddlewares
    >
  }>
}

export interface StartInstanceTypes<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> {
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr
  requestMiddleware: TRequestMiddlewares
  functionMiddleware: TFunctionMiddlewares
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

export const createStart = <
  const TSerializationAdapters extends ReadonlyArray<AnySerializationAdapter> =
    [],
  TDefaultSsr extends SSROption = SSROption,
  const TRequestMiddlewares extends ReadonlyArray<AnyRequestMiddleware> = [],
  const TFunctionMiddlewares extends ReadonlyArray<AnyFunctionMiddleware> = [],
>(
  getOptions: () =>
    | Promise<
        Omit<
          StartInstanceOptions<
            TSerializationAdapters,
            TDefaultSsr,
            TRequestMiddlewares,
            TFunctionMiddlewares
          >,
          '~types'
        >
      >
    | Omit<
        StartInstanceOptions<
          TSerializationAdapters,
          TDefaultSsr,
          TRequestMiddlewares,
          TFunctionMiddlewares
        >,
        '~types'
      >,
): StartInstance<
  TSerializationAdapters,
  TDefaultSsr,
  TRequestMiddlewares,
  TFunctionMiddlewares
> => {
  return {
    getOptions: async () => {
      const options = await getOptions()
      if (options.serializationAdapters) {
        const deduped = new Set<AnySerializationAdapter>()
        dedupeSerializationAdapters(
          deduped,
          options.serializationAdapters as unknown as Array<AnySerializationAdapter>,
        )
        options.serializationAdapters = Array.from(deduped) as any
      }
      return options
    },
    createMiddleware: createMiddleware,
    createServerFn: createServerFn,
  } as unknown as StartInstance<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >
}

export type AnyStartInstance = StartInstance<any, any, any, any>
export type AnyStartInstanceOptions = StartInstanceOptions<any, any, any, any>

declare module '@tanstack/router-core' {
  interface SerializableExtensions {
    serverFn: { [TSS_SERVER_FUNCTION]: true }
  }
}
