import { default as invariant } from 'tiny-invariant'
import { default as warning } from 'tiny-warning'
import { startSerializer } from './serializer'
import { mergeHeaders } from './headers'
import type { Readable } from 'node:stream'
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

export type MiddlewareOptions = {
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

export type MiddlewareResult = MiddlewareOptions & {
  result?: unknown
  error?: unknown
  type: ServerFnTypeOrTypeFn<any, any, any, any>
}

export type NextFn = (ctx: MiddlewareResult) => Promise<MiddlewareResult>

export type MiddlewareFn = (
  ctx: MiddlewareOptions & {
    next: NextFn
  },
) => Promise<MiddlewareResult>

export const applyMiddleware = async (
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
