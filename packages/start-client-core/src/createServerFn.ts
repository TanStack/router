import { mergeHeaders } from '@tanstack/router-core/ssr/client'

import { isRedirect, parseRedirect } from '@tanstack/router-core'
import {
  TSS_MIDDLEWARE_EARLY_RESULT,
  TSS_MIDDLEWARE_RESULT,
  TSS_SERVER_FUNCTION_FACTORY,
} from './constants'
import { getStartOptions } from './getStartOptions'
import { getStartContextServerOnly } from './getStartContextServerOnly'
import { createNullProtoObject, safeObjectMerge } from './safeObjectMerge'
import type {
  ClientFnMeta,
  ServerFnMeta,
  TSS_SERVER_FUNCTION,
} from './constants'
import type {
  AnyValidator,
  Constrain,
  Expand,
  Register,
  RegisteredSerializableInput,
  ResolveValidatorInput,
  ValidateSerializable,
  ValidateSerializableInput,
  Validator,
} from '@tanstack/router-core'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AssignAllServerFnContext,
  FunctionMiddlewareClientFnResult,
  FunctionMiddlewareServerFnResult,
  HasNextReturn,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
} from './createMiddleware'

type TODO = any

/**
 * Type-level fold over a middleware chain to compute *reachable* early returns.
 *
 * Rules:
 * - A middleware can short-circuit by returning `result({ data })`.
 * - A middleware continues by returning the result of `next()`.
 * - If a middleware cannot return `next()`, the chain cannot continue past it.
 * - If a middleware returns a union of `next()` and `result(...)`, later middleware
 *   (and the handler) are still reachable, but early returns from this middleware
 *   must be included.
 */
type MiddlewareEarlyReturnType<
  TMw,
  TEnv extends 'clientEarlyReturn' | 'serverEarlyReturn',
> = TMw extends { '~types': infer TTypes }
  ? TTypes extends { [K in TEnv]: infer TEarly }
    ? TEarly
    : never
  : never

type MiddlewareCanContinue<
  TMw,
  TEnv extends 'client' | 'server',
> = TMw extends { options: infer TOpts }
  ? TOpts extends { client: infer TClient }
    ? TEnv extends 'client'
      ? HasNextReturn<ReturnType<Extract<TClient, (...args: any) => any>>>
      : false
    : TOpts extends { server: infer TServer }
      ? TEnv extends 'server'
        ? HasNextReturn<ReturnType<Extract<TServer, (...args: any) => any>>>
        : false
      : true
  : true

export type ReachableMiddlewareEarlyReturns<
  TMiddlewares,
  TEnv extends 'clientEarlyReturn' | 'serverEarlyReturn',
  TCanContinue extends boolean = true,
  TRuntimeEnv extends 'client' | 'server' = TEnv extends 'clientEarlyReturn'
    ? 'client'
    : 'server',
> = TMiddlewares extends readonly [infer TFirst, ...infer TRest]
  ? TFirst extends AnyFunctionMiddleware | AnyRequestMiddleware
    ?
        | (TCanContinue extends true
            ? MiddlewareEarlyReturnType<TFirst, TEnv>
            : never)
        | ReachableMiddlewareEarlyReturns<
            TRest,
            TEnv,
            TCanContinue extends true
              ? MiddlewareCanContinue<TFirst, TRuntimeEnv>
              : false,
            TRuntimeEnv
          >
    : ReachableMiddlewareEarlyReturns<TRest, TEnv, TCanContinue, TRuntimeEnv>
  : never

type ChainCanContinue<
  TMiddlewares,
  TEnv extends 'client' | 'server',
> = TMiddlewares extends readonly [infer TFirst, ...infer TRest]
  ? TFirst extends AnyFunctionMiddleware | AnyRequestMiddleware
    ? MiddlewareCanContinue<TFirst, TEnv> extends true
      ? ChainCanContinue<TRest, TEnv>
      : false
    : ChainCanContinue<TRest, TEnv>
  : true

export type AllMiddlewareEarlyReturns<TMiddlewares> =
  | ReachableMiddlewareEarlyReturns<TMiddlewares, 'clientEarlyReturn'>
  | (ChainCanContinue<TMiddlewares, 'client'> extends true
      ? ReachableMiddlewareEarlyReturns<TMiddlewares, 'serverEarlyReturn'>
      : never)

export type CreateServerFn<TRegister> = <
  TMethod extends Method,
  TResponse = unknown,
  TMiddlewares = undefined,
  TInputValidator = undefined,
