// @vitest-environment node

import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { splitSetCookieString } from 'cookie-es'
import {
  createMiddleware,
  getRouterInstance,
} from '@tanstack/start-client-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  redirect,
} from '@tanstack/router-core'
import {
  attachRouterServerSsrUtils,
  createSsrStreamResponse,
  transformReadableStreamWithRouter,
} from '@tanstack/router-core/ssr/server'
import {
  createStartHandler,
  transferResponseBodyOwnership,
} from '../src/createStartHandler'
import {
  appendResponseHeader,
  clearResponseHeaders,
  createServerEntry,
  getCookie,
  getCookies,
  getRequestHost,
  getRequestIP,
  getRequestProtocol,
  getRequestUrl,
  getResponseHeader,
  getResponseHeaders,
  getResponseStatus,
  handleStartError,
  protectResponseHeaders,
  reconcileResponse,
  setCookie,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from '../src/internal-request-response'
import {
  getStaticHandlerInlineCssDefault,
  resolveInlineCssForRequest,
} from '../src/inlineCss'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'
import type {
  HandlersFnOpts,
  RouteMethodHandlerFn,
} from '@tanstack/start-client-core'

type TestRouteHandlerFn<TContext = undefined> = RouteMethodHandlerFn<
  {},
  AnyRoute,
  '/',
  {},
  undefined,
  undefined,
  TContext
>

const startMocks = vi.hoisted(() => {
  const hadServerFnBase = Object.prototype.hasOwnProperty.call(
    process.env,
    'TSS_SERVER_FN_BASE',
  )
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    hadServerFnBase,
    previousServerFnBase,
    requestMiddleware: [] as Array<any>,
    serverFnResult: undefined as undefined | Response | object,
    serverFnHandler: undefined as
      | undefined
      | ((opts: { serverFnId: string }) => unknown),
    serverFnCalls: [] as Array<{ context?: unknown }>,
    router: undefined as undefined | AnyRouter,
    routerFactory: undefined as undefined | (() => AnyRouter),
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
  getRouter: () => startMocks.routerFactory?.() ?? startMocks.router,
}))

vi.mock('../src/server-functions-handler', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/server-functions-handler')>()
  return {
    ...actual,
    createServerFnErrorResponse: () => {
      return new Response(JSON.stringify({ message: 'middleware failed' }), {
        status: 500,
        headers: {
          'content-type': 'application/json',
          'x-tss-serialized': 'true',
        },
      })
    },
    handleServerAction: (opts: { context?: unknown; serverFnId: string }) => {
      startMocks.serverFnCalls.push({ context: opts.context })
      return startMocks.serverFnHandler
        ? startMocks.serverFnHandler(opts)
        : startMocks.serverFnResult
    },
  }
})

function createTestStartHandler(
  options: Parameters<typeof createStartHandler>[0],
) {
  return createServerEntry({ fetch: createStartHandler(options) }).fetch
}

function createResponseHandler(callback: () => Response | Promise<Response>) {
  startMocks.requestMiddleware = [createMiddleware().server(callback)]
  return createStartHandler(() => {
    throw new Error('Response middleware should prevent rendering')
  })
}

const getStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn: () => void) => fn(),
})

function makeRouter(routeOptions: Record<string, unknown> = {}) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
    ...routeOptions,
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

function makeRouterWithRouteWork(routeWork: {
  beforeLoad?: (ctx: { abortController: AbortController }) => unknown
  loader?: (ctx: { abortController: AbortController }) => unknown
}) {
  const rootRoute = new BaseRootRoute({})
  const workRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/work',
    component: () => null,
    ...routeWork,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      routeTree: rootRoute.addChildren([workRoute]),
    },
    getStoreConfig,
  )
  router.isServer = true
  return router
}

function waitForAbortOrRelease(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const release = () => {
      signal.removeEventListener('abort', release)
      resolve()
    }
    signal.addEventListener('abort', release, { once: true })
  })
}

function makeStreamResponse(
  router: ReturnType<typeof makeRouter>,
  onCancel?: (reason?: unknown) => void,
) {
  attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('stream'))
    },
    cancel(reason) {
      onCancel?.(reason)
      router.serverSsr?.cleanup()
    },
  })
  return createSsrStreamResponse(router as any, new Response(stream))
}

function makeCompletingStreamResponse(router: ReturnType<typeof makeRouter>) {
  attachRouterServerSsrUtils({ router: router as any, manifest: undefined })
  router.serverSsr!.disableHydration()
  const source = new NodeReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('stream'))
      controller.close()
    },
  })
  const stream = transformReadableStreamWithRouter(router as any, source)
  return createSsrStreamResponse(
    router as any,
    new Response(stream as unknown as BodyInit),
  )
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
  startMocks.serverFnHandler = undefined
  startMocks.serverFnCalls = []
  startMocks.router = undefined
  startMocks.routerFactory = undefined
  vi.unstubAllEnvs()
})

afterAll(() => {
  if (!startMocks.hadServerFnBase) {
    delete (process.env as Partial<NodeJS.ProcessEnv>).TSS_SERVER_FN_BASE
  } else {
    process.env.TSS_SERVER_FN_BASE = startMocks.previousServerFnBase
  }
})

