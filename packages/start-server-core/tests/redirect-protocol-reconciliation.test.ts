// @vitest-environment node

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  RawStream,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  isRedirect,
  notFound,
  redirect,
} from '@tanstack/router-core'
import { createMiddleware } from '@tanstack/start-client-core'
import { serverFnFetcher } from '../../start-client-core/dist/esm/client-rpc/serverFnFetcher.js'
import {
  createStartHandler,
  transferResponseBodyOwnership,
} from '../src/createStartHandler'
import {
  appendResponseHeader,
  clearResponseHeaders,
  removeResponseHeader,
  getResponseHeader,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from '../src/request-response'

const mocks = vi.hoisted(() => {
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    previousServerFnBase,
    middleware: [] as Array<unknown>,
    action: undefined as undefined | (() => unknown),
  }
})

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: mocks.middleware,
      serializationAdapters: [],
    }),
  },
}))
vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => makeRouter(),
}))
vi.mock('#tanstack-start-server-fn-resolver', () => ({
  getServerFnById: () => mocks.action,
}))
// This test runs the client decoder in Node without the compiler's browser
// replacement for the isomorphic Start-options accessor.
vi.mock('../../start-client-core/dist/esm/getStartOptions.js', () => ({
  getStartOptions: () => undefined,
}))

function makeRouter() {
  const root = new BaseRootRoute({})
  const index = new BaseRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => null,
  })
  return new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: root.addChildren([index]),
      isServer: true,
    },
    () => ({
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn: () => void) => fn(),
    }),
  )
}

function app() {
  return createStartHandler(() => {
    throw new Error('This request should not render HTML')
  })
}

async function callServerFn() {
  const handler = app()
  return serverFnFetcher(
    '/_serverFn/test',
    [{ method: 'GET' }],
    async (url: string, init: RequestInit) =>
      handler(new Request(new URL(url, 'https://start.example'), init), {}),
  )
}

afterEach(() => {
  mocks.middleware = []
  mocks.action = undefined
})

afterAll(() => {
  if (mocks.previousServerFnBase === undefined) {
    Reflect.deleteProperty(process.env, 'TSS_SERVER_FN_BASE')
  } else {
    process.env.TSS_SERVER_FN_BASE = mocks.previousServerFnBase
  }
})

describe('Router redirects through public request middleware', () => {
  it.each([
    { target: 'to', throws: false, status: 302, statusText: undefined },
    { target: 'to', throws: true, status: 302, statusText: undefined },
    { target: 'to', throws: false, status: 307, statusText: 'Continue' },
    { target: 'to', throws: true, status: 307, statusText: 'Continue' },
    { target: 'href', throws: false, status: 302, statusText: undefined },
    { target: 'href', throws: true, status: 307, statusText: 'Continue' },
  ] as const)(
    'resolves $target redirects with throws=$throws and helper status $status/$statusText',
    async ({ target, throws, status, statusText }) => {
      mocks.middleware = [
        createMiddleware().server(() => {
          setResponseStatus(status, statusText)
          setCookie('session', 'committed')
          const response = redirect({ [target]: '/login' })
          if (throws) {
            throw response
          }
          return response
        }),
      ]

      const response = await app()(new Request('https://start.example'), {})

      expect(response.status).toBe(status)
      if (statusText !== undefined) {
        expect(response.statusText).toBe(statusText)
      }
      expect(response.headers.get('location')).toBe('/login')
      expect(response.headers.getSetCookie()).toEqual([
        'session=committed; Path=/',
      ])
    },
  )

  it.each([false, true])(
    'keeps the server-function redirect envelope when throws=%s and helper status changes',
    async (throws) => {
      mocks.middleware = [
        createMiddleware().server(({ next }) => {
          setResponseStatus(302, 'Continue')
          return next()
        }),
      ]
      mocks.action = () => {
        const response = redirect({ to: '/login', statusCode: 303 })
        if (throws) {
          throw response
        }
        return { result: response }
      }

      await expect(callServerFn()).rejects.toSatisfy((value: unknown) => {
        return (
          isRedirect(value) &&
          value.options.href === '/login' &&
          value.status === 303
        )
      })
    },
  )
})

