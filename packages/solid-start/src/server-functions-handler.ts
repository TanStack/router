import * as solidServerFunctions from '@solidjs/web/server-functions/server'
import {
  configureServerFunctionsServer,
  createNoJSHandler,
  handleServerFunctionRequest,
  parseServerFunctionUrl,
  serverFunctionUrl,
} from '@solidjs/web/server-functions/server'
import { redirect } from '@tanstack/solid-router'
import { provideRequestEvent } from '@solidjs/web/storage'
import {
  getStartContext,
  runWithStartContext,
} from '@tanstack/start-storage-context'
import { getSolidStartServerFunctionCodec } from './solid-rpc-codec'
import { SOLID_START_FLIGHT_SOURCE } from './solid-rpc-flight'
import { collectSolidStartFlightData } from './solid-rpc-flight-server'
import type {
  CollectFlightDataHook,
  HandleServerFunctionOptions,
} from '@solidjs/web/server-functions/server'
import type { StartStorageContext } from '@tanstack/start-storage-context'
import { getServerFnById } from '#tanstack-start-server-fn-resolver'

configureServerFunctionsServer({
  provideEvent: provideRequestEvent,
  endpoint: process.env.TSS_SERVER_FN_BASE,
})

// Named flight sources (Solid's multi-source single-flight protocol) ship
// in the @solidjs/web release after 2.0.0-rc.4. When present, the router's
// collector registers additively under its own source id — other caches'
// collectors (e.g. solid-query's "sq") fold their slices into the same
// mutation response, and a user-supplied `collectFlightData` hook keeps
// the unnamed slot to itself instead of displacing the router's data. On
// older versions the collector falls back to claiming the unnamed slot
// per-handler, exactly as before; the client half detects the same
// installed package, so the two halves cannot disagree.
const registerFlightDataSource = (
  solidServerFunctions as {
    registerFlightDataSource?: (
      source: string,
      hook: CollectFlightDataHook,
    ) => () => void
  }
).registerFlightDataSource
const hasNamedFlightSources = registerFlightDataSource !== undefined
if (registerFlightDataSource) {
  registerFlightDataSource(
    SOLID_START_FLIGHT_SOURCE,
    collectSolidStartFlightData,
  )
}

const solidNoJSHandler = createNoJSHandler()

export interface HandleSolidServerFunctionRequestOptions extends HandleServerFunctionOptions {
  startContext?: Partial<StartStorageContext>
}

export async function handleSolidServerFunctionRequest(
  request: Request,
  options: HandleSolidServerFunctionRequestOptions = {},
) {
  const serverFnId = getSolidServerFunctionId(request)

  if (!serverFnId) {
    throw new Error('Unable to resolve Solid server function id from request')
  }

  await getServerFnById(serverFnId, { origin: 'client' })

  const requestWithId = withSolidServerFunctionId(request, serverFnId)
  const { startContext, ...solidOptions } = options
  const transformResult = solidOptions.transformResult
  const handleNoJS = solidOptions.handleNoJS
  const collectFlightData = solidOptions.collectFlightData
  const existingStartContext = getStartContext({ throwIfNotFound: false })
  const handlerOptions: HandleServerFunctionOptions = {
    ...solidOptions,
    // With named sources the router's collector is registered globally
    // under SOLID_START_FLIGHT_SOURCE and the unnamed slot stays the
    // user's; without them, the legacy behavior: the router's collector
    // claims the unnamed slot unless the user overrides it.
    collectFlightData: hasNamedFlightSources
      ? collectFlightData
      : (collectFlightData ?? collectSolidStartFlightData),
    transformResult: async (event, result, context) => {
      const transformed = transformResult
        ? await transformResult(event, result, context)
        : result
      return adaptTanStackResult(transformed)
    },
    handleNoJS: async (result, currentRequest, args, thrown) => {
      if (handleNoJS) {
        return await handleNoJS(result, currentRequest, args, thrown)
      }
      return await handleSolidStartNoJS(result, currentRequest, args, thrown)
    },
  }
  const handleRequest = () =>
    handleServerFunctionRequest(requestWithId, {
      codec: getSolidStartServerFunctionCodec(),
      ...handlerOptions,
    })

  if (existingStartContext) {
    return await handleRequest()
  }

  return await runWithStartContext(
    {
      getRouter: unavailableRouter,
      request,
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
      ...startContext,
    },
    handleRequest,
  )
}

