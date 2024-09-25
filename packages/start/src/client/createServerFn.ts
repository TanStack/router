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

export type Fetcher<TInput, TResponse> = {
  url: string
} & FetcherImpl<TInput, TResponse>

export type FetcherImpl<TInput, TResponse> =
  IsOptional<TInput> extends true
    ? (opts?: FetcherOptions<TInput>) => Promise<FetcherPayload<TResponse>>
    : (opts: FetcherOptions<TInput>) => Promise<FetcherPayload<TResponse>>

export type FetcherOptions<TInput> = FetcherBaseOptions &
  FetcherPayloadOptions<TInput>

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

export type FetcherPayloadOptions<TInput> =
  IsOptional<TInput> extends true
    ? {
        data?: ResolveServerValidatorInput<TInput>
      }
    : {
        data: ResolveServerValidatorInput<TInput>
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

export type ServerFn<TMethod, TInput, TResponse, TContextIn> = (
  ctx: ServerFnCtx<TMethod, TInput, TContextIn>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TInput, TContextIn> = {
  method: TMethod
  data: ResolveSearchSchema<TInput>
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
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
> = {
  method?: TMethod
  middleware?: TMiddlewares
  input?: TInput
  fn?: ServerFn<
    TMethod,
    TInput,
    TResponse,
    ResolveMiddlewareContext<TMiddlewares>
  >
}

type ServerFnBase<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
> = {
  options: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TInput>
  middleware: <TNewMiddlewares extends Array<AnyServerMiddleware>>(
    middlewares: TNewMiddlewares,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TNewMiddlewares, TInput>,
    'input' | 'handler'
  >
  input: <TNewServerValidator extends AnySearchValidator>(
    input: TNewServerValidator,
  ) => Pick<
    ServerFnBase<TMethod, TResponse, TMiddlewares, TNewServerValidator>,
    'handler' | 'middleware'
  >
  handler: (
    fn: ServerFn<
      TMethod,
      TInput,
      TResponse,
      ResolveMiddlewareContext<TMiddlewares>
    >,
  ) => Fetcher<TInput, TResponse>
}

export function createServerFn<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
>(
  options?: {
    method: TMethod
  },
  __opts?: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TInput>,
): ServerFnBase<TMethod, TResponse, TMiddlewares, TInput> {
  return {
    options: options as any,
    middleware: (middleware) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TInput>(
        undefined,
        {
          ...(__opts as any),
          middleware,
        },
      ) as any
    },
    input: (input) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TInput>(
        undefined,
        {
          ...(__opts as any),
          input,
        },
      ) as any
    },
    handler: (fn) => {
      return createServerFnFetcher<TMethod, TResponse, TMiddlewares, TInput>({
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
  TInput extends AnySearchValidator,
>(
  options: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TInput>,
): CompiledFetcherFn<TResponse> {
  // Cast the compiled function that will be injected by vinxi
  // The `input` will be
  const compiledFn = options as unknown as CompiledFetcherFn<TResponse>

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/router-plugin/vite ?`,
  )

  return Object.assign((opts: FetcherOptions<TInput>) => {
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
  .input(z.object({ workspaceId: z.string() }))

const sayHello = createServerFn({
  method: 'GET',
})
  .middleware(['workspace'])
  .input(
    z.object({
      name: z.string(),
    }),
  ) // Type/Runtime Safety
  .handler(({ data, context }) => {
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
