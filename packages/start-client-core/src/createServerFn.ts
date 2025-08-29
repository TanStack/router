import { isNotFound, isRedirect } from '@tanstack/router-core'
import { mergeHeaders } from '@tanstack/router-core/ssr/client'
import { globalMiddleware } from './registerGlobalMiddleware'

import { getRouterInstance } from './getRouterInstance'
import type {
  AnyRouter,
  AnyValidator,
  Constrain,
  Expand,
  Register,
  RegisteredSerializableInput,
  ResolveValidatorInput,
  ValidateSerializable,
  ValidateSerializableInput,
  ValidateSerializableInputResult,
  Validator,
} from '@tanstack/router-core'
import type { JsonResponse } from '@tanstack/router-core/ssr/client'
import type { Readable } from 'node:stream'
import type {
  AnyFunctionMiddleware,
  AssignAllClientSendContext,
  AssignAllServerContext,
  FunctionMiddlewareClientFnResult,
  FunctionMiddlewareServerFnResult,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
} from './createMiddleware'

type TODO = any

export function createServerFn<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType = 'data',
  TResponse = unknown,
  TMiddlewares = undefined,
  TValidator = undefined,
>(
  options?: {
    method?: TMethod
    response?: TServerFnResponseType
  },
  __opts?: ServerFnBaseOptions<
    TRegister,
    TMethod,
    TServerFnResponseType,
    TResponse,
    TMiddlewares,
    TValidator
  >,
): ServerFnBuilder<TRegister, TMethod, TServerFnResponseType> {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    TRegister,
    TMethod,
    ServerFnResponseType,
    TResponse,
    TMiddlewares,
    TValidator
  >

  if (typeof resolvedOptions.method === 'undefined') {
    resolvedOptions.method = 'GET' as TMethod
  }

  const res: ServerFnBuilder<TRegister, TMethod, TServerFnResponseType> = {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      // multiple calls to `middleware()` merge the middlewares with the previously supplied ones
      // this is primarily useful for letting users create their own abstractions on top of `createServerFn`
      const newOptions = {
        ...resolvedOptions,
        middleware: [...(resolvedOptions.middleware || []), ...middleware],
      }
      return createServerFn<
        TRegister,
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, newOptions) as any
    },
    validator: (validator) => {
      const newOptions = { ...resolvedOptions, validator: validator as any }
      return createServerFn<
        TRegister,
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, newOptions) as any
    },
    handler: (...args) => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, serverFn] = args as unknown as [
        CompiledFetcherFn<TRegister, TResponse, TServerFnResponseType>,
        ServerFn<
          TRegister,
          TMethod,
          TServerFnResponseType,
          TMiddlewares,
          TValidator,
          TResponse
        >,
      ]

      // Keep the original function around so we can use it
      // in the server environment
      const newOptions = { ...resolvedOptions, extractedFn, serverFn }

      const resolvedMiddleware = [
        ...(newOptions.middleware || []),
        serverFnBaseToMiddleware(newOptions),
      ]

      // We want to make sure the new function has the same
      // properties as the original function

      return Object.assign(
        async (opts?: CompiledFetcherFnOptions) => {
          // Start by executing the client-side middleware chain
          return executeMiddleware(resolvedMiddleware, 'client', {
            ...extractedFn,
            ...newOptions,
            data: opts?.data as any,
            headers: opts?.headers,
            signal: opts?.signal,
            context: {},
            router: getRouterInstance(),
          }).then((d) => {
            if (newOptions.response === 'full') {
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
          __executeServer: async (opts: any, signal: AbortSignal) => {
            const ctx = {
              ...extractedFn,
              ...opts,
              signal,
            }

            return executeMiddleware(resolvedMiddleware, 'server', ctx).then(
              (d) => ({
                // Only send the result and sendContext back to the client
                result: d.result,
                error: d.error,
                context: d.sendContext,
              }),
            )
          },
        },
      ) as any
    },
  }
  const fun = (options?: {
    method?: TMethod
    response?: TServerFnResponseType
  }) => {
    return {
      ...res,
      options: {
        ...res.options,
        ...options,
      },
    }
  }
  return Object.assign(fun, res)
}

export async function executeMiddleware(
  middlewares: Array<AnyFunctionMiddleware>,
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

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  response?: ServerFnResponseType
  headers?: HeadersInit
  signal?: AbortSignal
  context?: any
  // router?: AnyRouter
}

