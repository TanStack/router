import invariant from 'tiny-invariant'
import { defaultTransformer } from '@tanstack/react-router'
import { mergeHeaders } from './headers'
import type {
  AnyValidator,
  Constrain,
  DefaultTransformerParse,
  DefaultTransformerStringify,
  Expand,
  ResolveValidatorInput,
  TransformerStringify,
  Validator,
} from '@tanstack/react-router'
import type {
  AnyMiddleware,
  MergeAllServerContext,
  MergeAllValidatorInputs,
  MergeAllValidatorOutputs,
} from './createMiddleware'

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
  __executeServer: (opts: {
    method: Method
    data: unknown
    headers?: HeadersInit
  }) => Promise<unknown>
} & FetcherImpl<TMiddlewares, TValidator, TResponse>

export type FetcherImpl<TMiddlewares, TValidator, TResponse> =
  undefined extends MergeAllValidatorInputs<TMiddlewares, TValidator>
    ? (
        opts?: OptionalFetcherDataOptions<
          Expand<MergeAllValidatorInputs<TMiddlewares, TValidator>>
        >,
      ) => Promise<FetcherData<TResponse>>
    : (
        opts: RequiredFetcherDataOptions<
          Expand<MergeAllValidatorInputs<TMiddlewares, TValidator>>
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

export type FetcherData<TResponse> = DefaultTransformerParse<
  TResponse extends JsonResponse<infer TData> ? TData : TResponse
>

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) =>
  | Promise<DefaultTransformerStringify<TResponse>>
  | DefaultTransformerStringify<TResponse>

export interface ServerFnCtx<TMethod, TMiddlewares, TValidator> {
  method: TMethod
  data: Expand<MergeAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<MergeAllServerContext<TMiddlewares>>
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
  validator?: ConstrainValidator<TInput>
  extractedFn?: CompiledFetcherFn<TResponse>
  serverFn?: ServerFn<TMethod, TMiddlewares, TInput, TResponse>
  filename: string
  functionId: string
}

export type ConstrainValidator<TValidator> = unknown extends TValidator
  ? TValidator
  : Constrain<
      TValidator,
      Validator<
        TransformerStringify<
          ResolveValidatorInput<TValidator>,
          Date | undefined | FormData
        >,
        any
      >
    >

export interface ServerFnMiddleware<TMethod extends Method, TValidator> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => ServerFnAfterMiddleware<TMethod, TNewMiddlewares, TValidator>
}

export interface ServerFnAfterMiddleware<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnValidator<TMethod, TMiddlewares>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {}

export interface ServerFnValidator<TMethod extends Method, TMiddlewares> {
  validator: <TValidator>(
    validator: ConstrainValidator<TValidator>,
  ) => ServerFnAfterValidator<TMethod, TMiddlewares, TValidator>
}

export interface ServerFnAfterValidator<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> extends ServerFnMiddleware<TMethod, TValidator>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {}

export interface ServerFnHandler<
  TMethod extends Method,
  TMiddlewares,
  TValidator,
> {
  handler: <TNewResponse>(
    fn?: ServerFn<TMethod, TMiddlewares, TValidator, TNewResponse>,
  ) => Fetcher<TMiddlewares, TValidator, TNewResponse>
}

export interface ServerFnBuilder<
  TMethod extends Method = 'GET',
  TResponse = unknown,
  TMiddlewares = unknown,
  TValidator = unknown,
> extends ServerFnMiddleware<TMethod, TValidator>,
    ServerFnValidator<TMethod, TMiddlewares>,
    ServerFnHandler<TMethod, TMiddlewares, TValidator> {
  options: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TValidator>
}

export function createServerFn<
  TMethod extends Method,
  TResponse = unknown,
  TMiddlewares = undefined,
  TValidator = undefined,
