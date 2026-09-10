// @vitest-environment node

import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { createMiddleware } from '@tanstack/start-client-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  redirect,
  type AnyRouter,
} from '@tanstack/router-core'
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

vi.mock('../src/server-functions-handler', () => ({
  handleServerAction: () => startMocks.serverFnResult,
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

afterEach(() => {
  startMocks.requestMiddleware = []
  startMocks.serverFnResult = undefined
  startMocks.router = undefined
  startMocks.routerFactory = undefined
  vi.unstubAllEnvs()
})

afterAll(() => {
  if (startMocks.previousServerFnBase === undefined) {
    delete (process.env as Partial<NodeJS.ProcessEnv>).TSS_SERVER_FN_BASE
  } else {
    process.env.TSS_SERVER_FN_BASE = startMocks.previousServerFnBase
  }
})

describe('createStartHandler redirect safety', () => {
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
      const handler = createStartHandler(() => new Response('unused'))
      const response = await handler(
        new Request(`http://localhost/${rpc ? '_serverFn/test' : ''}`, {
          headers: rpc ? { 'x-tsr-serverFn': 'true' } : undefined,
        }),
        {},
      )
      const blocked = href.startsWith('//')
      expect(response.status).toBe(blocked ? 500 : rpc ? 200 : 307)
      expect(response.headers.get('Location')).toBe(blocked ? null : '/login')
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
      const response = await createStartHandler(() => new Response('unused'))(
        new Request('http://localhost/'),
        {},
      )
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
    const response = await createStartHandler(() => new Response('unused'))(
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
      const handler = createStartHandler(() => new Response('unused'))

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
    const handler = createStartHandler(() => new Response('unused'))

    const response = await handler(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-tsr-serverFn': 'true' },
      }),
      {},
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBe('/login')
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
      const handler = createStartHandler(() => new Response('unused'))

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
    const handler = createStartHandler(() => new Response('unused'))
    const response = await handler(new Request('http://localhost/'), {})
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/work?next=home')
    expect(factory).toHaveBeenCalledTimes(1)
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
      const handler = createStartHandler(() => new Response('unused'))
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
      const handler = createStartHandler(() => new Response('unused'))

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
    const handler = createStartHandler(() => new Response('unused'))

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
    const handler = createStartHandler(() => new Response('unused'))

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

  it('preserves redirect headers and caller options across RPC then native form reuse', async () => {
    const headers = {
      Location: '/work',
      'set-cookie': 'session=secret; HttpOnly',
      'content-type': 'text/plain',
    }
    const options = { href: '/work', statusCode: 303, headers }
    const result = redirect(options)
    startMocks.serverFnResult = result
    const handler = createStartHandler(() => new Response('unused'))

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
    const handler = createStartHandler(() => new Response('unused'))

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
      const handler = createStartHandler(() => new Response('unused'))

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

  it('disposes stream response on middleware error after next', async () => {
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
    expect(dispose).toHaveBeenCalledOnce()
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
      const handler = createStartHandler(render)
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
    let cleanupCalls = 0
    let cancelCalls = 0
    let lateStreamResponse!: ReturnType<typeof createSsrStreamResponse>
    const handler = createStartHandler(({ router: requestRouter }) => {
      const serverSsr = requestRouter.serverSsr!
      const cleanup = serverSsr.cleanup
      serverSsr.cleanup = () => {
        cleanupCalls++
        cleanup()
      }
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
    expect(cleanupCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()

    resolveRender(lateStreamResponse)
    await Promise.resolve()
    await Promise.resolve()
    expect(cleanupCalls).toBe(1)
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
    const handler = createStartHandler(() => {
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

  it('cancels a plain response resolved by request middleware later', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyMiddlewareStarted!: () => void
    const middlewareStarted = new Promise<void>((resolve) => {
      notifyMiddlewareStarted = resolve
    })
    let resolveMiddleware!: (value: Response) => void
    const middlewareResult = new Promise<Response>((resolve) => {
      resolveMiddleware = resolve
    })
    const cancel = vi.fn((_reason: unknown) => new Promise<void>(() => {}))
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        notifyMiddlewareStarted()
        return middlewareResult
      }),
    ]
    const handler = createStartHandler(() => new Response('must not render'))
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
    resolveMiddleware(new Response(new ReadableStream({ cancel })))
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(cancellation)
    })
  })

  it.each(['throw', 'reject'] as const)(
    'reports a %s from disposal of a late render response',
    async (failureMode) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      const cleanupError = new Error('late stream cleanup failed')
      const dispose = vi.fn(() => {
        if (failureMode === 'throw') {
          throw cleanupError
        }
        return Promise.reject(cleanupError)
      })
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      let notifyRenderStarted!: () => void
      const renderStarted = new Promise<void>((resolve) => {
        notifyRenderStarted = resolve
      })
      let resolveRender!: (value: any) => void
      const renderResult = new Promise<any>((resolve) => {
        resolveRender = resolve
      })
      onTestFinished(() => {
        consoleError.mockRestore()
      })
      onTestFinished(() => {
        router.serverSsr?.cleanup()
      })

      const handler = createStartHandler(() => {
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

      resolveRender({
        response: new Response('stream'),
        serverSsrCleanup: 'stream',
        dispose,
      })
      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(cleanupError)
      })
      expect(dispose).toHaveBeenCalledOnce()
    },
  )

  it.each(['throw', 'reject'] as const)(
    'reports a stream disposal %s when middleware is aborted',
    async (failureMode) => {
      const router = makeRouter()
      startMocks.router = router
      const requestController = new AbortController()
      const cleanupError = new Error('custom stream cleanup failed')
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const ssrResponse = makeStreamResponse(router)
      const dispose = vi.fn(() => {
        if (failureMode === 'throw') {
          throw cleanupError
        }
        return Promise.reject(cleanupError)
      })
      ;(ssrResponse as any).dispose = dispose
      startMocks.serverFnResult = ssrResponse
      let notifyMiddlewareStarted!: () => void
      const middlewareStarted = new Promise<void>((resolve) => {
        notifyMiddlewareStarted = resolve
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(async ({ next }) => {
          await next()
          notifyMiddlewareStarted()
          return new Promise<Response>(() => {})
        }),
      ]
      onTestFinished(() => {
        consoleError.mockRestore()
      })
      onTestFinished(() => {
        router.serverSsr?.cleanup()
      })

      const handler = createStartHandler(() => new Response('unused'))
      const response = handler(
        new Request('http://localhost/_serverFn/test', {
          headers: { 'x-tsr-serverFn': 'true' },
          signal: requestController.signal,
        }),
        {},
      )

      await middlewareStarted
      requestController.abort(new Error('request disconnected'))

      expect((await response).status).toBe(500)
      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(cleanupError)
      })
      expect(dispose).toHaveBeenCalledOnce()
    },
  )

  it('disposes a stream when the request aborts after response handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let cancelCalls = 0
    const handler = createStartHandler(({ router: requestRouter }) =>
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

    requestController.abort(new Error('request disconnected'))
    await Promise.resolve()

    expect(cancelCalls).toBe(1)
    expect(router.serverSsr).toBeUndefined()
  })

  it('settles when request middleware ignores cancellation', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    let notifyMiddlewareStarted!: () => void
    const middlewareStarted = new Promise<void>((resolve) => {
      notifyMiddlewareStarted = resolve
    })
    const dispose = vi.fn(() => Promise.resolve())
    let releaseMiddleware!: (response: any) => void
    const middlewareResult = new Promise<any>((resolve) => {
      releaseMiddleware = resolve
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        notifyMiddlewareStarted()
        return middlewareResult
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)
    const response = handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    await middlewareStarted
    requestController.abort(new Error('request disconnected'))

    expect((await response).status).toBe(500)
    expect(render).not.toHaveBeenCalled()

    releaseMiddleware({
      response: new Response('late'),
      serverSsrCleanup: 'stream',
      dispose,
    })
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    expect(render).not.toHaveBeenCalled()
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
    const handler = createStartHandler(render)
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
    const handler = createStartHandler(render)
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
    startMocks.requestMiddleware = [
      createMiddleware().server(({ next }) => next()),
      createMiddleware().server(() => {
        requestController.abort(reason)
        throw new Response('must not escape', { status: 418 })
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    expect(render).not.toHaveBeenCalled()
  })

  it('preserves aborts that race with a fulfilled direct next promise', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const observedErrors: Array<unknown> = []
    const afterNext = vi.fn()
    const ssrResponse = makeStreamResponse(router)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const cancel = vi.spyOn(ssrResponse.response.body!, 'cancel')
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
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => expect(observedErrors).toEqual([reason]))
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(afterNext).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('disposes a tagged final response once when abort wins handoff', async () => {
    const router = makeRouter()
    startMocks.router = router
    const requestController = new AbortController()
    const reason = new Error('request disconnected')
    const ssrResponse = makeStreamResponse(router)
    const dispose = vi.spyOn(ssrResponse as any, 'dispose')
    const cancel = vi.spyOn(ssrResponse.response.body!, 'cancel')
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        queueMicrotask(() => {
          queueMicrotask(() => requestController.abort(reason))
        })
        return ssrResponse as any
      }),
    ]
    const render = vi.fn(() => new Response('must not render'))
    const handler = createStartHandler(render)

    const response = await handler(
      new Request('http://localhost/', {
        signal: requestController.signal,
      }),
      {},
    )

    expect(response.status).toBe(500)
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
    })
    expect(router.serverSsr).toBeUndefined()
    expect(render).not.toHaveBeenCalled()
  })

  it('ignores a late same-body alias after catch disposes its owner', async () => {
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
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream'))
        },
      }),
    )
    const cancel = vi.spyOn(response.body!, 'cancel')
    let ssrResponse!: ReturnType<typeof createSsrStreamResponse>
    const render = vi.fn(({ router: requestRouter }) => {
      ssrResponse = createSsrStreamResponse(requestRouter, response)
      return ssrResponse
    })
    const handler = createStartHandler(render)
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
      expect(dispose).toHaveBeenCalledOnce()
      expect(dispose).toHaveBeenCalledWith(reason)
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(reason)
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
