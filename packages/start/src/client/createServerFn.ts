import invariant from 'tiny-invariant'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  payload: unknown
  requestInit?: RequestInit
  middleware: Array<ServerMiddleware<any, any>>
  serverValidator: () => any
}

export type IsOptional<T> = [T] extends [undefined] ? true : false

export type Fetcher<TMethod, TPayload, TResponse> = {
  url: string
} & (TMethod extends 'GET' | 'DELETE'
  ? FetcherImpl<never, TResponse>
  : FetcherImpl<TPayload, TResponse>)

export type FetcherImpl<TPayload, TResponse> =
  IsOptional<TPayload> extends true
    ? (opts?: FetcherOptions<TPayload>) => Promise<FetcherPayload<TResponse>>
    : (opts: FetcherOptions<TPayload>) => Promise<FetcherPayload<TResponse>>

export type FetcherOptions<TPayload> = FetcherBaseOptions &
  FetcherPayloadOptions<TPayload>

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
  TId,
  TContextOut,
  TMiddlewares extends Array<ServerMiddleware<any, any>> = [],
> = {
  id: TId
  middleware?: TMiddlewares
  before?: ServerMiddlewarePreFn<
    ResolveMiddlewareContext<TMiddlewares>,
    TContextOut
  >
  after?: ServerMiddlewarePostFn<TContextOut>
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
type Method = 'GET' | 'POST'

export type ServerFn<TMethod, TPayload, TResponse, TContextIn> = (
  ctx: ServerFnCtx<TMethod, TPayload, TContextIn>,
) => Promise<TResponse> | TResponse

export type ServerFnCtx<TMethod, TPayload, TContextIn> = {
  method: TMethod
  payload: TPayload
  context: TContextIn
}

export type CompiledFetcherFn<TResponse> = {
  (opts: CompiledFetcherFnOptions): Promise<TResponse>
  url: string
}

type Validator = {
  in?: any
  out?: any
}

export function createServerFn<
  TMethod extends Method = 'GET',
  TPayload = undefined,
  TResponse = unknown,
  const TMiddlewares extends Array<ServerMiddleware<any, any>> = Array<
    ServerMiddleware<any, any>
  >,
  TServerValidator extends Validator = Validator,
>(options: {
  method?: TMethod
  middleware?: TMiddlewares
  serverValidator?: TServerValidator
  fn: ServerFn<
    TMethod,
    TPayload,
    TResponse,
    ResolveMiddlewareContext<TMiddlewares>
  >
}): Fetcher<TMethod, TPayload, TResponse> {
  // Cast the compiled function that will be injected by vinxi
  const compiledFn = options as unknown as CompiledFetcherFn<TResponse>

  invariant(
    compiledFn.url,
    `createServerFn must be called with a function that is marked with the 'use server' pragma. Are you using the @tanstack/router-plugin/vite ?`,
  )

  const middleware = options.middleware || []

  return Object.assign(
    (opts: FetcherOptions<TPayload>) => {
      return compiledFn({
        middleware,
        method: options.method || 'GET',
        serverValidator: options.serverValidator,
        payload: opts.payload!,
        requestInit: opts.requestInit,
      })
    },
    {
      url: compiledFn.url,
    },
  ) as any
}

//
//
//
//
//
//
//
//
//
//

// The createServerFn function

// const doStuff = createServerFn({
//   fn: (payload) => {
//     // ...
//   },
// })

// // Customizing the method

// const doStuff = createServerFn({
//   method: 'GET',
//   fn: () => {
//     // ...
//   },
// })

// // Typesafety

// type Person = {
//   name: string
// }

// const doStuff = createServerFn({
//   method: 'GET',
//   fn: (person: Person) => {
//     // ...
//   },
// })

// doStuff({
//   notName: 'bob', // Type Error, but allowed at runtime
// })

// // Runtime Type Safety and Validation

// const personSchema = z.object({
//   name: z.string(),
// })

// const doStuff = createServerFn({
//   method: 'GET',
//   validator: personSchema,
//   fn: (person) => {
//     // ...
//   },
// })

// doStuff({
//   name: 'Bob',
// })

// // What if we need to access externally via REST?

// const personSchema = z.object({
//   name: z.string(),
// })

// const doStuff = createServerFn({
//   method: 'GET',
//   validator: personSchema,
//   fn: (person) => {
//     // ...
//   },
// })

// fetch({
//   url: '/api/person',
//   searchParams: {
//     name: 'Bob',
//   },
//   method: 'GET',
// })

// // Middleware?

// export const apiServerFn = createServerFn({
//   before: async () => {
//     // authenticate the user
//     const user = await authUser()

//     return {
//       context: {
//         user,
//       },
//     }
//   },
// })

// const doStuff = createServerFn({
//   method: 'GET',
//   fn: ({ context }) => {
//     console.log(context.user)
//     // ...
//   },
// })

// // Composed Middleware?

// const apiMiddleware = createServerFn({
//   before: async () => {
//     // authenticate the user
//     const user = await authUser()

//     return {
//       context: {
//         user,
//       },
//     }
//   },
// })

// const doStuff = createServerFn({
//   middleware: [apiMiddleware],
//   fn: ({ context }) => {
//     console.log(context.user)
//     // ...
//   },
// })

// // Nested Middleware?
// // I'm not sure I like this API yet, but we should attempt to remove ambiguity
// // in the order of global middleware

// export const zodValidatorMiddleware = registerServerMiddleware([
//   // Customize the validator implementation
//   {
//     defaultValidatorFn: zodValidator,
//   },
//   // Add the sentry middleware
//   {
//     before: sentryServerStartMiddleware,
//   },
// ])

// // middleware/auth.ts

// export const authMiddleware = createServerMiddleware({
//   id: 'auth',
//   before: async ({ context }) => {
//     const user = await getUser()

//     // Provide a user to the context
//     return {
//       context: {
//         user,
//       },
//     }
//   },
// })

// export const workspaceMiddleware = createServerMiddleware({
//   id: 'workspace',
//   dependencies: ['auth'],
//   before: async ({ context }) => {
//     const workspace = await getWorkspace(context.user.id)

//     // Provide a workspace to the context
//     return {
//       context: {
//         workspace,
//       },
//     }
//   },
//   after: ({ context }) => {
//     // If things were successful, log the workspace
//     console.log(context.workspace)
//   },
//   clientBefore: () => {
//     setHeader('x-workspace-id', context.workspace.id)
//   },
// })

// const personSchema = z.object({
//   name: z.string(),
// })

// const doStuff = createServerFn({
//   dependencies: ['workspace'],
//   validator: personSchema,
//   fn: ({ payload, context }) => {
//     console.log(context.user)
//     console.log(context.workspace)
//     console.log(payload.name)
//   },
//   method: 'GET',
//   requestHeaders: {
//     'x-custom-header': 'value',
//   },
// })

// // In your app:
// doStuff({
//   name: 'Bob',
// })
