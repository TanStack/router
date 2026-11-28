// @vitest-environment node

// The setup file Start's plugin adds to a test run: mocks end with the test.
import '@tanstack/start-client-core/testing/vitest'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import {
  createMiddleware,
  createServerFn,
  getRouterInstance,
} from '@tanstack/start-client-core'
import { createServerRpc } from '../src/createServerRpc'
import {
  getCookie,
  getRequest,
  getResponseHeader,
  getResponseStatus,
  setResponseHeader,
  setResponseStatus,
} from '../src/request-response'
import { mockMiddleware, runInRequest, runMiddleware } from '../src/testing'
import type { AnyRouter } from '@tanstack/router-core'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
} from '@tanstack/start-client-core'

const app = vi.hoisted(() => ({
  requestMiddleware: [] as Array<any>,
  functionMiddleware: [] as Array<any>,
  router: undefined as unknown,
}))

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: app.requestMiddleware,
      functionMiddleware: app.functionMiddleware,
    }),
  },
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => app.router,
}))

function useGlobalMiddleware(options: {
  request?: Array<AnyRequestMiddleware>
  function?: Array<AnyFunctionMiddleware>
}) {
  app.requestMiddleware = options.request ?? []
  app.functionMiddleware = options.function ?? []
  // (registered before anything else of the test can throw)
  onTestFinished(() => {
    app.requestMiddleware = []
    app.functionMiddleware = []
  })
}

type CompiledServerFn = ((opts?: { data?: unknown }) => Promise<any>) & {
  __executeServer: (opts: unknown) => Promise<unknown>
}

// The compiled shape of a server function in the module that provides it:
// the RPC entry calls the function's server side.
function defineServerFn(
  middleware: Array<AnyFunctionMiddleware | AnyRequestMiddleware>,
  handler: (ctx: { data: any; context: any }) => unknown,
): CompiledServerFn {
  const attach = createServerFn({ method: 'GET' }).middleware(middleware)
    .handler as unknown as (...args: Array<unknown>) => CompiledServerFn
  const rpc = createServerRpc(
    { id: 'test', name: 'test', filename: 'test.ts' },
    (opts: unknown) => serverFn.__executeServer(opts),
  )
  const serverFn = attach(rpc, handler)
  return serverFn
}

function makeRouter(): AnyRouter {
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: new BaseRootRoute({}),
    },
    () => ({
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn: () => void) => fn(),
    }),
  )
  router.isServer = true
  return router
}

