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

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TMiddlewares, TValidator> = {
  method: TMethod
  input: ResolveAllMiddlewareOutput<TMiddlewares, TValidator>
  context: ResolveAllMiddlewareContext<TMiddlewares>
}

export type CompiledFetcherFn<TResponse> = {
  (opts: CompiledFetcherFnOptions): Promise<TResponse>
  url: string
}

type ServerFnBaseOptions<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TValidator = unknown,
> = {
  method?: TMethod
  middleware?: Constrain<TMiddlewares, ReadonlyArray<AnyServerMiddleware>>
  input?: Constrain<TValidator, AnyValidator>
  fn?: ServerFn<TMethod, TMiddlewares, TValidator, TResponse>
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
  input: <TNewServerValidator>(
    input: Constrain<TNewServerValidator, AnyValidator>,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TMiddlewares, TNewServerValidator>,
    'handler' | 'middleware'
  >
  handler: (
    fn: ServerFn<TMethod, TMiddlewares, TValidator, TResponse>,
  ) => Fetcher<TValidator, TResponse>
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
  return {
    options: options as any,
    middleware: (middleware) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        {
          ...(__opts as any),
          middleware,
        },
      ) as any
    },
    input: (input) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        {
          ...(__opts as any),
          input,
        },
      ) as any
    },
    handler: (fn) => {
      return createServerFnFetcher<
        TMethod,
        TResponse,
        TMiddlewares,
        TValidator
      >({
        ...(__opts as any),
        fn,
      }) as any
    },
  }
}

function createServerFnFetcher<
  TMethod extends Method,
  TResponse,
  TMiddlewares,
  TValidator,
>(
  options: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TValidator>,
): CompiledFetcherFn<TResponse> {
  // Cast the compiled function that will be injected by vinxi
  // The `input` will be
  const compiledFn = options as unknown as CompiledFetcherFn<TResponse>

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/router-plugin/vite ?`,
  )

  return Object.assign((opts: FetcherOptions<TValidator>) => {
    return (
      compiledFn({
        method: options.method || 'GET',
        middleware: options.middleware || [],
        data: opts.data!,
        requestInit: opts.requestInit,
      }),
      {
        url: compiledFn.url,
      }
    )
  })
}

// // Implicit
// import autoZodAdapter from '@tanstack/auto-zod-adapter'

// registerGlobalMiddleware({
//   validationImpl: autoZodAdapter
// })

// declare module '@tanstack/start' {
//   interface MiddlewareOptions {
//     validationImpl: autoZodAdapter.Type
//   }
// }

// Composed
// export const zodMiddleware = createRootMiddleware().validationImpl(zodAdapter)

// export const loggingMiddleware = createRootMiddleware().use(logger)

// export const middleware1 = createServerMiddleware({
//   id: 'auth',
// })
//   .middleware(['logging'])
//   .use(async ({ next }) => {
//     const user = await getUser()

//     if (!user) {
//       throw new Error('User not found')
//     }

//     return next({
//       user,
//     })
//   })

// export const workspaceMiddleware = createServerMiddleware({
//   id: 'workspace',
// })
//   .middleware(['auth'])
//   .input(z.object({ workspaceId: z.string() }))

// const sayHello = createServerFn({
//   method: 'GET',
// })
//   .middleware(['workspace'])
//   .input(
//     z.object({
//       name: z.string(),
//     }),
//   ) // Type/Runtime Safety
//   .handler(({ data, context }) => {
//     context.user
//     context.workspaceId

//     return `Hello, ${data}!`
//   })

// sayHello({
//   data: {
//     workspaceId: '123',
//     name: 'world',
//   },
// })

// - Crawl all user files for `createServerFn`, `createServerMiddleware`, `createRootMiddleware`
// - Is it exported? Error
// - Sort middleware based on dependencies.
// - Detect circular middlewares? Error
// - Write middleware maps/types to a generated file

// interface MiddlewareById {
//   auth: typeof zodMiddleware
// }
