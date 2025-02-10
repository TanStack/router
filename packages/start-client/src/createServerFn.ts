import { isNotFound, isRedirect, warning } from '@tanstack/react-router'
import { mergeHeaders } from './headers'
import { globalMiddleware } from './registerGlobalMiddleware'
import { startSerializer } from './serializer'
import type {
  AnyValidator,
  Constrain,
  Expand,
  ResolveValidatorInput,
  SerializerParse,
  SerializerStringify,
  SerializerStringifyBy,
  Validator,
} from '@tanstack/react-router'
import type {
  AnyMiddleware,
  AssignAllServerContext,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
  MiddlewareClientFnResult,
  MiddlewareServerFnResult,
} from './createMiddleware'

export interface JsonResponse<TData> extends Response {
  json: () => Promise<TData>
}

export type CompiledFetcherFnOptions = {
  method: Method
  data: unknown
  headers?: HeadersInit
  context?: any
}

export type Fetcher<TMiddlewares, TValidator, TResponse> =
  undefined extends IntersectAllValidatorInputs<TMiddlewares, TValidator>
    ? OptionalFetcher<TMiddlewares, TValidator, TResponse>
    : RequiredFetcher<TMiddlewares, TValidator, TResponse>

export interface FetcherBase {
  url: string
  __executeServer: (opts: {
    method: Method
    data: unknown
    headers?: HeadersInit
    context?: any
  }) => Promise<unknown>
}

export interface OptionalFetcher<TMiddlewares, TValidator, TResponse>
  extends FetcherBase {
  (
    ...args: [options?: OptionalFetcherDataOptions<TMiddlewares, TValidator>]
  ): Promise<FetcherData<TResponse>>
}

export interface RequiredFetcher<TMiddlewares, TValidator, TResponse>
  extends FetcherBase {
  (
    opts: RequiredFetcherDataOptions<TMiddlewares, TValidator>,
  ): Promise<FetcherData<TResponse>>
}

export type FetcherBaseOptions = {
  headers?: HeadersInit
}

