import { defaultTransformer, invariant, warning } from '@tanstack/react-router'
import { mergeHeaders } from './headers'
import { globalMiddleware } from './registerGlobalMiddleware'
import type {
  AnyValidator,
  Constrain,
  DefaultTransformerParse,
  DefaultTransformerStringify,
  Expand,
  ResolveValidatorInput,
  TransformerStringify,
  Validator,
} from '@tanstack/react-router'
import type {
  AnyMiddleware,
  MergeAllServerContext,
  MergeAllValidatorInputs,
  MergeAllValidatorOutputs,
} from './createMiddleware'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  headers?: HeadersInit
}

export type Fetcher<TMiddlewares, TValidator, TResponse> = {
  url: string
  __executeServer: (opts: {
    method: Method
    data: unknown
    headers?: HeadersInit
  }) => Promise<unknown>
} & FetcherImpl<TMiddlewares, TValidator, TResponse>

export type FetcherImpl<TMiddlewares, TValidator, TResponse> =
  undefined extends MergeAllValidatorInputs<TMiddlewares, TValidator>
    ? (
        opts?: OptionalFetcherDataOptions<
          Expand<MergeAllValidatorInputs<TMiddlewares, TValidator>>
        >,
      ) => Promise<FetcherData<TResponse>>
    : (
        opts: RequiredFetcherDataOptions<
          Expand<MergeAllValidatorInputs<TMiddlewares, TValidator>>
        >,
      ) => Promise<FetcherData<TResponse>>

export type FetcherBaseOptions = {
  headers?: HeadersInit
  type?: ServerFnType
}

export type ServerFnType = 'static' | 'dynamic'

export interface RequiredFetcherDataOptions<TInput> extends FetcherBaseOptions {
  data: TInput
}

export interface OptionalFetcherDataOptions<TInput> extends FetcherBaseOptions {
  data?: TInput
}

export type FetcherData<TResponse> = DefaultTransformerParse<
  TResponse extends JsonResponse<infer TData> ? TData : TResponse
>

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) =>
  | Promise<DefaultTransformerStringify<TResponse>>
  | DefaultTransformerStringify<TResponse>

export interface ServerFnCtx<TMethod, TMiddlewares, TValidator> {
  method: TMethod
  data: Expand<MergeAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<MergeAllServerContext<TMiddlewares>>
}

export type CompiledFetcherFn<TResponse> = {
  (opts: CompiledFetcherFnOptions & ServerFnInternalOptions): Promise<TResponse>
  url: string
}

type ServerFnInternalOptions<
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
  filename: string
  functionId: string
  type: ServerFnTypeOrTypeFn<TMethod, TMiddlewares, AnyValidator>
}

export type ConstrainValidator<TValidator> = unknown extends TValidator
  ? TValidator
  : Constrain<
      TValidator,
      Validator<
        TransformerStringify<
          ResolveValidatorInput<TValidator>,
          Date | undefined | FormData
        >,
        any
      >
    >

// Validator
export interface ServerFnValidator<TMethod extends Method, TMiddlewares> {
  validator: <TValidator>(
    validator: ConstrainValidator<TValidator>,
  ) => ServerFnAfterValidator<TMethod, TMiddlewares, TValidator>
}

export interface ServerFnAfterValidator<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnMiddleware<TMethod, TValidator>,
    ServerFnTyper<TMethod, TMiddlewares, TValidator>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {}

// Middleware
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

