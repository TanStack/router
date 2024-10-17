import invariant from 'tiny-invariant'
import { mergeHeaders } from './headers'
import type {
  AnyMiddleware,
  ResolveAllMiddlewareInput,
  ResolveAllMiddlewareOutput,
  ResolveAllMiddlewareServerContext,
} from './createMiddleware'
import type { AnyValidator, Constrain } from '@tanstack/react-router'

//

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  requestInit?: RequestInit
}

export type Fetcher<TMiddlewares, TValidator, TResponse> = {
  url: string
  __execute: (input: any) => Promise<{
    input: any
    context: Record<string, any>
  }>
} & FetcherImpl<TMiddlewares, TValidator, TResponse>

export type FetcherImpl<
  TMiddlewares,
  TValidator,
  TResponse,
  TInput = ResolveAllMiddlewareInput<TMiddlewares, TValidator>,
> = undefined extends TInput
  ? (
      opts?: OptionalFetcherDataOptions<TInput>,
    ) => Promise<FetcherData<TResponse>>
  : (
      opts: RequiredFetcherDataOptions<TInput>,
    ) => Promise<FetcherData<TResponse>>

export type FetcherBaseOptions = {
  requestInit?: RequestInit
}

export interface RequiredFetcherDataOptions<TInput> extends FetcherBaseOptions {
  data: TInput
}

export interface OptionalFetcherDataOptions<TInput> extends FetcherBaseOptions {
  data?: TInput
}

export type FetcherData<TResponse> = WrapRSCs<
  TResponse extends JsonResponse<infer TData> ? TData : TResponse
>

export type WrapRSCs<T> = T extends JSX.Element
  ? ReadableStream
  : T extends Record<string, any>
    ? {
        [K in keyof T]: WrapRSCs<T[K]>
      }
    : T extends Array<infer U>
      ? Array<WrapRSCs<U>>
      : T

export type RscStream<T> = {
  __cacheState: T
}

type Method = 'GET' | 'POST'

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TMiddlewares, TValidator> = {
  method: TMethod
  input: ResolveAllMiddlewareOutput<TMiddlewares, TValidator>
  context: ResolveAllMiddlewareServerContext<TMiddlewares>
}

export type CompiledFetcherFn<TResponse> = {
  (
    opts: CompiledFetcherFnOptions,
    ctx: { options: ServerFnBaseOptions },
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
  input?: Constrain<TInput, AnyValidator>
  handlerFn?: ServerFn<TMethod, TMiddlewares, TInput, TResponse>
  filename: string
  functionId: string
}

type ServerFnBase<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TValidator = unknown,
> = {
  options: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TValidator>
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TNewMiddlewares, TValidator>,
    'input' | 'handler'
  >
  input: <TValidator>(
    input: Constrain<TValidator, AnyValidator>,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TMiddlewares, TValidator>,
    'handler' | 'middleware'
  >
  handler: <TNewResponse>(
    fn?: ServerFn<TMethod, TMiddlewares, TValidator, TNewResponse>,
  ) => Fetcher<TMiddlewares, TValidator, TNewResponse>
}

export function createServerFn<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TValidator = undefined,
>(
  options?: {
    method: TMethod
  },
  __opts?: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TValidator>,
): ServerFnBase<TMethod, TResponse, TMiddlewares, TValidator> {
  const resolvedOptions = (__opts || options) as ServerFnBaseOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TValidator
  >

  return {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    input: (input) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { input }),
      ) as any
    },
    handler: (...args) => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, __serverOnlyOriginalFn] = args as unknown as [
        CompiledFetcherFn<TResponse>,
        ServerFn<TMethod, TMiddlewares, TValidator, TResponse>,
      ]

      // Keep the original function around so we can use it
      // in the server environment
      Object.assign(resolvedOptions, {
        ...extractedFn,
        handlerFn: __serverOnlyOriginalFn,
      })

      invariant(
        extractedFn.url,
        `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/start-vite-plugin ?`,
      )

      // We want to make sure the new function has the same
      // properties as the original function
      return Object.assign(
        (opts?: CompiledFetcherFnOptions) => {
          // Execute the extracted function. This may be a direct
          // call to handle the server function, or it may be a call
          // to make a fetch request from the client to the server
          // This depends on the runtime environment for `use server`
          return extractedFn(
            {
              method: resolvedOptions.method,
              data: opts?.data as any,
              requestInit: opts?.requestInit,
            },
            {
              options: resolvedOptions as any,
            },
          )
        },
        {
          // This copies over the URL, function ID and filename
          ...extractedFn,
          // These functions are called internally by the
          // extracted version of the function on the client and
          // server
          // The client version is used to execute the client-side
          __executeClient: makeExecuterFn('client', (serverExecutorFn) => ({
            ...resolvedOptions,
            handlerFn: (ctx) => {
              // It needs to call the extracted function on the client
              // that will ultimately make the RPC call to the server
              return serverExecutorFn(ctx)
            },
          })),
          // On the server, only the server version is called, which doesn't
          // need to make any changes and will call the normal handlerFn
          __executeServer: makeExecuterFn('server', () => resolvedOptions),
        },
      ) as any
    },
  }
}

