import { provideRequestEvent } from '@solidjs/web/storage'
import {
  createNullProtoObject,
  flattenMiddlewares,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import { createStartHandler } from '@tanstack/solid-start-server'
import { createMemoryHistory } from '@tanstack/solid-router'
import {
  createServerEntry,
  handleStartError,
} from '@tanstack/start-server-core/request-response'
import { handleSolidServerFunctionRequest } from './server-functions-handler'
import type { RequestHandler } from '@tanstack/solid-start-server'
import type { AnyRouter, Register } from '@tanstack/solid-router'
import type {
  AnyRequestMiddleware,
  AnyStartInstanceOptions,
} from '@tanstack/start-client-core'

type RequestMiddlewareResult = {
  request: Request
  pathname: string
  context: Record<string, unknown>
  response: Response
}

export function createSolidStartHandler<TRegister = Register>(
  cbOrOptions: Parameters<typeof createStartHandler>[0],
): RequestHandler<TRegister> {
  const startHandler = createStartHandler<TRegister>(cbOrOptions)
  const handleServerFn = async (
    request: Request,
    requestOptions?: { context?: object },
  ) => {
    const getRouter = createRequestRouterGetter(request)
    const startOptions = await getRequestStartOptions(getRouter)
    const requestMiddlewares = flattenMiddlewares(
      (startOptions.requestMiddleware ?? []) as Array<AnyRequestMiddleware>,
    )
    const response = await executeRequestMiddleware(
      request,
      requestMiddlewares,
      requestOptions?.context,
      async (context) => {
        return await handleSolidServerFunctionRequest(request, {
          startContext: {
            contextAfterGlobalMiddlewares: context,
            executedRequestMiddlewares: new Set(requestMiddlewares),
            getRouter,
            request,
            startOptions,
          },
        })
      },
    )
    // The only published API that applies response helper writes to a Response.
    return handleStartError(response)
  }

  const solidServerFnHandler = async (
    request: Request,
    requestOptions?: { context?: object },
  ) => {
    let failure: { error: unknown } | undefined
    const response = await createServerEntry<TRegister>({
      fetch: (async (scopedRequest: Request) => {
        try {
          return await handleServerFn(scopedRequest, requestOptions)
        } catch (error) {
          // createServerEntry would answer here; the caller's entry handles it.
          failure = { error }
          return new Response(null)
        }
      }) as RequestHandler<TRegister>,
    }).fetch(request, requestOptions as never)
    if (failure) {
      throw failure.error
    }
    return response
  }

  return (async (request: Request, requestOptions?: unknown) => {
    return await provideRequestEvent({ request, locals: {} }, async () => {
      const serverFnBase = process.env.TSS_SERVER_FN_BASE
      const url = new URL(request.url)

      if (serverFnBase && url.pathname.startsWith(serverFnBase)) {
        return await solidServerFnHandler(request, requestOptions as never)
      }

      return await (startHandler as any)(request, requestOptions)
    })
  }) as RequestHandler<TRegister>
}

async function executeRequestMiddleware(
  request: Request,
  middlewares: Array<AnyRequestMiddleware>,
  initialContext: object | undefined,
  handler: (context: Record<string, unknown>) => Promise<Response>,
) {
  const pathname = new URL(request.url).pathname

  const dispatch = async (
    index: number,
    context: Record<string, unknown>,
  ): Promise<RequestMiddlewareResult> => {
    request.signal.throwIfAborted()
    const middleware = middlewares[index]?.options.server

    if (!middleware) {
      if (index < middlewares.length) {
        return await dispatch(index + 1, context)
      }

      return {
        request,
        pathname,
        context,
        response: await handler(context),
      }
    }

    let nextCalled = false
    const next = async (options?: { context?: Record<string, unknown> }) => {
      if (nextCalled) {
        throw new Error('Request middleware called next() more than once')
      }
      nextCalled = true
      return await dispatch(
        index + 1,
        safeObjectMerge(context, options?.context),
      )
    }

    try {
      const result = await middleware({
        request,
        pathname,
        handlerType: 'serverFn',
        context,
        next,
      } as never)

      if (result instanceof Response) {
        return { request, pathname, context, response: result }
      }

      return result as RequestMiddlewareResult
    } catch (error) {
      if (error instanceof Response) {
        return { request, pathname, context, response: error }
      }
      throw error
    }
  }

  const context = createNullProtoObject(initialContext) as Record<
    string,
    unknown
  >
  return (await dispatch(0, context)).response
}

async function getRequestStartOptions(
  getRouter: () => Promise<AnyRouter>,
): Promise<AnyStartInstanceOptions> {
  const [startEntry, pluginAdapters, router] = await Promise.all([
    import('#tanstack-start-entry'),
    import('#tanstack-start-plugin-adapters'),
    getRouter(),
  ])
  const startOptions =
    (await startEntry.startInstance?.getOptions()) ??
    ({} as AnyStartInstanceOptions)

  return {
    ...startOptions,
    serializationAdapters: [
      ...(startOptions.serializationAdapters ?? []),
      ...(pluginAdapters.hasPluginAdapters
        ? pluginAdapters.pluginSerializationAdapters
        : []),
      ...(router.options.serializationAdapters ?? []),
    ],
  }
}

function createRequestRouterGetter(request: Request) {
  let routerPromise: Promise<AnyRouter> | undefined

  return async () => {
    routerPromise ??= import('#tanstack-router-entry').then(
      async ({ getRouter }) => {
        const router = await getRouter()
        const url = new URL(request.url)
        router.update({
          history: createMemoryHistory({
            initialEntries: [url.pathname + url.search + url.hash],
          }),
          origin: url.origin,
        })
        return router
      },
    )
    return await routerPromise
  }
}