describe('createStartHandler response reconciliation', () => {
  it('preserves returned response cookies when getSetCookie is unavailable', async () => {
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
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

  it('restores protected headers after direct response mutation', async () => {
    const handler = createResponseHandler(() => {
      const response = new Response('ok', {
        headers: {
          'content-type': 'application/json',
          'x-tss-serialized': 'true',
        },
      })
      protectResponseHeaders(
        response,
        new Map([
          ['content-type', 'application/json'],
          ['x-tss-serialized', 'true'],
        ]),
      )
      response.headers.set('content-type', 'text/plain')
      response.headers.set('x-tss-serialized', 'false')
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
  })

  it('merges repeated protected header snapshots', async () => {
    const handler = createResponseHandler(() => {
      const response = new Response('ok', {
        headers: {
          'content-type': 'application/json',
          'x-tss-raw': 'true',
        },
      })
      protectResponseHeaders(
        response,
        new Map([['content-type', 'application/json']]),
      )
      protectResponseHeaders(response, new Map([['x-tss-raw', 'true']]))
      response.headers.set('content-type', 'text/plain')
      response.headers.set('x-tss-raw', 'false')
      return response
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-raw')).toBe('true')
  })

  it('rejects protecting Set-Cookie snapshots', async () => {
    const handler = createResponseHandler(() => {
      const response = new Response('ok')
      protectResponseHeaders(response, new Map([['set-cookie', null]]))
      return response
    })
    await expect(handler(new Request('http://localhost/'), {})).rejects.toThrow(
      'Set-Cookie headers cannot be protected.',
    )
  })

  it('reads protected header snapshots after direct response mutation', async () => {
    let seenHeader: string | undefined
    let seenHeadersHeader: string | null | undefined
    const handler = createResponseHandler(() => {
      const response = new Response('ok', {
        headers: { 'x-transport': 'original' },
      })
      protectResponseHeaders(response, new Map([['x-transport', 'original']]))
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
    const handler = createResponseHandler(() => {
      const response = reconcileResponse(
        new Response('ok', {
          headers: {
            'x-keep': 'yes',
            'x-remove': 'remove-me',
          },
        }),
      )
      const headers = getResponseHeaders() as Headers
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
    const handler = createResponseHandler(() => {
      setResponseHeader('x-empty', '')
      seenHeader = getResponseHeader('x-empty')
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(seenHeader).toBe('')
    expect(response.headers.get('x-empty')).toBe('')
  })

  it('keeps helper headers set after clearing response headers', async () => {
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
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

  it('appends non-cookie response headers without replacing values', async () => {
    const handler = createResponseHandler(() => {
      appendResponseHeader('link', '</a.css>; rel=preload')
      appendResponseHeader('link', ['</b.css>; rel=preload'])
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.headers.get('link')).toBe(
      '</a.css>; rel=preload, </b.css>; rel=preload',
    )
  })

  it('merges appended raw Set-Cookie strings by cookie identity', async () => {
    const handler = createResponseHandler(() => {
      setCookie('helper', '1', { path: '/' })
      appendResponseHeader('set-cookie', 'external=abc; Path=/; HttpOnly')
      // Same cookie identity replaces the previous value instead of
      // duplicating — across calls and within one batched call.
      appendResponseHeader('set-cookie', [
        'external=def; Path=/; HttpOnly',
        'other=overwritten; Path=/',
        'other=1; Path=/',
      ])
      return new Response('ok', {
        headers: { 'set-cookie': 'returned=1; Path=/' },
      })
    })

    const response = await handler(new Request('http://localhost/'), {})
    const cookies = getSetCookieValues(response.headers)

    expectSetCookie(cookies, 'returned', '1')
    expectSetCookie(cookies, 'helper', '1')
    expectSetCookie(cookies, 'external', 'def')
    expectSetCookie(cookies, 'other', '1')
    expect(cookies.filter((c) => c.startsWith('external='))).toHaveLength(1)
    expect(cookies.filter((c) => c.startsWith('other='))).toHaveLength(1)
  })

  it('warns in development when setResponseStatus is out of range', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const handler = createResponseHandler(() => {
        setResponseStatus(999)
        return new Response('ok')
      })

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.status).toBe(200)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0]![0]).toContain('setResponseStatus(999)')
    } finally {
      warnSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('returns the same response after repeated clean reconciliation', async () => {
    let firstResponse: Response | undefined
    let secondResponse: Response | undefined
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
      const response = new Response('ok')
      reconciledResponse = reconcileResponse(response)
      setResponseHeader('x-late-helper', 'true')
      return reconciledResponse
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response).not.toBe(reconciledResponse)
    expect(response.body).toBe(reconciledResponse?.body)
    expect(reconciledResponse?.headers.get('x-late-helper')).toBeNull()
    expect(response.headers.get('x-late-helper')).toBe('true')
  })

  it('reapplies helper headers after direct mutation of a reconciled response', async () => {
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
      const response = new Response('ok', {
        headers: { 'x-transport': 'original' },
      })
      protectResponseHeaders(response, new Map([['x-transport', 'original']]))
      firstResponse = reconcileResponse(response)
      firstResponse.headers.set('x-transport', 'mutated')
      secondResponse = reconcileResponse(firstResponse)
      return secondResponse
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(secondResponse).not.toBe(firstResponse)
    expect(secondResponse?.body).toBe(firstResponse?.body)
    expect(firstResponse?.headers.get('x-transport')).toBe('mutated')
    expect(response.headers.get('x-transport')).toBe('original')
  })

  it('applies helper status to the returned response', async () => {
    const handler = createResponseHandler(() => {
      setResponseStatus(201, 'Created')
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
  })

  it('sanitizes helper statusText writes', async () => {
    const handler = createResponseHandler(() => {
      setResponseStatus(418, 'Bad\nTeapot')
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(418)
    expect(response.statusText).toBe('BadTeapot')
  })

  it('returns 400 for malformed URLs that throw TypeError', async () => {
    const handler = createResponseHandler(() => new Response('unused'))
    const response = await handler({ url: 'http://%' } as Request, {})

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Bad Request')
  })

  it('parses request helpers from forwarded headers and cookies', async () => {
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
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

    const response = await createServerEntry({ fetch: handler }).fetch(
      new Request('http://localhost/'),
      {},
    )

    expect(response.status).toBe(418)
    expect(response.statusText).toBe('Teapot')
    expect(response.headers.get('x-error')).toBe('handled')
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('converts errors through handleStartError', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = createResponseHandler(() => {
      throw new Error('handled by default')
    })

    try {
      const response = await createServerEntry({ fetch: handler }).fetch(
        new Request('http://localhost/'),
        {},
      )

      expect(response.status).toBe(500)
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('preserves HTTP-style error headers from cause', async () => {
    const handler = createResponseHandler(() => {
      throw new Error('wrapped', {
        cause: {
          status: 409,
          headers: { 'x-error-cause': 'handled' },
        },
      })
    })

    const response = await createServerEntry({ fetch: handler }).fetch(
      new Request('http://localhost/'),
      {},
    )

    expect(response.status).toBe(409)
    expect(response.headers.get('x-error-cause')).toBe('handled')
  })

  it('keeps helper status over HTTP-style error status', async () => {
    const handler = createResponseHandler(() => {
      setResponseStatus(401, 'Unauthorized')
      const error = new Error('handled') as Error & { status: number }
      error.status = 418
      throw error
    })

    const response = await createServerEntry({ fetch: handler }).fetch(
      new Request('http://localhost/'),
      {},
    )

    expect(response.status).toBe(401)
    expect(response.statusText).toBe('Unauthorized')
  })

  it('rethrows primitive errors', async () => {
    const handler = createResponseHandler(() => {
      return Promise.reject('primitive failure')
    })

    await expect(handler(new Request('http://localhost/'), {})).rejects.toBe(
      'primitive failure',
    )
  })

  it('does not recover request state from an error outside the active entry', async () => {
    const error = Object.assign(new Error('outside'), {
      status: 409,
      headers: { 'x-error': 'yes' },
    })
    const handler = createResponseHandler(() => {
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
    expect(response.headers.get('x-helper')).toBeNull()
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
    const handler = createResponseHandler(() => {
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
    const handler = createResponseHandler(() => {
      setResponseStatus(101)
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(200)
  })

  it('keeps the previous status when a helper write is out of range', async () => {
    const handler = createResponseHandler(() => {
      setResponseStatus(418)
      setResponseStatus(700)
      return new Response('ok')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(418)
  })

  it.each([101, 199, 600, 999, 404.5])(
    'ignores setResponseStatus(%s) instead of overriding a returned status',
    async (status) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const handler = createResponseHandler(() => {
          setResponseStatus(status, 'Ignored')
          return new Response('missing', {
            status: 404,
            statusText: 'Not Found',
          })
        })

        const response = await handler(new Request('http://localhost/'), {})

        expect(response.status).toBe(404)
        expect(response.statusText).toBe('Not Found')
        expect(warnSpy).toHaveBeenCalledOnce()
        expect(warnSpy.mock.calls[0]![0]).toContain(
          `setResponseStatus(${status}) was ignored`,
        )
      } finally {
        warnSpy.mockRestore()
      }
    },
  )

  it('keeps the uncaught error status and log after an ignored status write', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const handler = createResponseHandler(() => {
        setResponseStatus(999)
        throw new Error('unexpected failure')
      })

      const response = await createServerEntry({ fetch: handler }).fetch(
        new Request('http://localhost/'),
        {},
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toMatchObject({
        status: 500,
        unhandled: true,
      })
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      warnSpy.mockRestore()
      consoleError.mockRestore()
    }
  })
})

describe('createStartHandler redirect safety', () => {
  it('publishes early normalized redirects with helper writes from the custom entry', async () => {
    const handler = createStartHandler(() => {
      throw new Error('Early redirects should not render HTML')
    })
    const entry = createServerEntry({
      fetch: async (request, options) => {
        setCookie('entry', 'visited')
        const response = await handler(request, options)
        expect(getResponseStatus()).toBe(308)
        expect(getResponseHeader('location')).toBe('http://localhost/target')
        expect(getResponseHeaders().getSetCookie()).toEqual([
          'entry=visited; Path=/',
        ])
        return response
      },
    })

    const response = await entry.fetch(
      new Request('http://localhost//target'),
      {},
    )

    expect(response.status).toBe(308)
    expect(response.headers.getSetCookie()).toEqual(['entry=visited; Path=/'])
  })

  it.each(['GET', 'HEAD'])(
    'publishes the final %s server-function redirect response to custom-entry helpers',
    async (method) => {
      startMocks.routerFactory = makeRouter
      startMocks.serverFnResult = redirect({ to: '/login' })
      const handler = createStartHandler(() => {
        throw new Error('Server function redirects should not render HTML')
      })
      const entry = createServerEntry({
        fetch: async (request, options) => {
          const response = await handler(request, options)
          expect(getResponseStatus()).toBe(200)
          expect(getResponseHeader('location')).toBeUndefined()
          expect(getResponseHeaders().get('content-type')).toBe(
            'application/json',
          )
          return response
        },
      })

      const response = await entry.fetch(
        new Request('http://localhost/_serverFn/test', {
          method,
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      if (method === 'HEAD') {
        expect(response.body).toBeNull()
      } else {
        await expect(response.json()).resolves.toMatchObject({
          href: '/login',
          isSerializedRedirect: true,
        })
      }
    },
  )

  it.each(
    [false, true].flatMap((rpc) =>
      ['relative-to', 'functional-options'].flatMap((options) =>
        ['/login', 'http://localhost/login', '//evil.example'].map((href) => ({
          rpc,
          options,
          href,
        })),
      ),
    ),
  )(
    'uses an explicit Location before ignored $options (RPC=$rpc, href=$href)',
    async ({ rpc, options, href }) => {
      const factory = vi.fn(makeRouter)
      const updater = vi.fn(() => ({}))
      const hash = vi.fn(() => 'ignored')
      startMocks.routerFactory = factory
      const headers = { Location: href }
      const result =
        options === 'relative-to'
          ? redirect({ headers, to: 'ignored' })
          : redirect({ headers, search: updater, params: updater, hash })
      if (rpc) {
        startMocks.serverFnResult = result
      } else {
        startMocks.requestMiddleware = [createMiddleware().server(() => result)]
      }
      const handler = createTestStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request(`http://localhost/${rpc ? '_serverFn/test' : ''}`, {
          headers: rpc ? { 'x-tsr-serverFn': 'true' } : undefined,
        }),
        {},
      )
      const blocked = href.startsWith('//')
      expect(response.status).toBe(blocked ? 500 : rpc ? 200 : 307)
      expect(response.headers.get('Location')).toBe(
        blocked || rpc ? null : '/login',
      )
      expect(factory).toHaveBeenCalledTimes(href === '/login' ? 0 : 1)
      expect(updater).not.toHaveBeenCalled()
      expect(hash).not.toHaveBeenCalled()
      if (rpc && !blocked) {
        expect(await response.json()).toMatchObject({
          href: '/login',
          isSerializedRedirect: true,
        })
      }
    },
  )

  it.each(
    [undefined, ''].flatMap((location) =>
      ['to', 'params', 'search', 'hash'].map((option) => ({
        location,
        option,
      })),
    ),
  )(
    'still validates unresolved $option with Location=$location',
    async ({ location, option }) => {
      const factory = vi.fn(makeRouter)
      const updater = vi.fn(() => ({}))
      const hash = vi.fn(() => 'ignored')
      startMocks.routerFactory = factory
      const headers =
        location === undefined ? undefined : { Location: location }
      const result =
        option === 'to'
          ? redirect({ headers, to: 'relative' })
          : redirect({
              headers,
              to: '/login',
              params: option === 'params' ? updater : undefined,
              search: option === 'search' ? updater : undefined,
              hash: option === 'hash' ? hash : undefined,
            })
      startMocks.requestMiddleware = [createMiddleware().server(() => result)]
      const response = await createTestStartHandler(
        () => new Response('unused'),
      )(new Request('http://localhost/'), {})
      expect(response.status).toBe(500)
      expect(response.headers.get('Location')).toBeNull()
      expect(factory).not.toHaveBeenCalled()
      expect(updater).not.toHaveBeenCalled()
      expect(hash).not.toHaveBeenCalled()
    },
  )

  it('applies custom protocol policy to a header-only redirect with ignored options', async () => {
    startMocks.routerFactory = () => {
      const router = makeRouter()
      router.update({ protocolAllowlist: [] })
      return router
    }
    startMocks.requestMiddleware = [
      createMiddleware().server(() =>
        redirect({
          to: 'ignored',
          headers: { Location: 'https://other.example/login' },
        }),
      ),
    ]
    const response = await createTestStartHandler(() => new Response('unused'))(
      new Request('http://localhost/'),
      {},
    )
    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
  })

  it.each([
    '/login',
    '../login',
    '?next=https://example.com',
    '#details',
    '/items/a:b',
  ])(
    'returns an early relative redirect to %j without initializing the router',
    async (href) => {
      const factory = vi.fn(makeRouter)
      startMocks.routerFactory = factory
      startMocks.requestMiddleware = [
        createMiddleware().server(() => redirect({ href })),
      ]
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe(href)
      expect(factory).not.toHaveBeenCalled()
    },
  )

  it('serializes an early relative server-function redirect without initializing the router', async () => {
    const factory = vi.fn(makeRouter)
    startMocks.routerFactory = factory
    startMocks.serverFnResult = redirect({
      href: '/ignored',
      headers: { Location: '/login', 'set-cookie': 'session=secret; HttpOnly' },
    })
    const handler = createTestStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('set-cookie')).toBe('session=secret; HttpOnly')
    const body = await response.json()
    expect(body).toMatchObject({ href: '/login', isSerializedRedirect: true })
    expect(body).not.toHaveProperty('headers')
    expect(factory).not.toHaveBeenCalled()
  })

  it.each([
    { href: 'https://example.com/login', protocols: [], status: 500 },
    { href: 'myapp:login', protocols: ['myapp:'], status: 307 },
    { href: 'myapp:login', protocols: [], status: 500 },
  ])(
    'uses router policy for an early redirect to $href with $protocols',
    async ({ href, protocols, status }) => {
      const factory = vi.fn(() => {
        const router = makeRouter()
        router.update({ protocolAllowlist: protocols })
        return router
      })
      startMocks.routerFactory = factory
      startMocks.requestMiddleware = [
        createMiddleware().server(() =>
          redirect({
            href: '/ignored',
            headers: { Location: href },
          }),
        ),
      ]
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.status).toBe(status)
      expect(response.headers.get('Location')).toBe(
        status === 307 ? href : null,
      )
      expect(factory).toHaveBeenCalledTimes(1)
    },
  )

  it('resolves route-based early redirects through the router', async () => {
    const factory = vi.fn(() => makeRouterWithRouteWork({}))
    startMocks.routerFactory = factory
    startMocks.requestMiddleware = [
      createMiddleware().server(() =>
        redirect({
          to: '/work',
          search: { next: 'home' },
        }),
      ),
    ]
    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(new Request('http://localhost/'), {})
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/work?next=home')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('resolves redirects thrown by a server handlers factory before route middleware runs', async () => {
    startMocks.router = makeRouter({
      server: {
        handlers: () => {
          setCookie('factory', 'visited')
          throw redirect({ to: '/login' })
        },
      },
    })
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/login')
    expect(response.headers.getSetCookie()).toEqual(['factory=visited; Path=/'])
    expect(render).not.toHaveBeenCalled()
  })

  it.each([
    { href: '/login', status: 307, factories: 0, location: '/login' },
    { href: '/\\evil.example', status: 500, factories: 1, location: null },
    {
      href: 'http://localhost/login',
      status: 307,
      factories: 1,
      location: '/login',
    },
  ])(
    'validates a header-only early redirect to $href',
    async ({ href, status, factories, location }) => {
      const factory = vi.fn(makeRouter)
      startMocks.routerFactory = factory
      startMocks.requestMiddleware = [
        createMiddleware().server(() =>
          redirect({
            headers: { Location: href },
            throw: true,
          }),
        ),
      ]
      const handler = createTestStartHandler(() => new Response('unused'))
      const response = await handler(new Request('http://localhost/'), {})
      expect(response.status).toBe(status)
      expect(response.headers.get('Location')).toBe(location)
      expect(factory).toHaveBeenCalledTimes(factories)
    },
  )

  it.each(
    [
      '//evil.example',
      '/\\evil.example',
      '/\\\\evil.example',
      '/\\/evil.example',
      '\\/evil.example',
      '\\\\evil.example',
    ].flatMap((href) => [false, true].map((rpc) => ({ href, rpc }))),
  )(
    'validates a resolved server function redirect to $href (RPC=$rpc)',
    async ({ href, rpc }) => {
      startMocks.router = makeRouter()
      startMocks.serverFnResult = redirect({ href })
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: rpc ? { 'x-tsr-serverFn': 'true' } : undefined,
        }),
        {},
      )

      expect(response.status).toBe(500)
      expect(response.headers.get('Location')).toBeNull()
    },
  )

  it('validates a structured redirect before returning it directly', async () => {
    startMocks.router = makeRouter()
    startMocks.requestMiddleware = [
      createMiddleware().server(() => redirect({ href: '/\\evil.example' })),
    ]
    const handler = createTestStartHandler(() => new Response('unused'))

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(500)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('does not serialize structured redirect headers into the response body', async () => {
    startMocks.router = makeRouter()
    startMocks.serverFnResult = redirect({
      href: '/safe',
      headers: { 'set-cookie': 'session=secret; HttpOnly' },
    })
    const handler = createTestStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBe('session=secret; HttpOnly')
    const responseText = await response.text()
    expect(responseText).not.toContain('session=secret')
    expect(JSON.parse(responseText)).toEqual(
      expect.objectContaining({
        href: '/safe',
        statusCode: 307,
        isSerializedRedirect: true,
      }),
    )
  })

  it.each(['href', 'to'] as const)(
    'snapshots RPC redirect headers before %s option serialization writes helpers',
    async (target) => {
      startMocks.routerFactory = makeRouter
      const callerHeaders = new Headers([
        ['x-snapshot', 'before'],
        ['set-cookie', 'first=1; Path=/'],
        ['set-cookie', 'second=2; Path=/'],
      ])
      const state = {
        toJSON() {
          source.headers.set('x-snapshot', 'after')
          source.headers.append('set-cookie', 'late=3; Path=/')
          setResponseHeader('x-serialization', 'complete')
          appendResponseHeader('x-steps', 'serialized')
          return { serialized: true }
        },
      }
      const options = { [target]: '/safe', headers: callerHeaders, state }
      const source = redirect(options)
      startMocks.serverFnResult = source
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response.headers.get('x-snapshot')).toBe('before')
      expect(response.headers.getSetCookie()).toEqual([
        'first=1; Path=/',
        'second=2; Path=/',
      ])
      expect(response.headers.get('x-serialization')).toBe('complete')
      expect(response.headers.get('x-steps')).toBe('serialized')
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-tss-raw')).toBeNull()
      expect(response.headers.get('x-tss-serialized')).toBeNull()
      expect(await response.json()).toEqual(
        expect.objectContaining({
          href: '/safe',
          state: { serialized: true },
          isSerializedRedirect: true,
        }),
      )
      expect(source.headers.get('x-snapshot')).toBe('after')
      expect(options.headers).toBe(callerHeaders)
      expect(callerHeaders.get('x-snapshot')).toBe('before')
      expect(options.state).toBe(state)
    },
  )

  it('preserves redirect headers and caller options across RPC then native form reuse', async () => {
    const headers = {
      Location: '/work',
      'set-cookie': 'session=secret; HttpOnly',
      'content-type': 'text/plain',
    }
    const options = { href: '/work', statusCode: 303, headers }
    const result = redirect(options)
    startMocks.serverFnResult = result
    const handler = createTestStartHandler(() => new Response('unused'))

    const rpcResponse = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )
    expect(rpcResponse.status).toBe(200)
    expect(rpcResponse.headers.get('content-type')).toBe('application/json')
    expect(await rpcResponse.json()).not.toHaveProperty('headers')
    expect(options.headers).toBe(headers)
    expect(result.headers.get('content-type')).toBe('text/plain')

    const formResponse = await handler(
      new Request('http://localhost/_serverFn/test', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'name=test',
      }),
      {},
    )
    expect(formResponse.status).toBe(303)
    expect(formResponse.headers.get('Location')).toBe('/work')
    expect(formResponse.headers.get('set-cookie')).toBe(
      'session=secret; HttpOnly',
    )
    expect(formResponse.headers.get('content-type')).toBe('text/plain')
    expect(await formResponse.text()).toBe('')
  })

  it('does not serialize an ordinary redirect with a spoofed server function header', async () => {
    startMocks.router = makeRouter()
    startMocks.requestMiddleware = [
      createMiddleware().server(() => redirect({ href: '/safe' })),
    ]
    const handler = createTestStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/safe')
    expect(response.headers.get('content-type')).toBeNull()
    expect(await response.text()).toBe('')
  })

  it.each([{ href: '/work' }, { to: '/work' }, { hash: () => 'ignored' }])(
    'preserves native form redirects for %j without the RPC header',
    async (target) => {
      startMocks.routerFactory = () => makeRouterWithRouteWork({})
      startMocks.serverFnResult = redirect({
        ...target,
        statusCode: 303,
        headers: {
          'set-cookie': 'session=secret; HttpOnly',
          ...('hash' in target ? { Location: '/work' } : undefined),
        },
      })
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'text/html',
          },
          body: 'name=test',
        }),
        {},
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/work')
      expect(response.headers.get('set-cookie')).toBe(
        'session=secret; HttpOnly',
      )
      expect(response.headers.get('content-type')).not.toBe('application/json')
      expect(await response.text()).toBe('')
    },
  )
})

it('keeps the request URL when server code attempts navigation', async () => {
  const loader = vi.fn(async () => {
    const router = startMocks.router!
    router.history.push('/pushed')
    router.history.replace('/replaced')
    await router.navigate({ to: '/navigated' })
    return 'request data'
  })
  const router = makeRouterWithRouteWork({ loader })
  startMocks.router = router
  const load = vi.spyOn(router, 'load')
  const handler = createTestStartHandler(({ router: loadedRouter }) => {
    expect(loadedRouter.state.location.pathname).toBe('/work')
    expect(loadedRouter.history.location.pathname).toBe('/work')
    expect(loadedRouter.history.length).toBe(1)
    return new Response(loadedRouter.state.matches.at(-1)?.loaderData as string)
  })
  const response = await handler(new Request('http://localhost/work'), {})

  expect(response.status).toBe(200)
  expect(await response.text()).toBe('request data')
  expect(loader).toHaveBeenCalledTimes(1)
  expect(load).toHaveBeenCalledTimes(1)
})

describe('createStartHandler router request Accept handling', () => {
  it('returns 406 JSON for router requests that do not accept HTML', async () => {
    startMocks.routerFactory = vi.fn(makeRouter)
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        headers: { accept: 'application/json' },
      }),
      {},
    )

    expect(response.status).toBe(406)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      error: 'Only HTML requests are supported here',
    })
    expect(render).not.toHaveBeenCalled()
  })

  it.each(['text/html', '*/*', undefined])(
    'does not return 406 for Accept: %s',
    async (accept) => {
      startMocks.routerFactory = vi.fn(makeRouter)
      const render = vi.fn(() => new Response('ok'))
      const handler = createTestStartHandler(render)

      const response = await handler(
        new Request('http://localhost/', {
          headers: accept === undefined ? undefined : { accept },
        }),
        {},
      )

      expect(response.status).not.toBe(406)
      expect(await response.text()).toBe('ok')
      expect(render).toHaveBeenCalledTimes(1)
    },
  )
})

describe('createStartHandler SSR cleanup ownership', () => {
  it.each([204, 200])(
    'preserves cancellation helper writes when a short-circuit body is dropped and cleanup selects %s without a router',
    async (status) => {
      const routerFactory = vi.fn(makeRouter)
      startMocks.routerFactory = routerFactory
      const cancel = vi.fn(() => {
        setResponseStatus(status)
        setCookie('cleanup', 'visited')
        setResponseHeader('x-cleanup', 'complete')
        appendResponseHeader('x-cleanup-steps', 'cancelled')
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          setResponseStatus(204)
          return new Response(new ReadableStream({ cancel }), {
            headers: { 'x-cleanup-steps': 'initial' },
          })
        }),
      ]
      const render = vi.fn(() => new Response('must not render'))
      const handler = createTestStartHandler(render)

      const response = await handler(new Request('http://localhost/'), {})

      expect(routerFactory).not.toHaveBeenCalled()
      expect(render).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledOnce()
      expect(response.status).toBe(status)
      expect(response.body).toBeNull()
      expect(response.headers.getSetCookie()).toEqual([
        'cleanup=visited; Path=/',
      ])
      expect(response.headers.get('x-cleanup')).toBe('complete')
      expect(response.headers.get('x-cleanup-steps')).toBe('initial, cancelled')
    },
  )

  it('preserves cancellation helper writes when outermost middleware replaces a server-function response without a router', async () => {
    const routerFactory = vi.fn(makeRouter)
    startMocks.routerFactory = routerFactory
    const cancel = vi.fn(() => {
      setCookie('cleanup', 'visited')
      setResponseHeader('x-cleanup', 'complete')
      appendResponseHeader('x-cleanup-steps', 'cancelled')
    })
    startMocks.serverFnHandler = () =>
      new Response(new ReadableStream({ cancel }))
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return new Response('replacement', {
          headers: { 'x-cleanup-steps': 'replacement' },
        })
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(routerFactory).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
    expect(startMocks.serverFnCalls).toHaveLength(1)
    expect(cancel).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual(['cleanup=visited; Path=/'])
    expect(response.headers.get('x-cleanup')).toBe('complete')
    expect(response.headers.get('x-cleanup-steps')).toBe(
      'replacement, cancelled',
    )
    await expect(response.text()).resolves.toBe('replacement')
  })

  it.each(['drop', 'replace'] as const)(
    'preserves cleanup helper writes when middleware disposes SSR through %s',
    async (mode) => {
      const router = makeRouter()
      startMocks.router = router
      const cancel = vi.fn()
      const cleanup = vi.fn(() => {
        setResponseHeader('x-cleanup', 'complete')
        setCookie('cleanup', 'visited')
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          if (mode === 'drop') {
            setResponseStatus(204)
            return result
          }
          return new Response('replacement')
        }),
      ]
      const handler = createTestStartHandler(({ router: requestRouter }) => {
        requestRouter.serverSsr!.onCleanup(cleanup)
        return createSsrStreamResponse(
          requestRouter,
          new Response(new ReadableStream({ cancel })),
        )
      })

      const response = await handler(new Request('http://localhost/'), {})

      expect(cancel).toHaveBeenCalledOnce()
      expect(cleanup).toHaveBeenCalledOnce()
      expect(router.serverSsr).toBeUndefined()
      expect(response.headers.get('x-cleanup')).toBe('complete')
      expect(response.headers.getSetCookie()).toEqual([
        'cleanup=visited; Path=/',
      ])
      if (mode === 'drop') {
        expect(response.status).toBe(204)
        expect(response.body).toBeNull()
      } else {
        expect(response.status).toBe(200)
        await expect(response.text()).resolves.toBe('replacement')
      }
    },
  )

  it('preserves response helper writes made by eager SSR cleanup callbacks', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cleanup = vi.fn(() => {
      setResponseStatus(202, 'Accepted')
      setResponseHeader('x-cleanup', 'complete')
      setCookie('cleanup', 'visited')
    })
    const handler = createTestStartHandler(({ router: requestRouter }) => {
      requestRouter.serverSsr!.onCleanup(cleanup)
      return new Response('eager document')
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(cleanup).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
    expect(response.status).toBe(202)
    expect(response.statusText).toBe('Accepted')
    expect(response.headers.get('x-cleanup')).toBe('complete')
    expect(response.headers.getSetCookie()).toEqual(['cleanup=visited; Path=/'])
    await expect(response.text()).resolves.toBe('eager document')
  })

  it('preserves helper appends when an eager renderer cleans up before returning', async () => {
    const router = makeRouter()
    startMocks.router = router
    const handler = createTestStartHandler(({ router: requestRouter }) => {
      requestRouter.serverSsr!.onCleanup(() => {
        setResponseStatus(202, 'Accepted')
        appendResponseHeader('x-steps', 'cleanup')
        setCookie('cleanup', 'visited')
      })
      requestRouter.serverSsr!.cleanup()
      return new Response('eager document', {
        headers: { 'x-steps': 'render' },
      })
    })

    const response = await handler(new Request('http://localhost/'), {})

    expect(router.serverSsr).toBeUndefined()
    expect(response.status).toBe(202)
    expect(response.statusText).toBe('Accepted')
    expect(response.headers.get('x-steps')).toBe('render, cleanup')
    expect(response.headers.getSetCookie()).toEqual(['cleanup=visited; Path=/'])
    await expect(response.text()).resolves.toBe('eager document')
  })

  it.each([
    { method: 'GET', status: 204 },
    { method: 'HEAD', status: 200 },
  ])(
    'serializes $method RPC redirect options before omitting a body at status $status',
    async ({ method, status }) => {
      const toJSON = vi.fn(() => {
        clearResponseHeaders()
        setResponseStatus(status)
        setResponseHeader('content-type', 'text/plain')
        setResponseHeader('location', '/ignored')
        setResponseHeader('x-tss-serialized', 'true')
        setResponseHeader('x-tss-raw', 'true')
        appendResponseHeader('x-steps', 'serialized')
        setCookie('serialization', 'visited')
        return { serialized: true }
      })
      startMocks.serverFnResult = redirect({ href: '/safe', state: { toJSON } })
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          method,
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(toJSON).toHaveBeenCalledOnce()
      expect(response.status).toBe(status)
      expect(response.body).toBeNull()
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-tss-serialized')).toBeNull()
      expect(response.headers.get('x-tss-raw')).toBeNull()
      expect(response.headers.get('x-steps')).toBe('serialized')
      expect(response.headers.getSetCookie()).toEqual([
        'serialization=visited; Path=/',
      ])
    },
  )

  it('rejects an RPC redirect whose options cannot be serialized as JSON', async () => {
    const options = { href: '/safe', toJSON: () => undefined }
    startMocks.serverFnResult = redirect(options)
    const handler = createStartHandler(() => new Response('unused'))

    await expect(
      handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      ),
    ).rejects.toThrow('Value is not JSON serializable')
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

  it('preserves serverFn stream cleanup ownership through early return', async () => {
    startMocks.requestMiddleware = []
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')

    const handler = createTestStartHandler(() => new Response('unused'))
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

  it('does not cancel the returned response when an inner result settles late', async () => {
    let resolveInner!: (response: Response) => void
    startMocks.serverFnHandler = () =>
      new Promise<Response>((resolve) => {
        resolveInner = resolve
      })
    const timeoutCancel = vi.fn()
    const timeoutResponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('timeout'))
          controller.close()
        },
        cancel: timeoutCancel,
      }),
      { status: 504 },
    )
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) =>
        Promise.race([
          next(),
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(timeoutResponse), 5),
          ),
        ]),
      ),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )
    expect(response.status).toBe(504)

    const innerCancel = vi.fn()
    resolveInner(new Response(new ReadableStream({ cancel: innerCancel })))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(timeoutCancel).not.toHaveBeenCalled()
    expect(innerCancel).toHaveBeenCalledExactlyOnceWith(
      'late middleware response',
    )
    expect(await response.text()).toBe('timeout')
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

  it('adopts a replacement registered on a directly returned next promise', async () => {
    startMocks.router = makeRouter()
    const cancel = vi.fn()
    const original = new Response(new ReadableStream({ cancel }))
    const replacement = new Response('replacement')
    const cancelReplacement = vi.spyOn(replacement.body!, 'cancel')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => {
        const pending = Promise.resolve(next())
        void pending.then((result) => {
          result.response = replacement
        })
        return pending
      }),
    ]

    const handler = createTestStartHandler(() => original)
    const response = await handler(new Request('http://localhost/'), {})

    expect(response).toBe(replacement)
    expect(cancel).toHaveBeenCalledExactlyOnceWith(
      'middleware response replaced',
    )
    expect(cancelReplacement).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('replacement')
  })

  it('disposes SSR ownership when a directly returned next promise drops the body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => {
        const pending = Promise.resolve(next())
        void pending.then(() => {
          setResponseStatus(204)
        })
        return pending
      }),
    ]

    const handler = createTestStartHandler(({ router: requestRouter }) =>
      createSsrStreamResponse(
        requestRouter,
        new Response(new ReadableStream({ cancel })),
      ),
    )
    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it.each(['return', 'mutate', 'throw'] as const)(
    'cancels a plain stream that outer middleware replaces via %s',
    async (mode) => {
      const router = makeRouter()
      startMocks.router = router
      const cancel = vi.fn(() => new Promise<void>(() => {}))
      startMocks.serverFnResult = new Response(new ReadableStream({ cancel }))
      const replacement = new Response('replacement')
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          if (mode === 'return') {
            return replacement
          }
          if (mode === 'throw') {
            throw replacement
          }
          result.response = replacement
          return result
        }),
      ]

      const handler = createTestStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response).toBe(replacement)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith('middleware response replaced')
    },
  )

  it('preserves a plain stream when middleware pipes the body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    startMocks.serverFnResult = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'))
          controller.close()
        },
        cancel,
      }),
    )
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        return new Response(
          result.response.body!.pipeThrough(new TransformStream()),
          result.response,
        )
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    await expect(response.text()).resolves.toBe('stream')
    expect(cancel).not.toHaveBeenCalled()
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

  it('preserves stream ownership when middleware pipes the body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let wrappedResponse: Response | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        wrappedResponse = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
        return wrappedResponse
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(wrappedResponse)
    expect(dispose).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('stream')
    expect(router.serverSsr).toBeUndefined()
  })

  it.each([false, true])(
    'cancels a derived body after handoff with a router transform: %s',
    async (useRouterTransform) => {
      const router = makeRouter()
      startMocks.router = router
      const sourceCancel = vi.fn()
      const source = new ReadableStream<Uint8Array>({ cancel: sourceCancel })
      let dispose: ReturnType<typeof vi.spyOn>
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          return transferResponseBodyOwnership(
            result.response,
            new Response(
              result.response.body!.pipeThrough(new TransformStream()),
              result.response,
            ),
          )
        }),
      ]
      const requestController = new AbortController()
      const handler = createTestStartHandler(
        ({ router: requestRouter, request }) => {
          const responseBody = useRouterTransform
            ? transformReadableStreamWithRouter(requestRouter, source, {
                signal: request.signal,
              })
            : source
          const ssrResponse = createSsrStreamResponse(
            requestRouter,
            new Response(responseBody),
          )
          dispose = vi.spyOn(ssrResponse, 'dispose')
          return ssrResponse
        },
      )
      const response = await handler(
        new Request('http://localhost/', {
          signal: requestController.signal,
        }),
        {},
      )
      const derivedCancel = vi.spyOn(response.body!, 'cancel')
      const reason = new Error('request disconnected')

      expect(source.locked).toBe(true)
      requestController.abort(reason)

      await vi.waitFor(() => {
        expect(dispose).toHaveBeenCalledExactlyOnceWith(reason)
        expect(derivedCancel).toHaveBeenCalledExactlyOnceWith(reason)
        expect(sourceCancel).toHaveBeenCalledExactlyOnceWith(reason)
        expect(source.locked).toBe(false)
        expect(router.serverSsr).toBeUndefined()
      })
    },
  )

  it('preserves both Response.clone() branches when the clone is assigned', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let siblingResponse!: Response
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        siblingResponse = result.response
        result.response = transferResponseBodyOwnership(
          siblingResponse,
          siblingResponse.clone(),
        )
        return result
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(dispose).not.toHaveBeenCalled()
    await expect(
      Promise.all([response.text(), siblingResponse.text()]),
    ).resolves.toEqual(['stream', 'stream'])
    expect(router.serverSsr).toBeUndefined()
  })

  it('disposes a piped stream that outer middleware replaces', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    let derivedCancel!: ReturnType<typeof vi.spyOn>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        expect(dispose).not.toHaveBeenCalled()
        return replacement
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const response = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
        derivedCancel = vi.spyOn(response.body!, 'cancel')
        return response
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    expect(derivedCancel).toHaveBeenCalledWith('middleware response replaced')
    expect(router.serverSsr).toBeUndefined()
  })

  it('refreshes a cloned response before an outer replacement', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const replacement = new Response('replacement')
    let ownerBody!: ReadableStream<Uint8Array>
    let cloneCancellation!: Promise<void>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        await next()
        return replacement
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        cloneCancellation = result.response.clone().body!.cancel('not used')
        ownerBody = result.response.body!
        vi.spyOn(ownerBody, 'cancel')
        return result
      }),
    ]

    try {
      const handler = createTestStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response).toBe(replacement)
      await expect(response.text()).resolves.toBe('replacement')
      expect(dispose).toHaveBeenCalledOnce()
      expect(ownerBody.cancel).toHaveBeenCalledOnce()
      await cloneCancellation
      expect(router.serverSsr).toBeUndefined()
      await Promise.resolve()
      await Promise.resolve()
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('disposes a locked stream that middleware replaces with no body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        reader = result.response.body!.getReader()
        return new Response(null, { status: 204 })
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
    expect(dispose).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
    reader?.releaseLock()
  })

  it('disposes a locked stream replaced by an unrelated body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('replacement')
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        reader = result.response.body!.getReader()
        return replacement
      }),
    ]

    try {
      const handler = createTestStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response).toBe(replacement)
      await expect(response.text()).resolves.toBe('replacement')
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith('middleware response replaced')
      expect(router.serverSsr).toBeUndefined()
    } finally {
      await reader?.cancel('test cleanup')
      reader?.releaseLock()
    }
  })

  it('disposes an in-place replacement on middleware error', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const cancel = vi.fn()
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response = new Response(new ReadableStream({ cancel }))
        throw new Error('middleware failed')
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(dispose).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
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
        const result = await next()
        result.response = result.response.clone()
        throw replacement
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
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

  it('disposes a side-cloned stream before an unrelated thrown response', async () => {
    const router = makeRouter()
    startMocks.router = router
    const ssrResponse = makeCompletingStreamResponse(router)
    startMocks.serverFnResult = ssrResponse
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const replacement = new Response('handled', { status: 418 })
    let cloneCancellation!: Promise<void>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        cloneCancellation = result.response.clone().body!.cancel('not used')
        throw replacement
      }),
    ]

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response).toBe(replacement)
    expect(dispose).toHaveBeenCalledOnce()
    await cloneCancellation
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

    const handler = createTestStartHandler(() => new Response('unused'))
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