function getSolidServerFunctionId(request: Request) {
  const parsedId = parseServerFunctionUrl(request.url)
  if (parsedId) {
    return parsedId
  }

  const url = new URL(request.url)
  const queryId = url.searchParams.get('id')
  if (queryId) {
    return queryId
  }

  const serverFnBase = process.env.TSS_SERVER_FN_BASE
  if (serverFnBase && url.pathname.startsWith(serverFnBase)) {
    return url.pathname.slice(serverFnBase.length).split('/')[0]
  }

  return undefined
}

function withSolidServerFunctionId(request: Request, serverFnId: string) {
  // Solid resolves the function id from the request URL's pathname
  // (endpoint mount + id segment). Requests that carried the id some other
  // way (e.g. an `?id=` query) are rewritten onto that canonical shape.
  if (parseServerFunctionUrl(request.url) === serverFnId) {
    return request
  }

  const url = new URL(request.url)
  const canonicalUrl = new URL(serverFunctionUrl(serverFnId), url.origin)
  canonicalUrl.search = url.search
  return new Request(canonicalUrl, request)
}

function serializeTanStackRedirect(result: unknown) {
  if (!isObject(result) || !isTanStackRedirect(result.error)) {
    return result
  }

  const redirectResponse = result.error
  return {
    ...result,
    error: {
      ...redirectResponse.options,
      headers: Object.fromEntries(redirectResponse.headers),
      isSerializedRedirect: true,
    },
  }
}

function adaptTanStackResult(result: unknown) {
  const serialized = serializeTanStackRedirect(result)
  if (!isTanStackResultEnvelope(serialized)) {
    return serialized
  }

  return Object.fromEntries(
    Object.entries(serialized).filter(([, value]) => value !== undefined),
  )
}

async function handleSolidStartNoJS(
  result: unknown,
  request: Request,
  args: Array<unknown>,
  thrown?: boolean,
) {
  if (isObject(result) && isSerializedRedirect(result.error)) {
    const startContext = getStartContext({ throwIfNotFound: false })
    if (startContext) {
      const router = await startContext.getRouter()
      return router.resolveRedirect(redirect(result.error as never))
    }
  }

  if (isObject(result)) {
    const unwrapped = result.result ?? result.error
    if (isResponseLike(unwrapped)) {
      return normalizeResponse(unwrapped)
    }
    if (typeof unwrapped === 'string') {
      return new Response(unwrapped)
    }
    if (unwrapped !== undefined) {
      return Response.json(unwrapped)
    }
  }

  return solidNoJSHandler(result, request, args, thrown)
}

function isTanStackRedirect(
  value: unknown,
): value is Response & { options: Record<string, unknown> } {
  return isResponseLike(value) && isObject(value.options)
}

function isTanStackResultEnvelope(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isObject(value) &&
    ('result' in value || 'error' in value || 'context' in value)
  )
}

interface ResponseLike {
  body: ReadableStream<Uint8Array> | null
  headers: Headers
  options?: unknown
  status: number
  statusText: string
}

function isResponseLike(value: unknown): value is ResponseLike {
  return (
    isObject(value) &&
    typeof value.status === 'number' &&
    isObject(value.headers) &&
    typeof value.headers.forEach === 'function' &&
    ('body' in value || typeof value.text === 'function')
  )
}

function normalizeResponse(response: ResponseLike) {
  if (response instanceof Response) {
    return response
  }

  return new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function isSerializedRedirect(value: unknown) {
  return isObject(value) && value.isSerializedRedirect === true
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object'
}

function unavailableRouter(): never {
  throw new Error(
    'Router context is not available in handleSolidServerFunctionRequest. Use it inside createStartHandler or pass startContext.getRouter.',
  )
}
