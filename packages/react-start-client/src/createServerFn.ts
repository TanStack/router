import { isNotFound, isRedirect } from '@tanstack/react-router'
import {
  applyMiddleware,
  execValidator,
  extractFormDataContext,
  flattenMiddlewares,
  globalMiddleware,
  serverFnBaseToMiddleware,
  serverFnStaticCache,
} from '@tanstack/start-client-core'
import invariant from 'tiny-invariant'
import type {
  AnyMiddleware,
  CompiledFetcherFn,
  CompiledFetcherFnOptions,
  Method,
  MiddlewareFn,
  NextFn,
  ServerFn,
  ServerFnBaseOptions,
  ServerFnBuilder,
  ServerFnMiddlewareOptions,
  ServerFnMiddlewareResult,
  ServerFnResponseType,
  ServerFnType,
  StaticCachedResult,
} from '@tanstack/start-client-core'

export function createServerFn<
  TMethod extends Method,
  TServerFnResponseType extends ServerFnResponseType = 'data',
  TResponse = unknown,
  TMiddlewares = undefined,
  TValidator = undefined,
>(
  options?: {
    method?: TMethod
    response?: TServerFnResponseType
    type?: ServerFnType
  },
  __opts?: ServerFnBaseOptions<
    TMethod,
    TServerFnResponseType,
    TResponse,
    TMiddlewares,
    TValidator
  >,
): ServerFnBuilder<TMethod, TServerFnResponseType> {
  const resolvedOptions = (__opts || options || {}) as ServerFnBaseOptions<
    TMethod,
    ServerFnResponseType,
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
      return createServerFn<
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, Object.assign(resolvedOptions, { middleware })) as any
    },
    validator: (validator) => {
      return createServerFn<
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, Object.assign(resolvedOptions, { validator })) as any
    },
    type: (type) => {
      return createServerFn<
        TMethod,
        ServerFnResponseType,
        TResponse,
        TMiddlewares,
        TValidator
      >(undefined, Object.assign(resolvedOptions, { type })) as any
    },
    handler: (...args) => {
      // This function signature changes due to AST transformations
      // in the babel plugin. We need to cast it to the correct
      // function signature post-transformation
      const [extractedFn, serverFn] = args as unknown as [
        CompiledFetcherFn<TResponse, TServerFnResponseType>,
        ServerFn<
          TMethod,
          TServerFnResponseType,
          TMiddlewares,
          TValidator,
          TResponse
        >,
      ]

      // Keep the original function around so we can use it
      // in the server environment
      Object.assign(resolvedOptions, {
        ...extractedFn,
        extractedFn,
        serverFn,
      })

      const resolvedMiddleware = [
        ...(resolvedOptions.middleware || []),
        serverFnBaseToMiddleware(resolvedOptions),
      ]

      // We want to make sure the new function has the same
      // properties as the original function
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      return Object.assign(
        async (opts?: CompiledFetcherFnOptions) => {
          // Start by executing the client-side middleware chain
          return executeMiddleware(resolvedMiddleware, 'client', {
            ...extractedFn,
            ...resolvedOptions,
            data: opts?.data as any,
            headers: opts?.headers,
            signal: opts?.signal,
            context: {},
          }).then((d) => {
            if (resolvedOptions.response === 'full') {
              return d
            }
            if (d.error) throw d.error
            return d.result
          })
        },
        {
          // This copies over the URL, function ID
          ...extractedFn,
          // The extracted function on the server-side calls
          // this function
          __executeServer: async (opts_: any, signal: AbortSignal) => {
            const opts =
              opts_ instanceof FormData ? extractFormDataContext(opts_) : opts_

            opts.type =
              typeof resolvedOptions.type === 'function'
                ? resolvedOptions.type(opts)
                : resolvedOptions.type

            const ctx = {
              ...extractedFn,
              ...opts,
              signal,
            }

            const run = () =>
              executeMiddleware(resolvedMiddleware, 'server', ctx).then(
                (d) => ({
                  // Only send the result and sendContext back to the client
                  result: d.result,
                  error: d.error,
                  context: d.sendContext,
                }),
              )

            if (ctx.type === 'static') {
              let response: StaticCachedResult | undefined

              // If we can get the cached item, try to get it
              if (serverFnStaticCache?.getItem) {
                // If this throws, it's okay to let it bubble up
                response = await serverFnStaticCache.getItem(ctx)
              }

              if (!response) {
                // If there's no cached item, execute the server function
                response = await run()
                  .then((d) => {
                    return {
                      ctx: d,
                      error: null,
                    }
                  })
                  .catch((e) => {
                    return {
                      ctx: undefined,
                      error: e,
                    }
                  })

                if (serverFnStaticCache?.setItem) {
                  await serverFnStaticCache.setItem(ctx, response)
                }
              }

              invariant(
                response,
                'No response from both server and static cache!',
              )

              if (response.error) {
                throw response.error
              }

              return response.ctx
            }

            return run()
          },
        },
      ) as any
    },
  }
}

async function executeMiddleware(
  middlewares: Array<AnyMiddleware>,
  env: 'client' | 'server',
  opts: ServerFnMiddlewareOptions,
): Promise<ServerFnMiddlewareResult> {
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const middlewareFn = (
      env === 'client'
        ? nextMiddleware.options.client
        : nextMiddleware.options.server
    ) as MiddlewareFn | undefined

    if (middlewareFn) {
      // Execute the middleware
      return applyMiddleware(middlewareFn, ctx, async (newCtx) => {
        return next(newCtx).catch((error: any) => {
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