describe('createStartHandler router initialization', () => {
  it('normalizes a server function router URL while preserving the incoming URL', async () => {
    const requestUrl =
      'http://localhost/_serverFn/test?space=a%20b&tilde=~&bad=%GG&a=1&a=2#part'
    let middlewarePathname: string | undefined
    let middlewareRequestUrl: string | undefined
    let factoryCalls = 0
    startMocks.requestMiddleware = [
      createMiddleware().server(({ pathname, request, next }) => {
        middlewarePathname = pathname
        middlewareRequestUrl = request.url
        return next()
      }),
    ]
    startMocks.routerFactory = () => {
      factoryCalls++
      return makeRouter()
    }
    startMocks.serverFnHandler = async () => {
      const [first, second] = await Promise.all([
        getRouterInstance(),
        getRouterInstance(),
      ])
      return Response.json({
        href: first.history.location.href,
        origin: first.options.origin,
        requestUrl: getRequestUrl().href,
        sameRouter: first === second,
      })
    }

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request(requestUrl, { headers: { 'x-tsr-serverFn': 'true' } }),
      {},
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      href: '/_serverFn/test?space=a+b&tilde=%7E&bad=%25GG&a=1&a=2#part',
      origin: 'http://localhost',
      requestUrl,
      sameRouter: true,
    })
    expect(middlewarePathname).toBe('/_serverFn/test')
    expect(middlewareRequestUrl).toBe(requestUrl)
    expect(factoryCalls).toBe(1)
  })

  it.each(['/%5FserverFn/test', '/_serverFn/%74est'])(
    'dispatches an encoded server function pathname: %s',
    async (pathname) => {
      let middlewarePathname: string | undefined
      startMocks.requestMiddleware = [
        createMiddleware().server(({ pathname: currentPathname, next }) => {
          middlewarePathname = currentPathname
          return next()
        }),
      ]
      startMocks.serverFnHandler = ({ serverFnId }) => {
        return Response.json({ serverFnId, requestUrl: getRequestUrl().href })
      }
      const handler = createTestStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request(`http://localhost${pathname}`, {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        serverFnId: 'test',
        requestUrl: `http://localhost${pathname}`,
      })
      expect(middlewarePathname).toBe('/_serverFn/test')
    },
  )

  it('redirects a protocol-relative server function pathname before dispatch', async () => {
    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost//_serverFn/test?space=a%20b', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'http://localhost/_serverFn/test?space=a+b',
    )
    expect(startMocks.serverFnCalls).toHaveLength(0)
  })

  it('shares one router between concurrent request-context reads', async () => {
    let factoryCalls = 0
    let instances: Array<AnyRouter> = []
    startMocks.routerFactory = () => {
      factoryCalls++
      return makeRouter()
    }
    startMocks.serverFnHandler = async () => {
      instances = await Promise.all([getRouterInstance(), getRouterInstance()])
      return new Response('ok')
    }

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    await expect(response.text()).resolves.toBe('ok')
    expect(factoryCalls).toBe(1)
    expect(instances[0]).toBe(instances[1])
  })

  it('shares one router failure between sequential request-context reads', async () => {
    const factoryError = new Error('router factory failed')
    const errors: Array<unknown> = []
    let factoryCalls = 0
    startMocks.routerFactory = () => {
      factoryCalls++
      throw factoryError
    }
    startMocks.serverFnHandler = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await getRouterInstance()
        } catch (error) {
          errors.push(error)
        }
      }
      return new Response('ok')
    }

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    await expect(response.text()).resolves.toBe('ok')
    expect(factoryCalls).toBe(1)
    expect(errors).toEqual([factoryError, factoryError])
  })

  it('does not start the router factory from a continuation after request abort', async () => {
    const requestController = new AbortController()
    const reason = new Error('request aborted')
    let factoryCalls = 0
    let lateError: unknown
    let continueServerFn!: () => void
    const serverFnCanContinue = new Promise<void>((resolve) => {
      continueServerFn = resolve
    })
    let notifyServerFnStarted!: () => void
    const serverFnStarted = new Promise<void>((resolve) => {
      notifyServerFnStarted = resolve
    })
    let notifyLateReadFinished!: () => void
    const lateReadFinished = new Promise<void>((resolve) => {
      notifyLateReadFinished = resolve
    })

    startMocks.routerFactory = () => {
      factoryCalls++
      return makeRouter()
    }
    startMocks.serverFnHandler = async () => {
      notifyServerFnStarted()
      await serverFnCanContinue
      try {
        await getRouterInstance()
      } catch (error) {
        lateError = error
      }
      notifyLateReadFinished()
      return new Response('late')
    }

    const handler = createTestStartHandler(() => new Response('unused'))
    const response = handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
        signal: requestController.signal,
      }),
      {},
    )

    await serverFnStarted
    requestController.abort(reason)
    expect((await response).status).toBe(500)

    continueServerFn()
    await lateReadFinished
    expect(factoryCalls).toBe(0)
    expect(lateError).toBe(reason)
  })
})