describe('runInRequest', () => {
  it('resolves to what the callback returns', async () => {
    await expect(runInRequest(() => 'sync')).resolves.toBe('sync')
    await expect(runInRequest(async () => 'async')).resolves.toBe('async')
  })

  it('rejects with what the callback throws', async () => {
    const error = new Error('from the callback')

    await expect(
      runInRequest(() => {
        throw error
      }),
    ).rejects.toBe(error)
  })

  it('sends a GET request to http://localhost/ by default', async () => {
    const request = await runInRequest(() => getRequest())

    expect(request.method).toBe('GET')
    expect(request.url).toBe('http://localhost/')
  })

  it('builds the request from url, method and headers', async () => {
    await runInRequest(
      {
        url: '/posts/42?draft=1',
        method: 'POST',
        headers: { cookie: 'session=abc' },
      },
      () => {
        expect(getRequest().url).toBe('http://localhost/posts/42?draft=1')
        expect(getRequest().method).toBe('POST')
        expect(getCookie('session')).toBe('abc')
      },
    )
  })

  it('takes a Request as it is', async () => {
    const request = new Request('https://example.com/a')

    await expect(runInRequest({ request }, () => getRequest())).resolves.toBe(
      request,
    )
  })

  it('rejects an aborted request before any middleware or the callback runs', async () => {
    const middleware = vi.fn()
    useGlobalMiddleware({ request: [createMiddleware().server(middleware)] })
    const controller = new AbortController()
    const reason = new Error('the client went away')
    controller.abort(reason)
    const callback = vi.fn()

    await expect(
      runInRequest(
        {
          request: new Request('http://localhost/', {
            signal: controller.signal,
          }),
        },
        callback,
      ),
    ).rejects.toBe(reason)
    expect(middleware).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('lets a test read what a handler set on the response', async () => {
    const save = defineServerFn([], () => {
      setResponseHeader('cache-control', 'private')
      setResponseStatus(201)
      return 'saved'
    })

    await runInRequest(async () => {
      expect(getResponseHeader('cache-control')).toBeUndefined()

      await expect(save()).resolves.toBe('saved')

      expect(getResponseHeader('cache-control')).toBe('private')
      expect(getResponseStatus()).toBe(201)
    })
  })

  it('runs a server function as a loader calls it during server rendering', async () => {
    const order: Array<string> = []
    const middleware = createMiddleware({ type: 'function' })
      .client(({ next }) => {
        order.push('client')
        return next()
      })
      .server(({ next }) => {
        order.push('server')
        return next({ context: { user: 'Ada' } })
      })
    const greet = defineServerFn([middleware], ({ data, context }) => {
      order.push('handler')
      return `${data} ${context.user}`
    })

    await expect(runInRequest(() => greet({ data: 'Hello' }))).resolves.toBe(
      'Hello Ada',
    )
    expect(order).toEqual(['client', 'server', 'handler'])
  })

  it('fails a server function that is called outside of it', async () => {
    const greet = defineServerFn([], () => 'hello')

    await expect(greet()).rejects.toThrow(
      /No Start context found.*runInRequest\(\)/,
    )
  })

  describe('global middleware', () => {
    it('runs the request middleware before the callback and passes its context on', async () => {
      const order: Array<string> = []
      useGlobalMiddleware({
        request: [
          createMiddleware().server(async ({ next, context }) => {
            order.push('request middleware')
            const result = await next({
              context: {
                tenant:
                  (context as unknown as { tenant?: string }).tenant ??
                  'default',
              },
            })
            order.push('after')
            return result
          }),
        ],
      })
      const readTenant = defineServerFn([], ({ context }) => context.tenant)

      const tenant = await runInRequest(
        { context: { tenant: 'acme' } as {} },
        () => {
          order.push('callback')
          return readTenant()
        },
      )

      expect(tenant).toBe('acme')
      expect(order).toEqual(['request middleware', 'callback', 'after'])
    })

    it('runs the function middleware for a server function call', async () => {
      useGlobalMiddleware({
        function: [
          createMiddleware({ type: 'function' }).server(({ next }) =>
            next({ context: { locale: 'de' } }),
          ),
        ],
      })
      const readLocale = defineServerFn([], ({ context }) => context.locale)

      await expect(runInRequest(() => readLocale())).resolves.toBe('de')
    })

    it('leaves both lists out with globalMiddleware: skip, and uses the context of the test', async () => {
      const requestMiddleware = vi.fn(({ next }) => next())
      const functionMiddleware = vi.fn(({ next }) => next())
      useGlobalMiddleware({
        request: [createMiddleware().server(requestMiddleware)],
        function: [
          createMiddleware({ type: 'function' }).server(functionMiddleware),
        ],
      })
      const readUser = defineServerFn([], ({ context }) => context.user)

      const user = await runInRequest(
        { globalMiddleware: 'skip', context: { user: 'Ada' } as never },
        () => readUser(),
      )

      expect(user).toBe('Ada')
      expect(requestMiddleware).not.toHaveBeenCalled()
      expect(functionMiddleware).not.toHaveBeenCalled()
    })

    it('still runs a global middleware that a server function lists itself, with globalMiddleware: skip', async () => {
      const server = vi.fn()
      const middleware = createMiddleware({ type: 'function' }).server(
        ({ next }) => {
          server()
          return next()
        },
      )
      useGlobalMiddleware({ function: [middleware] })
      const listsIt = defineServerFn([middleware], () => 'done')
      const doesNot = defineServerFn([], () => 'done')

      await runInRequest({ globalMiddleware: 'skip' }, () => doesNot())
      expect(server).not.toHaveBeenCalled()

      await runInRequest({ globalMiddleware: 'skip' }, () => listsIt())
      expect(server).toHaveBeenCalledTimes(1)
    })

    it('does not run a request middleware again that a server function lists as well', async () => {
      const server = vi.fn(({ next }) => next())
      const middleware = createMiddleware().server(server)
      useGlobalMiddleware({ request: [middleware] })
      const fn = defineServerFn([middleware], () => 'done')

      await runInRequest(() => fn())

      expect(server).toHaveBeenCalledTimes(1)
    })

    it('rejects when a request middleware ends the request before the callback', async () => {
      useGlobalMiddleware({
        request: [
          createMiddleware().server(() => new Response(null, { status: 401 })),
        ],
      })
      const callback = vi.fn()

      const error: Error = await runInRequest(callback).then(
        () => {
          throw new Error('the scope should have rejected')
        },
        (reason) => reason,
      )

      expect(error.message).toMatch(
        /ended the request with status 401 before the callback ran/,
      )
      expect((error.cause as Response).status).toBe(401)
      expect(callback).not.toHaveBeenCalled()
    })

    it('rejects with what a request middleware throws', async () => {
      const error = new Error('no session')
      useGlobalMiddleware({
        request: [
          createMiddleware().server(() => {
            throw error
          }),
        ],
      })

      await expect(runInRequest(() => 'unreached')).rejects.toBe(error)
    })

    it('rejects with the error of the callback when a middleware turns it into a response', async () => {
      const error = new Error('from the callback')
      useGlobalMiddleware({
        request: [
          createMiddleware().server(async ({ next }) => {
            try {
              return await next()
            } catch {
              return new Response(null, { status: 500 })
            }
          }),
        ],
      })

      await expect(
        runInRequest(() => {
          throw error
        }),
      ).rejects.toBe(error)
    })

    it('waits for the callback when a middleware does not wait for next()', async () => {
      useGlobalMiddleware({
        request: [
          createMiddleware().server(({ next }) => {
            void next()
            return new Response(null)
          }),
        ],
      })
      let finished = false

      const value = await runInRequest(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        finished = true
        return 'done'
      })

      expect(value).toBe('done')
      expect(finished).toBe(true)
    })

    it('gives an outer middleware the response an inner one put on its result', async () => {
      let seen: number | undefined
      useGlobalMiddleware({
        request: [
          createMiddleware().server(async ({ next }) => {
            const result = await next()
            seen = result.response.status
            return result
          }),
          createMiddleware().server(async ({ next }) => ({
            ...(await next()),
            response: new Response(null, { status: 403 }),
          })),
        ],
      })

      await runInRequest(() => 'done')

      expect(seen).toBe(403)
    })

    it('gives an outer middleware what an inner one set through the helpers after next()', async () => {
      let seen: string | null | undefined
      useGlobalMiddleware({
        request: [
          createMiddleware().server(async ({ next }) => {
            const result = await next()
            seen = result.response.headers.get('x-inner')
            return result
          }),
          createMiddleware().server(async ({ next }) => {
            const result = await next()
            setResponseHeader('x-inner', 'yes')
            return result
          }),
        ],
      })

      await runInRequest(() => 'done')

      expect(seen).toBe('yes')
    })

    it('waits for an inner middleware that calls next() late, when the outer one does not wait for it', async () => {
      useGlobalMiddleware({
        request: [
          createMiddleware().server(({ next }) => {
            void next()
            return new Response(null)
          }),
          createMiddleware().server(async ({ next }) => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return next()
          }),
        ],
      })

      await expect(runInRequest(async () => 'done')).resolves.toBe('done')

      const error = new Error('from the callback')
      await expect(
        runInRequest(() => {
          throw error
        }),
      ).rejects.toBe(error)
    })

    it('gives a middleware the response with what the callback set through the helpers', async () => {
      let seen: Response | undefined
      useGlobalMiddleware({
        request: [
          createMiddleware().server(async ({ next }) => {
            const result = await next()
            seen = result.response
            return result
          }),
        ],
      })

      await runInRequest(() => {
        setResponseStatus(404)
        setResponseHeader('x-reason', 'missing')
      })

      expect(seen?.status).toBe(404)
      expect(seen?.headers.get('x-reason')).toBe('missing')
    })
  })

  describe('getRouterInstance', () => {
    it('returns the router of the router entry at the URL of the request', async () => {
      app.router = makeRouter()
      onTestFinished(() => {
        app.router = undefined
      })

      const router = await runInRequest({ url: '/posts/42?page=2' }, () =>
        getRouterInstance(),
      )

      expect(router).toBe(app.router)
      expect(router.history.location.href).toBe('/posts/42?page=2')
    })

    it('fails in a project without a router entry', async () => {
      await expect(runInRequest(() => getRouterInstance())).rejects.toThrow(
        'This project has no router entry',
      )
    })
  })
})

