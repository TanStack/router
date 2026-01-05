import { mergeHeaders } from '@tanstack/router-core/ssr/client'

import { isRedirect, parseRedirect } from '@tanstack/router-core'
import { TSS_SERVER_FUNCTION_FACTORY } from './constants'
import { getStartOptions } from './getStartOptions'
import { getStartContextServerOnly } from './getStartContextServerOnly'
import { createNullProtoObject, safeObjectMerge } from './safeObjectMerge'
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
import type { TSS_SERVER_FUNCTION } from './constants'
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
          __executeServer: async (opts: any, signal: AbortSignal) => {
            const startContext = getStartContextServerOnly()
            const serverContextAfterGlobalMiddlewares =
              startContext.contextAfterGlobalMiddlewares
            // Use safeObjectMerge for opts.context which comes from client
            const ctx = {
              ...extractedFn,
              ...opts,
              context: safeObjectMerge(
                serverContextAfterGlobalMiddlewares,
                opts.context,
              ),
              signal,
              request: startContext.request,
            }

            const result = await executeMiddleware(
              resolvedMiddleware,
              'server',
              ctx,
            ).then((d) => ({
              // Only send the result and sendContext back to the client
              result: d.result,
              error: d.error,
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
            result:
              userCtx.result !== undefined
                ? userCtx.result
                : userCtx instanceof Response
                  ? userCtx
                  : (ctx as any).result,
            error: userCtx.error ?? (ctx as any).error,
          }

          try {
            return await callNextMiddleware(nextCtx)
          } catch (error: any) {
            return {
              ...nextCtx,
              error,
            }
          }
        }

        // Execute the middleware
        const result = await middlewareFn({
          ...ctx,
          next: userNext as any,
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

        return result
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
  })
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  headers?: HeadersInit
  signal?: AbortSignal
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
    signal: AbortSignal
  }) => Promise<unknown>
}

export interface OptionalFetcher<TMiddlewares, TInputValidator, TResponse>
  extends FetcherBase {
  (
    options?: OptionalFetcherDataOptions<TMiddlewares, TInputValidator>,
  ): Promise<Awaited<TResponse>>
}

export interface RequiredFetcher<TMiddlewares, TInputValidator, TResponse>
  extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TInputValidator>,
  ): Promise<Awaited<TResponse>>
}

export type FetcherBaseOptions = {
  headers?: HeadersInit
  signal?: AbortSignal
}

export interface OptionalFetcherDataOptions<TMiddlewares, TInputValidator>
  extends FetcherBaseOptions {
  data?: Expand<IntersectAllValidatorInputs<TMiddlewares, TInputValidator>>
}

export interface RequiredFetcherDataOptions<TMiddlewares, TInputValidator>
  extends FetcherBaseOptions {
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
  ctx: ServerFnCtx<TRegister, TMiddlewares, TInputValidator>,
) => ServerFnReturnType<TRegister, TResponse>

export interface ServerFnCtx<TRegister, TMiddlewares, TInputValidator> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TInputValidator>>
  context: Expand<AssignAllServerFnContext<TRegister, TMiddlewares, {}>>
  signal: AbortSignal
}

export type CompiledFetcherFn<TRegister, TResponse> = {
  (
    opts: CompiledFetcherFnOptions & ServerFnBaseOptions<TRegister, Method>,
  ): Promise<TResponse>
  url: string
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
  functionId: string
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
> extends ServerFnWithTypes<
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
> extends ServerFnWithTypes<
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
> extends ServerFnWithTypes<
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
  extends ServerFnWithTypes<
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
          any,
          any
        >
      },
    },
  }
}