>(
  options?: {
    method?: TMethod
  },
  __opts?: ServerFnBaseOptions<
    TRegister,
    TMethod,
    TResponse,
    TMiddlewares,
    TInputValidator
  >,
) => ServerFnBuilder<TRegister, TMethod>

export const createServerFn: CreateServerFn<Register> = (options, __opts) => {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    any,
    any,
    any,
    any,
    any
  >

  if (typeof resolvedOptions.method === 'undefined') {
    resolvedOptions.method = 'GET' as Method
  }

  const res: ServerFnBuilder<Register, Method> = {
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
      const res = createServerFn(undefined, newOptions) as any
      res[TSS_SERVER_FUNCTION_FACTORY] = true
      return res
    },
    inputValidator: (inputValidator) => {
      const newOptions = { ...resolvedOptions, inputValidator }
      return createServerFn(undefined, newOptions) as any
    },
    handler: (...args) => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, serverFn] = args as unknown as [
        CompiledFetcherFn<Register, any>,
        ServerFn<Register, Method, any, any, any>,
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
          const result = await executeMiddleware(resolvedMiddleware, 'client', {
            ...extractedFn,
            ...newOptions,
            data: opts?.data as any,
            headers: opts?.headers,
            signal: opts?.signal,
            fetch: opts?.fetch,
            context: createNullProtoObject(),
          })

          const redirect = parseRedirect(result.error)
          if (redirect) {
            throw redirect
          }

          if (result.error) throw result.error
          return result.result
        },
        {
          // This copies over the URL, function ID
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: async (opts: any) => {
            const startContext = getStartContextServerOnly()
            const serverContextAfterGlobalMiddlewares =
              startContext.contextAfterGlobalMiddlewares
            // Use safeObjectMerge for opts.context which comes from client
            const ctx = {
              ...extractedFn,
              ...opts,
              // Ensure we use the full serverFnMeta from the provider file's extractedFn
              // (which has id, name, filename) rather than the partial one from SSR/client
              // callers (which only has id)
              serverFnMeta: extractedFn.serverFnMeta,
              // Use safeObjectMerge for opts.context which comes from client
              context: safeObjectMerge(
                serverContextAfterGlobalMiddlewares,
                opts.context,
              ),
              request: startContext.request,
            }

            const result = await executeMiddleware(
              resolvedMiddleware,
              'server',
              ctx,
            ).then((d) => ({
              // Only send the result, headers and sendContext back to the client
              result: d.result,
              error: d.error,
              headers: d.headers,
              context: d.sendContext,
            }))

            return result
          },
        },
      ) as any
    },
  } as ServerFnBuilder<Register, Method>
  const fun = (options?: { method?: Method }) => {
    const newOptions = {
      ...resolvedOptions,
      ...options,
    }
    return createServerFn(undefined, newOptions) as any
  }
  return Object.assign(fun, res) as any
}