describe('concurrent requests', () => {
  it('keep their requests, responses and request mocks apart', async () => {
    const tag = createMiddleware({ type: 'function' }).server(({ next }) =>
      next({ context: { tag: 'real' } }),
    )
    const readTag = defineServerFn([tag], ({ context }) => {
      setResponseHeader('x-tag', context.tag)
      return context.tag
    })
    const request = (name: string, delay: number) =>
      runInRequest({ url: `/${name}` }, async () => {
        mockMiddleware(tag, ({ next }) => next({ context: { tag: name } }))
        await new Promise((resolve) => setTimeout(resolve, delay))
        const value = await readTag()
        return [value, getResponseHeader('x-tag'), getRequest().url]
      })

    const [a, b] = await Promise.all([request('a', 20), request('b', 0)])

    expect(a).toEqual(['a', 'a', 'http://localhost/a'])
    expect(b).toEqual(['b', 'b', 'http://localhost/b'])
  })
})

// Through Start's setup file, which runs each test in its own async context.
describe.concurrent('concurrent tests', () => {
  const tag = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { tag: 'real' } }),
  )
  const readTag = defineServerFn([tag], ({ context }) => context.tag)
  const later = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

  for (const [name, delay] of [
    ['a', 20],
    ['b', 0],
  ] as const) {
    it(`each get their own mock of the same middleware, outside of runInRequest (${name})`, async () => {
      mockMiddleware(tag, ({ next }) => next({ context: { tag: name } }))
      await later(delay)

      await expect(runInRequest(() => readTag())).resolves.toBe(name)
    })
  }
})

