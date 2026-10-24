import { createMemoryHistory, createServerHistory } from '@tanstack/history'
import { expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createRequestHandler } from '../src/ssr/server'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test.each([
  { basepath: '', origin: undefined },
  { basepath: '/app', origin: undefined },
  { basepath: '/app', origin: 'https://canonical.example' },
])(
  'request handling rewrites once with basepath $basepath and origin $origin',
  async ({ basepath, origin }) => {
    const root = new BaseRootRoute()
    const input = vi.fn(({ url }: { url: URL }) => {
      url.pathname = url.pathname.replace('/public/', '/posts/')
      return url
    })
    const router = createTestRouter({
      isServer: true,
      basepath,
      origin,
      rewrite: {
        input,
        output: ({ url }) => {
          url.pathname = url.pathname.replace('/posts/', '/public/')
          return url
        },
      },
      routeTree: root.addChildren([
        new BaseRoute({
          getParentRoute: () => root,
          path: '/posts/$postId',
          loader: ({ params }) => params.postId,
        }),
      ]),
    })
    input.mockClear()

    const response = await createRequestHandler({
      createRouter: () => router,
      request: new Request(
        `https://example.com${basepath}/public/caf%C3%A9?view=full`,
      ),
    })(({ router: loadedRouter }) => {
      return Response.json({
        postId: loadedRouter.state.matches.at(-1)?.loaderData,
        pathname: loadedRouter.state.location.pathname,
        search: loadedRouter.state.location.search,
      })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      postId: 'café',
      pathname: '/posts/café',
      search: { view: 'full' },
    })
    expect(input).toHaveBeenCalledTimes(1)
    expect(input.mock.calls[0]?.[0].url.origin).toBe(
      origin ?? 'https://example.com',
    )
  },
)

test.each([
  { isServer: false, action: 'push' },
  { isServer: false, action: 'replace' },
  { isServer: true, action: 'push' },
  { isServer: true, action: 'replace' },
] as const)(
  'loads refresh memory history after $action with isServer=$isServer by default',
  async ({ isServer, action }) => {
    const root = new BaseRootRoute()
    const targetLoader = vi.fn(() => 'target')
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      isServer,
      history,
      routeTree: root.addChildren([
        new BaseRoute({ getParentRoute: () => root, path: '/' }),
        new BaseRoute({
          getParentRoute: () => root,
          path: '/target',
          loader: targetLoader,
        }),
      ]),
    })
    await router.load()

    history[action]('/target')
    await router.load()

    expect(router.state.location.pathname).toBe('/target')
    expect(targetLoader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.loaderData).toBe('target')
  },
)

test('server loads reuse a location prepared with updated router options', async () => {
  const root = new BaseRootRoute()
  const input = vi.fn(({ url }: { url: URL }) => {
    url.pathname = url.pathname.replace('/public', '/target')
    return url
  })
  const router = createTestRouter({
    isServer: true,
    basepath: '/old',
    history: createMemoryHistory({ initialEntries: ['/old/'] }),
    routeTree: root.addChildren([
      new BaseRoute({ getParentRoute: () => root, path: '/' }),
      new BaseRoute({
        getParentRoute: () => root,
        path: '/target',
        loader: () => 'target',
      }),
    ]),
  })
  router.update({
    history: createServerHistory('/app/public'),
    basepath: '/app',
    rewrite: {
      input,
      output: ({ url }) => {
        url.pathname = url.pathname.replace('/target', '/public')
        return url
      },
    },
  })
  input.mockClear()

  await router.load({ _skipLocationUpdate: true })

  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.location.publicHref).toBe('/app/public')
  expect(router.state.matches.at(-1)?.loaderData).toBe('target')
  expect(input).not.toHaveBeenCalled()
})

test.each([false, true])(
  'router navigation respects isServer=%s with memory history',
  async (isServer) => {
    const root = new BaseRootRoute()
    const targetLoader = vi.fn(() => 'target')
    const router = createTestRouter({
      isServer,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: root.addChildren([
        new BaseRoute({ getParentRoute: () => root, path: '/' }),
        new BaseRoute({
          getParentRoute: () => root,
          path: '/target',
          loader: targetLoader,
        }),
      ]),
    })
    await router.load()
    const load = vi.spyOn(router, 'load')

    await router.navigate({ to: '/target' })
    expect(router.history.length).toBe(isServer ? 1 : 2)
    expect(router.state.location.pathname).toBe(isServer ? '/' : '/target')
    await router.navigate({ to: '/', replace: true })
    expect(router.history.length).toBe(isServer ? 1 : 2)
    expect(router.history.location.pathname).toBe('/')
    expect(targetLoader).toHaveBeenCalledTimes(isServer ? 0 : 1)
    expect(load).toHaveBeenCalledTimes(isServer ? 0 : 2)
  },
)

test('server navigation entry points resolve without building or loading', async () => {
  const router = createTestRouter({
    isServer: true,
    history: createServerHistory('/'),
    routeTree: new BaseRootRoute(),
  })
  const location = router.buildLocation({ to: '/' })
  const build = vi.spyOn(router, 'buildLocation')
  const load = vi.spyOn(router, 'load')
  await router.navigate({ to: '/' })
  await router.navigate({ href: 'https://example.com', reloadDocument: true })
  await router.navigate({ to: '/', reloadDocument: true, replace: true })
  await router.buildAndCommitLocation({ to: '/' })
  await router.commitLocation(location)

  expect(build).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
  expect(router._pendingLocation).toBeUndefined()
  expect(router._commitPromise).toBeUndefined()
})

test.each(['beforeLoad', 'loader'] as const)(
  'navigation during %s leaves the request load intact',
  async (hook) => {
    const targetLoader = vi.fn()
    const root = new BaseRootRoute()
    const router = createTestRouter({
      isServer: true,
      routeTree: root.addChildren([
        new BaseRoute({
          getParentRoute: () => root,
          path: '/',
          [hook]: async ({
            navigate,
          }: {
            navigate: (opts: { to: string }) => Promise<void>
          }) => {
            await navigate({ to: '/target' })
            return { value: 'request data' }
          },
        }),
        new BaseRoute({
          getParentRoute: () => root,
          path: '/target',
          loader: targetLoader,
        }),
      ]),
    })
    const load = vi.spyOn(router, 'load')
    const response = await loadServerResponse(router, '/')

    expect(response.status).toBe(200)
    expect(load).toHaveBeenCalledTimes(1)
    expect(targetLoader).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/')
    expect(router.history.location.pathname).toBe('/')
    expect(router.state.matches.at(-1)?.status).toBe('success')
    router.history.push('/target')
    expect(router.history.location.pathname).toBe('/')
  },
)

test('server redirects still produce HTTP redirect responses', async () => {
  const router = createTestRouter({
    isServer: true,
    routeTree: new BaseRootRoute({
      beforeLoad: () => {
        throw redirect({ href: '/login', statusCode: 307 })
      },
    }),
  })
  const response = await loadServerResponse(router, '/')
  expect(response.status).toBe(307)
  expect(response.headers.get('Location')).toBe('/login')
  expect(router.history.location.pathname).toBe('/')
})