describe('createStartHandler direct server routes', () => {
  it('disposes a thrown sole-terminal response when the request aborts after the fast-path check', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const cancel = vi.fn()
    const thrownResponse = new Response(
      new ReadableStream<Uint8Array>({ cancel }),
    )
    // Abort during the `instanceof Response` check, immediately after the
    // fast path's first abort check has passed.
    const responsePrototype = new Proxy(Response.prototype, {
      getPrototypeOf() {
        requestController.abort(cancellation)
        return Response.prototype
      },
    })
    Object.setPrototypeOf(thrownResponse, responsePrototype)
    startMocks.serverFnHandler = () => {
      throw thrownResponse
    }
    const handler = createTestStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it.each([
    ['Response', 'sole-terminal'],
    ['SsrResponse', 'sole-terminal'],
    ['Response', 'middleware-chain'],
    ['SsrResponse', 'middleware-chain'],
  ] as const)(
    'does not read context from a direct %s result in the %s path',
    async (resultType, executionPath) => {
      if (executionPath === 'middleware-chain') {
        startMocks.requestMiddleware = [
          createMiddleware().server(({ next }) => next()),
        ]
      }
      const directResponse = new Response(resultType, { status: 202 })
      const directResult =
        resultType === 'Response'
          ? directResponse
          : { response: directResponse, serverSsrCleanup: 'none' as const }
      const contextGetter = vi.fn(() => {
        throw new Error('direct response context must not be read')
      })
      Object.defineProperty(directResult, 'context', {
        get: contextGetter,
      })
      startMocks.serverFnHandler = () => directResult
      const handler = createTestStartHandler(() => new Response('unused'))

      const response = await handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        {},
      )

      expect(response.status).toBe(202)
      await expect(response.text()).resolves.toBe(resultType)
      expect(contextGetter).not.toHaveBeenCalled()
    },
  )

  it('does not invoke the sole terminal after abort while copying request context', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const serverFnHandler = vi.fn(() => new Response('must not run'))
    const requestContext = {} as { abort: boolean }
    Object.defineProperty(requestContext, 'abort', {
      enumerable: true,
      get() {
        requestController.abort(cancellation)
        return true
      },
    })
    startMocks.serverFnHandler = serverFnHandler
    const handler = createStartHandler<{
      server: { requestContext: { abort: boolean } }
    }>(() => new Response('unused'))

    await expect(
      handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
          signal: requestController.signal,
        }),
        { context: requestContext },
      ),
    ).rejects.toBe(cancellation)
    expect(serverFnHandler).not.toHaveBeenCalled()
  })

  it('does not invoke a direct handler when its handler factory aborts', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    const routeHandler = vi.fn(() => new Response('must not run'))
    const handlers = vi.fn(() => {
      requestController.abort(cancellation)
      return { GET: routeHandler }
    })
    const router = makeRouter({
      component: undefined,
      server: { handlers },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(handlers).toHaveBeenCalledOnce()
    expect(routeHandler).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('returns an exact non-component handler response without rendering a document', async () => {
    const routeHandler = vi.fn(() => new Response('direct', { status: 201 }))
    const router = makeRouter({
      component: undefined,
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(201)
    await expect(response.text()).resolves.toBe('direct')
    expect(routeHandler).toHaveBeenCalledOnce()
    expect(render).not.toHaveBeenCalled()
    expect(router.serverSsr).toBeUndefined()
  })

  it('preserves request context, params, and pathname for a direct handler', async () => {
    const routeHandler = vi.fn(
      ({ context, params, pathname, handlerType, request }: any) =>
        Response.json({
          context,
          params,
          pathname,
          handlerType,
          requestUrl: request.url,
        }),
    )
    const router = makeRouter({
      path: '/items/$itemId',
      component: undefined,
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler<{
      server: { requestContext: { requestValue: string } }
    }>(render)

    const response = await handler(
      new Request('http://localhost/items/42?source=test'),
      { context: { requestValue: 'preserved' } },
    )

    await expect(response.json()).resolves.toMatchObject({
      context: { requestValue: 'preserved' },
      params: { itemId: '42' },
      pathname: '/items/42',
      handlerType: 'router',
      requestUrl: 'http://localhost/items/42?source=test',
    })
    expect(render).not.toHaveBeenCalled()
  })

  it.each(
    [false, true].flatMap((component) =>
      ['function', 'object'].flatMap((handlerKind) =>
        ['params.parse', 'parseParams'].map((parserKind) => ({
          component,
          handlerKind,
          parserKind,
        })),
      ),
    ),
  )(
    'parses server handler params (component=$component, handler=$handlerKind, parser=$parserKind)',
    async ({ component, handlerKind, parserKind }) => {
      const parse = (params: { itemId: string }) => ({
        itemId: Number(params.itemId),
      })
      const routeHandler = vi.fn(({ params }: any) => Response.json(params))
      startMocks.router = makeRouter({
        path: '/items/$itemId',
        component: component ? () => null : undefined,
        ...(parserKind === 'params.parse'
          ? { params: { parse } }
          : { parseParams: parse }),
        server: {
          handlers: {
            GET:
              handlerKind === 'function'
                ? routeHandler
                : { handler: routeHandler },
          },
        },
      })
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)

      const response = await handler(
        new Request('http://localhost/items/42'),
        {},
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ itemId: 42 })
      expect(routeHandler).toHaveBeenCalledOnce()
      expect(render).not.toHaveBeenCalled()
    },
  )

  it.each(['route', 'handler'] as const)(
    'lets %s middleware catch terminal handler parameter parsing errors',
    async (placement) => {
      const error = new Error('Invalid item id')
      const middleware = createMiddleware().server(async ({ next }) => {
        try {
          return await next()
        } catch (caught) {
          expect(caught).toBe(error)
          return new Response(error.message, { status: 400 })
        }
      })
      const routeHandler = vi.fn(() => new Response('must not run'))
      startMocks.router = makeRouter({
        path: '/items/$itemId',
        component: undefined,
        params: {
          parse: () => {
            throw error
          },
        },
        server: {
          ...(placement === 'route' ? { middleware: [middleware] } : {}),
          handlers: {
            GET:
              placement === 'handler'
                ? { middleware: [middleware], handler: routeHandler }
                : routeHandler,
          },
        },
      })
      const render = vi.fn(() => new Response('must not render'))
      const handler = createStartHandler(render)

      const response = await handler(
        new Request('http://localhost/items/nope'),
        {},
      )

      expect(response.status).toBe(400)
      await expect(response.text()).resolves.toBe('Invalid item id')
      expect(routeHandler).not.toHaveBeenCalled()
      expect(render).not.toHaveBeenCalled()
    },
  )

  it.each(['route', 'handler'] as const)(
    'runs %s middleware instead of incorrectly taking the direct path',
    async (placement) => {
      const events: Array<string> = []
      const middleware = createMiddleware().server(async ({ next }) => {
        events.push('middleware before')
        const result = await next({
          context: { middlewarePlacement: placement },
        })
        events.push('middleware after')
        result.response.headers.set('x-middleware', placement)
        return result
      })
      const routeHandler = vi.fn(({ context }: any) => {
        events.push('handler')
        return Response.json(context)
      })
      const handlers = {
        GET:
          placement === 'handler'
            ? { middleware: [middleware], handler: routeHandler }
            : routeHandler,
      }
      const router = makeRouter({
        component: undefined,
        server: {
          ...(placement === 'route' ? { middleware: [middleware] } : {}),
          handlers,
        },
      })
      startMocks.router = router
      const render = vi.fn(() => new Response('must not render'))
      const handler = createTestStartHandler(render)

      const response = await handler(new Request('http://localhost/'), {})

      expect(response.headers.get('x-middleware')).toBe(placement)
      await expect(response.json()).resolves.toMatchObject({
        middlewarePlacement: placement,
      })
      expect(events).toEqual([
        'middleware before',
        'handler',
        'middleware after',
      ])
      expect(render).not.toHaveBeenCalled()
    },
  )

  it('rejects a missing direct response before middleware resumes', async () => {
    const afterNext = vi.fn()
    const middleware = createMiddleware().server(async ({ next }) => {
      await next()
      afterNext()
      return new Response('must not return')
    })
    const router = makeRouter({
      component: undefined,
      server: {
        middleware: [middleware],
        handlers: { GET: () => undefined },
      },
    })
    startMocks.router = router
    const handler = createTestStartHandler(
      () => new Response('must not render'),
    )

    const response = await handler(new Request('http://localhost/'), {})

    expect(response.status).toBe(500)
    expect(afterNext).not.toHaveBeenCalled()
  })

  it.each(['function', 'object'] as const)(
    'preserves the non-component %s handler next callback',
    async (handlerKind) => {
      const events: Array<string> = []
      let observedNext: unknown
      let caught: unknown
      const middleware = createMiddleware().server(async ({ next }) => {
        events.push('middleware before')
        try {
          return await next()
        } catch (error) {
          caught = error
          events.push('middleware caught')
          return new Response('cannot defer', { status: 409 })
        }
      })
      const routeHandler = vi.fn<TestRouteHandlerFn>(({ next }) => {
        events.push('handler')
        observedNext = next
        return next()
      })
      startMocks.router = makeRouter({
        component: undefined,
        server: {
          middleware: [middleware],
          handlers:
            handlerKind === 'function'
              ? { GET: routeHandler }
              : ({
                  createHandlers,
                }: HandlersFnOpts<{}, AnyRoute, '/', {}, undefined>) =>
                  createHandlers({ GET: { handler: routeHandler } }),
        },
      })
      const render = vi.fn(() => new Response('must not render'))
      const handler = createTestStartHandler(render)

      const response = await handler(new Request('http://localhost/'), {})

      expect(observedNext).toBeTypeOf('function')
      expect(caught).toBeInstanceOf(Error)
      expect(caught).not.toBeInstanceOf(TypeError)
      expect(response.status).toBe(409)
      await expect(response.text()).resolves.toBe('cannot defer')
      expect(events).toEqual([
        'middleware before',
        'handler',
        'middleware caught',
      ])
      expect(routeHandler).toHaveBeenCalledOnce()
      expect(render).not.toHaveBeenCalled()
    },
  )

  it('lets a component route handler defer context to document rendering with next', async () => {
    const events: Array<string> = []
    const requestContext = Object.freeze({ nonce: 'request' })
    const globalContext = Object.freeze({ global: 'yes', shared: 'global' })
    const routeContext = Object.freeze({ route: 'yes', shared: 'route' })
    const handlerContext = Object.freeze({ handler: 'yes', shared: 'handler' })
    let loadedContext: unknown
    let resumedContext: unknown
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        events.push('global before')
        const result = await next({ context: globalContext })
        events.push('global after')
        appendResponseHeader('x-after', 'global')
        return result
      }),
    ]
    const middleware = createMiddleware().server(async ({ next }) => {
      events.push('route before')
      const result = await next({ context: routeContext })
      resumedContext = result.context
      events.push('route after')
      appendResponseHeader('x-after', 'route')
      return result
    })
    const routeHandler = vi.fn<TestRouteHandlerFn<typeof handlerContext>>(
      async ({ next }) => {
        events.push('handler before')
        const result = await next({ context: handlerContext })
        events.push('handler after')
        appendResponseHeader('x-after', 'handler')
        return result
      },
    )
    const loader = vi.fn(
      ({ serverContext }: { serverContext?: Record<string, unknown> }) => {
        events.push('loader')
        loadedContext = serverContext
        return 'loaded'
      },
    )
    const router = makeRouter({
      loader,
      server: {
        middleware: [middleware],
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => {
      events.push('render')
      return Response.json({ context: loadedContext })
    })
    const handler = createTestStartHandler(render)

    const response = await handler(new Request('http://localhost/'), {
      context: requestContext,
    })

    const expectedContext = {
      nonce: 'request',
      global: 'yes',
      route: 'yes',
      handler: 'yes',
      shared: 'handler',
    }
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ context: expectedContext })
    expect(resumedContext).toEqual(expectedContext)
    expect(response.headers.get('x-after')).toBe('handler, route, global')
    expect(events).toEqual([
      'global before',
      'route before',
      'handler before',
      'loader',
      'render',
      'handler after',
      'route after',
      'global after',
    ])
    expect(requestContext).toEqual({ nonce: 'request' })
    expect(globalContext).toEqual({ global: 'yes', shared: 'global' })
    expect(routeContext).toEqual({ route: 'yes', shared: 'route' })
    expect(handlerContext).toEqual({ handler: 'yes', shared: 'handler' })
    expect(routeHandler).toHaveBeenCalledOnce()
    expect(loader).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a direct handler body that resolves after request abort', async () => {
    const requestController = new AbortController()
    const cancellation = new Error('request disconnected')
    let notifyHandlerStarted!: () => void
    const handlerStarted = new Promise<void>((resolve) => {
      notifyHandlerStarted = resolve
    })
    let resolveHandler!: (response: Response) => void
    const handlerResult = new Promise<Response>((resolve) => {
      resolveHandler = resolve
    })
    const routeHandler = vi.fn(() => {
      notifyHandlerStarted()
      return handlerResult
    })
    const router = makeRouter({
      component: undefined,
      server: {
        handlers: {
          GET: routeHandler,
        },
      },
    })
    startMocks.router = router
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await handlerStarted
    requestController.abort(cancellation)
    expect((await response).status).toBe(500)

    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    resolveHandler(new Response(new ReadableStream({ cancel })))

    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
    expect(render).not.toHaveBeenCalled()
  })
})

