import { mergeHeaders } from '@tanstack/router-core/ssr/client'

import { isRedirect, parseRedirect } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { TSS_SERVER_FUNCTION_FACTORY } from './constants'
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
  FunctionMiddlewareServerFnResult,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
} from './createMiddleware'

const NEXT_RESULT_SYMBOL = Symbol.for('TSR_SERVER_FN_NEXT_RESULT')
const RESULT_HELPER_SYMBOL = Symbol.for('TSR_SERVER_FN_RESULT_HELPER')
const INTERNAL_RESULT_ORIGIN_SYMBOL = Symbol.for(
  'TSR_SERVER_FN_INTERNAL_RESULT_ORIGIN',
)
const SHORT_CIRCUIT_INDEX_KEY = 'sc'
const MIDDLEWARE_SERVER_MARKER_KEY = 'hasServer'

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const canRunServerCode = (isServer ??
  typeof document === 'undefined') as boolean

type MiddlewareResultOriginKind = 'server-middleware' | 'client-middleware'

type MiddlewareResultOrigin = {
  kind: MiddlewareResultOriginKind
  index?: number
}

type MiddlewareScopeSource = 'middleware' | 'handler' | 'unknown'

export type FlattenedMiddlewareEntry<
  T extends AnyFunctionMiddleware | AnyRequestMiddleware,
> = {
  middleware: T
  position: number
  subtreeStartPosition: number
  hasServer: boolean
  hasServerAfter: boolean
  hasClient: boolean
  isServerFnBase: boolean
}

function setInternalResultOrigin(
  target: object,
  origin: MiddlewareResultOrigin,
) {
  ;(target as any)[INTERNAL_RESULT_ORIGIN_SYMBOL] = origin
}

function getInternalResultOrigin(
  value: unknown,
): MiddlewareResultOrigin | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const symbolOrigin = (value as any)[INTERNAL_RESULT_ORIGIN_SYMBOL]
  if (symbolOrigin) {
    return symbolOrigin
  }

  const index = (value as any)[SHORT_CIRCUIT_INDEX_KEY]

  if (typeof index !== 'number') {
    return undefined
  }

  delete (value as any)[SHORT_CIRCUIT_INDEX_KEY]

  const origin = {
    kind: 'server-middleware',
    index,
  } satisfies MiddlewareResultOrigin

  setInternalResultOrigin(value, origin)

  return origin
}

function createShortCircuitResult(
  ctx: ServerFnMiddlewareResult,
  result: unknown,
  origin: MiddlewareResultOrigin,
  headers?: HeadersInit,
): ServerFnMiddlewareResult {
  const nextResult = {
    ...ctx,
    result,
    headers: mergeHeaders(ctx.headers, headers),
  }

  setInternalResultOrigin(nextResult, origin)

  return nextResult
}