export interface ServerFnBuilder<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TValidator = unknown,
> extends ServerFnValidator<TMethod, TMiddlewares>,
    ServerFnMiddleware<TMethod, TValidator>,
    ServerFnTyper<TMethod, TMiddlewares, TValidator>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {
  options: ServerFnInternalOptions<TMethod, TResponse, TMiddlewares, TValidator>
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
    ctx: MiddlewareCtx,
  ) => StaticCachedResult | Promise<StaticCachedResult | undefined>
  setItem: (ctx: MiddlewareCtx, response: StaticCachedResult) => Promise<void>
  fetchItem: (
    ctx: MiddlewareCtx,
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
  const getStaticCacheUrl = (options: MiddlewareCtx, hash: string) => {
    return `/__tsr/staticServerFnCache/${options.filename}__${options.functionId}__${hash}.json`
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
            defaultTransformer.parse(c) as {
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
      await fs.writeFile(filePath, defaultTransformer.stringify(response))
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
          .then((d) => defaultTransformer.parse(d))

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
  },
  __opts?: ServerFnInternalOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TValidator
  >,
): ServerFnBuilder<TMethod, TResponse, TMiddlewares, TValidator> {
  const resolvedOptions = (__opts || options || {}) as ServerFnInternalOptions<
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
            ...resolvedOptions,
            ...(opts as any),
            context: Object.assign({}, extractedFn),
          }).then((d) => d.result)
        },
        {
          // This copies over the URL, function ID and filename
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: async (opts: any) => {
            if (process.env.ROUTER !== 'client') {
              const parsedOpts =
                opts instanceof FormData ? extractFormDataContext(opts) : opts

              const ctx = {
                ...resolvedOptions,
                ...parsedOpts,
              }

              ctx.type =
                typeof resolvedOptions.type === 'function'
                  ? resolvedOptions.type(ctx)
                  : resolvedOptions.type

              const run = async () =>
                executeMiddleware(resolvedMiddleware, 'server', ctx).then(
                  (d) => ({
                    // Only send the result and sendContext back to the client
                    result: d.result,
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
            }

            return undefined
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
    const context = defaultTransformer.parse(serializedContext)
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

export type MiddlewareCtx = {
  context: any
  sendContext: any
  data: any
  result: unknown
  method: Method
  type: 'static' | 'dynamic'
  headers: HeadersInit
  filename: string
  functionId: string
}

const applyMiddleware = (
  middlewareFn: NonNullable<
    | AnyMiddleware['options']['client']
    | AnyMiddleware['options']['server']
    | AnyMiddleware['options']['clientAfter']
  >,
  mCtx: MiddlewareCtx,
  nextFn: (ctx: MiddlewareCtx) => Promise<MiddlewareCtx>,
) => {
  return middlewareFn({
    ...mCtx,
    next: ((userResult: any) => {
      // Take the user provided context
      // and merge it with the current context
      const context = {
        ...mCtx.context,
        ...userResult?.context,
      }

      const sendContext = {
        ...mCtx.sendContext,
        ...(userResult?.sendContext ?? {}),
      }

      const headers = mergeHeaders(mCtx.headers, userResult?.headers)

      // Return the next middleware
      return nextFn({
        ...mCtx,
        context,
        sendContext,
        headers,
        result: userResult?.result ?? (mCtx as any).result,
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
  ctx: Omit<MiddlewareCtx, 'headers'> & { headers?: HeadersInit },
): Promise<MiddlewareCtx> {
  const flattenedMiddlewares = flattenMiddlewares([
    ...globalMiddleware,
    ...middlewares,
  ])

  const next = async (ctx: MiddlewareCtx): Promise<MiddlewareCtx> => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx as any
    }

    if (
      nextMiddleware.options.validator &&
      (env === 'client' ? nextMiddleware.options.validateClient : true)
    ) {
      // Execute the middleware's input function
      ctx.data = await execValidator(nextMiddleware.options.validator, ctx.data)
    }

    const middlewareFn =
      env === 'client'
        ? nextMiddleware.options.client
        : nextMiddleware.options.server

    if (middlewareFn) {
      // Execute the middleware
      return applyMiddleware(
        middlewareFn,
        ctx,
        async (userCtx): Promise<MiddlewareCtx> => {
          // If there is a clientAfter function and we are on the client
          if (env === 'client' && nextMiddleware.options.clientAfter) {
            // We need to await the next middleware and get the result
            const resultCtx = await next(userCtx)
            // Then we can execute the clientAfter function
            return applyMiddleware(
              nextMiddleware.options.clientAfter,
              resultCtx as any,
              // Identity, because there "next" is just returning
              (d: any) => d,
            ) as any
          }

          return next(userCtx)
        },
      ) as any
    }

    return next(ctx)
  }

  // Start the middleware chain
  return next({
    ...ctx,
    headers: ctx.headers || {},
    sendContext: (ctx as any).sendContext || {},
    context: ctx.context || {},
  })
}

function serverFnBaseToMiddleware(
  options: ServerFnInternalOptions<any, any, any, any>,
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
          typeof document !== 'undefined' &&
          serverFnStaticCache?.fetchItem
        ) {
          const result = await serverFnStaticCache.fetchItem(payload)

          if (result) {
            if (result.error) {
              throw result.error
            }

            return next(result.ctx)
          }

          warning(
            result,
            `No static cache item found for ${payload.filename}__${payload.functionId}__${JSON.stringify(payload.data)}, falling back to server function...`,
          )
        }

        // Execute the extracted function
        // but not before serializing the context
        const res = await options.extractedFn?.(payload)

        return next(res)
      },
      server: async ({ next, ...ctx }) => {
        if (process.env.ROUTER !== 'client') {
          // Execute the server function
          const result = await options.serverFn?.(ctx as any)

          return next({
            result,
          } as any)
        }

        throw new Error('Server function called from the client!')
      },
    },
  }
}