describe('createStartHandler HEAD fallback', () => {
  it('strips and disposes the rendered document body', async () => {
    const router = makeRouter()
    startMocks.router = router
    const cancel = vi.fn()
    let cleanupEffects = 0

    const handler = createTestStartHandler(({ router: requestRouter }) => {
      requestRouter.serverSsr!.onCleanup(() => {
        cleanupEffects++
      })
      return createSsrStreamResponse(
        requestRouter,
        new Response(new ReadableStream({ cancel }), {
          headers: { 'x-rendered': 'true' },
          status: 201,
        }),
      )
    })
    const response = await handler(
      new Request('http://localhost/', { method: 'HEAD' }),
      {},
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('x-rendered')).toBe('true')
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith('HEAD body stripped')
    expect(cleanupEffects).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a plain streaming GET body before stripping it', async () => {
    const cancel = vi.fn()
    const router = makeRouter({
      server: {
        handlers: {
          GET: () =>
            new Response(
              new ReadableStream({
                cancel,
              }),
            ),
        },
      },
    })
    startMocks.router = router

    const handler = createTestStartHandler(
      () => new Response('must not render'),
    )
    const response = await handler(
      new Request('http://localhost/', { method: 'HEAD' }),
      {},
    )

    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith('HEAD body stripped')
  })
})