const mutations = [
  {
    name: 'a different content type',
    run: () => setResponseHeader('content-type', 'text/plain'),
  },
  { name: 'cleared headers', run: () => clearResponseHeaders() },
  {
    name: 'the raw response marker',
    run: () => setResponseHeader('x-tss-raw', 'true'),
  },
  {
    name: 'the serialized marker',
    run: () => setResponseHeader('x-tss-serialized', 'true'),
  },
]

describe('server-function protocol headers through public request middleware', () => {
  it.each(['constructor', 'toString', '__proto__'])(
    'allows helpers to write and clear the %s header on protocol responses',
    async (name) => {
      mocks.middleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          expect(result.response.headers.get(name)).toBe('from-helper')
          expect(getResponseHeader(name)).toBe('from-helper')
          clearResponseHeaders()
          expect(getResponseHeader(name)).toBeUndefined()
          return result
        }),
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          setResponseHeader(name, 'from-helper')
          expect(getResponseHeader(name)).toBe('from-helper')
          return result
        }),
      ]
      mocks.action = () => ({
        result: new Response('raw result', {
          headers: [[name, 'from-response']],
        }),
      })

      const response = await callServerFn()
      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get(name)).toBeNull()
      expect(response.headers.get('x-tss-raw')).toBe('true')
      expect(await response.text()).toBe('raw result')
    },
  )

  it('restores direct protocol header mutations at each middleware boundary without helper writes', async () => {
    const mutateHeaders = (response: Response) => {
      response.headers.set('content-type', 'text/plain')
      response.headers.delete('x-tss-serialized')
      response.headers.append('x-tss-raw', 'true')
    }
    mocks.middleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        expect(result.response.headers.get('content-type')).toBe(
          'application/json',
        )
        expect(result.response.headers.get('x-tss-serialized')).toBe('true')
        expect(result.response.headers.get('x-tss-raw')).toBeNull()
        mutateHeaders(result.response)
        return result
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        mutateHeaders(result.response)
        return result
      }),
    ]
    mocks.action = () => ({ result: { answer: 42 } })

    await expect(callServerFn()).resolves.toEqual({ result: { answer: 42 } })
  })

  it('restores a raw response marker directly removed by each middleware layer', async () => {
    mocks.middleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        expect(result.response.headers.get('x-tss-raw')).toBe('true')
        result.response.headers.delete('x-tss-raw')
        return result
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response.headers.delete('x-tss-raw')
        return result
      }),
    ]
    mocks.action = () => ({ result: new Response('raw result') })

    const response = await callServerFn()
    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('x-tss-raw')).toBe('true')
    expect(await response.text()).toBe('raw result')
  })

  it('wraps raw responses without changing their headers or duplicating their body', async () => {
    const cancel = vi.fn()
    const source = new Response(new ReadableStream({ cancel }), {
      status: 201,
      statusText: 'Created',
      headers: [
        ['content-type', 'application/octet-stream'],
        ['set-cookie', 'session=one; Path=/'],
        ['set-cookie', 'session=two; Path=/admin'],
      ],
    })
    mocks.action = () => ({ result: source })

    const response = await callServerFn()
    expect(response).toBeInstanceOf(Response)
    expect(response).not.toBe(source)
    expect(response.body).toBe(source.body)
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(response.headers.get('x-tss-raw')).toBe('true')
    expect(source.headers.get('x-tss-raw')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([
      'session=one; Path=/',
      'session=two; Path=/admin',
    ])
    response.headers.set('content-type', 'text/plain')
    expect(source.headers.get('content-type')).toBe('application/octet-stream')

    const reason = new Error('client disconnected')
    await response.body!.cancel(reason)
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason)
  })

  it('marks raw responses with immutable headers without modifying their source', async () => {
    const source = Response.redirect('https://start.example/login', 303)
    mocks.action = () => ({ result: source })

    const response = await callServerFn()

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(303)
    expect(response.body).toBeNull()
    expect(response.headers.get('location')).toBe('https://start.example/login')
    expect(response.headers.get('x-tss-raw')).toBe('true')
    expect(source.headers.get('x-tss-raw')).toBeNull()
  })

  it('keeps Location absent from RPC redirect JSON despite a helper override', async () => {
    mocks.middleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        setResponseStatus(302)
        setResponseHeader('location', '/middleware-target')
        return result
      }),
    ]
    mocks.action = () => ({ result: redirect({ href: '/login' }) })

    const response = await app()(
      new Request('https://start.example/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toMatchObject({
      href: '/login',
      isSerializedRedirect: true,
    })
  })

  it.each(mutations)(
    'decodes redirects despite $name before or after next()',
    async ({ run }) => {
      for (const afterNext of [false, true]) {
        mocks.middleware = [
          createMiddleware().server(async ({ next }) => {
            if (!afterNext) {
              run()
            }
            const result = await next()
            if (afterNext) {
              run()
            }
            return result
          }),
        ]
        mocks.action = () => ({ result: redirect({ href: '/login' }) })

        await expect(callServerFn()).rejects.toSatisfy((value: unknown) => {
          return isRedirect(value) && value.options.href === '/login'
        })
      }
    },
  )

  it.each(mutations)(
    'decodes serialized values despite $name',
    async ({ run }) => {
      mocks.middleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          run()
          return result
        }),
      ]
      mocks.action = () => ({ result: { answer: 42 } })

      await expect(callServerFn()).resolves.toEqual({
        result: { answer: 42 },
      })
    },
  )

  // Setting the serialized marker cannot break a serialized reply, so that
  // mutation would pass without the protection this test covers.
  it.each(mutations.filter(({ name }) => name !== 'the serialized marker'))(
    'decodes serialized values wrapped in a same-body response despite $name',
    async ({ run }) => {
      mocks.middleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          run()
          return result
        }),
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          // An ordinary wrapper that keeps the body stream and response init.
          return new Response(result.response.body, result.response)
        }),
      ]
      mocks.action = () => ({ result: { answer: 42 } })

      await expect(callServerFn()).resolves.toEqual({
        result: { answer: 42 },
      })
    },
  )

  it('keeps a raw result raw when a same-body wrapper loses its marker', async () => {
    mocks.middleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        removeResponseHeader('x-tss-raw')
        return result
      }),
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const headers = new Headers(result.response.headers)
        headers.delete('x-tss-raw')
        return new Response(result.response.body, {
          status: result.response.status,
          headers,
        })
      }),
    ]
    mocks.action = () => ({ result: new Response('raw result') })

    const response = await callServerFn()
    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('x-tss-raw')).toBe('true')
    expect(await response.text()).toBe('raw result')
  })

  it('decodes framed RawStream results despite a raw response marker', async () => {
    mocks.middleware = [
      createMiddleware().server(({ next }) => {
        setResponseHeader('x-tss-raw', 'true')
        return next()
      }),
    ]
    mocks.action = () => ({
      result: new RawStream(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('stream result'))
            controller.close()
          },
        }),
      ),
    })

    const decoded = await callServerFn()
    expect(decoded).not.toBeInstanceOf(Response)
    expect(await new Response(decoded.result).text()).toBe('stream result')
  })

  it('decodes action errors despite a raw response marker', async () => {
    mocks.middleware = [
      createMiddleware().server(({ next }) => {
        setResponseHeader('x-tss-raw', 'true')
        return next()
      }),
    ]
    mocks.action = () => {
      setResponseStatus(409)
      throw new Error('Session update conflict')
    }

    await expect(callServerFn()).rejects.toThrow('Session update conflict')
  })

  it('decodes not-found results despite a raw response marker', async () => {
    mocks.middleware = [
      createMiddleware().server(({ next }) => {
        setResponseHeader('x-tss-raw', 'true')
        return next()
      }),
    ]
    mocks.action = () => {
      throw notFound({ data: 'missing' })
    }

    await expect(callServerFn()).rejects.toMatchObject({
      isNotFound: true,
      data: 'missing',
    })
  })

  it('owns protocol markers supplied in redirect headers', async () => {
    mocks.action = () => ({
      result: redirect({
        href: '/login',
        headers: { 'x-tss-raw': 'true', 'x-tss-serialized': 'true' },
      }),
    })

    await expect(callServerFn()).rejects.toSatisfy((value: unknown) => {
      return isRedirect(value) && value.options.href === '/login'
    })
  })

  it('owns protocol markers supplied in error headers', async () => {
    mocks.action = () => {
      throw Object.assign(new Error('Session update conflict'), {
        status: 409,
        headers: { 'x-tss-raw': 'true' },
      })
    }

    await expect(callServerFn()).rejects.toThrow('Session update conflict')
  })

  it('owns protocol markers supplied in not-found headers', async () => {
    mocks.action = () => {
      throw notFound({
        data: 'missing',
        headers: { 'x-tss-raw': 'true', 'x-tss-serialized': 'true' },
      })
    }

    await expect(callServerFn()).rejects.toMatchObject({
      isNotFound: true,
      data: 'missing',
    })
  })

  it('keeps an explicitly returned response raw after middleware clears headers', async () => {
    mocks.middleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        clearResponseHeaders()
        setResponseHeader('x-tss-serialized', 'true')
        return result
      }),
    ]
    mocks.action = () => ({ result: new Response('raw result') })

    const response = await callServerFn()
    expect(response).toBeInstanceOf(Response)
    expect(await response.text()).toBe('raw result')
  })
})

