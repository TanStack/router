import { provideRequestEvent } from '@solidjs/web/storage'
import { createStartHandler } from '@tanstack/solid-start-server'
import { createMemoryHistory } from '@tanstack/solid-router'
import {
  getResponse,
  requestHandler,
} from '@tanstack/start-server-core/request-response'
import { handleSolidServerFunctionRequest } from './server-functions-handler'
import type { RequestHandler } from '@tanstack/solid-start-server'
import type { AnyRouter, Register } from '@tanstack/solid-router'
import type { AnyStartInstanceOptions } from '@tanstack/start-client-core'

export function createSolidStartHandler<TRegister = Register>(
  cbOrOptions: Parameters<typeof createStartHandler>[0],
): RequestHandler<TRegister> {
  const startHandler = createStartHandler<TRegister>(cbOrOptions)
  const solidServerFnHandler = requestHandler(
    async (request, requestOptions) => {
      const getRouter = createRequestRouterGetter(request)
      const startOptions = await getRequestStartOptions(getRouter)
      const response = await handleSolidServerFunctionRequest(request, {
        startContext: {
          contextAfterGlobalMiddlewares: requestOptions?.context ?? {},
          getRouter,
          request,
          startOptions,
        },
      })
      const startResponse = getResponse()
      const status = startResponse.status || 200
      const statusText = startResponse.statusText || ''

      if (
        response.status !== 200 ||
        (response.status === status && response.statusText === statusText)
      ) {
        return response
      }

      return new Response(response.body, {
        headers: response.headers,
        status,
        statusText,
      })
    },
  )

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