function makeExecuterFn(
  env: 'client' | 'server',
  getOptions: (
    serverExecuterFn?: any,
  ) => ServerFnBaseOptions<any, any, any, any>,
) {
  // This is a private method that gets called from the client to execute any client-side
  // middleware logic. It's passed the server executor function.
  return async (opts: any, serverExecutorFn: any) => {
    const options = getOptions(serverExecutorFn)
    const middleware = [
      ...(options.middleware || []),
      serverFnBaseToMiddleware(options),
    ]

    return executeMiddleware(middleware, env, opts)
  }
}

function flattenMiddlewares(
  middlewares: Array<AnyMiddleware>,
): Array<AnyMiddleware> {
  const flattened: Array<AnyMiddleware> = []

  const recurse = (middleware: Array<AnyMiddleware>) => {
    middleware.forEach((m) => {
      if (m.options.middleware) {
        recurse(m.options.middleware)
      }
      flattened.push(m)
    })
  }

  recurse(middlewares)

  return flattened
}

async function executeMiddleware(
  middlewares: Array<AnyMiddleware>,
  env: 'client' | 'server',
  input: any,
): Promise<{
  context: any
  serverContext: any
  input: any
  result: unknown
}> {
  const flattenedMiddlewares = flattenMiddlewares(middlewares)

  const next = async (ctx: {
    input: any
    context: any
    serverContext: any
    headers?: HeadersInit
  }): Promise<{
    context: any
    serverContext: any
    input: any
    result: unknown
  }> => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx as any
    }

    if (
      nextMiddleware.options.input && env === 'client'
        ? nextMiddleware.options.validateClient
        : true
    ) {
      // Execute the middleware's input function
      ctx.input = await nextMiddleware.options.input(ctx.input)
    }

    const middlewareFn =
      env === 'client'
        ? nextMiddleware.options.client
        : nextMiddleware.options.server

    if (middlewareFn) {
      // Execute the middleware's server
      return middlewareFn({
        input: ctx.input,
        context: ctx.context as never,
        next: (userResult: any) => {
          // Take the user provided context
          // and merge it with the current context
          const context = {
            ...ctx.context,
            ...userResult?.context,
          }

          const serverContext = {
            ...ctx.serverContext,
            ...(userResult?.serverContext ?? {}),
          }

          const headers = mergeHeaders(ctx.headers, userResult?.headers)

          // Return the next middleware
          return next({
            input: ctx.input,
            context,
            serverContext,
            headers,
            result: userResult?.result,
          } as {
            context: any
            serverContext: any
            headers: any
            input: any
            result: unknown
          }) as any
        },
      }) as any
    }

    // If the middleware doesn't have a fn, just continue
    // to the next middleware
    return next(ctx)
  }

  // Start the middleware chain
  return next({
    input,
    context: {},
    serverContext: {},
    headers: {},
  })
}

function serverFnBaseToMiddleware(
  options: ServerFnBaseOptions<any, any, any, any>,
): AnyMiddleware {
  return {
    _types: undefined!,
    options: {
      input: options.input,
      validateClient: options.validateClient,
      server: async ({ next, ...ctx }) => {
        const result = await options.handlerFn?.(ctx as any)

        return next({
          result,
        } as any)
      },
    },
  }
}