export async function executeMiddleware(
  middlewares: Array<AnyFunctionMiddleware | AnyRequestMiddleware>,
  env: 'client' | 'server',
  opts: ServerFnMiddlewareOptions,
): Promise<ServerFnMiddlewareResult> {
  const globalMiddlewares = getStartOptions()?.functionMiddleware || []
  let flattenedMiddlewares = flattenMiddlewares([
    ...globalMiddlewares,
    ...middlewares,
  ])

  // On server, filter out middlewares that already executed in the request phase
  // to prevent duplicate execution (issue #5239)
  if (env === 'server') {
    const startContext = getStartContextServerOnly({ throwIfNotFound: false })
    if (startContext?.executedRequestMiddlewares) {
      flattenedMiddlewares = flattenedMiddlewares.filter(
        (m) => !startContext.executedRequestMiddlewares.has(m),
      )
    }
  }

  const callNextMiddleware: NextFn = async (ctx) => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx
    }

    // Execute the middleware
    try {
      if (
        'inputValidator' in nextMiddleware.options &&
        nextMiddleware.options.inputValidator &&
        env === 'server'
      ) {
        // Execute the middleware's input function
        ctx.data = await execValidator(
          nextMiddleware.options.inputValidator,
          ctx.data,
        )
      }

      let middlewareFn: MiddlewareFn | undefined = undefined
      if (env === 'client') {
        if ('client' in nextMiddleware.options) {
          middlewareFn = nextMiddleware.options.client as
            | MiddlewareFn
            | undefined
        }
      }
      // env === 'server'
      else if ('server' in nextMiddleware.options) {
        middlewareFn = nextMiddleware.options.server as MiddlewareFn | undefined
      }

      if (middlewareFn) {
        const userNext = async (
          userCtx: ServerFnMiddlewareResult | undefined = {} as any,
        ) => {
          // Return the next middleware
          // Use safeObjectMerge for context objects to prevent prototype pollution
          const nextCtx = {
            ...ctx,
            ...userCtx,
            context: safeObjectMerge(ctx.context, userCtx.context),
            sendContext: safeObjectMerge(ctx.sendContext, userCtx.sendContext),
            headers: mergeHeaders(ctx.headers, userCtx.headers),
            _callSiteFetch: ctx._callSiteFetch,
            fetch: ctx._callSiteFetch ?? userCtx.fetch ?? ctx.fetch,
            result:
              userCtx.result !== undefined
                ? userCtx.result
                : userCtx instanceof Response
                  ? userCtx
                  : (ctx as any).result,
            error: userCtx.error ?? (ctx as any).error,
          }

          const result = await callNextMiddleware(nextCtx)

          if (result.error) {
            throw result.error
          }

          // Mark this result as coming from next() so we can distinguish
          // it from early returns by the middleware
          ;(result as any)[TSS_MIDDLEWARE_RESULT] = true

          return result
        }

        // Create the result() function for explicit early returns
        const userResult = <TData>(options: {
          data: TData
          headers?: HeadersInit
        }) => {
          return {
            [TSS_MIDDLEWARE_EARLY_RESULT]: true,
            _data: options.data,
            _headers: options.headers,
          }
        }

        // Execute the middleware
        const result = await middlewareFn({
          ...ctx,
          next: userNext as any,
          result: userResult as any,
        } as any)

        // If result is NOT a ctx object, we need to return it as
        // the { result }
        if (isRedirect(result)) {
          return {
            ...ctx,
            error: result,
          }
        }

        if (result instanceof Response) {
          return {
            ...ctx,
            result,
          }
        }

        if (!(result as any)) {
          throw new Error(
            'User middleware returned undefined. You must call next() or return a result in your middlewares.',
          )
        }

        // Check if the result came from calling next() by looking for our marker symbol.
        // This is more robust than duck-typing (e.g., checking for 'method' property)
        // because user code could return an object that happens to have similar properties.
        if (
          typeof result === 'object' &&
          result !== null &&
          TSS_MIDDLEWARE_RESULT in result
        ) {
          return result
        }

        // Check if the result came from calling result() for explicit early returns
        if (
          typeof result === 'object' &&
          result !== null &&
          TSS_MIDDLEWARE_EARLY_RESULT in result
        ) {
          // Extract data and headers from the result() return value
          const earlyResult = result as unknown as {
            _data: unknown
            _headers?: HeadersInit
          }
          return {
            ...ctx,
            result: earlyResult._data,
            headers: mergeHeaders(ctx.headers, earlyResult._headers),
          }
        }

        // Legacy: Early return from middleware without using result() - wrap the value as the result
        return {
          ...ctx,
          result,
        }
      }

      return callNextMiddleware(ctx)
    } catch (error: any) {
      return {
        ...ctx,
        error,
      }
    }
  }

  // Start the middleware chain
  return callNextMiddleware({
    ...opts,
    headers: opts.headers || {},
    sendContext: opts.sendContext || {},
    context: opts.context || createNullProtoObject(),
    _callSiteFetch: opts.fetch,
  })
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  fetch?: CustomFetch
  context?: any
}

export type Fetcher<TMiddlewares, TInputValidator, TResponse> =
  undefined extends IntersectAllValidatorInputs<TMiddlewares, TInputValidator>
    ? OptionalFetcher<TMiddlewares, TInputValidator, TResponse>
    : RequiredFetcher<TMiddlewares, TInputValidator, TResponse>

export interface FetcherBase {
  [TSS_SERVER_FUNCTION]: true
  url: string
  __executeServer: (opts: {
    method: Method
    data: unknown
    headers?: HeadersInit
    context?: any
  }) => Promise<unknown>
}

export interface OptionalFetcher<
  TMiddlewares,
  TInputValidator,
  TResponse,
> extends FetcherBase {
  (
    options?: OptionalFetcherDataOptions<TMiddlewares, TInputValidator>,
  ): Promise<Awaited<TResponse> | AllMiddlewareEarlyReturns<TMiddlewares>>
}

export interface RequiredFetcher<
  TMiddlewares,
  TInputValidator,
  TResponse,
> extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TInputValidator>,
  ): Promise<Awaited<TResponse> | AllMiddlewareEarlyReturns<TMiddlewares>>
}

export type CustomFetch = typeof globalThis.fetch

export type FetcherBaseOptions = {
  headers?: HeadersInit
  signal?: AbortSignal
  fetch?: CustomFetch
}

export interface OptionalFetcherDataOptions<
  TMiddlewares,
  TInputValidator,