function getMiddlewareSource(
  origin: MiddlewareResultOrigin | undefined,
  middlewareEntry: FlattenedMiddlewareEntry<
    AnyFunctionMiddleware | AnyRequestMiddleware
  >,
  flattenedMiddlewareEntries: Array<
    FlattenedMiddlewareEntry<AnyFunctionMiddleware | AnyRequestMiddleware>
  >,
  executedRequestMiddlewares?: ReadonlySet<
    AnyFunctionMiddleware | AnyRequestMiddleware
  >,
): MiddlewareScopeSource {
  if (
    origin?.kind === 'server-middleware' &&
    typeof origin.index === 'number' &&
    origin.index >= middlewareEntry.subtreeStartPosition &&
    origin.index <= middlewareEntry.position
  ) {
    return 'middleware'
  }

  if (origin) {
    return 'unknown'
  }

  if (
    canRunServerCode &&
    middlewareEntry.hasServerAfter &&
    executedRequestMiddlewares?.size
  ) {
    for (
      let index = middlewareEntry.position + 1;
      index < flattenedMiddlewareEntries.length;
      index++
    ) {
      const nextEntry = flattenedMiddlewareEntries[index]!

      if (executedRequestMiddlewares.has(nextEntry.middleware)) {
        continue
      }

      if (nextEntry.hasServer && !nextEntry.isServerFnBase) {
        return 'unknown'
      }
    }

    return 'handler'
  }

  return middlewareEntry.hasServerAfter ? 'unknown' : 'handler'
}

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
    options: resolvedOptions,
    middleware: (middleware) => {
      // multiple calls to `middleware()` merge the middlewares with the previously supplied ones
      // this is primarily useful for letting users create their own abstractions on top of `createServerFn`

      const newMiddleware = [...(resolvedOptions.middleware || [])]
      for (const m of middleware) {
        if (TSS_SERVER_FUNCTION_FACTORY in m) {
          if (m.options.middleware) {
            newMiddleware.push(...m.options.middleware)
          }
        } else {
          newMiddleware.push(m)
        }
      }

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
      let middlewareEntries:
        | Array<
            FlattenedMiddlewareEntry<
              AnyFunctionMiddleware | AnyRequestMiddleware
            >
          >
        | undefined
      const getMiddlewareEntries = () => {
        if (!middlewareEntries) {
          const globalMiddlewares = getStartOptions()?.functionMiddleware || []

          middlewareEntries = flattenMiddlewaresWithDetails(
            globalMiddlewares.length
              ? globalMiddlewares.concat(resolvedMiddleware)
              : resolvedMiddleware,
          )
        }

        return middlewareEntries
      }

      // We want to make sure the new function has the same
      // properties as the original function

      // Propagate the declared HTTP method onto the extracted handler
      // so the manifest-exported symbol (resolved by getServerFnById)
      // carries `method`, enabling the server handler to reject
      // mismatched HTTP methods before parsing request payloads.
      ;(extractedFn as any).method = resolvedOptions.method

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
            _getMiddlewareEntries: getMiddlewareEntries,
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
          // Expose the declared HTTP method so the server handler
          // can reject mismatched methods before parsing payloads
          method: resolvedOptions.method,
          ...(canRunServerCode
            ? {
                __executeServer: async (opts: any) => {
                  const startContext = getStartContextServerOnly()

                  const result = await executeMiddleware(
                    resolvedMiddleware,
                    'server',
                    {
                      ...extractedFn,
                      ...opts,
                      serverFnMeta: extractedFn.serverFnMeta,
                      context: safeObjectMerge(
                        startContext.contextAfterGlobalMiddlewares,
                        opts.context,
                      ),
                      request: startContext.request,
                      _getMiddlewareEntries: getMiddlewareEntries,
                    },
                  )

                  const origin = getInternalResultOrigin(result)

                  return {
                    result: result.result,
                    error: result.error,
                    headers: result.headers,
                    context: result.sendContext,
                    ...(origin?.kind === 'server-middleware' &&
                    typeof origin.index === 'number'
                      ? { [SHORT_CIRCUIT_INDEX_KEY]: origin.index }
                      : {}),
                  }
                },
              }
            : {}),
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
  const executedRequestMiddlewares = canRunServerCode
    ? getStartContextServerOnly({ throwIfNotFound: false })
        ?.executedRequestMiddlewares
    : undefined
  const flattenedMiddlewareEntries = opts._getMiddlewareEntries
    ? opts._getMiddlewareEntries()
    : flattenMiddlewaresWithDetails(middlewares)
  let middlewareIndex = 0

  const callNextMiddleware: NextFn = async (ctx) => {
    let middlewareEntry:
      | FlattenedMiddlewareEntry<AnyFunctionMiddleware | AnyRequestMiddleware>
      | undefined

    while (middlewareIndex < flattenedMiddlewareEntries.length) {
      const nextEntry = flattenedMiddlewareEntries[middlewareIndex++]!

      if (executedRequestMiddlewares?.has(nextEntry.middleware)) {
        continue
      }

      middlewareEntry = nextEntry
      break
    }

    if (!middlewareEntry) {
      return ctx
    }

    const nextMiddleware = middlewareEntry.middleware

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

          if (env === 'client' && middlewareEntry.hasClient) {
            const origin = getInternalResultOrigin(result)
            ;(result as any).source = getMiddlewareSource(
              origin,
              middlewareEntry,
              flattenedMiddlewareEntries,
              executedRequestMiddlewares,
            )
            ;(result as any).data = result.result
            ;(result as any)[NEXT_RESULT_SYMBOL] = true

            return result
          }

          ;(result as any)[NEXT_RESULT_SYMBOL] = true

          return result
        }

        // Execute the middleware
        const result = await middlewareFn({
          ...ctx,
          next: userNext,
          result: ({ data, headers }: any) => ({
            [RESULT_HELPER_SYMBOL]: true,
            data,
            headers,
          }),
        })

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

        if ((result as any)[RESULT_HELPER_SYMBOL] === true) {
          const origin: MiddlewareResultOrigin =
            env === 'server'
              ? {
                  kind: 'server-middleware',
                  index: middlewareEntry.position,
                }
              : { kind: 'client-middleware' }

          return createShortCircuitResult(
            ctx,
            result.data,
            origin,
            result.headers,
          )
        }

        if (!(result as any)) {
          throw new Error(
            'User middleware returned undefined. You must call next() or return a result in your middlewares.',
          )
        }

        if ((result as any)[NEXT_RESULT_SYMBOL] === true) {
          return result
        }

        if (env === 'server') {
          return createShortCircuitResult(ctx, result, {
            kind: 'server-middleware',
            index: middlewareEntry.position,
          })
        }

        return createShortCircuitResult(ctx, result, {
          kind: 'client-middleware',
        })
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
  method: Method
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
  ): Promise<Awaited<TResponse>>
}

