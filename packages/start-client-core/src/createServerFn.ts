import { default as invariant } from 'tiny-invariant'
import { default as warning } from 'tiny-warning'
import { isNotFound, isRedirect } from '@tanstack/router-core'
import { startSerializer } from './serializer'
import { mergeHeaders } from './headers'
import { globalMiddleware } from './registerGlobalMiddleware'
import type {
  AnyValidator,
  Constrain,
  Expand,
  ResolveValidatorInput,
  SerializerParse,
  SerializerStringify,
  SerializerStringifyBy,
  Validator,
} from '@tanstack/router-core'
import type { Readable } from 'node:stream'
import type {
  AnyMiddleware,
  AssignAllClientSendContext,
  AssignAllServerContext,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
  MiddlewareClientFnResult,
  MiddlewareServerFnResult,
} from './createMiddleware'

export function createServerFn<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType = 'data',
  TResponse = unknown,
  TMiddlewares = undefined,
  TValidator = undefined,
>(
  options?: {
    method?: TMethod
    response?: TServerFnResponseType
    type?: ServerFnType
  },
  __opts?: ServerFnBaseOptions<
    TMethod,
    TServerFnResponseType,
    TResponse,
    TMiddlewares,
    TValidator
  >,
): ServerFnBuilder<TMethod, TServerFnResponseType> {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    TMethod,
    ServerFnResponseType,
    TResponse,
    TMiddlewares,
    TValidator
  >

  if (typeof resolvedOptions.method === 'undefined') {
    resolvedOptions.method = 'GET' as TMethod
  }

  return {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      return createServerFn<
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, Object.assign(resolvedOptions, { middleware })) as any
    },
    validator: (validator) => {
      return createServerFn<
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, Object.assign(resolvedOptions, { validator })) as any
    },
    type: (type) => {
      return createServerFn<
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, Object.assign(resolvedOptions, { type })) as any
    },
    handler: (...args) => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, serverFn] = args as unknown as [
        CompiledFetcherFn<TResponse, TServerFnResponseType>,
        ServerFn<
          TMethod,
          TServerFnResponseType,
          TMiddlewares,
          TValidator,
          TResponse
        >,
      ]

      // Keep the original function around so we can use it
      // in the server environment
      Object.assign(resolvedOptions, {
        ...extractedFn,
        extractedFn,
        serverFn,
      })

      const resolvedMiddleware = [
        ...(resolvedOptions.middleware || []),
        serverFnBaseToMiddleware(resolvedOptions),
      ]

      // We want to make sure the new function has the same
      // properties as the original function

      return Object.assign(
        async (opts?: CompiledFetcherFnOptions) => {
          // Start by executing the client-side middleware chain
          return executeMiddleware(resolvedMiddleware, 'client', {
            ...extractedFn,
            ...resolvedOptions,
            data: opts?.data as any,
            headers: opts?.headers,
            signal: opts?.signal,
            context: {},
          }).then((d) => {
            if (resolvedOptions.response === 'full') {
              return d
            }
            if (d.error) throw d.error
            return d.result
          })
        },
        {
          // This copies over the URL, function ID
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: async (opts_: any, signal: AbortSignal) => {
            const opts =
              opts_ instanceof FormData ? extractFormDataContext(opts_) : opts_

            opts.type =
              typeof resolvedOptions.type === 'function'
                ? resolvedOptions.type(opts)
                : resolvedOptions.type

            const ctx = {
              ...extractedFn,
              ...opts,
              signal,
            }

            const run = () =>
              executeMiddleware(resolvedMiddleware, 'server', ctx).then(
                (d) => ({
                  // Only send the result and sendContext back to the client
                  result: d.result,
                  error: d.error,
                  context: d.sendContext,
                }),
              )

            if (ctx.type === 'static') {
              let response: StaticCachedResult | undefined

              // If we can get the cached item, try to get it
              if (serverFnStaticCache?.getItem) {
                // If this throws, it's okay to let it bubble up
                response = await serverFnStaticCache.getItem(ctx)
              }

              if (!response) {
                // If there's no cached item, execute the server function
                response = await run()
                  .then((d) => {
                    return {
                      ctx: d,
                      error: null,
                    }
                  })
                  .catch((e) => {
                    return {
                      ctx: undefined,
                      error: e,
                    }
                  })

                if (serverFnStaticCache?.setItem) {
                  await serverFnStaticCache.setItem(ctx, response)
                }
              }

              invariant(
                response,
                'No response from both server and static cache!',
              )

              if (response.error) {
                throw response.error
              }

              return response.ctx
            }

            return run()
          },
        },
      ) as any
    },
  }
}