it('preserves protocol requirements when request middleware rejects a HEAD RPC', async () => {
  mocks.middleware = [
    createMiddleware().server(() => {
      setResponseHeader('content-type', 'text/plain')
      setResponseHeader('x-tss-raw', 'true')
      appendResponseHeader('vary', 'Origin')
      throw Object.assign(new Error('HEAD request rejected'), { status: 401 })
    }),
  ]
  const response = await app()(
    new Request('https://start.example/_serverFn/test', {
      method: 'HEAD',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    {},
  )
  expect(response.status).toBe(401)
  expect(response.body).toBeNull()
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(response.headers.get('x-tss-serialized')).toBe('true')
  expect(response.headers.get('x-tss-raw')).toBeNull()
  expect(response.headers.get('vary')).toBe('Origin')
})

it('unwinds aborted request middleware error serialization', async () => {
  let resolvePending!: () => void
  const pending = new Promise<void>((resolve) => {
    resolvePending = resolve
  })
  let serializationStarted!: () => void
  const started = new Promise<void>((resolve) => {
    serializationStarted = resolve
  })
  const failure = {
    status: 500,
    get pending() {
      serializationStarted()
      return pending
    },
  }
  mocks.middleware = [
    createMiddleware().server(() => {
      throw failure
    }),
  ]
  const controller = new AbortController()
  const reason = new Error('request disconnected')
  let outcome: { response: Response } | { error: unknown } | undefined
  const request = app()(
    new Request('https://start.example/_serverFn/test', {
      signal: controller.signal,
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    {},
  )
  const settled = Promise.resolve(request).then(
    (response) => {
      outcome = { response }
    },
    (error) => {
      outcome = { error }
    },
  )

  await started
  controller.abort(reason)
  try {
    // Abort propagation is promise work. Drain this turn without imposing a
    // timing deadline or resolving the application-owned pending value.
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(outcome).toEqual({ error: reason })
  } finally {
    resolvePending()
    await settled
  }
})

it('keeps RPC protocol metadata through explicit response body ownership transfer', async () => {
  mocks.middleware = [
    createMiddleware().server(async ({ next }) => {
      setResponseHeader('content-type', 'text/plain')
      const result = await next()
      return transferResponseBodyOwnership(
        result.response,
        new Response(result.response.body, result.response),
      )
    }),
  ]
  mocks.action = () => ({ result: 'still serialized' })

  await expect(callServerFn()).resolves.toEqual({ result: 'still serialized' })
})

it('applies helper appends to fresh headers during explicit body ownership transfer', async () => {
  mocks.middleware = [
    createMiddleware().server(async ({ next }) => {
      appendResponseHeader('vary', 'Origin')
      const result = await next()
      return transferResponseBodyOwnership(
        result.response,
        new Response(result.response.body, {
          headers: { vary: 'Accept-Language' },
        }),
      )
    }),
  ]
  mocks.action = () => ({ result: 'still serialized' })

  const response = await app()(
    new Request('https://start.example/_serverFn/test', {
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    {},
  )
  expect(response.headers.get('vary')).toBe('Accept-Language, Origin')
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(response.headers.get('x-tss-serialized')).toBe('true')
  await response.body?.cancel()
})
