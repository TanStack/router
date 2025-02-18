import {
  invariant,
  isNotFound,
  isRedirect,
  warning,
} from '@tanstack/react-router'
import { mergeHeaders } from './headers'
import { globalMiddleware } from './registerGlobalMiddleware'
import { startSerializer } from './serializer'
import type {
  AnyValidator,
  Constrain,
  Expand,
  ResolveValidatorInput,
  SerializerParse,
  SerializerStringify,
  SerializerStringifyBy,
  Validator,
} from '@tanstack/react-router'
import type {
  AnyMiddleware,
  AssignAllClientSendContext,
  AssignAllServerContext,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
  MiddlewareClientFnResult,
  MiddlewareServerFnResult,
} from './createMiddleware'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  headers?: HeadersInit
  context?: any
}

export type Fetcher<TMiddlewares, TValidator, TResponse> =
  undefined extends IntersectAllValidatorInputs<TMiddlewares, TValidator>
    ? OptionalFetcher<TMiddlewares, TValidator, TResponse>
    : RequiredFetcher<TMiddlewares, TValidator, TResponse>

export interface FetcherBase {
  url: string
  __executeServer: (opts: {
    method: Method
    data: unknown
    headers?: HeadersInit
    context?: any
  }) => Promise<unknown>
}

export type FetchResult<
  TMiddlewares,
  TResponse,
  TFullResponse extends boolean,
> = false extends TFullResponse
  ? Promise<FetcherData<TResponse>>
  : Promise<FullFetcherData<TMiddlewares, TResponse>>

export interface OptionalFetcher<TMiddlewares, TValidator, TResponse>
  extends FetcherBase {
  <TFullResponse extends boolean>(
    options?: OptionalFetcherDataOptions<
      TMiddlewares,
      TValidator,
      TFullResponse
    >,
  ): FetchResult<TMiddlewares, TResponse, TFullResponse>
}

export interface RequiredFetcher<TMiddlewares, TValidator, TResponse>
  extends FetcherBase {
  <TFullResponse extends boolean>(
    opts: RequiredFetcherDataOptions<TMiddlewares, TValidator, TFullResponse>,
  ): FetchResult<TMiddlewares, TResponse, TFullResponse>
}

export type FetcherBaseOptions<TFullResponse extends boolean = false> = {
  headers?: HeadersInit
  type?: ServerFnType
  fullResponse?: TFullResponse
}

export type ServerFnType = 'static' | 'dynamic'

export interface OptionalFetcherDataOptions<
  TMiddlewares,
  TValidator,
  TFullResponse extends boolean,