export interface RequiredFetcher<
  TMiddlewares,
  TInputValidator,
  TResponse,
> extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TInputValidator>,
  ): Promise<Awaited<TResponse>>
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

export function flattenMiddlewaresWithDetails<
  T extends AnyFunctionMiddleware | AnyRequestMiddleware,
>(
  middlewares: Array<T>,
  maxDepth: number = 100,
): Array<FlattenedMiddlewareEntry<T>> {
  const seen = new Set<T>()
  const flattened: Array<FlattenedMiddlewareEntry<T>> = []
  const stack: Array<
    [
      middleware: T,
      depth: number,
      subtreeStartPosition: number,
      expanded: 0 | 1,
    ]
  > = []

  for (let index = middlewares.length - 1; index >= 0; index--) {
    stack.push([middlewares[index]!, 0, 0, 0])
  }

  while (stack.length) {
    const [middleware, depth, subtreeStartPosition, expanded] = stack.pop()!

    if (depth > maxDepth) {
      throw new Error(
        `Middleware nesting depth exceeded maximum of ${maxDepth}. Check for circular references.`,
      )
    }

    if (expanded === 1) {
      if (seen.has(middleware)) {
        continue
      }

      seen.add(middleware)

      const options = middleware.options as any

      flattened.push({
        middleware,
        position: flattened.length,
        subtreeStartPosition,
        hasServer:
          ('server' in middleware.options && !!middleware.options.server) ||
          (middleware.options as any)[MIDDLEWARE_SERVER_MARKER_KEY] !== false,
        hasServerAfter: false,
        hasClient:
          'client' in middleware.options && !!middleware.options.client,
        isServerFnBase: !!options._isServerFnBase,
      })

      continue
    }

    stack.push([middleware, depth, flattened.length, 1])

    const nestedMiddlewares = middleware.options.middleware as
      | Array<T>
      | undefined

    if (!nestedMiddlewares?.length) {
      continue
    }

    for (let index = nestedMiddlewares.length - 1; index >= 0; index--) {
      stack.push([nestedMiddlewares[index]!, depth + 1, 0, 0])
    }
  }

  let hasServerAfter = false
  for (let index = flattened.length - 1; index >= 0; index--) {
    flattened[index]!.hasServerAfter = hasServerAfter
    if (flattened[index]!.hasServer && !flattened[index]!.isServerFnBase) {
      hasServerAfter = true
    }
  }

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
  /** @internal */
  _getMiddlewareEntries?: () => Array<
    FlattenedMiddlewareEntry<AnyFunctionMiddleware | AnyRequestMiddleware>
  >
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
    result?: (opts: { data: unknown; headers?: HeadersInit }) => unknown
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
      _isServerFnBase: true,
      inputValidator: options.inputValidator,
      client: async ({ next, sendContext, fetch, ...ctx }: any) => {
        const payload = {
          ...ctx,
          // switch the sendContext over to context
          context: sendContext,
          fetch,
        }

        // Execute the extracted function
        // but not before serializing the context
        const res = await options.extractedFn?.(payload)

        return next(res)
      },
      server: canRunServerCode
        ? async ({ next, ...ctx }: any) => {
            const result = await options.serverFn?.(ctx)

            return next({
              ...ctx,
              result,
            }) as unknown as FunctionMiddlewareServerFnResult<
              any,
              any,
              any,
              any,
              any
            >
          }
        : undefined,
    } as any,
  }
}
