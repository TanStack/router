import invariant from 'tiny-invariant'
import { mergeHeaders } from './headers'
import type {
  AnyMiddleware,
  MergeAllServerContext,
  MergeAllValidatorInputs,
  MergeAllValidatorOutputs,
  ResolveAllValidators,
} from './createMiddleware'
import type { AnyValidator, Constrain } from '@tanstack/react-router'

//

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
  __executeClient: (opts: {
    method: Method
    input: unknown
    headers?: HeadersInit
  }) => Promise<unknown>
  __executeServer: (opts: {
    method: Method
    input: unknown
    headers?: HeadersInit
  }) => Promise<unknown>
} & FetcherImpl<TMiddlewares, TValidator, TResponse>

export type IsDataOptional<TMiddlewares, TValidator> = ResolveAllValidators<
  TMiddlewares,
  TValidator
>

export type FetcherImpl<TMiddlewares, TValidator, TResponse> =
  undefined extends MergeAllValidatorInputs<TMiddlewares, TValidator>
    ? (
        opts?: OptionalFetcherDataOptions<
          MergeAllValidatorInputs<TMiddlewares, TValidator>
        >,
      ) => Promise<FetcherData<TResponse>>
    : (
        opts: RequiredFetcherDataOptions<
          MergeAllValidatorInputs<TMiddlewares, TValidator>
        >,
      ) => Promise<FetcherData<TResponse>>

export type FetcherBaseOptions = {
  headers?: HeadersInit
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

export type Method = 'GET' | 'POST'

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TMiddlewares, TValidator> = {
  method: TMethod
  input: MergeAllValidatorOutputs<TMiddlewares, TValidator>
  context: MergeAllServerContext<TMiddlewares>
}

export type CompiledFetcherFn<TResponse> = {
  (opts: CompiledFetcherFnOptions & ServerFnBaseOptions): Promise<TResponse>
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
  extractedFn?: CompiledFetcherFn<TResponse>
  serverFn?: ServerFn<TMethod, TMiddlewares, TInput, TResponse>
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
  TMiddlewares = undefined,
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

      invariant(
        extractedFn.url,
        `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/start-vite-plugin ?`,
      )

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
            method: resolvedOptions.method,
            input: opts?.data as any,
            headers: opts?.headers,
          }).then((d) => d.result)
        },
        {
          // This copies over the URL, function ID and filename
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: (opts: any) => {
            return executeMiddleware(resolvedMiddleware, 'server', {
              ...extractedFn,
              ...opts,
            }).then((d) => d.result)
          },
        },
      ) as any
    },
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

export type MiddlewareOptions = {
  method: Method
  input: any
  headers?: HeadersInit
  serverContext?: any
  context?: any
}

export type MiddlewareResult = {
  context: any
  serverContext: any
  input: any
  result: unknown
}

async function executeMiddleware(
  middlewares: Array<AnyMiddleware>,
  env: 'client' | 'server',
  opts: MiddlewareOptions,
): Promise<MiddlewareResult> {
  const flattenedMiddlewares = flattenMiddlewares(middlewares)

  const next = async (ctx: MiddlewareOptions): Promise<MiddlewareResult> => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx as any
    }

    if (
      nextMiddleware.options.input &&
      (env === 'client' ? nextMiddleware.options.validateClient : true)
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
        serverContext: ctx.serverContext as never,
        method: ctx.method,
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
            method: ctx.method,
            input: ctx.input,
            context,
            serverContext,
            headers,
            result: userResult?.result,
          } as MiddlewareResult & {
            method: Method
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
    ...opts,
    headers: opts.headers || {},
    serverContext: (opts as any).serverContext || {},
    context: opts.context || {},
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
      client: async ({ next, serverContext, ...ctx }) => {
        // Execute the extracted function
        // but not before serializing the context
        const result = await options.extractedFn?.({
          ...ctx,
          // switch the serverContext over to context
          context: serverContext,
        } as any)

        return next({
          result,
        } as any)
      },
      server: async ({ next, ...ctx }) => {
        // Execute the server function
        const result = await options.serverFn?.(ctx as any)

        return next({
          result,
        } as any)
      },
    },
  }
}