>(
  options?: {
    method: TMethod
  },
  __opts?: ServerFnBaseOptions<TMethod, TResponse, TMiddlewares, TValidator>,
): ServerFnBuilder<TMethod, TResponse, TMiddlewares, TValidator> {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    TMethod,
    TResponse,
    TMiddlewares,
    TValidator
  >

  if (typeof resolvedOptions.method === 'undefined') {
    resolvedOptions.method = 'GET' as TMethod
  }

  return {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    validator: (validator) => {
      return createServerFn<TMethod, TResponse, TMiddlewares, TValidator>(
        undefined,
        Object.assign(resolvedOptions, { validator }),
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
            data: opts?.data as any,
            headers: opts?.headers,
            context: Object.assign({}, extractedFn),
          }).then((d) => d.result)
        },
        {
          // This copies over the URL, function ID and filename
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: (opts: any) => {
            const parsedOpts =
              opts instanceof FormData ? extractFormDataContext(opts) : opts

            return executeMiddleware(resolvedMiddleware, 'server', {
              ...extractedFn,
              ...parsedOpts,
            }).then((d) => ({
              // Only send the result and sendContext back to the client
              result: d.result,
              context: d.sendContext,
            }))
          },
        },
      ) as any
    },
  }
}

function extractFormDataContext(formData: FormData) {
  const serializedContext = formData.get('__TSR_CONTEXT')
  formData.delete('__TSR_CONTEXT')

  if (typeof serializedContext !== 'string') {
    return {
      context: {},
      data: formData,
    }
  }

  try {
    const context = defaultTransformer.parse(serializedContext)
    return {
      context,
      data: formData,
    }
  } catch (e) {
    return {
      data: formData,
    }
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
  data: any
  headers?: HeadersInit
  sendContext?: any
  context?: any
}

export type MiddlewareResult = {
  context: any
  sendContext: any
  data: any
  result: unknown
}

const applyMiddleware = (
  middlewareFn: NonNullable<
    | AnyMiddleware['options']['client']
    | AnyMiddleware['options']['server']
    | AnyMiddleware['options']['clientAfter']
  >,
  mCtx: MiddlewareOptions,
  nextFn: (ctx: MiddlewareOptions) => Promise<MiddlewareResult>,
) => {
  return middlewareFn({
    data: mCtx.data,
    context: mCtx.context,
    sendContext: mCtx.sendContext,
    method: mCtx.method,
    next: ((userResult: any) => {
      // Take the user provided context
      // and merge it with the current context
      const context = {
        ...mCtx.context,
        ...userResult?.context,
      }

      const sendContext = {
        ...mCtx.sendContext,
        ...(userResult?.sendContext ?? {}),
      }

      const headers = mergeHeaders(mCtx.headers, userResult?.headers)

      // Return the next middleware
      return nextFn({
        method: mCtx.method,
        data: mCtx.data,
        context,
        sendContext,
        headers,
        result: userResult?.result ?? (mCtx as any).result,
      } as MiddlewareResult & {
        method: Method
      })
    }) as any,
  })
}

function execValidator(validator: AnyValidator, input: unknown): unknown {
  if (validator == null) return {}

  if ('~standard' in validator) {
    const result = validator['~standard'].validate(input)

    if (result instanceof Promise)
      throw new Error('Async validation not supported')

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
      nextMiddleware.options.validator &&
      (env === 'client' ? nextMiddleware.options.validateClient : true)
    ) {
      // Execute the middleware's input function
      ctx.data = await execValidator(nextMiddleware.options.validator, ctx.data)
    }

    const middlewareFn =
      env === 'client'
        ? nextMiddleware.options.client
        : nextMiddleware.options.server

    if (middlewareFn) {
      // Execute the middleware
      return applyMiddleware(
        middlewareFn,
        ctx,
        async (userCtx): Promise<MiddlewareResult> => {
          // If there is a clientAfter function and we are on the client
          if (env === 'client' && nextMiddleware.options.clientAfter) {
            // We need to await the next middleware and get the result
            const result = await next(userCtx)
            // Then we can execute the clientAfter function
            return applyMiddleware(
              nextMiddleware.options.clientAfter,
              result as any,
              // Identity, because there "next" is just returning
              (d: any) => d,
            ) as any
          }

          return next(userCtx)
        },
      ) as any
    }

    return next(ctx)
  }

  // Start the middleware chain
  return next({
    ...opts,
    headers: opts.headers || {},
    sendContext: (opts as any).sendContext || {},
    context: opts.context || {},
  })
}

function serverFnBaseToMiddleware(
  options: ServerFnBaseOptions<any, any, any, any>,
): AnyMiddleware {
  return {
    _types: undefined!,
    options: {
      validator: options.validator,
      validateClient: options.validateClient,
      client: async ({ next, sendContext, ...ctx }) => {
        // Execute the extracted function
        // but not before serializing the context
        const res = await options.extractedFn?.({
          ...ctx,
          // switch the sendContext over to context
          context: sendContext,
        } as any)

        return next(res)
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
