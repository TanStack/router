import invariant from 'tiny-invariant'
import type {
  AnyServerMiddleware,
  ResolveAllMiddlewareContext,
  ResolveAllMiddlewareOutput,
} from './createServerMiddleware'
import type {
  AnyValidator,
  Constrain,
  ResolveValidatorInput,
} from '@tanstack/react-router'

//

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  requestInit?: RequestInit
  middleware: ReadonlyArray<AnyServerMiddleware>
}

export type IsOptional<T> = [T] extends [undefined] ? true : false

export type Fetcher<TInput, TResponse> = {
  url: string
  __execute: (input: any) => Promise<{
    input: any
    context: Record<string, any>
  }>
} & FetcherImpl<TInput, TResponse>

export type FetcherImpl<TInput, TResponse> =
  IsOptional<TInput> extends true
    ? (opts?: FetcherOptions<TInput>) => Promise<FetcherData<TResponse>>
    : (opts: FetcherOptions<TInput>) => Promise<FetcherData<TResponse>>

export type FetcherOptions<TInput> = FetcherBaseOptions &
  FetcherDataOptions<TInput>

export type FetcherBaseOptions = {
  requestInit?: RequestInit
}

export type FetcherDataOptions<TInput> =
  IsOptional<TInput> extends true
    ? {
        data?: ResolveValidatorInput<TInput>
      }
    : {
        data: ResolveValidatorInput<TInput>
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

export type ServerFn<TMethod, TMiddlewares, TInput, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TInput>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TMiddlewares, TInput> = {
  method: TMethod
  input: ResolveAllMiddlewareOutput<TMiddlewares, TInput>
  context: ResolveAllMiddlewareContext<TMiddlewares>
}

export type CompiledFetcherFn<TInput, TResponse> = {
  (
    opts: FetcherOptions<TInput>,
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
  TInput = unknown,
> = {
  options: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TInput>
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyServerMiddleware>>,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TNewMiddlewares, TInput>,
    'input' | 'handler'
  >
  input: <TNewServerValidator>(
    input: Constrain<TNewServerValidator, AnyValidator>,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TMiddlewares, TNewServerValidator>,
    'handler' | 'middleware'
  >
  handler: (
    fn?: ServerFn<TMethod, TMiddlewares, TInput, TResponse>,
  ) => Fetcher<TInput, TResponse>
}

export function createServerFn<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TInput = undefined,
>(
  options?: {
    method: TMethod
  },
  __opts?: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TInput>,
): ServerFnBase<TMethod, TResponse, TMiddlewares, TInput> {
  const resolvedOptions = (__opts || options) as ServerFnBaseOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TInput
  >

  return {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TInput>(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    input: (input) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TInput>(
        undefined,
        Object.assign(resolvedOptions, { input }),
      ) as any
    },
    handler: (...args): Fetcher<TInput, TResponse> => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, __serverOnlyOriginalFn] = args as unknown as [
        CompiledFetcherFn<TInput, TResponse>,
        ServerFn<TMethod, TMiddlewares, TInput, TResponse>,
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
        (opts?: FetcherOptions<TInput>) => {
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
      ) as Fetcher<TInput, TResponse>
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
        context: ctx.context,
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