describe('mockMiddleware', () => {
  const realServer = vi.fn()
  const realClient = vi.fn()
  const auth = createMiddleware({ type: 'function' })
    .client(({ next }) => {
      realClient()
      return next()
    })
    .server(({ next }) => {
      realServer()
      return next({ context: { user: 'real' } })
    })
  const whoAmI = defineServerFn([auth], ({ context }) => context.user)

  // Registered at the top of the file: stays for every test of the file.
  const fileLevel = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { source: 'real' } }),
  )
  const readSource = defineServerFn(
    [fileLevel],
    ({ context }) => context.source,
  )
  mockMiddleware(fileLevel, ({ next }) =>
    next({ context: { source: 'file mock' } }),
  )

  it('replaces the server function of a middleware and switches its client function off', async () => {
    realServer.mockClear()
    realClient.mockClear()
    const mock = vi.fn(({ next }) => next({ context: { user: 'mocked' } }))
    mockMiddleware(auth, mock)

    await expect(runInRequest(() => whoAmI({ data: 'x' }))).resolves.toBe(
      'mocked',
    )

    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'x', method: 'GET' }),
    )
    expect(realServer).not.toHaveBeenCalled()
    expect(realClient).not.toHaveBeenCalled()
  })

  it('ends with the test that registered it', async () => {
    realServer.mockClear()
    realClient.mockClear()

    await expect(runInRequest(() => whoAmI())).resolves.toBe('real')

    expect(realServer).toHaveBeenCalledTimes(1)
    expect(realClient).toHaveBeenCalledTimes(1)
  })

  it('stays for the file when it was registered at the top of the file', async () => {
    await expect(runInRequest(() => readSource())).resolves.toBe('file mock')
  })

  it('belongs to the request when it is registered inside runInRequest', async () => {
    await runInRequest(async () => {
      mockMiddleware(fileLevel, ({ next }) =>
        next({ context: { source: 'request mock' } }),
      )

      await expect(readSource()).resolves.toBe('request mock')
    })

    await expect(runInRequest(() => readSource())).resolves.toBe('file mock')
  })

  it('ends with its request also for work that the request left running', async () => {
    let later: Promise<unknown> | undefined

    await runInRequest(async () => {
      mockMiddleware(fileLevel, ({ next }) =>
        next({ context: { source: 'request mock' } }),
      )
      await expect(readSource()).resolves.toBe('request mock')
      // (a call that the request schedules and does not wait for)
      later = new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
        readSource(),
      )
    })

    await expect(later).resolves.toBe('file mock')
  })

  it('fails the request when a mock registered inside it never ran', async () => {
    await expect(
      runInRequest(() => {
        mockMiddleware(auth, ({ next }) => next({ context: { user: 'x' } }))
      }),
    ).rejects.toThrow(
      'A middleware was mocked inside runInRequest() and did not run in that request.',
    )
  })

  it('reports the error of the callback, not a mock that never ran because of it', async () => {
    const error = new Error('from the callback')

    await expect(
      runInRequest(() => {
        mockMiddleware(auth, ({ next }) => next({ context: { user: 'x' } }))
        throw error
      }),
    ).rejects.toBe(error)
  })

  it('lets a mock end the call by throwing', async () => {
    const error = new Error('not signed in')
    mockMiddleware(auth, () => {
      throw error
    })

    await expect(runInRequest(() => whoAmI())).rejects.toBe(error)
  })

  it('replaces a global request middleware when it is registered before the request', async () => {
    const real = vi.fn()
    const tenantMiddleware = createMiddleware().server(({ next }) => {
      real()
      return next({ context: { tenant: 'real' } })
    })
    useGlobalMiddleware({ request: [tenantMiddleware] })
    const readTenant = defineServerFn([], ({ context }) => context.tenant)
    mockMiddleware(tenantMiddleware, ({ next, request }) =>
      next({ context: { tenant: new URL(request.url).hostname } }),
    )

    await expect(
      runInRequest({ url: 'https://acme.example/' }, () => readTenant()),
    ).resolves.toBe('acme.example')
    expect(real).not.toHaveBeenCalled()
  })

  it('lets the mock of a request middleware end the request with a response', async () => {
    const gate = createMiddleware().server(({ next }) => next())
    useGlobalMiddleware({ request: [gate] })
    mockMiddleware(gate, () => new Response(null, { status: 403 }))

    await expect(runInRequest(() => 'unreached')).rejects.toThrow(
      /ended the request with status 403/,
    )
  })

  it('needs a middleware', () => {
    expect(() =>
      mockMiddleware({} as AnyFunctionMiddleware, ({ next }) => next()),
    ).toThrow('mockMiddleware() needs a middleware')
  })
})

