import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { createMiddleware } from '@tanstack/start-client-core'
import { BaseRootRoute, BaseRoute, RouterCore } from '@tanstack/router-core'
import { splitSetCookieString } from 'cookie-es'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  createSsrStreamResponse,
} from '@tanstack/router-core/ssr/server'
import { createStartHandler } from '../src/createStartHandler'
import {
  clearResponseHeaders,
  getCookie,
  getCookies,
  getRequestHost,
  getRequestIP,
  getRequestProtocol,
  getRequestUrl,
  getResponse,
  getResponseHeader,
  getResponseHeaders,
  handleStartError,
  protectResponseHeaders,
  reconcileResponse,
  requestHandler,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  updateSession,
  useSession,
} from '../src/internal-request-response'
import {
  getStaticHandlerInlineCssDefault,
  resolveInlineCssForRequest,
} from '../src/inlineCss'

const startMocks = vi.hoisted(() => {
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    previousServerFnBase,
    requestMiddleware: [] as Array<any>,
    serverFnResult: undefined as undefined | Response | object,
    serverFnCalls: [] as Array<{ context?: unknown }>,
    router: undefined as undefined | ReturnType<typeof makeRouter>,
  }
})

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: startMocks.requestMiddleware,
      serializationAdapters: [],
    }),
  },
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => startMocks.router,
}))

vi.mock('../src/server-functions-handler', () => ({
  createServerFnErrorResponse: () => {
    return new Response(JSON.stringify({ message: 'middleware failed' }), {
      status: 500,
      headers: {
        'content-type': 'application/json',
        'x-tss-serialized': 'true',
      },
    })
  },
  handleServerAction: (opts: { context?: unknown }) => {
    startMocks.serverFnCalls.push({
      context: opts.context,
    })
    return startMocks.serverFnResult
  },
}))

const getStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn: () => void) => fn(),
})

function makeRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: rootRoute.addChildren([indexRoute]),
    },
    getStoreConfig,
  )
  router.isServer = true
  return router
}

function makeStreamResponse(router: ReturnType<typeof makeRouter>) {
  attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('stream'))
    },
    cancel() {
      router.serverSsr?.cleanup()
    },
  })
  return createSsrStreamResponse(router as any, new Response(stream))
}

function getSetCookieValues(headers: Headers): Array<string> {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => Array<string>
  }
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie()
  }
  const value = headers.get('set-cookie')
  if (value) {
    return splitSetCookieString(value)
  }
  return []
}

async function handleThrownStartError(
  fn: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    await fn()
  } catch (error) {
    return handleStartError(error)
  }

  throw new Error('Expected request handler to throw')
}

function expectSetCookie(
  cookies: Array<string>,
  name: string,
  value: string,
): void {
  expect(
    cookies.filter((cookie) => cookie.startsWith(`${name}=${value};`)),
  ).toHaveLength(1)
}

afterEach(() => {
  startMocks.requestMiddleware = []
  startMocks.serverFnResult = undefined
  startMocks.serverFnCalls = []
  startMocks.router = undefined
  vi.unstubAllEnvs()
})

afterAll(() => {
  if (startMocks.previousServerFnBase === undefined) {
    delete (process.env as Partial<NodeJS.ProcessEnv>).TSS_SERVER_FN_BASE
  } else {
    process.env.TSS_SERVER_FN_BASE = startMocks.previousServerFnBase
  }
})