async function executeMiddleware(
  middlewares: Array<AnyMiddleware>,
  env: 'client' | 'server',
  opts: ServerFnMiddlewareOptions,
): Promise<ServerFnMiddlewareResult> {
  const flattenedMiddlewares = flattenMiddlewares([
    ...globalMiddleware,
    ...middlewares,
  ])

  const next: NextFn = async (ctx) => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx
    }

    if (
      nextMiddleware.options.validator &&
      (env === 'client' ? nextMiddleware.options.validateClient : true)
    ) {
      // Execute the middleware's input function
      ctx.data = await execValidator(nextMiddleware.options.validator, ctx.data)
    }

    const middlewareFn = (
      env === 'client'
        ? nextMiddleware.options.client
        : nextMiddleware.options.server
    ) as MiddlewareFn | undefined

    if (middlewareFn) {
      // Execute the middleware
      return applyMiddleware(middlewareFn, ctx, async (newCtx) => {
        return next(newCtx).catch((error: any) => {
          if (isRedirect(error) || isNotFound(error)) {
            return {
              ...newCtx,
              error,
            }
          }

          throw error
        })
      })
    }

    return next(ctx)
  }

  // Start the middleware chain
  return next({
    ...opts,
    headers: opts.headers || {},
    sendContext: opts.sendContext || {},
    context: opts.context || {},
  })
}

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  response?: ServerFnResponseType
  headers?: HeadersInit
  signal?: AbortSignal
  context?: any
}

export type Fetcher<
  TMiddlewares,
  TValidator,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> =
  undefined extends IntersectAllValidatorInputs<TMiddlewares, TValidator>
    ? OptionalFetcher<
        TMiddlewares,
        TValidator,
        TResponse,
        TServerFnResponseType
      >
    : RequiredFetcher<
        TMiddlewares,
        TValidator,
        TResponse,
        TServerFnResponseType
      >

export interface FetcherBase {
  url: string
  __executeServer: (opts: {
    method: Method
    response?: ServerFnResponseType
    data: unknown
    headers?: HeadersInit
    context?: any
    signal: AbortSignal
  }) => Promise<unknown>
}

export type FetchResult<
  TMiddlewares,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> = TServerFnResponseType extends 'raw'
  ? Promise<Response>
  : TServerFnResponseType extends 'full'
    ? Promise<FullFetcherData<TMiddlewares, TResponse>>
    : Promise<FetcherData<TResponse>>

export interface OptionalFetcher<
  TMiddlewares,
  TValidator,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> extends FetcherBase {
  (
    options?: OptionalFetcherDataOptions<TMiddlewares, TValidator>,
  ): FetchResult<TMiddlewares, TResponse, TServerFnResponseType>
}

export interface RequiredFetcher<
  TMiddlewares,
  TValidator,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TValidator>,
  ): FetchResult<TMiddlewares, TResponse, TServerFnResponseType>
}

export type FetcherBaseOptions = {
  headers?: HeadersInit
  type?: ServerFnType
  signal?: AbortSignal
}

export type ServerFnType = 'static' | 'dynamic'