describe('runMiddleware', () => {
  it('calls the server function of a function middleware with the input', async () => {
    const middleware = createMiddleware({ type: 'function' })
      .validator((input: { id: string }) => input)
      .server(({ data, next }) => {
        if (getCookie('session') !== 'abc') {
          throw new Error('not signed in')
        }
        return next({
          context: { user: { id: data.id } },
          sendContext: { seen: true },
        })
      })

    await runInRequest({ headers: { cookie: 'session=abc' } }, async () => {
      const next = vi.fn(() => 'the handler result')
      const run = await runMiddleware(middleware, { data: { id: '42' } }, next)

      expect(run.context).toEqual({ user: { id: '42' } })
      expect(run.sendContext).toEqual({ seen: true })
      expect(run.result).toBe('the handler result')
      expect(next).toHaveBeenCalledWith({
        context: { user: { id: '42' } },
        sendContext: { seen: true },
      })
    })

    await runInRequest(async () => {
      await expect(
        runMiddleware(middleware, { data: { id: '42' } }),
      ).rejects.toThrow('not signed in')
    })
  })

  it('merges the context of the input with what the middleware adds', async () => {
    const parent = createMiddleware({ type: 'function' }).server(({ next }) =>
      next({ context: { tenant: 'acme' } }),
    )
    const middleware = createMiddleware({ type: 'function' })
      .middleware([parent])
      .server(({ next, context }) =>
        next({ context: { greeting: `hello ${context.tenant}` } }),
      )

    const run = await runInRequest(() =>
      runMiddleware(middleware, { context: { tenant: 'other' } }),
    )

    // (only this middleware ran: `parent` would have set `acme`)
    expect(run.context).toEqual({ tenant: 'other', greeting: 'hello other' })
    expect(run.result).toBeUndefined()
  })

  it('calls the server function of a request middleware for the request of the scope', async () => {
    const middleware = createMiddleware().server(
      async ({ next, request, pathname, handlerType }) => {
        if (!request.headers.get('authorization')) {
          return new Response(null, { status: 401 })
        }
        const result = await next({ context: { pathname, handlerType } })
        result.response.headers.set('x-checked', 'yes')
        return result
      },
    )

    await runInRequest({ url: '/admin' }, async () => {
      const next = vi.fn()
      const run = await runMiddleware(middleware, {}, next)

      expect(run.response.status).toBe(401)
      expect(next).not.toHaveBeenCalled()
    })

    await runInRequest(
      { url: '/admin', headers: { authorization: 'Bearer x' } },
      async () => {
        const run = await runMiddleware(
          middleware,
          {},
          () => new Response('page', { status: 203 }),
        )

        expect(run.context).toEqual({
          pathname: '/admin',
          handlerType: 'router',
        })
        expect(run.response.status).toBe(203)
        expect(run.response.headers.get('x-checked')).toBe('yes')
        await expect(run.response.text()).resolves.toBe('page')
      },
    )
  })

  it('treats a thrown response of a request middleware as its answer', async () => {
    const middleware = createMiddleware().server(() => {
      throw new Response(null, { status: 302, headers: { location: '/login' } })
    })

    const run = await runInRequest(() => runMiddleware(middleware, {}))

    expect(run.response.status).toBe(302)
    expect(run.response.headers.get('location')).toBe('/login')
  })

  it('applies what a request middleware set through the response helpers', async () => {
    const middleware = createMiddleware().server(({ next }) => {
      setResponseHeader('x-frame-options', 'DENY')
      return next()
    })

    const run = await runInRequest(() =>
      runMiddleware(middleware, { handlerType: 'serverFn' }),
    )

    expect(run.response.headers.get('x-frame-options')).toBe('DENY')
  })

  it('runs the real server function of a middleware that is mocked', async () => {
    const middleware = createMiddleware({ type: 'function' }).server(
      ({ next }) => next({ context: { source: 'real' } }),
    )
    mockMiddleware(middleware, ({ next }) =>
      next({ context: { source: 'mock' } }),
    )

    const run = await runInRequest(() => runMiddleware(middleware, {}))

    expect(run.context).toEqual({ source: 'real' })
  })

  it('has to be called inside runInRequest', async () => {
    const middleware = createMiddleware({ type: 'function' }).server(
      ({ next }) => next(),
    )

    await expect(runMiddleware(middleware, {})).rejects.toThrow(
      'runMiddleware() has to be called inside runInRequest()',
    )
  })

  it('needs a middleware with a server function', async () => {
    const clientOnly = createMiddleware({ type: 'function' }).client(
      ({ next }) => next(),
    )

    await expect(
      runInRequest(() => runMiddleware(clientOnly, {})),
    ).rejects.toThrow('the middleware has no server function')
  })
})