describe('requestHandler response reconciliation', () => {
  it('preserves returned response cookies when getSetCookie is unavailable', async () => {
    const handler = requestHandler(() => {
      setCookie('helper', '1', { path: '/' })
      const headers = new Headers()
      headers.append('set-cookie', 'returned-one=1; Path=/')
      headers.append('set-cookie', 'returned-two=2; Path=/')
      const response = new Response('ok', { headers })
      const responseHeaders = response.headers as unknown as {
        getSetCookie?: unknown
      }
      responseHeaders.getSetCookie = undefined
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})
    const cookies = getSetCookieValues(response.headers)

    expectSetCookie(cookies, 'returned-one', '1')
    expectSetCookie(cookies, 'returned-two', '2')
    expectSetCookie(cookies, 'helper', '1')
  })

  it('does not dedupe absent-path cookies against explicit-path cookies', async () => {
    const handler = requestHandler(() => {
      setCookie('same', 'helper', { path: '/' })
      return new Response('ok', {
        headers: { 'set-cookie': 'same=returned' },
      })
    })

    const response = await handler(new Request('http://localhost/nested'), {})
    const cookies = getSetCookieValues(response.headers)

    expect(cookies.filter((cookie) => cookie.startsWith('same='))).toEqual([
      'same=returned',
      'same=helper; Path=/',
    ])
  })

  it('merges session cookies with helper cookies', async () => {
    const handler = requestHandler(async () => {
      setCookie('helper', '1', { path: '/' })
      const session = await useSession({ password: 'x'.repeat(32) })
      await session.update({ user: 'tanner' })
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})
    const cookies = getSetCookieValues(response.headers)

    expectSetCookie(cookies, 'helper', '1')
    expect(cookies.some((cookie) => cookie.startsWith('start='))).toBe(true)
  })

  it('serializes concurrent session updates through one response bridge', async () => {
    const handler = requestHandler(async () => {
      const password = 'x'.repeat(32)
      const first = updateSession<{ count: number }>({ password }, (data) => ({
        count: (data.count ?? 0) + 1,
      }))
      const second = updateSession<{ count: number }>({ password }, (data) => ({
        count: (data.count ?? 0) + 1,
      }))
      const [, secondSession] = await Promise.all([first, second])

      expect(secondSession.data.count).toBe(2)
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})
    const cookies = getSetCookieValues(response.headers)

    expect(cookies.some((cookie) => cookie.startsWith('start='))).toBe(true)
  })

  it('releases queued session operations after update failures', async () => {
    const handler = requestHandler(async () => {
      const password = 'x'.repeat(32)
      const failed = updateSession({ password }, () => {
        throw new Error('session failed')
      }).catch((error) => error)
      const next = updateSession<{ ok: boolean }>(
        { name: 'next', password },
        { ok: true },
      )
      const [error, nextSession] = await Promise.all([failed, next])

      expect(error).toBeInstanceOf(Error)
      expect(nextSession.data.ok).toBe(true)
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})
    const cookies = getSetCookieValues(response.headers)

    expect(cookies.some((cookie) => cookie.startsWith('next='))).toBe(true)
  })

  it('restores protected headers after direct response mutation', async () => {
    const handler = requestHandler(() => {
      const response = new Response('ok', {
        headers: {
          'content-type': 'application/json',
          'x-tss-serialized': 'true',
        },
      })
      protectResponseHeaders(response, ['content-type', 'x-tss-serialized'])
      response.headers.set('content-type', 'text/plain')
      response.headers.set('x-tss-serialized', 'false')
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
  })

  it('merges repeated protected header snapshots', async () => {
    const handler = requestHandler(() => {
      const response = new Response('ok', {
        headers: {
          'content-type': 'application/json',
          'x-tss-raw': 'true',
        },
      })
      protectResponseHeaders(response, ['content-type'])
      protectResponseHeaders(response, ['x-tss-raw'])
      response.headers.set('content-type', 'text/plain')
      response.headers.set('x-tss-raw', 'false')
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-raw')).toBe('true')
  })

  it('rejects protecting Set-Cookie snapshots', () => {
    expect(() => {
      protectResponseHeaders(new Response('ok'), ['set-cookie'])
    }).toThrow('Set-Cookie headers cannot be protected.')
  })

  it('reads protected header snapshots after direct response mutation', async () => {
    let seenHeader: string | undefined
    let seenHeadersHeader: string | null | undefined
    const handler = requestHandler(() => {
      const response = new Response('ok', {
        headers: { 'x-transport': 'original' },
      })
      protectResponseHeaders(response, ['x-transport'])
      const reconciled = reconcileResponse(response)
      reconciled.headers.set('x-transport', 'mutated')
      seenHeader = getResponseHeader('x-transport')
      seenHeadersHeader = getResponseHeaders().get('x-transport')
      return reconciled
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(seenHeader).toBe('original')
    expect(seenHeadersHeader).toBe('original')
    expect(response.headers.get('x-transport')).toBe('original')
  })

  it('returns getResponseHeaders as a read-only snapshot after reconciliation', async () => {
    const handler = requestHandler(() => {
      const response = reconcileResponse(
        new Response('ok', {
          headers: {
            'x-keep': 'yes',
            'x-remove': 'remove-me',
          },
        }),
      )
      const headers = getResponseHeaders()
      expect(headers.get('x-remove')).toBe('remove-me')
      headers.set('x-added', 'yes')
      headers.delete('x-remove')
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('x-keep')).toBe('yes')
    expect(response.headers.get('x-added')).toBe(null)
    expect(response.headers.get('x-remove')).toBe('remove-me')
  })

  it('preserves empty string response header values', async () => {
    let seenHeader: string | undefined
    const handler = requestHandler(() => {
      setResponseHeader('x-empty', '')
      seenHeader = getResponseHeader('x-empty')
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(seenHeader).toBe('')
    expect(response.headers.get('x-empty')).toBe('')
  })

  it('keeps helper headers set after clearing response headers', async () => {
    const handler = requestHandler(() => {
      clearResponseHeaders()
      setResponseHeader('x-after-clear', 'yes')
      return new Response('ok', {
        headers: {
          'x-returned': 'removed',
        },
      })
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('x-returned')).toBe(null)
    expect(response.headers.get('x-after-clear')).toBe('yes')
  })

  it('replaces Set-Cookie arrays and keeps later semantic cookie updates', async () => {
    const handler = requestHandler(() => {
      setResponseHeader('set-cookie', ['array=1; Path=/', 'same=first; Path=/'])
      setCookie('same', 'second', { path: '/' })
      return new Response('ok', {
        headers: {
          'set-cookie': 'returned=1; Path=/',
        },
      })
    })

    const response = await handler(new Request('http://localhost/'), {})
    const cookies = getSetCookieValues(response.headers)

    expect(cookies).toEqual(['array=1; Path=/', 'same=second; Path=/'])
  })

  it('returns the same response after repeated clean reconciliation', async () => {
    let firstResponse: Response | undefined
    let secondResponse: Response | undefined
    const handler = requestHandler(() => {
      const response = new Response('ok')
      firstResponse = reconcileResponse(response)
      secondResponse = reconcileResponse(firstResponse)
      return secondResponse
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(secondResponse).toBe(firstResponse)
    expect(response).toBe(firstResponse)
  })

  it('applies helper mutations after the same response was reconciled', async () => {
    let reconciledResponse: Response | undefined
    const handler = requestHandler(() => {
      const response = new Response('ok')
      reconciledResponse = reconcileResponse(response)
      setResponseHeader('x-late-helper', 'true')
      return reconciledResponse
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response).toBe(reconciledResponse)
    expect(response.headers.get('x-late-helper')).toBe('true')
  })

  it('reapplies helper headers after direct mutation of a reconciled response', async () => {
    const handler = requestHandler(() => {
      setResponseHeader('x-helper', 'true')
      const response = reconcileResponse(new Response('ok'))
      response.headers.delete('x-helper')
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('x-helper')).toBe('true')
  })

  it('applies earlier helper state to later replacement responses', async () => {
    let firstResponse: Response | undefined
    const handler = requestHandler(() => {
      setResponseHeader('x-helper', 'true')
      firstResponse = reconcileResponse(new Response('first'))
      return new Response('second')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response).not.toBe(firstResponse)
    expect(response.headers.get('x-helper')).toBe('true')
    await expect(response.text()).resolves.toBe('second')
  })

  it('checks protected headers after the same response was reconciled', async () => {
    let firstResponse: Response | undefined
    let secondResponse: Response | undefined
    const handler = requestHandler(() => {
      const response = new Response('ok', {
        headers: { 'x-transport': 'original' },
      })
      protectResponseHeaders(response, ['x-transport'])
      firstResponse = reconcileResponse(response)
      firstResponse.headers.set('x-transport', 'mutated')
      secondResponse = reconcileResponse(firstResponse)
      return secondResponse
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(secondResponse).toBe(firstResponse)
    expect(response.headers.get('x-transport')).toBe('original')
  })

  it('tracks direct Start response status assignment', async () => {
    const handler = requestHandler(() => {
      const response = getResponse()
      response.status = 201
      response.statusText = 'Created'
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
  })

  it('sanitizes direct response statusText assignment', async () => {
    const handler = requestHandler(() => {
      const response = getResponse()
      response.status = 418
      response.statusText = 'Bad\nTeapot'
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(418)
    expect(response.statusText).toBe('BadTeapot')
  })

  it('returns 400 for malformed URLs that throw TypeError', async () => {
    const handler = requestHandler(() => new Response('unused'))
    const response = await handler({ url: 'http://%' } as Request, {})

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Bad Request')
  })

  it('parses request helpers from forwarded headers and cookies', async () => {
    const handler = requestHandler(() => {
      return Response.json({
        host: getRequestHost(),
        forwardedHost: getRequestHost({ xForwardedHost: true }),
        protocol: getRequestProtocol(),
        originalProtocol: getRequestProtocol({ xForwardedProto: false }),
        url: getRequestUrl({ xForwardedHost: true }).toString(),
        ip: getRequestIP() ?? null,
        forwardedIp: getRequestIP({ xForwardedFor: true }),
        cookies: getCookies(),
        encodedCookie: getCookie('encoded'),
      })
    })

    const response = await handler(
      new Request('http://internal.local:3000/path?x=1', {
        headers: {
          cookie: 'plain=value; encoded=hello%20world',
          host: 'origin.example:8080',
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
          'x-forwarded-host': 'public.example, proxy.example',
          'x-forwarded-proto': 'https, http',
        },
      }),
      {},
    )

    await expect(response.json()).resolves.toEqual({
      host: 'origin.example:8080',
      forwardedHost: 'public.example',
      protocol: 'https',
      originalProtocol: 'http',
      url: 'https://public.example/path?x=1',
      ip: null,
      forwardedIp: '203.0.113.10',
      cookies: {
        plain: 'value',
        encoded: 'hello world',
      },
      encodedCookie: 'hello world',
    })
  })

  it('preserves HTTP-style error status, statusText, and headers', async () => {
    const handler = requestHandler(() => {
      const error = new Error('handled') as Error & {
        status: number
        statusText: string
        headers: HeadersInit
      }
      error.status = 418
      error.statusText = 'Teapot'
      error.headers = { 'x-error': 'handled' }
      throw error
    })

    const response = await handleThrownStartError(() =>
      handler(new Request('http://localhost/'), {}),
    )

    expect(response.status).toBe(418)
    expect(response.statusText).toBe('Teapot')
    expect(response.headers.get('x-error')).toBe('handled')
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('converts errors through handleStartError', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = requestHandler(() => {
      throw new Error('handled by default')
    })

    try {
      const response = await handleThrownStartError(() =>
        handler(new Request('http://localhost/'), {}),
      )

      expect(response.status).toBe(500)
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('preserves HTTP-style error headers from cause', async () => {
    const handler = requestHandler(() => {
      throw new Error('wrapped', {
        cause: {
          status: 409,
          headers: { 'x-error-cause': 'handled' },
        },
      })
    })

    const response = await handleThrownStartError(() =>
      handler(new Request('http://localhost/'), {}),
    )

    expect(response.status).toBe(409)
    expect(response.headers.get('x-error-cause')).toBe('handled')
  })

  it('keeps helper status over HTTP-style error status', async () => {
    const handler = requestHandler(() => {
      setResponseStatus(401, 'Unauthorized')
      const error = new Error('handled') as Error & { status: number }
      error.status = 418
      throw error
    })

    const response = await handleThrownStartError(() =>
      handler(new Request('http://localhost/'), {}),
    )

    expect(response.status).toBe(401)
    expect(response.statusText).toBe('Unauthorized')
  })

  it('rethrows primitive errors', async () => {
    const handler = requestHandler(() => {
      return Promise.reject('primitive failure')
    })

    await expect(handler(new Request('http://localhost/'), {})).rejects.toBe(
      'primitive failure',
    )
  })

  it('recovers Start error state outside the active event', async () => {
    const error = Object.assign(new Error('outside'), {
      status: 409,
      headers: { 'x-error': 'yes' },
    })
    const handler = requestHandler(() => {
      setResponseHeader('x-helper', 'yes')
      throw error
    })

    let caught: unknown
    try {
      await handler(new Request('http://localhost/'), {})
    } catch (error) {
      caught = error
    }

    const response = handleStartError(caught)

    expect(response.status).toBe(409)
    expect(response.headers.get('x-error')).toBe('yes')
    expect(response.headers.get('x-helper')).toBe('yes')
  })

  it('returns response errors verbatim outside the active event', () => {
    const response = new Response('handled', { status: 418 })

    expect(handleStartError(response)).toBe(response)
  })

  it('returns a generic response for primitive errors outside the active event', () => {
    const response = handleStartError('primitive failure')

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('cancels returned response bodies when reconciliation drops them', async () => {
    let cancelledReason: unknown
    let resolveCancel!: () => void
    const cancelled = new Promise<void>((resolve) => {
      resolveCancel = resolve
    })
    const handler = requestHandler(() => {
      setResponseStatus(204)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
          },
          cancel(reason) {
            cancelledReason = reason
            resolveCancel()
          },
        }),
      )
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(204)
    expect(response.body).toBe(null)
    await expect(cancelled).resolves.toBeUndefined()
    expect(cancelledReason).toBe(
      'Response body dropped by Start reconciliation',
    )
  })

  it('falls back from informational statuses that Fetch responses cannot use', async () => {
    const handler = requestHandler(() => {
      setResponseStatus(101)
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(200)
  })

  it('sanitizes direct response status assignment', async () => {
    const handler = requestHandler(() => {
      const response = getResponse()
      response.status = 418
      response.status = 700
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(418)
  })
})

describe('createStartHandler SSR cleanup ownership', () => {
  it('preserves serverFn stream cleanup ownership through early return', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes stream response replaced by middleware result', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('exposes Response to middleware while preserving stream ownership', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const seenHeaders = [] as Array<Headers | undefined>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        seenHeaders.push(result.response.headers)
        result.response.headers.set('x-test', 'true')
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(seenHeaders).toEqual([ssrResponse.response.headers])
    expect(response.headers.get('x-test')).toBe('true')
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves stream ownership through return next', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => {
        return next()
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(ssrResponse.response)
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('does not duplicate helper cookies across repeated reconciliation', async () => {
    startMocks.serverFnResult = new Response('ok')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        setCookie('first', '1', { path: '/' })
        const result = await next()
        setCookie('second', '2', { path: '/' })
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )
    const cookies = getSetCookieValues(response.headers)

    expect(
      cookies.filter((cookie) => cookie.startsWith('first=1;')),
    ).toHaveLength(1)
    expect(
      cookies.filter((cookie) => cookie.startsWith('second=2;')),
    ).toHaveLength(1)
  })

  it('preserves stream ownership when middleware wraps same body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let wrappedResponse: Response | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        wrappedResponse = new Response(result.response.body, result.response)
        wrappedResponse.headers.set('x-wrapped', 'true')
        return wrappedResponse
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(wrappedResponse)
    expect(response).not.toBe(ssrResponse.response)
    expect(response.headers.get('x-wrapped')).toBe('true')
    expect(dispose).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeDefined()

    await response.body!.cancel('done')
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes stream response when later reconciliation drops the body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        setResponseStatus(204)
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(204)
    expect(response.body).toBe(null)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('converts middleware errors by default', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        throw new Error('middleware failed')
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('x-tss-serialized')).toBe('true')
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('passes request middleware context to server functions', async () => {
    startMocks.serverFnResult = new Response('ok')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => {
        return next({ context: { middleware: 'yes' } })
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(startMocks.serverFnCalls).toHaveLength(1)
    expect(startMocks.serverFnCalls[0]?.context).toMatchObject({
      middleware: 'yes',
    })
  })

  it('disposes stream response replaced by thrown response', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('handled', { status: 418 })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        throw replacement
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('honors in-place response assignment on returned context', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response = replacement
        return result
      }),
    ]

    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })
})

describe('createStartHandler inlineCss option', () => {
  const request = new Request('https://example.com/')

  it('defaults to true', async () => {
    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss: undefined,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(true)
  })

  it('uses the handler-level boolean default', async () => {
    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss: false,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(false)
  })

  it('uses the handler-level callback default', async () => {
    const handlerInlineCss = vi.fn(({ request: req }) => {
      return req.headers.get('x-inline-css') !== 'false'
    })
    const callbackRequest = new Request('https://example.com/', {
      headers: { 'x-inline-css': 'false' },
    })

    await expect(
      resolveInlineCssForRequest({
        request: callbackRequest,
        handlerInlineCss,
        requestInlineCss: undefined,
      }),
    ).resolves.toBe(false)
    expect(handlerInlineCss).toHaveBeenCalledWith({ request: callbackRequest })
  })

  it('lets request options override handler-level options', async () => {
    const handlerInlineCss = vi.fn(() => false)

    await expect(
      resolveInlineCssForRequest({
        request,
        handlerInlineCss,
        requestInlineCss: true,
      }),
    ).resolves.toBe(true)

    expect(handlerInlineCss).not.toHaveBeenCalled()
  })

  it('returns a static inline CSS default only for non-callback options', () => {
    expect(getStaticHandlerInlineCssDefault(undefined)).toBe(true)
    expect(getStaticHandlerInlineCssDefault(true)).toBe(true)
    expect(getStaticHandlerInlineCssDefault(false)).toBe(false)
    expect(getStaticHandlerInlineCssDefault(() => true)).toBe(undefined)
  })
})