export type Fetcher<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> =
  undefined extends IntersectAllValidatorInputs<TMiddlewares, TValidator>
    ? OptionalFetcher<
        TRegister,
        TMiddlewares,
        TValidator,
        TResponse,
        TServerFnResponseType
      >
    : RequiredFetcher<
        TRegister,
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
  TRegister extends Register,
  TMiddlewares,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> = TServerFnResponseType extends 'raw'
  ? Promise<Response>
  : TServerFnResponseType extends 'full'
    ? Promise<FullFetcherData<TRegister, TMiddlewares, TResponse>>
    : Promise<FetcherData<TRegister, TResponse>>

export interface OptionalFetcher<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> extends FetcherBase {
  (
    options?: OptionalFetcherDataOptions<TMiddlewares, TValidator>,
  ): FetchResult<TRegister, TMiddlewares, TResponse, TServerFnResponseType>
}

export interface RequiredFetcher<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TValidator>,
  ): FetchResult<TRegister, TMiddlewares, TResponse, TServerFnResponseType>
}

export type FetcherBaseOptions = {
  headers?: HeadersInit
  signal?: AbortSignal
}

export interface OptionalFetcherDataOptions<TMiddlewares, TValidator>
  extends FetcherBaseOptions {
  data?: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export interface RequiredFetcherDataOptions<TMiddlewares, TValidator>
  extends FetcherBaseOptions {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export interface FullFetcherData<
  TRegister extends Register,
  TMiddlewares,
  TResponse,
> {
  error: unknown
  result: FetcherData<TRegister, TResponse>
  context: AssignAllClientSendContext<TMiddlewares>
}

export type FetcherData<TRegister extends Register, TResponse> =
  TResponse extends JsonResponse<any>
    ? ValidateSerializableInputResult<TRegister, ReturnType<TResponse['json']>>
    : ValidateSerializableInputResult<TRegister, TResponse>

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'
export type ServerFnResponseType = 'data' | 'full' | 'raw'

// see https://h3.unjs.io/guide/event-handler#responses-types
export type RawResponse = Response | ReadableStream | Readable | null | string

export type ServerFnReturnType<
  TRegister extends Register,
  TServerFnResponseType extends ServerFnResponseType,
  TResponse,
> = TServerFnResponseType extends 'raw'
  ? RawResponse | Promise<RawResponse>
  :
      | Promise<ValidateSerializableInput<TRegister, TResponse>>
      | ValidateSerializableInput<TRegister, TResponse>

export type ServerFn<
  TRegister extends Register,
  TMethod,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
  TResponse,
> = (
  ctx: ServerFnCtx<TMethod, TServerFnResponseType, TMiddlewares, TValidator>,
) => ServerFnReturnType<TRegister, TServerFnResponseType, TResponse>

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
  TRegister extends Register,
  TResponse,
  TServerFnResponseType extends ServerFnResponseType,
> = {
  (
    opts: CompiledFetcherFnOptions &
      ServerFnBaseOptions<TRegister, Method, TServerFnResponseType>,
  ): Promise<TResponse>
  url: string
}

export type ServerFnBaseOptions<
  TRegister extends Register,
  TMethod extends Method = 'GET',
  TServerFnResponseType extends ServerFnResponseType = 'data',
  TResponse = unknown,
  TMiddlewares = unknown,
  TInput = unknown,
> = {
  method: TMethod
  response?: TServerFnResponseType
  validateClient?: boolean
  middleware?: Constrain<TMiddlewares, ReadonlyArray<AnyFunctionMiddleware>>
  validator?: ConstrainValidator<TRegister, TInput>
  extractedFn?: CompiledFetcherFn<TRegister, TResponse, TServerFnResponseType>
  serverFn?: ServerFn<
    TRegister,
    TMethod,
    TServerFnResponseType,
    TMiddlewares,
    TInput,
    TResponse
  >
  functionId: string
}

export type ValidateValidatorInput<
  TRegister extends Register,
  TValidator,
> = ValidateSerializable<
  ResolveValidatorInput<TValidator>,
  RegisteredSerializableInput<TRegister> | FormData
>

export type ValidateValidator<TRegister extends Register, TValidator> =
  ValidateValidatorInput<TRegister, TValidator> extends infer TInput
    ? Validator<TInput, any>
    : never

export type ConstrainValidator<TRegister extends Register, TValidator> =
  | (unknown extends TValidator
      ? TValidator
      : ResolveValidatorInput<TValidator> extends ValidateValidator<
            TRegister,
            TValidator
          >
        ? TValidator
        : never)
  | ValidateValidator<TRegister, TValidator>

type ToTuple<T> =
  T extends ReadonlyArray<infer U> ? T : T extends undefined ? [] : [T]

export interface ServerFnMiddleware<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyFunctionMiddleware>
    >,
  ) => ServerFnAfterMiddleware<
    TRegister,
    TMethod,
    TServerFnResponseType,
    [...ToTuple<TMiddlewares>, ...ToTuple<TNewMiddlewares>],
    TValidator
  >
}