> extends FetcherBaseOptions {
  data?: Expand<IntersectAllValidatorInputs<TMiddlewares, TInputValidator>>
}

export interface RequiredFetcherDataOptions<
  TMiddlewares,
  TInputValidator,
> extends FetcherBaseOptions {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TInputValidator>>
}

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'

export type ServerFnReturnType<TRegister, TResponse> =
  TResponse extends PromiseLike<infer U>
    ? Promise<ServerFnReturnType<TRegister, U>>
    : TResponse extends Response
      ? TResponse
      : ValidateSerializableInput<TRegister, TResponse>

export type ServerFn<
  TRegister,
  TMethod,
  TMiddlewares,
  TInputValidator,
  TResponse,
> = (
  ctx: ServerFnCtx<TRegister, TMethod, TMiddlewares, TInputValidator>,
) => ServerFnReturnType<TRegister, TResponse>

export interface ServerFnCtx<
  TRegister,
  TMethod,
  TMiddlewares,
  TInputValidator,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TInputValidator>>
  serverFnMeta: ServerFnMeta
  context: Expand<AssignAllServerFnContext<TRegister, TMiddlewares, {}>>
  method: TMethod
}

export type CompiledFetcherFn<TRegister, TResponse> = {
  (
    opts: CompiledFetcherFnOptions & ServerFnBaseOptions<TRegister, Method>,
  ): Promise<TResponse>
  url: string
  serverFnMeta: ServerFnMeta
}

export type ServerFnBaseOptions<
  TRegister,
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TInputValidator = unknown,
> = {
  method: TMethod
  middleware?: Constrain<
    TMiddlewares,
    ReadonlyArray<AnyFunctionMiddleware | AnyRequestMiddleware>
  >
  inputValidator?: ConstrainValidator<TRegister, TMethod, TInputValidator>
  extractedFn?: CompiledFetcherFn<TRegister, TResponse>
  serverFn?: ServerFn<
    TRegister,
    TMethod,
    TMiddlewares,
    TInputValidator,
    TResponse
  >
}

export type ValidateValidatorInput<
  TRegister,
  TMethod extends Method,
  TInputValidator,
> = TMethod extends 'POST'
  ? ResolveValidatorInput<TInputValidator> extends FormData
    ? ResolveValidatorInput<TInputValidator>
    : ValidateSerializable<
        ResolveValidatorInput<TInputValidator>,
        RegisteredSerializableInput<TRegister>
      >
  : ValidateSerializable<
      ResolveValidatorInput<TInputValidator>,
      RegisteredSerializableInput<TRegister>
    >

export type ValidateValidator<
  TRegister,
  TMethod extends Method,
  TInputValidator,
> =
  ValidateValidatorInput<
    TRegister,
    TMethod,
    TInputValidator
  > extends infer TInput
    ? Validator<TInput, any>
    : never

export type ConstrainValidator<
  TRegister,
  TMethod extends Method,
  TInputValidator,
> =
  | (unknown extends TInputValidator
      ? TInputValidator
      : ResolveValidatorInput<TInputValidator> extends ValidateValidator<
            TRegister,
            TMethod,
            TInputValidator
          >
        ? TInputValidator
        : never)
  | ValidateValidator<TRegister, TMethod, TInputValidator>

export type AppendMiddlewares<TMiddlewares, TNewMiddlewares> =
  TMiddlewares extends ReadonlyArray<any>
    ? TNewMiddlewares extends ReadonlyArray<any>
      ? readonly [...TMiddlewares, ...TNewMiddlewares]
      : TMiddlewares
    : TNewMiddlewares

export interface ServerFnMiddleware<
  TRegister,
  TMethod extends Method,
  TMiddlewares,
  TInputValidator,
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
    TInputValidator
  >
}

export interface ServerFnAfterMiddleware<
  TRegister,
  TMethod extends Method,
  TMiddlewares,
  TInputValidator,
>
  extends
    ServerFnWithTypes<
      TRegister,
      TMethod,
      TMiddlewares,
      TInputValidator,
      undefined
    >,
    ServerFnMiddleware<TRegister, TMethod, TMiddlewares, undefined>,
    ServerFnValidator<TRegister, TMethod, TMiddlewares>,
    ServerFnHandler<TRegister, TMethod, TMiddlewares, TInputValidator> {
  <TNewMethod extends Method = TMethod>(options?: {
    method?: TNewMethod
  }): ServerFnAfterMiddleware<
    TRegister,
    TNewMethod,
    TMiddlewares,
    TInputValidator
  >
}

export type ValidatorFn<TRegister, TMethod extends Method, TMiddlewares> = <
  TInputValidator,