describe('createStartHandler request cancellation', () => {
  it.each(['beforeLoad', 'loader'] as const)(
    'aborts route %s work and does not render HTML',
    async (hook) => {
      let routeSignal: AbortSignal | undefined
      let notifyStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        notifyStarted = resolve
      })
      const routeWork = ({
        abortController,
      }: {
        abortController: AbortController
      }) => {
        routeSignal = abortController.signal
        notifyStarted?.()
        return waitForAbortOrRelease(abortController.signal)
      }
      const router = makeRouterWithRouteWork({ [hook]: routeWork })
      startMocks.router = router
      const requestController = new AbortController()
      const render = vi.fn(() => new Response('must not render'))
      const handler = createTestStartHandler(render)
      const response = handler(
        new Request('http://localhost/work', {
          signal: requestController.signal,
        }),
        {},
      )

      await started
      const cancellation = new Error('request disconnected')
      requestController.abort(cancellation)

      expect((await response).status).toBe(500)
      expect(routeSignal?.aborted).toBe(true)
      expect(routeSignal?.reason).toBe(cancellation)
      expect(render).not.toHaveBeenCalled()
    },
  )

  it('settles and cleans up while the render callback is still pending', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (
      value: ReturnType<typeof createSsrStreamResponse>,
    ) => void
    const renderResult = new Promise<
      ReturnType<typeof createSsrStreamResponse>
    >((resolve) => {
      resolveRender = resolve
    })
    let cleanupEffects = 0
    let cancelCalls = 0
    let lateStreamResponse!: ReturnType<typeof createSsrStreamResponse>
    const handler = createTestStartHandler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      serverSsr.onCleanup(() => {
        cleanupEffects++
      })
      lateStreamResponse = createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      )
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(cleanupEffects).toBe(1)
    expect(router.serverSsr).toBeUndefined()

    resolveRender(lateStreamResponse)
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanupEffects).toBe(1)
    expect(cancelCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a plain response resolved by the render callback later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (value: Response) => void
    const renderResult = new Promise<Response>((resolve) => {
      resolveRender = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    const handler = createTestStartHandler(() => {
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)

    expect((await response).status).toBe(500)
    resolveRender(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it.each(['resolves', 'rejects'] as const)(
    'cancels a plain response when request middleware %s later',
    async (settlement) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      let notifyMiddlewareStarted!: () => void
      const middlewareStarted = new Promise<void>((resolve) => {
        notifyMiddlewareStarted = resolve
      })
      let settleMiddleware!: (value: Response) => void
      const middlewareResult = new Promise<Response>((resolve, reject) => {
        settleMiddleware = settlement === 'resolves' ? resolve : reject
      })
      const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          notifyMiddlewareStarted()
          return middlewareResult
        }),
      ]
      const handler = createTestStartHandler(
        () => new Response('must not render'),
      )
      const response = handler(
        new Request('http://localhost/', {
          signal: requestController.signal,
        }),
        {},
      )

      await middlewareStarted
      const cancellation = new Error('request disconnected')
      requestController.abort(cancellation)

      expect((await response).status).toBe(500)
      settleMiddleware(new Response(new ReadableStream({ cancel })))
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(cancel).toHaveBeenCalledWith(cancellation)
      })
    },
  )

  it('cancels a stream resolved by the render callback later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyRenderStarted!: () => void
    const renderStarted = new Promise<void>((resolve) => {
      notifyRenderStarted = resolve
    })
    let resolveRender!: (
      value: ReturnType<typeof createSsrStreamResponse>,
    ) => void
    const renderResult = new Promise<
      ReturnType<typeof createSsrStreamResponse>
    >((resolve) => {
      resolveRender = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    let streamResponse!: ReturnType<typeof createSsrStreamResponse>

    const handler = createTestStartHandler(({ router: requestRouter }) => {
      streamResponse = createSsrStreamResponse(
        requestRouter,
        new Response(new ReadableStream({ cancel })),
      )
      notifyRenderStarted()
      return renderResult
    })
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await renderStarted
    const cancellation = new Error('request disconnected')
    requestController.abort(cancellation)
    expect((await response).status).toBe(500)

    resolveRender(streamResponse)
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it('disposes a side-cloned stream when the request aborts after handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let cancelCalls = 0
    let siblingResponse!: Response
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        siblingResponse = result.response.clone()
        return result
      }),
    ]
    const handler = createTestStartHandler(({ router: requestRouter }) =>
      createSsrStreamResponse(
        requestRouter,
        new Response(
          new ReadableStream({
            cancel() {
              cancelCalls++
              return new Promise<void>(() => {})
            },
          }),
        ),
      ),
    )

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )
    expect(response.body).not.toBeNull()
    expect(router.serverSsr).toBeDefined()
    const cancel = vi.spyOn(response.body!, 'cancel')
    const reason = new Error('request disconnected')

    requestController.abort(reason)
    void siblingResponse.body!.cancel(reason)

    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledWith(reason)
      expect(cancelCalls).toBe(1)
      expect(router.serverSsr).toBeUndefined()
    })
  })

  it('unwinds nested middleware when an inner operation ignores cancellation', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const outerFinally = vi.fn()
    let notifyInnerStarted!: () => void
    const innerStarted = new Promise<void>((resolve) => {
      notifyInnerStarted = resolve
    })
    const pending = new Promise<Response>(() => {})
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(async ({ next }) => {
        try {
          return await next()
        } finally {
          outerFinally()
        }
      }),
      createMiddleware().server(() => {
        notifyInnerStarted()
        return pending
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await innerStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(outerFinally).toHaveBeenCalledOnce()
    expect(render).not.toHaveBeenCalled()
  })

  it('cancels an all-synchronous direct next chain', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyInnerStarted!: () => void
    const innerStarted = new Promise<void>((resolve) => {
      notifyInnerStarted = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(() => {
        notifyInnerStarted()
        return new Promise<Response>(() => {})
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await innerStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves the abort reason when direct next rejects during abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        requestController.abort(reason)
        throw result.response
      }),
      createMiddleware().server(() => ssrResponse as any),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves aborts that race with a fulfilled direct next promise', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const observedErrors: Array<unknown> = []
    const afterNext = vi.fn()
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        try {
          const result = await next()
          afterNext()
          return result
        } catch (error) {
          observedErrors.push(error)
          throw error
        }
      }),
      createMiddleware().server(({ next }) => {
        const pending = next()
        void Promise.resolve(pending).then(() =>
          requestController.abort(reason),
        )
        return pending
      }),
      createMiddleware().server(() => ssrResponse as any),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => expect(observedErrors).toEqual([reason]))
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(afterNext).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('disposes a tagged final response when abort wins handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const cancel = vi.fn()
    const ssrResponse = makeStreamResponse(router, cancel)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        queueMicrotask(() => {
          queueMicrotask(() => requestController.abort(reason))
        })
        return ssrResponse as any
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createTestStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
    expect(render).not.toHaveBeenCalled()
  })

  it('keeps late same-body disposal idempotent after abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    let notifyResponseCaptured!: () => void
    const responseCaptured = new Promise<void>((resolve) => {
      notifyResponseCaptured = resolve
    })
    let releaseMiddleware!: () => void
    const middlewareRelease = new Promise<void>((resolve) => {
      releaseMiddleware = resolve
    })
    let notifyLateResultDelivered!: () => void
    const lateResultDelivered = new Promise<void>((resolve) => {
      notifyLateResultDelivered = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const wrapped = new Response(result.response.body, result.response)
        notifyResponseCaptured()
        await middlewareRelease
        queueMicrotask(() => {
          queueMicrotask(notifyLateResultDelivered)
        })
        return wrapped
      }),
    ]
    const sourceCancel = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'))
        },
        cancel: sourceCancel,
      }),
    )
    let ssrResponse!: ReturnType<typeof createSsrStreamResponse>
    const render = vi.fn(({ router: requestRouter }) => {
      ssrResponse = createSsrStreamResponse(requestRouter, response)
      return ssrResponse
    })
    const handler = createTestStartHandler(render)
    const result = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await responseCaptured
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    requestController.abort(reason)

    expect((await result).status).toBe(500)
    releaseMiddleware()
    await lateResultDelivered
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(sourceCancel).toHaveBeenCalledOnce()
      expect(sourceCancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
  })

  it('cancels a transferred body that middleware returns after abort', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    let notifyResponseCaptured!: () => void
    const responseCaptured = new Promise<void>((resolve) => {
      notifyResponseCaptured = resolve
    })
    let releaseMiddleware!: () => void
    const middlewareRelease = new Promise<void>((resolve) => {
      releaseMiddleware = resolve
    })
    let derivedBody!: ReadableStream<Uint8Array>
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const derived = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
        derivedBody = derived.body!
        notifyResponseCaptured()
        await middlewareRelease
        return derived
      }),
    ]
    const sourceCancel = vi.fn()
    const response = new Response(
      new ReadableStream<Uint8Array>({ cancel: sourceCancel }),
    )
    const handler = createTestStartHandler(({ router: requestRouter }) =>
      createSsrStreamResponse(requestRouter, response),
    )
    const result = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await responseCaptured
    const derivedCancel = vi.spyOn(derivedBody, 'cancel')
    requestController.abort(reason)

    expect((await result).status).toBe(500)
    expect(sourceCancel).not.toHaveBeenCalled()
    releaseMiddleware()
    await vi.waitFor(() => {
      expect(derivedCancel).toHaveBeenCalledWith(reason)
      expect(sourceCancel).toHaveBeenCalledOnce()
      expect(sourceCancel).toHaveBeenCalledWith(reason)
    })
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