export interface RequiredFetcherDataOptions<TMiddlewares, TValidator>
  extends FetcherBaseOptions {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export interface OptionalFetcherDataOptions<TMiddlewares, TValidator>
  extends FetcherBaseOptions {
  data?: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
}

export type FetcherData<TResponse> =
  TResponse extends JsonResponse<any>
    ? SerializerParse<ReturnType<TResponse['json']>>
    : SerializerParse<TResponse>

export type RscStream<T> = {
  __cacheState: T
}

export type Method = 'GET' | 'POST'

export type ServerFn<TMethod, TMiddlewares, TValidator, TResponse> = (
  ctx: ServerFnCtx<TMethod, TMiddlewares, TValidator>,
) => Promise<SerializerStringify<TResponse>> | SerializerStringify<TResponse>

export interface ServerFnCtx<TMethod, TMiddlewares, TValidator> {
  method: TMethod
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares>>
}

export type CompiledFetcherFn<TResponse> = {
  (
    opts: CompiledFetcherFnOptions & ServerFnBaseOptions<Method>,
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
  validator?: ConstrainValidator<TInput>
  extractedFn?: CompiledFetcherFn<TResponse>
  serverFn?: ServerFn<TMethod, TMiddlewares, TInput, TResponse>
  filename: string
  functionId: string
}

export type ValidatorSerializerStringify<TValidator> = Validator<
  SerializerStringifyBy<
    ResolveValidatorInput<TValidator>,
    Date | undefined | FormData
  >,
  any
>

export type ConstrainValidator<TValidator> = unknown extends TValidator
  ? TValidator
  : Constrain<TValidator, ValidatorSerializerStringify<TValidator>>

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

export type ValidatorFn<TMethod extends Method, TMiddlewares> = <TValidator>(
  validator: ConstrainValidator<TValidator>,
) => ServerFnAfterValidator<TMethod, TMiddlewares, TValidator>

export interface ServerFnValidator<TMethod extends Method, TMiddlewares> {
  validator: ValidatorFn<TMethod, TMiddlewares>
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

export interface ServerFnBuilder<TMethod extends Method = 'GET'>
  extends ServerFnMiddleware<TMethod, undefined>,
    ServerFnValidator<TMethod, undefined>,
    ServerFnHandler<TMethod, undefined, undefined> {
  options: ServerFnBaseOptions<TMethod, unknown, undefined, undefined>
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
): ServerFnBuilder<TMethod> {
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

      if (!extractedFn.url) {
        console.warn(extractedFn)
        warning(
          false,
          `createServerFn must be called with a function that has a 'url' property. Ensure that the @tanstack/start-plugin is ordered **before** the @tanstack/server-functions-plugin.`,
        )
      }

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
            context: {},
          }).then((d) => {
            if (d.error) throw d.error
            return d.result
          })
        },
        {
          // This copies over the URL, function ID and filename
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: async (opts: any) => {
            const parsedOpts =
              opts instanceof FormData ? extractFormDataContext(opts) : opts

            const result = await executeMiddleware(
              resolvedMiddleware,
              'server',
              {
                ...extractedFn,
                ...parsedOpts,
              },
            ).then((d) => ({
              // Only send the result and sendContext back to the client
              result: d.result,
              error: d.error,
              context: d.sendContext,
            }))

            return result
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
    const context = startSerializer.parse(serializedContext)
    return {
      context,
      data: formData,
    }
  } catch {
    return {
      data: formData,
    }
  }
}

function flattenMiddlewares(
  middlewares: Array<AnyMiddleware>,
): Array<AnyMiddleware> {
  const seen = new Set<AnyMiddleware>()
  const flattened: Array<AnyMiddleware> = []

  const recurse = (middleware: Array<AnyMiddleware>) => {
    middleware.forEach((m) => {
      if (m.options.middleware) {
        recurse(m.options.middleware)
      }

      if (!seen.has(m)) {
        seen.add(m)
        flattened.push(m)
      }
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

export type MiddlewareResult = MiddlewareOptions & {
  result?: unknown
  error?: unknown
}

export type NextFn = (ctx: MiddlewareResult) => Promise<MiddlewareResult>

export type MiddlewareFn = (
  ctx: MiddlewareOptions & {
    next: NextFn
  },
) => Promise<MiddlewareResult>

const applyMiddleware = async (
  middlewareFn: MiddlewareFn,
  ctx: MiddlewareOptions,
  nextFn: NextFn,
) => {
  return middlewareFn({
    ...ctx,
    next: (async (userCtx: MiddlewareResult | undefined = {} as any) => {
      // Return the next middleware
      return nextFn({
        ...ctx,
        ...userCtx,
        context: {
          ...ctx.context,
          ...userCtx.context,
        },
        sendContext: {
          ...ctx.sendContext,
          ...(userCtx.sendContext ?? {}),
        },
        headers: mergeHeaders(ctx.headers, userCtx.headers),
        result:
          userCtx.result !== undefined ? userCtx.result : (ctx as any).result,
        error: userCtx.error ?? (ctx as any).error,
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
  const flattenedMiddlewares = flattenMiddlewares([
    ...globalMiddleware,
    ...middlewares,
  ])

  const next: NextFn = async (ctx) => {
    // Get the next middleware
    const nextMiddleware = flattenedMiddlewares.shift()

    // If there are no more middlewares, return the context
    if (!nextMiddleware) {
      return ctx
    }

    if (
      nextMiddleware.options.validator &&
      (env === 'client' ? nextMiddleware.options.validateClient : true)
    ) {
      // Execute the middleware's input function
      ctx.data = await execValidator(nextMiddleware.options.validator, ctx.data)
    }

    const middlewareFn = (
      env === 'client'
        ? nextMiddleware.options.client
        : nextMiddleware.options.server
    ) as MiddlewareFn | undefined

    if (middlewareFn) {
      // Execute the middleware
      return applyMiddleware(middlewareFn, ctx, async (newCtx) => {
        // If there is a clientAfter function and we are on the client
        const clientAfter = nextMiddleware.options.clientAfter as
          | MiddlewareFn
          | undefined

        if (env === 'client' && clientAfter) {
          // We need to await the next middleware and get the result
          const result = await next(newCtx)

          // Then we can execute the clientAfter function
          return applyMiddleware(
            clientAfter,
            {
              ...newCtx,
              ...result,
            },
            // Identity, because there "next" is just returning
            (d: any) => d,
          )
        }

        return next(newCtx).catch((error) => {
          if (isRedirect(error) || isNotFound(error)) {
            return {
              ...newCtx,
              error,
            }
          }

          throw error
        })
      })
    }

    return next(ctx)
  }

  // Start the middleware chain
  return next({
    ...opts,
    headers: opts.headers || {},
    sendContext: opts.sendContext || {},
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
        const serverCtx = await options.extractedFn?.({
          ...ctx,
          // switch the sendContext over to context
          context: sendContext,
        })

        return next(serverCtx) as unknown as MiddlewareClientFnResult<
          any,
          any,
          any
        >
      },
      server: async ({ next, ...ctx }) => {
        // Execute the server function
        const result = await options.serverFn?.(ctx)

        return next({
          ...ctx,
          result,
        } as any) as unknown as MiddlewareServerFnResult<any, any, any, any>
      },
    },
  }
}
