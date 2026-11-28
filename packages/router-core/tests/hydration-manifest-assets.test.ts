import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, getSsrBodyScriptParts } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { AnyRouter } from '../src'
import type { ManifestRoute } from '../src/manifest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function scriptAsset(id: string): ManifestRoute {
  return { scripts: [{ attrs: { id } }] }
}

/** Ids of the manifest scripts the client renders for its current matches. */
function renderedManifestScriptIds(router: AnyRouter) {
  return getSsrBodyScriptParts(
    router.state.matches,
    router.ssr?.manifest,
    undefined,
  )[1].map((tag) => tag.attrs?.id)
}

describe('hydrated manifest assets', () => {
  test('decodes the transported manifest route keys back to route ids', async () => {
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      const layoutRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        id: '_layout',
      })
      const groupRoute = new BaseRoute({
        getParentRoute: () => layoutRoute,
        id: '(marketing)',
      })
      const postRoute = new BaseRoute({
        getParentRoute: () => groupRoute,
        path: 'blog/$slug',
      })
      return {
        rootRoute,
        layoutRoute,
        groupRoute,
        postRoute,
        routeTree: rootRoute.addChildren([
          layoutRoute.addChildren([groupRoute.addChildren([postRoute])]),
        ]),
      }
    }
    const rootAssets: ManifestRoute = { preloads: ['/assets/root.js'] }
    const layoutAssets: ManifestRoute = { css: ['/assets/layout.css'] }
    const postAssets: ManifestRoute = {
      css: ['/assets/post.css'],
      preloads: ['/assets/post.js'],
    }

    const server = createRouteTree()
    const serverRouter = createTestRouter({
      routeTree: server.routeTree,
      history: createMemoryHistory({ initialEntries: ['/blog/hello'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter, {
      routes: {
        [server.rootRoute.id]: rootAssets,
        [server.layoutRoute.id]: layoutAssets,
        [server.postRoute.id]: postAssets,
      },
    })
    // The transported keys are not URL-like.
    const transportedKeys = Object.keys(bootstrap.router!.manifest!.routes)
    expect(transportedKeys).toHaveLength(3)
    for (const key of transportedKeys) {
      expect(key).not.toContain('/')
    }

    const client = createRouteTree()
    const clientRouter = createTestRouter({
      routeTree: client.routeTree,
      history: createMemoryHistory({ initialEntries: ['/blog/hello'] }),
      isServer: false,
    })
    vi.stubGlobal('window', { $_TSR: bootstrap })

    await hydrate(clientRouter)

    expect(clientRouter.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/_layout',
      '/_layout/(marketing)',
      '/_layout/(marketing)/blog/$slug',
    ])
    const routes = clientRouter.ssr!.manifest!.routes
    expect(routes).toEqual({
      [client.rootRoute.id]: rootAssets,
      [client.layoutRoute.id]: layoutAssets,
      [client.postRoute.id]: postAssets,
    })
    expect(routes[client.postRoute.id]).toEqual(postAssets)
  })

  test('runs the hydrate option after the manifest route keys are decoded', async () => {
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      const postRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/$postId',
      })
      return {
        postRoute,
        routeTree: rootRoute.addChildren([postRoute]),
      }
    }
    const postAssets: ManifestRoute = { preloads: ['/assets/post.js'] }

    const server = createRouteTree()
    const bootstrap = await dehydrateToBootstrap(
      createTestRouter({
        routeTree: server.routeTree,
        history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
        isServer: true,
      }),
      { routes: { [server.postRoute.id]: postAssets } },
    )

    const client = createRouteTree()
    const clientRouter = createTestRouter({
      routeTree: client.routeTree,
      history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
      isServer: false,
    })
    let seenByHydrateOption: ManifestRoute | undefined
    clientRouter.options.hydrate = () => {
      seenByHydrateOption =
        clientRouter.ssr?.manifest?.routes[client.postRoute.id]
    }
    vi.stubGlobal('window', { $_TSR: bootstrap })

    await hydrate(clientRouter)

    expect(seenByHydrateOption).toEqual(postAssets)
  })

  test('passes raw manifest route keys through and decodes a payload only once', async () => {
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      const postsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
      })
      return {
        rootRoute,
        postsRoute,
        routeTree: rootRoute.addChildren([postsRoute]),
      }
    }

    const server = createRouteTree()
    const bootstrap = await dehydrateToBootstrap(
      createTestRouter({
        routeTree: server.routeTree,
        history: createMemoryHistory({ initialEntries: ['/posts'] }),
        isServer: true,
      }),
      {
        routes: {
          [server.rootRoute.id]: scriptAsset('root-asset'),
          [server.postsRoute.id]: scriptAsset('posts-asset'),
        },
      },
    )
    const transportedRoutes = bootstrap.router!.manifest!.routes
    const rootAssets = transportedRoutes.__root__!
    const postsAssets = transportedRoutes['#posts']!
    expect(postsAssets).toEqual(scriptAsset('posts-asset'))
    // A payload built by hand with a raw route id.
    const rawAssets = scriptAsset('raw-asset')
    transportedRoutes['/raw/route'] = rawAssets
    vi.stubGlobal('window', { $_TSR: bootstrap })

    const hydrateClient = async () => {
      const client = createRouteTree()
      const clientRouter = createTestRouter({
        routeTree: client.routeTree,
        history: createMemoryHistory({ initialEntries: ['/posts'] }),
        isServer: false,
      })
      await hydrate(clientRouter)
      expect(renderedManifestScriptIds(clientRouter)).toEqual([
        'root-asset',
        'posts-asset',
      ])
      return clientRouter.ssr!.manifest!.routes
    }

    // Hydrating the same payload again sees already-decoded keys.
    for (const routes of [await hydrateClient(), await hydrateClient()]) {
      expect(Object.keys(routes).sort()).toEqual(
        ['/posts', '/raw/route', '__root__'].sort(),
      )
      expect(routes.__root__).toBe(rootAssets)
      expect(routes['/posts']).toBe(postsAssets)
      expect(routes['/raw/route']).toBe(rawAssets)
    }
  })

  test('hydrates a payload without a manifest', async () => {
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      return rootRoute.addChildren([
        new BaseRoute({ getParentRoute: () => rootRoute, path: '/' }),
      ])
    }
    const bootstrap = await dehydrateToBootstrap(
      createTestRouter({
        routeTree: createRouteTree(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      }),
      undefined,
    )
    expect(bootstrap.router!.manifest).toBeUndefined()

    const clientRouter = createTestRouter({
      routeTree: createRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
    })
    vi.stubGlobal('window', { $_TSR: bootstrap })

    await hydrate(clientRouter)

    expect(clientRouter.ssr).toEqual({ manifest: undefined })
    expect(clientRouter.state.matches.map((match) => match.status)).toEqual([
      'success',
      'success',
    ])
  })

  test('applies assets of matches below a data-only boundary', async () => {
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      const reportRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/report',
        ssr: 'data-only',
        loader: () => 'report',
      })
      const detailsRoute = new BaseRoute({
        getParentRoute: () => reportRoute,
        path: '/details',
        loader: () => 'details',
      })
      return {
        rootRoute,
        reportRoute,
        detailsRoute,
        routeTree: rootRoute.addChildren([
          reportRoute.addChildren([detailsRoute]),
        ]),
      }
    }

    const server = createRouteTree()
    const serverRouter = createTestRouter({
      routeTree: server.routeTree,
      history: createMemoryHistory({ initialEntries: ['/report/details'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter, {
      routes: {
        [server.rootRoute.id]: scriptAsset('root-asset'),
        [server.reportRoute.id]: scriptAsset('report-asset'),
        [server.detailsRoute.id]: scriptAsset('details-asset'),
      },
    })

    const client = createRouteTree()
    const clientRouter = createTestRouter({
      routeTree: client.routeTree,
      history: createMemoryHistory({ initialEntries: ['/report/details'] }),
      isServer: false,
    })
    vi.stubGlobal('window', { $_TSR: bootstrap })

    await hydrate(clientRouter)

    expect(clientRouter.state.matches.map((match) => match.status)).toEqual([
      'success',
      'pending',
      'success',
    ])
    expect(renderedManifestScriptIds(clientRouter)).toEqual([
      'root-asset',
      'report-asset',
      'details-asset',
    ])
  })

  test('keeps root assets when a longer server lane is rejected', async () => {
    const serverRootRoute = new BaseRootRoute({})
    const serverParentRoute = new BaseRoute({
      getParentRoute: () => serverRootRoute,
      path: '/parent',
      loader: () => 'server data',
    })
    const serverIndexRoute = new BaseRoute({
      getParentRoute: () => serverParentRoute,
      path: '/',
    })
    const serverRouter = createTestRouter({
      routeTree: serverRootRoute.addChildren([
        serverParentRoute.addChildren([serverIndexRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
      isServer: true,
    })
    const bootstrap = await dehydrateToBootstrap(serverRouter, {
      routes: {
        [serverRootRoute.id]: scriptAsset('root-asset'),
        [serverParentRoute.id]: scriptAsset('parent-asset'),
        [serverIndexRoute.id]: scriptAsset('index-asset'),
      },
    })
    expect(bootstrap.router?.matches).toHaveLength(3)

    // The client lane has no index child, so no server work is attached.
    const clientRootRoute = new BaseRootRoute({})
    const clientParentRoute = new BaseRoute({
      getParentRoute: () => clientRootRoute,
      path: '/parent',
      loader: () => 'client data',
    })
    const clientRouter = createTestRouter({
      routeTree: clientRootRoute.addChildren([clientParentRoute]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
      isServer: false,
    })
    vi.stubGlobal('window', { $_TSR: bootstrap })

    await hydrate(clientRouter)

    expect(clientRouter.state.matches.map((match) => match.status)).toEqual([
      'pending',
      'pending',
    ])
    expect(renderedManifestScriptIds(clientRouter)).toEqual(['root-asset'])
  })

  test.each([
    { mode: 'a full render', isShell: false },
    { mode: 'a shell render', isShell: true },
  ])(
    'delivers request-scoped assets through the root route in $mode',
    async ({ isShell }) => {
      const createRouteTree = () => {
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
        })
        return {
          rootRoute,
          pageRoute,
          routeTree: rootRoute.addChildren([pageRoute]),
        }
      }

      const server = createRouteTree()
      const serverRouter = createTestRouter({
        routeTree: server.routeTree,
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: true,
        isShell,
      })
      const bootstrap = await dehydrateToBootstrap(
        serverRouter,
        {
          routes: {
            [server.rootRoute.id]: {
              preloads: ['/assets/root.js'],
              ...scriptAsset('root-asset'),
            },
            [server.pageRoute.id]: scriptAsset('page-asset'),
          },
        },
        {
          preloads: ['/assets/request.js'],
          scripts: [{ attrs: { id: 'request-asset' } }],
        },
      )

      const client = createRouteTree()
      const clientRouter = createTestRouter({
        routeTree: client.routeTree,
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      vi.stubGlobal('window', { $_TSR: bootstrap })

      await hydrate(clientRouter)

      expect(renderedManifestScriptIds(clientRouter)).toEqual(
        isShell
          ? ['request-asset', 'root-asset']
          : ['request-asset', 'root-asset', 'page-asset'],
      )
      // Read the way the head renderers look up a matched route's assets.
      expect(
        clientRouter.ssr?.manifest?.routes[client.rootRoute.id]?.preloads,
      ).toEqual(['/assets/request.js', '/assets/root.js'])
    },
  )
})