export interface OptionalFetcherDataOptions<TMiddlewares, TValidator>
  extends FetcherBaseOptions {
  data?: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export interface RequiredFetcherDataOptions<TMiddlewares, TValidator>
  extends FetcherBaseOptions {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export interface FullFetcherData<TMiddlewares, TResponse> {
  error: unknown
  result: FetcherData<TResponse>
  context: AssignAllClientSendContext<TMiddlewares>
}

export type FetcherData<TResponse> =
  TResponse extends JsonResponse<any>
    ? SerializerParse<ReturnType<TResponse['json']>>
    : SerializerParse<TResponse>

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'
export type ServerFnResponseType = 'data' | 'full' | 'raw'

// see https://h3.unjs.io/guide/event-handler#responses-types
export type RawResponse = Response | ReadableStream | Readable | null | string

export type ServerFnReturnType<
  TServerFnResponseType extends ServerFnResponseType,
  TResponse,
> = TServerFnResponseType extends 'raw'
  ? RawResponse | Promise<RawResponse>
  : Promise<SerializerStringify<TResponse>> | SerializerStringify<TResponse>
export type ServerFn<
  TMethod,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
  TResponse,
> = (
  ctx: ServerFnCtx<TMethod, TServerFnResponseType, TMiddlewares, TValidator>,
) => ServerFnReturnType<TServerFnResponseType, TResponse>

export interface ServerFnCtx<
  TMethod,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> {
  method: TMethod
  response: TServerFnResponseType
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares>>
  signal: AbortSignal
}

export type CompiledFetcherFn<
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> = {
  (
    opts: CompiledFetcherFnOptions &
      ServerFnBaseOptions<Method, TServerFnResponseType>,
  ): Promise<TResponse>
  url: string
}

export type ServerFnBaseOptions<
  TMethod extends Method = 'GET',
  TServerFnResponseType extends ServerFnResponseType = 'data',
  TResponse = unknown,
  TMiddlewares = unknown,
  TInput = unknown,
> = {
  method: TMethod
  response?: TServerFnResponseType
  validateClient?: boolean
  middleware?: Constrain<TMiddlewares, ReadonlyArray<AnyMiddleware>>
  validator?: ConstrainValidator<TInput>
  extractedFn?: CompiledFetcherFn<TResponse, TServerFnResponseType>
  serverFn?: ServerFn<
    TMethod,
    TServerFnResponseType,
    TMiddlewares,
    TInput,
    TResponse
  >
  functionId: string
  type: ServerFnTypeOrTypeFn<
    TMethod,
    TServerFnResponseType,
    TMiddlewares,
    AnyValidator
  >
}

export type ValidatorSerializerStringify<TValidator> = Validator<
  SerializerStringifyBy<
    ResolveValidatorInput<TValidator>,
    Date | undefined | FormData
  >,
  any
>

export type ConstrainValidator<TValidator> = unknown extends TValidator
  ? TValidator
  : Constrain<TValidator, ValidatorSerializerStringify<TValidator>>

export interface ServerFnMiddleware<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TValidator,
> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => ServerFnAfterMiddleware<
    TMethod,
    TServerFnResponseType,
    TNewMiddlewares,
    TValidator
  >
}

export interface ServerFnAfterMiddleware<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> extends ServerFnValidator<TMethod, TServerFnResponseType, TMiddlewares>,
    ServerFnTyper<TMethod, TServerFnResponseType, TMiddlewares, TValidator>,
    ServerFnHandler<TMethod, TServerFnResponseType, TMiddlewares, TValidator> {}

export type ValidatorFn<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
> = <TValidator>(
  validator: ConstrainValidator<TValidator>,
) => ServerFnAfterValidator<
  TMethod,
  TServerFnResponseType,
  TMiddlewares,
  TValidator
>

export interface ServerFnValidator<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
> {
  validator: ValidatorFn<TMethod, TServerFnResponseType, TMiddlewares>
}

export interface ServerFnAfterValidator<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> extends ServerFnMiddleware<TMethod, TServerFnResponseType, TValidator>,
    ServerFnTyper<TMethod, TServerFnResponseType, TMiddlewares, TValidator>,
    ServerFnHandler<TMethod, TServerFnResponseType, TMiddlewares, TValidator> {}

// Typer
export interface ServerFnTyper<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> {
  type: (
    typer: ServerFnTypeOrTypeFn<
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      TValidator
    >,
  ) => ServerFnAfterTyper<
    TMethod,
    TServerFnResponseType,
    TMiddlewares,
    TValidator
  >
}

export type ServerFnTypeOrTypeFn<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> =
  | ServerFnType
  | ((
      ctx: ServerFnCtx<
        TMethod,
        TServerFnResponseType,
        TMiddlewares,
        TValidator
      >,
    ) => ServerFnType)

export interface ServerFnAfterTyper<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> extends ServerFnHandler<
    TMethod,
    TServerFnResponseType,
    TMiddlewares,
    TValidator
  > {}

// Handler
export interface ServerFnHandler<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> {
  handler: <TNewResponse>(
    fn?: ServerFn<
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      TValidator,
      TNewResponse
    >,
  ) => Fetcher<TMiddlewares, TValidator, TNewResponse, TServerFnResponseType>
}

export interface ServerFnBuilder<
  TMethod extends Method = 'GET',
  TServerFnResponseType extends ServerFnResponseType = 'data',
> extends ServerFnMiddleware<TMethod, TServerFnResponseType, undefined>,
    ServerFnValidator<TMethod, TServerFnResponseType, undefined>,
    ServerFnTyper<TMethod, TServerFnResponseType, undefined, undefined>,
    ServerFnHandler<TMethod, TServerFnResponseType, undefined, undefined> {
  options: ServerFnBaseOptions<
    TMethod,
    TServerFnResponseType,
    unknown,
    undefined,
    undefined
  >
}

export type StaticCachedResult = {
  ctx?: {
    result: any
    context: any
  }
  error?: any
}

export type ServerFnStaticCache = {
  getItem: (
    ctx: ServerFnMiddlewareResult,
  ) => StaticCachedResult | Promise<StaticCachedResult | undefined>
  setItem: (
    ctx: ServerFnMiddlewareResult,
    response: StaticCachedResult,
  ) => Promise<void>
  fetchItem: (
    ctx: ServerFnMiddlewareResult,
  ) => StaticCachedResult | Promise<StaticCachedResult | undefined>
}

export let serverFnStaticCache: ServerFnStaticCache | undefined

export function setServerFnStaticCache(
  cache?: ServerFnStaticCache | (() => ServerFnStaticCache | undefined),
) {
  const previousCache = serverFnStaticCache
  serverFnStaticCache = typeof cache === 'function' ? cache() : cache

  return () => {
    serverFnStaticCache = previousCache
  }
}

export function createServerFnStaticCache(
  serverFnStaticCache: ServerFnStaticCache,
) {
  return serverFnStaticCache
}

setServerFnStaticCache(() => {
  const getStaticCacheUrl = (
    options: ServerFnMiddlewareResult,
    hash: string,
  ) => {
    return `/__tsr/staticServerFnCache/${options.functionId}__${hash}.json`
  }

  const jsonToFilenameSafeString = (json: any) => {
    // Custom replacer to sort keys
    const sortedKeysReplacer = (key: string, value: any) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value)
            .sort()
            .reduce((acc: any, curr: string) => {
              acc[curr] = value[curr]
              return acc
            }, {})
        : value

    // Convert JSON to string with sorted keys
    const jsonString = JSON.stringify(json ?? '', sortedKeysReplacer)

    // Replace characters invalid in filenames
    return jsonString
      .replace(/[/\\?%*:|"<>]/g, '-') // Replace invalid characters with a dash
      .replace(/\s+/g, '_') // Optionally replace whitespace with underscores
  }

  const staticClientCache =
    typeof document !== 'undefined' ? new Map<string, any>() : null

  return createServerFnStaticCache({
    getItem: async (ctx) => {
      if (typeof document === 'undefined') {
        const hash = jsonToFilenameSafeString(ctx.data)
        const url = getStaticCacheUrl(ctx, hash)
        const publicUrl = process.env.TSS_OUTPUT_PUBLIC_DIR!

        // Use fs instead of fetch to read from filesystem
        const { promises: fs } = await import('node:fs')
        const path = await import('node:path')
        const filePath = path.join(publicUrl, url)

        const [cachedResult, readError] = await fs
          .readFile(filePath, 'utf-8')
          .then((c) => [
            startSerializer.parse(c) as {
              ctx: unknown
              error: any
            },
            null,
          ])
          .catch((e) => [null, e])

        if (readError && readError.code !== 'ENOENT') {
          throw readError
        }

        return cachedResult as StaticCachedResult
      }

      return undefined
    },
    setItem: async (ctx, response) => {
      const { promises: fs } = await import('node:fs')
      const path = await import('node:path')

      const hash = jsonToFilenameSafeString(ctx.data)
      const url = getStaticCacheUrl(ctx, hash)
      const publicUrl = process.env.TSS_OUTPUT_PUBLIC_DIR!
      const filePath = path.join(publicUrl, url)

      // Ensure the directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true })

      // Store the result with fs
      await fs.writeFile(filePath, startSerializer.stringify(response))
    },
    fetchItem: async (ctx) => {
      const hash = jsonToFilenameSafeString(ctx.data)
      const url = getStaticCacheUrl(ctx, hash)

      let result: any = staticClientCache?.get(url)

      if (!result) {
        result = await fetch(url, {
          method: 'GET',
        })
          .then((r) => r.text())
          .then((d) => startSerializer.parse(d))

        staticClientCache?.set(url, result)
      }

      return result
    },
  })
})

export function extractFormDataContext(formData: FormData) {
  const serializedContext = formData.get('__TSR_CONTEXT')
  formData.delete('__TSR_CONTEXT')

  if (typeof serializedContext !== 'string') {
    return {
      context: {},
      data: formData,
    }
  }

  try {
    const context = startSerializer.parse(serializedContext)
    return {
      context,
      data: formData,
    }
  } catch {
    return {
      data: formData,
    }
  }
}

export function flattenMiddlewares(
  middlewares: Array<AnyMiddleware>,
): Array<AnyMiddleware> {
  const seen = new Set<AnyMiddleware>()
  const flattened: Array<AnyMiddleware> = []

  const recurse = (middleware: Array<AnyMiddleware>) => {
    middleware.forEach((m) => {
      if (m.options.middleware) {
        recurse(m.options.middleware)
      }

      if (!seen.has(m)) {
        seen.add(m)
        flattened.push(m)
      }
    })
  }

  recurse(middlewares)

  return flattened
}

export type ServerFnMiddlewareOptions = {
  method: Method
  response?: ServerFnResponseType
  data: any
  headers?: HeadersInit
  signal?: AbortSignal
  sendContext?: any
  context?: any
  type: ServerFnTypeOrTypeFn<any, any, any, any>
  functionId: string
}

export type ServerFnMiddlewareResult = ServerFnMiddlewareOptions & {
  result?: unknown
  error?: unknown
  type: ServerFnTypeOrTypeFn<any, any, any, any>
}

export type NextFn = (
  ctx: ServerFnMiddlewareResult,
) => Promise<ServerFnMiddlewareResult>

export type MiddlewareFn = (
  ctx: ServerFnMiddlewareOptions & {
    next: NextFn
  },
) => Promise<ServerFnMiddlewareResult>

export const applyMiddleware = async (
  middlewareFn: MiddlewareFn,
  ctx: ServerFnMiddlewareOptions,
  nextFn: NextFn,
) => {
  return middlewareFn({
    ...ctx,
    next: (async (
      userCtx: ServerFnMiddlewareResult | undefined = {} as any,
    ) => {
      // Return the next middleware
      return nextFn({
        ...ctx,
        ...userCtx,
        context: {
          ...ctx.context,
          ...userCtx.context,
        },
        sendContext: {
          ...ctx.sendContext,
          ...(userCtx.sendContext ?? {}),
        },
        headers: mergeHeaders(ctx.headers, userCtx.headers),
        result:
          userCtx.result !== undefined
            ? userCtx.result
            : ctx.response === 'raw'
              ? userCtx
              : (ctx as any).result,
        error: userCtx.error ?? (ctx as any).error,
      })
    }) as any,
  } as any)
}

export function execValidator(
  validator: AnyValidator,
  input: unknown,
): unknown {
  if (validator == null) return {}

  if ('~standard' in validator) {
    const result = validator['~standard'].validate(input)

    if (result instanceof Promise)
      throw new Error('Async validation not supported')

    if (result.issues)
      throw new Error(JSON.stringify(result.issues, undefined, 2))

    return result.value
  }

  if ('parse' in validator) {
    return validator.parse(input)
  }

  if (typeof validator === 'function') {
    return validator(input)
  }

  throw new Error('Invalid validator type!')
}

export function serverFnBaseToMiddleware(
  options: ServerFnBaseOptions<any, any, any, any, any>,
): AnyMiddleware {
  return {
    _types: undefined!,
    options: {
      validator: options.validator,
      validateClient: options.validateClient,
      client: async ({ next, sendContext, ...ctx }) => {
        const payload = {
          ...ctx,
          // switch the sendContext over to context
          context: sendContext,
          type: typeof ctx.type === 'function' ? ctx.type(ctx) : ctx.type,
        } as any

        if (
          ctx.type === 'static' &&
          process.env.NODE_ENV === 'production' &&
          typeof document !== 'undefined'
        ) {
          invariant(
            serverFnStaticCache,
            'serverFnStaticCache.fetchItem is not available!',
          )

          const result = await serverFnStaticCache.fetchItem(payload)

          if (result) {
            if (result.error) {
              throw result.error
            }

            return next(result.ctx)
          }

          warning(
            result,
            `No static cache item found for ${payload.functionId}__${JSON.stringify(payload.data)}, falling back to server function...`,
          )
        }

        // Execute the extracted function
        // but not before serializing the context
        const res = await options.extractedFn?.(payload)

        return next(res) as unknown as MiddlewareClientFnResult<any, any, any>
      },
      server: async ({ next, ...ctx }) => {
        // Execute the server function
        const result = await options.serverFn?.(ctx)

        return next({
          ...ctx,
          result,
        } as any) as unknown as MiddlewareServerFnResult<any, any, any, any>
      },
    },
  }
}
