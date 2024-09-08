import invariant from 'tiny-invariant'
import type { ResolveParams } from '@tanstack/react-router'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions<TSearch, TPayload> = {
  method: Method
  search: unknown
  payload: unknown
  requestInit?: RequestInit
  middleware: Array<ServerMiddleware<any, any>>
}

export type IsOptional<T> = [T] extends [undefined] ? true : false

export type Fetcher<TMethod, TSearch, TPayload, TResponse> = {
  url: string
} & (TMethod extends 'GET' | 'DELETE'
  ? FetcherImpl<TSearch, never, TResponse>
  : FetcherImpl<TSearch, TPayload, TResponse>)

export type FetcherImpl<TSearch, TPayload, TResponse> = [
  IsOptional<TPayload>,
  IsOptional<TSearch>,
] extends [true, true]
  ? (
      opts?: FetcherOptions<TSearch, TPayload>,
    ) => Promise<FetcherPayload<TResponse>>
  : (
      opts: FetcherOptions<TSearch, TPayload>,
    ) => Promise<FetcherPayload<TResponse>>

export type FetcherOptions<TSearch, TPayload> = FetcherBaseOptions &
  FetcherPayloadOptions<TPayload> &
  FetcherSearchOptions<TSearch>

export type FetcherBaseOptions = {
  requestInit?: RequestInit
}

export type FetcherPayloadOptions<TPayload> =
  IsOptional<TPayload> extends true
    ? {
        payload?: TPayload
      }
    : {
        payload: TPayload
      }

export type FetcherSearchOptions<TSearch> = undefined extends TSearch
  ? {
      search?: Record<string, any>
    }
  : IsOptional<TSearch> extends true
    ? {
        search?: TSearch
      }
    : {
        search: TSearch
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

export type ServerMiddleware<
  TContextOut,
  TMiddlewares extends Array<ServerMiddleware<any, any>> = [],
> = MiddlewareOptions<TContextOut, TMiddlewares>

export type ServerMiddlewarePreFn<TContextIn, TContextOut> = (options: {
  context: TContextIn
}) =>
  | ServerMiddlewarePreFnReturn<TContextOut>
  | Promise<ServerMiddlewarePreFnReturn<TContextOut>>

export type ServerMiddlewarePreFnReturn<TContextOut> = {
  context: TContextOut
}

export type ServerMiddlewarePostFn<TContextOut> = (options: {
  context: TContextOut
}) => void

export type MiddlewareOptions<
  TContextOut,
  TMiddlewares extends Array<ServerMiddleware<any, any>> = [],
> = {
  middleware?: TMiddlewares
  pre?: ServerMiddlewarePreFn<
    ResolveMiddlewareContext<TMiddlewares>,
    TContextOut
  >
  post?: ServerMiddlewarePostFn<TContextOut>
}

export function createServerMiddleware<
  TContextOut,
  const TMiddlewares extends Array<ServerMiddleware<any, any>>,
>(
  options: MiddlewareOptions<TContextOut, TMiddlewares>,
): ServerMiddleware<TContextOut, TMiddlewares> {
  return options
}

export type FlattenMiddleware<TMiddlewares> = TMiddlewares extends []
  ? []
  : TMiddlewares extends [infer TFirst, ...infer TRest]
    ? [
        ...FlattenMiddleware<ExtractMiddleware<TFirst>>,
        TFirst,
        ...FlattenMiddleware<TRest>,
      ]
    : []

// Define a utility type to extract the output context from a middleware function
export type ExtractContext<TMiddleware> =
  TMiddleware extends ServerMiddleware<infer TContextOut, any>
    ? TContextOut
    : never

export type ExtractMiddleware<TMiddleware> =
  TMiddleware extends ServerMiddleware<any, infer TMiddlewares>
    ? TMiddlewares
    : []

// Recursively resolve the context type produced by a sequence of middleware
export type ResolveMiddlewareContext<TMiddlewares> =
  ResolveMiddlewareContextInner<FlattenMiddleware<TMiddlewares>>

export type ResolveMiddlewareContextInner<TMiddlewares> = TMiddlewares extends [
  infer TFirst,
  ...infer TRest,
]
  ? ExtractContext<TFirst> &
      (TRest extends [] ? {} : ResolveMiddlewareContextInner<TRest>)
  : {}

export type testMiddleware = [
  ServerMiddleware<
    { d: string },
    [
      ServerMiddleware<{ b: number }, [ServerMiddleware<{ a: boolean }, []>]>,
      ServerMiddleware<{ c: boolean }, []>,
    ]
  >,
  ServerMiddleware<{ e: number }, []>,
]

type testFlat = FlattenMiddleware<testMiddleware>
type testResolved = ResolveMiddlewareContext<testMiddleware>
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export type ServerFn<
  TPath extends string,
  TMethod,
  TSearch,
  TPayload,
  TResponse,
  TContextIn,
> = (
  ctx: ServerFnCtx<
    ResolveParams<TPath>,
    TMethod,
    TSearch,
    TPayload,
    TContextIn
  >,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TParams, TMethod, TSearch, TPayload, TContextIn> = {
  path: string
  params: TParams
  method: TMethod
  search: TSearch
  payload: TPayload
  context: TContextIn
}

export type CompiledFetcherFn<TSearch, TPayload, TResponse> = {
  (opts: CompiledFetcherFnOptions<TSearch, TPayload>): Promise<TResponse>
  url: string
}

export function createServerFn<
  TPath extends string = string,
  TMethod extends Method = 'GET',
  TSearch = undefined,
  TPayload = undefined,
  TResponse = unknown,
  const TMiddlewares extends Array<ServerMiddleware<any, any>> = Array<
    ServerMiddleware<any, any>
  >,
>(options: {
  path?: TPath
  method?: TMethod
  middleware?: TMiddlewares
  fn: ServerFn<
    TPath,
    TMethod,
    TSearch,
    TPayload,
    TResponse,
    ResolveMiddlewareContext<TMiddlewares>
  >
}): Fetcher<TMethod, TSearch, TPayload, TResponse> {
  // Cast the compiled function that will be injected by vinxi
  const compiledFn = options as unknown as CompiledFetcherFn<
    TPayload,
    TResponse,
    TSearch
  >

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/router-plugin/vite ?`,
  )

  const middleware = options.middleware || []

  return Object.assign(
    (opts: FetcherOptions<TSearch, TPayload>) => {
      return compiledFn({
        method: options.method || 'GET',
        payload: opts.payload!,
        search: opts.search,
        requestInit: opts.requestInit,
        middleware,
      })
    },
    {
      url: compiledFn.url,
    },
  ) as any
}

const rootMiddleware = createServerMiddleware({
  // defaultValidatorFn: zodValidator,
})

const authMiddleware = createServerMiddleware({
  middleware: [rootMiddleware],
  pre: async () => {
    const user = await {
      id: '123',
      name: 'Bob',
    }

    return {
      context: {
        user,
      },
    }
  },
  post: ({ context }) => {
    context.user
    // console.log(getHeaders())
  },
})

const workspaceMiddleware = createServerMiddleware({
  middleware: [authMiddleware],
  pre: ({ context }) => {
    const workspace = context.user + '-workspace'

    return {
      context: {
        workspace,
      },
    }
  },
})

// const personSchema = z.object({
//   name: z.string(),
// })

const doStuff = createServerFn({
  path: '/api/do-stuff/$stuffId',
  method: 'GET',
  middleware: [workspaceMiddleware],
  // validator: personSchema,
  fn: ({ payload, search, context }) => {
    // context.user
    // context.workspace
    // params.stuffId
    // ...
  },
})

doStuff()