export interface ServerFnAfterMiddleware<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> extends ServerFnMiddleware<
      TRegister,
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      undefined
    >,
    ServerFnValidator<TRegister, TMethod, TServerFnResponseType, TMiddlewares>,
    ServerFnHandler<
      TRegister,
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      TValidator
    > {
  <
    TNewMethod extends Method = TMethod,
    TNewServerFnResponseType extends
      ServerFnResponseType = TServerFnResponseType,
  >(options?: {
    method?: TNewMethod
    response?: TNewServerFnResponseType
  }): ServerFnAfterMiddleware<
    TRegister,
    TNewMethod,
    TNewServerFnResponseType,
    TMiddlewares,
    TValidator
  >
}

export type ValidatorFn<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
> = <TValidator>(
  validator: ConstrainValidator<TRegister, TValidator>,
) => ServerFnAfterValidator<
  TRegister,
  TMethod,
  TServerFnResponseType,
  TMiddlewares,
  TValidator
>

export interface ServerFnValidator<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
> {
  validator: ValidatorFn<
    TRegister,
    TMethod,
    TServerFnResponseType,
    TMiddlewares
  >
}

export interface ServerFnAfterValidator<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> extends ServerFnMiddleware<
      TRegister,
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      TValidator
    >,
    ServerFnHandler<
      TRegister,
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      TValidator
    > {}

export interface ServerFnAfterTyper<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> extends ServerFnHandler<
    TRegister,
    TMethod,
    TServerFnResponseType,
    TMiddlewares,
    TValidator
  > {}

// Handler
export interface ServerFnHandler<
  TRegister extends Register,
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType,
  TMiddlewares,
  TValidator,
> {
  handler: <TNewResponse>(
    fn?: ServerFn<
      TRegister,
      TMethod,
      TServerFnResponseType,
      TMiddlewares,
      TValidator,
      TNewResponse
    >,
  ) => Fetcher<
    TRegister,
    TMiddlewares,
    TValidator,
    TNewResponse,
    TServerFnResponseType
  >
}

export interface ServerFnBuilder<
  TRegister extends Register,
  TMethod extends Method = 'GET',
  TServerFnResponseType extends ServerFnResponseType = 'data',
> extends ServerFnMiddleware<
      TRegister,
      TMethod,
      TServerFnResponseType,
      undefined,
      undefined
    >,
    ServerFnValidator<TRegister, TMethod, TServerFnResponseType, undefined>,
    ServerFnHandler<
      TRegister,
      TMethod,
      TServerFnResponseType,
      undefined,
      undefined
    > {
  options: ServerFnBaseOptions<
    TRegister,
    TMethod,
    TServerFnResponseType,
    unknown,
    undefined,
    undefined
  >
}

export function flattenMiddlewares(
  middlewares: Array<AnyFunctionMiddleware>,
): Array<AnyFunctionMiddleware> {
  const seen = new Set<AnyFunctionMiddleware>()
  const flattened: Array<AnyFunctionMiddleware> = []

  const recurse = (middleware: Array<AnyFunctionMiddleware>) => {
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
  functionId: string
  router?: AnyRouter
}

export type ServerFnMiddlewareResult = ServerFnMiddlewareOptions & {
  result?: unknown
  error?: unknown
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
  options: ServerFnBaseOptions<any, any, any, any, any, any>,
): AnyFunctionMiddleware {
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
        } as any

        // Execute the extracted function
        // but not before serializing the context
        const res = await options.extractedFn?.(payload)

        return next(res) as unknown as FunctionMiddlewareClientFnResult<
          any,
          any,
          any
        >
      },
      server: async ({ next, ...ctx }) => {
        // Execute the server function
        const result = await options.serverFn?.(ctx as TODO)

        return next({
          ...ctx,
          result,
        } as any) as unknown as FunctionMiddlewareServerFnResult<
          any,
          any,
          any,
          any
        >
      },
    },
  }
}
