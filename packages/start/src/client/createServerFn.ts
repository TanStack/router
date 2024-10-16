import invariant from 'tiny-invariant'
import type {
  AnyServerMiddleware,
  ResolveAllMiddlewareContext,
  ResolveAllMiddlewareInput,
  ResolveAllMiddlewareOutput,
} from './createServerMiddleware'
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
  context: ResolveAllMiddlewareContext<TMiddlewares>
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
  middleware?: Constrain<TMiddlewares, ReadonlyArray<AnyServerMiddleware>>
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
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyServerMiddleware>>,
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
          ...extractedFn,
          __execute: makeExecuterFn(resolvedOptions),
        },
      ) as any
    },
  }
}

function makeExecuterFn(options: ServerFnBaseOptions<any, any, any, any>) {
  // This is a private method that is only called from the server to execute the middleware
  // chain. It is used in the server environment. It's passed the input
  // and uses the resolved server function options to create
  // a final middleware chain to be executed and returned
  return async (input: any) => {
    const middleware = [
      ...(options.middleware || []),
      serverFnBaseToMiddleware(options),
    ]

    return executeMiddleware(middleware, input)
  }
}

function flattenMiddlewares(
  middlewares: Array<AnyServerMiddleware>,
): Array<AnyServerMiddleware> {
  const flattened: Array<AnyServerMiddleware> = []

  const recurse = (middleware: Array<AnyServerMiddleware>) => {
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
  middlewares: Array<AnyServerMiddleware>,
  input: any,
): Promise<unknown> {
  const flattenedMiddlewares = flattenMiddlewares(middlewares)

  const next = async (ctx: {
    input: any
    context: any
  }): Promise<{
    context: any
    input: any
    result: unknown
  }> => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx as any
    }

    if (nextMiddleware.options.input) {
      // Execute the middleware's input function
      ctx.input = await nextMiddleware.options.input(ctx.input)
    }

    if (nextMiddleware.options.useFn) {
      // Execute the middleware's useFn
      return nextMiddleware.options.useFn({
        input: ctx.input,
        context: ctx.context as never,
        next: (userResult) => {
          // Take the user provided context
          // and merge it with the current context
          const context = {
            ...ctx.context,
            ...userResult?.context,
          }

          // Return the next middleware
          return next({
            input: ctx.input,
            context,
            result: (userResult as any)?.result,
          } as {
            context: any
            input: any
            result: unknown
          }) as any
        },
      }) as any
    }

    // If the middleware doesn't have a useFn, just continue
    // to the next middleware
    return next(ctx)
  }

  // Start the middleware chain
  const res = await next({
    input,
    context: {},
  })

  return res.result
}

function serverFnBaseToMiddleware(
  options: ServerFnBaseOptions<any, any, any, any>,
): AnyServerMiddleware {
  return {
    _types: undefined!,
    options: {
      id: undefined!,
      input: options.input,
      // eslint-disable-next-line @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks
      useFn: async ({ next, ...ctx }) => {
        const result = await options.handlerFn?.(ctx as any)

        return next({
          result,
        } as any)
      },
    },
  }
}
