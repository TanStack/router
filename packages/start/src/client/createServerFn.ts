import invariant from 'tiny-invariant'
import { createServerMiddleware } from './createServerMiddleware'
import type {
  AnyServerMiddleware,
  ResolveMiddlewareContext,
} from './createServerMiddleware'
import type {
  AnySearchValidator,
  AnySearchValidatorAdapter,
  AnySearchValidatorObj,
  ResolveSearchSchema,
  SearchValidator,
} from '@tanstack/react-router'

//

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  requestInit?: RequestInit
  middleware: Array<AnyServerMiddleware>
}

export type IsOptional<T> = [T] extends [undefined] ? true : false

export type Fetcher<TServerValidator, TResponse> = {
  url: string
} & FetcherImpl<TServerValidator, TResponse>

export type FetcherImpl<TServerValidator, TResponse> =
  IsOptional<TServerValidator> extends true
    ? (
        opts?: FetcherOptions<TServerValidator>,
      ) => Promise<FetcherPayload<TResponse>>
    : (
        opts: FetcherOptions<TServerValidator>,
      ) => Promise<FetcherPayload<TResponse>>

export type FetcherOptions<TServerValidator> = FetcherBaseOptions &
  FetcherPayloadOptions<TServerValidator>

export type FetcherBaseOptions = {
  requestInit?: RequestInit
}

export type ResolveServerValidatorSchemaFnInput<TSearchValidator> =
  TSearchValidator extends (input: infer TSearchSchemaInput) => any
    ? unknown extends TSearchSchemaInput
      ? ResolveSearchSchema<TSearchValidator>
      : TSearchSchemaInput
    : ResolveSearchSchema<TSearchValidator>

export type ResolveServerValidatorInput<TSearchValidator> =
  TSearchValidator extends AnySearchValidatorAdapter
    ? TSearchValidator['types']['input']
    : TSearchValidator extends AnySearchValidatorObj
      ? ResolveServerValidatorSchemaFnInput<TSearchValidator['parse']>
      : ResolveServerValidatorSchemaFnInput<TSearchValidator>

export type FetcherPayloadOptions<TServerValidator> =
  IsOptional<TServerValidator> extends true
    ? {
        data?: ResolveServerValidatorInput<TServerValidator>
      }
    : {
        data: ResolveServerValidatorInput<TServerValidator>
      }

export type FetcherPayload<TResponse> = WrapRSCs<
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

export type ServerFn<TMethod, TServerValidator, TResponse, TContextIn> = (
  ctx: ServerFnCtx<TMethod, TServerValidator, TContextIn>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TServerValidator, TContextIn> = {
  method: TMethod
  data: ResolveSearchSchema<TServerValidator>
  context: TContextIn
}

export type CompiledFetcherFn<TResponse> = {
  (opts: CompiledFetcherFnOptions): Promise<TResponse>
  url: string
}

type ServerFnBaseOptions<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TServerValidator extends AnySearchValidator = SearchValidator<
    unknown,
    unknown
  >,
> = {
  method?: TMethod
  middleware?: TMiddlewares
  serverValidator?: TServerValidator
  fn?: ServerFn<
    TMethod,
    TServerValidator,
    TResponse,
    ResolveMiddlewareContext<TMiddlewares>
  >
}

type ServerFnBase<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TServerValidator extends AnySearchValidator = SearchValidator<
    unknown,
    unknown
  >,
> = {
  options: ServerFnBaseOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TServerValidator
  >
  setMethod: <TNewMethod extends Method>(
    method: TNewMethod,
  ) => Pick<
    ServerFnBase<TNewMethod, TResponse, TMiddlewares, TServerValidator>,
    'middleware' | 'serverValidator' | 'fn'
  >
  middleware: <TNewMiddlewares extends Array<AnyServerMiddleware>>(
    middlewares: TNewMiddlewares,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TNewMiddlewares, TServerValidator>,
    'serverValidator' | 'fn'
  >
  serverValidator: <TNewServerValidator extends AnySearchValidator>(
    serverValidator: TNewServerValidator,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TMiddlewares, TNewServerValidator>,
    'fn' | 'middleware'
  >
  fn: (
    fn: ServerFn<
      TMethod,
      TServerValidator,
      TResponse,
      ResolveMiddlewareContext<TMiddlewares>
    >,
  ) => Fetcher<TServerValidator, TResponse>
}

export function createServerFn<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TServerValidator extends AnySearchValidator = SearchValidator<
    unknown,
    unknown
  >,
>(
  options?: {
    method: TMethod
  },
  __opts?: ServerFnBaseOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TServerValidator
  >,
): ServerFnBase<TMethod, TResponse, TMiddlewares, TServerValidator> {
  return {
    options: options as any,
    setMethod: (method) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TServerValidator>(
        undefined,
        {
          ...(__opts as any),
          method,
        },
      ) as any
    },
    middleware: (middleware) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TServerValidator>(
        undefined,
        {
          ...(__opts as any),
          middleware,
        },
      ) as any
    },
    serverValidator: (serverValidator) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TServerValidator>(
        undefined,
        {
          ...(__opts as any),
          serverValidator,
        },
      ) as any
    },
    fn: (fn) => {
      return createServerFnFetcher<
        TMethod,
        TResponse,
        TMiddlewares,
        TServerValidator
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
  TMiddlewares extends Array<AnyServerMiddleware>,
  TServerValidator extends AnySearchValidator,
>(
  options: ServerFnBaseOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TServerValidator
  >,
): CompiledFetcherFn<TResponse> {
  // Cast the compiled function that will be injected by vinxi
  // The `serverValidator` will be
  const compiledFn = options as unknown as CompiledFetcherFn<TResponse>

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/router-plugin/vite ?`,
  )

  return Object.assign((opts: FetcherOptions<TServerValidator>) => {
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
export const zodMiddleware = createRootMiddleware().validationImpl(zodAdapter)

export const loggingMiddleware = createRootMiddleware().use(logger)

export const middleware1 = createServerMiddleware({
  id: 'auth',
})
  .middleware(['logging'])
  .use(async ({ next }) => {
    const user = await getUser()

    if (!user) {
      throw new Error('User not found')
    }

    return next({
      user,
    })
  })

export const workspaceMiddleware = createServerMiddleware({
  id: 'workspace',
})
  .middleware(['auth'])
  .serverValidator(z.object({ workspaceId: z.string() }))

const sayHello = createServerFn({
  method: 'GET',
})
  .middleware(['workspace'])
  .serverValidator(
    z.object({
      name: z.string(),
    }),
  ) // Type/Runtime Safety
  .fn(({ data, context }) => {
    context.user
    context.workspaceId

    return `Hello, ${data}!`
  })

sayHello({
  data: {
    workspaceId: '123',
    name: 'world',
  },
})

// - Crawl all user files for `createServerFn`, `createServerMiddleware`, `createRootMiddleware`
// - Is it exported? Error
// - Sort middleware based on dependencies.
// - Detect circular middlewares? Error
// - Write middleware maps/types to a generated file

// interface MiddlewareById {
//   auth: typeof zodMiddleware
// }