> extends FetcherBaseOptions<TFullResponse> {
  data?: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export interface RequiredFetcherDataOptions<
  TMiddlewares,
  TValidator,
  TFullResponse extends boolean,
> extends FetcherBaseOptions<TFullResponse> {
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

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) => Promise<SerializerStringify<TResponse>> | SerializerStringify<TResponse>

export interface ServerFnCtx<TMethod, TMiddlewares, TValidator> {
  method: TMethod
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares>>
}

export type CompiledFetcherFn<TResponse> = {
  (
    opts: CompiledFetcherFnOptions & ServerFnBaseOptions<Method>,
  ): Promise<TResponse>
  url: string
}

type ServerFnBaseOptions<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TInput = unknown,
> = {
  method: TMethod
  validateClient?: boolean
  middleware?: Constrain<TMiddlewares, ReadonlyArray<AnyMiddleware>>
  validator?: ConstrainValidator<TInput>
  extractedFn?: CompiledFetcherFn<TResponse>
  serverFn?: ServerFn<TMethod, TMiddlewares, TInput, TResponse>
  functionId: string
  type: ServerFnTypeOrTypeFn<TMethod, TMiddlewares, AnyValidator>
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

export interface ServerFnMiddleware<TMethod extends Method, TValidator> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => ServerFnAfterMiddleware<TMethod, TNewMiddlewares, TValidator>
}

export interface ServerFnAfterMiddleware<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnValidator<TMethod, TMiddlewares>,
    ServerFnTyper<TMethod, TMiddlewares, TValidator>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {}

export type ValidatorFn<TMethod extends Method, TMiddlewares> = <TValidator>(
  validator: ConstrainValidator<TValidator>,
) => ServerFnAfterValidator<TMethod, TMiddlewares, TValidator>

export interface ServerFnValidator<TMethod extends Method, TMiddlewares> {
  validator: ValidatorFn<TMethod, TMiddlewares>
}

export interface ServerFnAfterValidator<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnMiddleware<TMethod, TValidator>,
    ServerFnTyper<TMethod, TMiddlewares, TValidator>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {}

// Typer
export interface ServerFnTyper<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> {
  type: (
    typer: ServerFnTypeOrTypeFn<TMethod, TMiddlewares, TValidator>,
  ) => ServerFnAfterTyper<TMethod, TMiddlewares, TValidator>
}

export type ServerFnTypeOrTypeFn<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> =
  | ServerFnType
  | ((ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>) => ServerFnType)

export interface ServerFnAfterTyper<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnHandler<TMethod, TMiddlewares, TValidator> {}

// Handler
export interface ServerFnHandler<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> {
  handler: <TNewResponse>(
    fn?: ServerFn<TMethod, TMiddlewares, TValidator, TNewResponse>,
  ) => Fetcher<TMiddlewares, TValidator, TNewResponse>
}

export interface ServerFnBuilder<TMethod extends Method = 'GET'>
  extends ServerFnMiddleware<TMethod, undefined>,
    ServerFnValidator<TMethod, undefined>,
    ServerFnTyper<TMethod, undefined, undefined>,
    ServerFnHandler<TMethod, undefined, undefined> {
  options: ServerFnBaseOptions<TMethod, unknown, undefined, undefined>
}

type StaticCachedResult = {
  ctx?: {
    result: any
    context: any
  }
  error?: any
}

export type ServerFnStaticCache = {
  getItem: (
    ctx: MiddlewareResult,
  ) => StaticCachedResult | Promise<StaticCachedResult | undefined>
  setItem: (
    ctx: MiddlewareResult,
    response: StaticCachedResult,
  ) => Promise<void>
  fetchItem: (
    ctx: MiddlewareResult,
  ) => StaticCachedResult | Promise<StaticCachedResult | undefined>
}

let serverFnStaticCache: ServerFnStaticCache | undefined

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
  const getStaticCacheUrl = (options: MiddlewareResult, hash: string) => {
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
        const fs = await import('node:fs/promises')
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
      const fs = await import('node:fs/promises')
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

export function createServerFn<
  TMethod extends Method,
  TResponse = unknown,
  TMiddlewares = undefined,
  TValidator = undefined,
>(
  options?: {
    method?: TMethod
    type?: ServerFnType
  },
  __opts?: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TValidator>,
): ServerFnBuilder<TMethod> {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    TMethod,
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
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    validator: (validator) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { validator }),
      ) as any
    },
    type: (type) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { type }),
      ) as any
    },
    handler: (...args) => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, serverFn] = args as unknown as [
        CompiledFetcherFn<TResponse>,
        ServerFn<TMethod, TMiddlewares, TValidator, TResponse>,
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
            context: {},
          }).then((d) => {
            if (d.error) throw d.error
            return d.result
          })
        },
        {
          // This copies over the URL, function ID
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: async (opts_: any) => {
            const opts =
              opts_ instanceof FormData ? extractFormDataContext(opts_) : opts_

            opts.type =
              typeof resolvedOptions.type === 'function'
                ? resolvedOptions.type(opts)
                : resolvedOptions.type

            const ctx = {
              ...extractedFn,
              ...opts,
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

function extractFormDataContext(formData: FormData) {
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

function flattenMiddlewares(
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

export type MiddlewareOptions = {
  method: Method
  data: any
  headers?: HeadersInit
  sendContext?: any
  context?: any
  type: ServerFnTypeOrTypeFn<any, any, any>
  functionId: string
}

export type MiddlewareResult = MiddlewareOptions & {
  result?: unknown
  error?: unknown
  type: ServerFnTypeOrTypeFn<any, any, any>
}

export type NextFn = (ctx: MiddlewareResult) => Promise<MiddlewareResult>

export type MiddlewareFn = (
  ctx: MiddlewareOptions & {
    next: NextFn
  },
) => Promise<MiddlewareResult>

const applyMiddleware = async (
  middlewareFn: MiddlewareFn,
  ctx: MiddlewareOptions,
  nextFn: NextFn,
) => {
  return middlewareFn({
    ...ctx,
    next: (async (userCtx: MiddlewareResult | undefined = {} as any) => {
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
          userCtx.result !== undefined ? userCtx.result : (ctx as any).result,
        error: userCtx.error ?? (ctx as any).error,
      })
    }) as any,
  } as any)
}

function execValidator(validator: AnyValidator, input: unknown): unknown {
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

async function executeMiddleware(
  middlewares: Array<AnyMiddleware>,
  env: 'client' | 'server',
  opts: MiddlewareOptions,
): Promise<MiddlewareResult> {
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
        return next(newCtx).catch((error) => {
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

function serverFnBaseToMiddleware(
  options: ServerFnBaseOptions<any, any, any, any>,
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
