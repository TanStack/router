import { isNotFound, isRedirect } from '@tanstack/router-core'
import { mergeHeaders } from '@tanstack/router-core/ssr/client'

import { TSS_SERVER_FUNCTION_FACTORY } from './constants'
import { getServerContextAfterGlobalMiddlewares } from './getServerContextAfterGlobalMiddlewares'
import { getStartInstance } from './getStartInstance'
import type {
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
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AssignAllServerFnContext,
  FunctionMiddlewareClientFnResult,
  FunctionMiddlewareServerFnResult,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
} from './createMiddleware'

type TODO = any

export function createServerFn<
  TRegister extends Register,
  TMethod extends Method,
  TResponse = unknown,
  TMiddlewares = undefined,
  TValidator = undefined,
>(
  options?: {
    method?: TMethod
  },
  __opts?: ServerFnBaseOptions<
    TRegister,
    TMethod,
    TResponse,
    TMiddlewares,
    TValidator
  >,
): ServerFnBuilder<TRegister, TMethod> {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    TRegister,
    TMethod,
    TResponse,
    TMiddlewares,
    TValidator
  >

  if (typeof resolvedOptions.method === 'undefined') {
    resolvedOptions.method = 'GET' as TMethod
  }

  const res: ServerFnBuilder<TRegister, TMethod> = {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      // multiple calls to `middleware()` merge the middlewares with the previously supplied ones
      // this is primarily useful for letting users create their own abstractions on top of `createServerFn`

      const newMiddleware = [...(resolvedOptions.middleware || [])]
      middleware.map((m) => {
        if (TSS_SERVER_FUNCTION_FACTORY in m) {
          if (m.options.middleware) {
            newMiddleware.push(...m.options.middleware)
          }
        } else {
          newMiddleware.push(m)
        }
      })

      const newOptions = {
        ...resolvedOptions,
        middleware: newMiddleware,
      }
      const res = createServerFn<
        TRegister,
        TMethod,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, newOptions) as any
      res[TSS_SERVER_FUNCTION_FACTORY] = true
      return res
    },
    validator: (validator) => {
      const newOptions = { ...resolvedOptions, validator: validator as any }
      return createServerFn<
        TRegister,
        TMethod,
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
        CompiledFetcherFn<TRegister, TResponse>,
        ServerFn<TRegister, TMethod, TMiddlewares, TValidator, TResponse>,
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
          __executeServer: async (opts: any, signal: AbortSignal) => {
            const serverContextAfterGlobalMiddlewares =
              getServerContextAfterGlobalMiddlewares()
            const ctx = {
              ...extractedFn,
              ...opts,
              context: {
                ...serverContextAfterGlobalMiddlewares,
                ...opts.context,
              },
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
  } as ServerFnBuilder<TRegister, TMethod>
  const fun = (options?: { method?: TMethod }) => {
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
  middlewares: Array<AnyFunctionMiddleware | AnyRequestMiddleware>,
  env: 'client' | 'server',
  opts: ServerFnMiddlewareOptions,
): Promise<ServerFnMiddlewareResult> {
  const globalMiddlewares = getStartInstance().functionMiddleware || []
  const flattenedMiddlewares = flattenMiddlewares([
    ...globalMiddlewares,
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
      'validator' in nextMiddleware.options &&
      nextMiddleware.options.validator &&
      env === 'server'
    ) {
      // Execute the middleware's input function
      ctx.data = await execValidator(nextMiddleware.options.validator, ctx.data)
    }

    const middlewareFn = (
      env === 'client' && 'client' in nextMiddleware.options
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
  headers?: HeadersInit
  signal?: AbortSignal
  context?: any
}

export type Fetcher<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TResponse,
> =
  undefined extends IntersectAllValidatorInputs<TMiddlewares, TValidator>
    ? OptionalFetcher<TRegister, TMiddlewares, TValidator, TResponse>
    : RequiredFetcher<TRegister, TMiddlewares, TValidator, TResponse>

export interface FetcherBase {
  url: string
  __executeServer: (opts: {
    method: Method
    data: unknown
    headers?: HeadersInit
    context?: any
    signal: AbortSignal
  }) => Promise<unknown>
}

export interface OptionalFetcher<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TResponse,
> extends FetcherBase {
  (
    options?: OptionalFetcherDataOptions<TMiddlewares, TValidator>,
  ): Promise<FetcherData<TRegister, TResponse>>
}

export interface RequiredFetcher<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TResponse,
> extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TValidator>,
  ): Promise<FetcherData<TRegister, TResponse>>
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

export type FetcherData<
  TRegister extends Register,
  TResponse,
> = TResponse extends Response
  ? Response
  : TResponse extends JsonResponse<any>
    ? ValidateSerializableInputResult<TRegister, ReturnType<TResponse['json']>>
    : ValidateSerializableInputResult<TRegister, TResponse>

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'

export type ServerFnReturnType<TRegister extends Register, TResponse> =
  | Response
  | Promise<ValidateSerializableInput<TRegister, TResponse>>
  | ValidateSerializableInput<TRegister, TResponse>

export type ServerFn<
  TRegister extends Register,
  TMethod,
  TMiddlewares,
  TValidator,
  TResponse,
> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) => ServerFnReturnType<TRegister, TResponse>

export interface ServerFnCtx<TMethod, TMiddlewares, TValidator> {
  method: TMethod
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerFnContext<TMiddlewares, {}>>
  signal: AbortSignal
}

export type CompiledFetcherFn<TRegister extends Register, TResponse> = {
  (
    opts: CompiledFetcherFnOptions & ServerFnBaseOptions<TRegister, Method>,
  ): Promise<TResponse>
  url: string
}

export type ServerFnBaseOptions<
  TRegister extends Register,
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TInput = unknown,
> = {
  method: TMethod
  middleware?: Constrain<
    TMiddlewares,
    ReadonlyArray<AnyFunctionMiddleware | AnyRequestMiddleware>
  >
  validator?: ConstrainValidator<TRegister, TMethod, TInput>
  extractedFn?: CompiledFetcherFn<TRegister, TResponse>
  serverFn?: ServerFn<TRegister, TMethod, TMiddlewares, TInput, TResponse>
  functionId: string
}

export type ValidateValidatorInput<
  TRegister extends Register,
  TMethod extends Method,
  TValidator,
> = TMethod extends 'POST'
  ? ResolveValidatorInput<TValidator> extends FormData
    ? ResolveValidatorInput<TValidator>
    : ValidateSerializable<
        ResolveValidatorInput<TValidator>,
        RegisteredSerializableInput<TRegister>
      >
  : ValidateSerializable<
      ResolveValidatorInput<TValidator>,
      RegisteredSerializableInput<TRegister>
    >

export type ValidateValidator<
  TRegister extends Register,
  TMethod extends Method,
  TValidator,
> =
  ValidateValidatorInput<TRegister, TMethod, TValidator> extends infer TInput
    ? Validator<TInput, any>
    : never

export type ConstrainValidator<
  TRegister extends Register,
  TMethod extends Method,
  TValidator,
> =
  | (unknown extends TValidator
      ? TValidator
      : ResolveValidatorInput<TValidator> extends ValidateValidator<
            TRegister,
            TMethod,
            TValidator
          >
        ? TValidator
        : never)
  | ValidateValidator<TRegister, TMethod, TValidator>

export type AppendMiddlewares<TMiddlewares, TNewMiddlewares> =
  TMiddlewares extends ReadonlyArray<any>
    ? TNewMiddlewares extends ReadonlyArray<any>
      ? readonly [...TMiddlewares, ...TNewMiddlewares]
      : TMiddlewares
    : TNewMiddlewares

export interface ServerFnMiddleware<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> {
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyFunctionMiddleware | AnyRequestMiddleware | AnyServerFn>
    >,
  ) => ServerFnAfterMiddleware<
    TRegister,
    TMethod,
    AppendMiddlewares<TMiddlewares, TNewMiddlewares>,
    TValidator
  >
}

export interface ServerFnAfterMiddleware<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnWithTypes<
      TRegister,
      TMethod,
      TMiddlewares,
      TValidator,
      undefined
    >,
    ServerFnMiddleware<TRegister, TMethod, TMiddlewares, undefined>,
    ServerFnValidator<TRegister, TMethod, TMiddlewares>,
    ServerFnHandler<TRegister, TMethod, TMiddlewares, TValidator> {
  <TNewMethod extends Method = TMethod>(options?: {
    method?: TNewMethod
  }): ServerFnAfterMiddleware<TRegister, TNewMethod, TMiddlewares, TValidator>
}

export type ValidatorFn<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
> = <TValidator>(
  validator: ConstrainValidator<TRegister, TMethod, TValidator>,
) => ServerFnAfterValidator<TRegister, TMethod, TMiddlewares, TValidator>

export interface ServerFnValidator<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
> {
  validator: ValidatorFn<TRegister, TMethod, TMiddlewares>
}

export interface ServerFnAfterValidator<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnWithTypes<
      TRegister,
      TMethod,
      TMiddlewares,
      TValidator,
      undefined
    >,
    ServerFnMiddleware<TRegister, TMethod, TMiddlewares, TValidator>,
    ServerFnHandler<TRegister, TMethod, TMiddlewares, TValidator> {}

export interface ServerFnAfterTyper<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnWithTypes<
      TRegister,
      TMethod,
      TMiddlewares,
      TValidator,
      undefined
    >,
    ServerFnHandler<TRegister, TMethod, TMiddlewares, TValidator> {}

// Handler
export interface ServerFnHandler<
  TRegister extends Register,
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> {
  handler: <TNewResponse>(
    fn?: ServerFn<TRegister, TMethod, TMiddlewares, TValidator, TNewResponse>,
  ) => Fetcher<TRegister, TMiddlewares, TValidator, TNewResponse>
}

export interface ServerFnBuilder<
  TRegister extends Register,
  TMethod extends Method = 'GET',
> extends ServerFnWithTypes<
      TRegister,
      TMethod,
      undefined,
      undefined,
      undefined
    >,
    ServerFnMiddleware<TRegister, TMethod, undefined, undefined>,
    ServerFnValidator<TRegister, TMethod, undefined>,
    ServerFnHandler<TRegister, TMethod, undefined, undefined> {
  options: ServerFnBaseOptions<
    TRegister,
    TMethod,
    unknown,
    undefined,
    undefined
  >
}

export interface ServerFnWithTypes<
  in out TRegister extends Register,
  in out TMethod extends Method,
  in out TMiddlewares,
  in out TValidator,
  in out TResponse,
> {
  _types: ServerFnTypes<TMethod, TMiddlewares, TValidator, TResponse>
  options: ServerFnBaseOptions<
    TRegister,
    TMethod,
    unknown,
    undefined,
    undefined
  >
  [TSS_SERVER_FUNCTION_FACTORY]: true
}

export type AnyServerFn = ServerFnWithTypes<any, any, any, any, any>

export interface ServerFnTypes<
  in out TMethod extends Method,
  in out TMiddlewares,
  in out TValidator,
  in out TResponse,
> {
  method: TMethod
  middlewares: TMiddlewares
  validator: TValidator
  response: TResponse
  allServerContext: AssignAllServerFnContext<TMiddlewares>
  allInput: IntersectAllValidatorInputs<TMiddlewares, TValidator>
  allOutput: IntersectAllValidatorOutputs<TMiddlewares, TValidator>
}

export function flattenMiddlewares(
  middlewares: Array<AnyFunctionMiddleware | AnyRequestMiddleware>,
): Array<AnyFunctionMiddleware | AnyRequestMiddleware> {
  const seen = new Set<AnyFunctionMiddleware | AnyRequestMiddleware>()
  const flattened: Array<AnyFunctionMiddleware | AnyRequestMiddleware> = []

  const recurse = (
    middleware: Array<AnyFunctionMiddleware | AnyRequestMiddleware>,
  ) => {
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
  data: any
  headers?: HeadersInit
  signal?: AbortSignal
  sendContext?: any
  context?: any
  functionId: string
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
            : userCtx instanceof Response
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

function serverFnBaseToMiddleware(
  options: ServerFnBaseOptions<any, any, any, any, any>,
): AnyFunctionMiddleware {
  return {
    _types: undefined!,
    options: {
      validator: options.validator,
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