describe('setResponseHeaders', () => {
  it('should set a single header via Headers object', async () => {
    const headers = new Headers()
    headers.set('X-Custom-Header', 'test-value')

    const handler = createResponseHandler(() => {
      setResponseHeaders(headers)
      const responseHeaders = getResponseHeaders()
      expect(responseHeaders.get('X-Custom-Header')).toBe('test-value')
      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should set multiple headers via Headers object', async () => {
    const headers = new Headers()
    headers.set('X-Custom-Header', 'test-value')
    headers.set('X-Another-Header', 'another-value')
    headers.set('Content-Type', 'application/json')

    const handler = createResponseHandler(() => {
      setResponseHeaders(headers)
      const responseHeaders = getResponseHeaders()
      expect(responseHeaders.get('X-Custom-Header')).toBe('test-value')
      expect(responseHeaders.get('X-Another-Header')).toBe('another-value')
      expect(responseHeaders.get('Content-Type')).toBe('application/json')
      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should handle empty Headers object', async () => {
    const handler = createResponseHandler(() => {
      const headers = new Headers()
      setResponseHeaders(headers)
      const responseHeaders = getResponseHeaders()
      expect(responseHeaders).toBeDefined()
      expect(Array.from(responseHeaders.entries()).length).toEqual(0)
      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should preserve response header values when a snapshot is passed back', async () => {
    const cookies = ['session=abc123; Path=/', 'user=john; Path=/']
    const handler = createResponseHandler(() => {
      setResponseHeader('set-cookie', cookies)
      setResponseHeader('x-custom', 'keep')
      const headers = getResponseHeaders()
      const entries = Array.from(headers)

      setResponseHeaders(headers)

      expect(Array.from(getResponseHeaders())).toEqual(entries)
      expect(Array.from(headers)).toEqual(entries)
      expect(headers.getSetCookie()).toEqual(cookies)
      return new Response('OK')
    })

    const response = await handler(
      new Request('http://localhost:3000/test'),
      {},
    )
    expect(response.headers.getSetCookie()).toEqual(cookies)
    expect(response.headers.get('x-custom')).toBe('keep')
  })

  it('should replace existing headers with the same name', async () => {
    const handler = createResponseHandler(() => {
      setResponseHeaders(
        new Headers({
          'X-Custom-Header': 'old-value',
        }),
      )
      expect(getResponseHeader('X-Custom-Header')).toEqual('old-value')
      setResponseHeaders(
        new Headers({
          'X-Custom-Header': 'new-value',
        }),
      )
      expect(getResponseHeader('X-Custom-Header')).toEqual('new-value')

      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should handle multiple headers with the same name added via headers.append()', async () => {
    const headers = new Headers()
    headers.append('Set-Cookie', 'session=abc123; Path=/; HttpOnly')
    headers.append('Set-Cookie', 'user=john; Path=/; Secure')

    const handler = createResponseHandler(() => {
      setResponseHeaders(headers)

      // Set-Cookie values remain separate during Headers iteration.
      const setCookieValue = getResponseHeader('Set-Cookie')

      expect(setCookieValue).toBeDefined()

      // Both cookie values should be present in the result
      expect(setCookieValue).toContain('session=abc123')
      expect(setCookieValue).toContain('user=john')
      expect(getResponseHeaders().getSetCookie()).toEqual([
        'session=abc123; Path=/; HttpOnly',
        'user=john; Path=/; Secure',
      ])

      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it.each(['constructor', '__proto__'])(
    'should replace the %s header',
    async (name) => {
      const handler = createResponseHandler(() => {
        setResponseHeader(name, 'old-value')
        setResponseHeaders(new Headers([[name, 'new-value']]))
        expect(getResponseHeader(name)).toBe('new-value')
        return new Response('OK')
      })

      await handler(new Request('http://localhost:3000/test'), {})
    },
  )

  it('should replace cookies on each call while preserving unrelated headers', async () => {
    const cookies = [
      'session=new; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
      'user=john; Path=/',
      'user=john; Path=/',
    ] as const
    const headers = new Headers([
      ['X-Last', 'last'],
      ['Set-Cookie', cookies[0]],
      ['X-First', 'first'],
      ['set-cookie', cookies[1]],
      ['SET-COOKIE', cookies[2]],
    ])
    const handler = createResponseHandler(() => {
      setResponseHeader('set-cookie', ['old=1', 'old=2'])
      setResponseHeader('x-keep', 'keep')
      setResponseHeaders(headers)

      expect(getResponseHeaders().getSetCookie()).toEqual(cookies)
      expect(headers.getSetCookie()).toEqual(cookies)
      expect(getResponseHeader('x-first')).toBe('first')
      expect(getResponseHeader('x-last')).toBe('last')
      expect(getResponseHeader('x-keep')).toBe('keep')

      setResponseHeaders(new Headers({ 'set-cookie': 'next=1' }))
      expect(getResponseHeaders().getSetCookie()).toEqual(['next=1'])
      expect(getResponseHeader('x-keep')).toBe('keep')

      setResponseHeaders(new Headers())
      expect(getResponseHeaders().getSetCookie()).toEqual(['next=1'])
      return new Response('OK')
    })

    const response = await handler(
      new Request('http://localhost:3000/test'),
      {},
    )
    expect(response.headers.getSetCookie()).toEqual(['next=1'])
    expect(response.headers.get('x-keep')).toBe('keep')
  })

  it('should replace combined values for ordinary headers', async () => {
    const handler = createResponseHandler(() => {
      setResponseHeader('x-custom', 'old-value')
      setResponseHeaders(
        new Headers([
          ['X-Custom', 'first'],
          ['x-custom', 'second'],
          ['x-empty', ''],
        ]),
      )
      expect(getResponseHeader('x-custom')).toBe('first, second')
      expect(getResponseHeaders().get('x-empty')).toBe('')
      return new Response('OK')
    })

    await handler(new Request('http://localhost:3000/test'), {})
  })
})