>(
  inputValidator: ConstrainValidator<TRegister, TMethod, TInputValidator>,
) => ServerFnAfterValidator<TRegister, TMethod, TMiddlewares, TInputValidator>

export interface ServerFnValidator<
  TRegister,
  TMethod extends Method,
  TMiddlewares,
> {
  inputValidator: ValidatorFn<TRegister, TMethod, TMiddlewares>
}

export interface ServerFnAfterValidator<
  TRegister,
  TMethod extends Method,
  TMiddlewares,
  TInputValidator,
>
  extends
    ServerFnWithTypes<
      TRegister,
      TMethod,
      TMiddlewares,
      TInputValidator,
      undefined
    >,
    ServerFnMiddleware<TRegister, TMethod, TMiddlewares, TInputValidator>,
    ServerFnHandler<TRegister, TMethod, TMiddlewares, TInputValidator> {}

export interface ServerFnAfterTyper<
  TRegister,
  TMethod extends Method,
  TMiddlewares,
  TInputValidator,
>
  extends
    ServerFnWithTypes<
      TRegister,
      TMethod,
      TMiddlewares,
      TInputValidator,
      undefined
    >,
    ServerFnHandler<TRegister, TMethod, TMiddlewares, TInputValidator> {}

// Handler
export interface ServerFnHandler<
  TRegister,
  TMethod extends Method,
  TMiddlewares,
  TInputValidator,
> {
  handler: <TNewResponse>(
    fn?: ServerFn<
      TRegister,
      TMethod,
      TMiddlewares,
      TInputValidator,
      TNewResponse
    >,
  ) => Fetcher<TMiddlewares, TInputValidator, TNewResponse>
}

export interface ServerFnBuilder<TRegister, TMethod extends Method = 'GET'>
  extends
    ServerFnWithTypes<TRegister, TMethod, undefined, undefined, undefined>,
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
  in out TRegister,
  in out TMethod extends Method,
  in out TMiddlewares,
  in out TInputValidator,
  in out TResponse,
> {
  '~types': ServerFnTypes<
    TRegister,
    TMethod,
    TMiddlewares,
    TInputValidator,
    TResponse
  >
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
  in out TRegister,
  in out TMethod extends Method,
  in out TMiddlewares,
  in out TInputValidator,
  in out TResponse,
> {
  method: TMethod
  middlewares: TMiddlewares
  inputValidator: TInputValidator
  response: TResponse
  allServerContext: AssignAllServerFnContext<TRegister, TMiddlewares>
  allInput: IntersectAllValidatorInputs<TMiddlewares, TInputValidator>
  allOutput: IntersectAllValidatorOutputs<TMiddlewares, TInputValidator>
}

export function flattenMiddlewares<
  T extends AnyFunctionMiddleware | AnyRequestMiddleware,
>(middlewares: Array<T>, maxDepth: number = 100): Array<T> {
  const seen = new Set<T>()
  const flattened: Array<T> = []

  const recurse = (middleware: Array<T>, depth: number) => {
    if (depth > maxDepth) {
      throw new Error(
        `Middleware nesting depth exceeded maximum of ${maxDepth}. Check for circular references.`,
      )
    }
    middleware.forEach((m) => {
      if (m.options.middleware) {
        recurse(m.options.middleware as Array<T>, depth + 1)
      }

      if (!seen.has(m)) {
        seen.add(m)
        flattened.push(m)
      }
    })
  }

  recurse(middlewares, 0)

  return flattened
}

export type ServerFnMiddlewareOptions = {
  method: Method
  data: any
  headers?: HeadersInit
  signal?: AbortSignal
  sendContext?: any
  context?: any
  serverFnMeta: ClientFnMeta
  fetch?: CustomFetch
  /** @internal - Preserves the call-site fetch to ensure it has highest priority over middleware */
  _callSiteFetch?: CustomFetch
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

export async function execValidator(
  validator: AnyValidator,
  input: unknown,
): Promise<unknown> {
  if (validator == null) return {}

  if ('~standard' in validator) {
    const result = await validator['~standard'].validate(input)

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
    '~types': undefined!,
    options: {
      inputValidator: options.inputValidator,
      client: async ({ next, sendContext, fetch, ...ctx }) => {
        const payload = {
          ...ctx,
          // switch the sendContext over to context
          context: sendContext,
          fetch,
        } as any

        // Execute the extracted function
        // but not before serializing the context
        const res = await options.extractedFn?.(payload)

        return next(res) as unknown as FunctionMiddlewareClientFnResult<
          any,
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
          any,
          any
        >
      },
    },
  }
}
