import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import {
  createScopedRedirect,
  getRouteModuleId,
  getRouteNavigationScope,
  getScopedRouterView,
  mountRouteModule,
  resolveRouteId,
} from '../src/route-module-internal'
import { createTestRouter, loadServerResponse } from './routerTestUtils'
import type { AnyRoute } from '../src'

function createModuleRoot(moduleId: string, options: object = {}) {
  return new BaseRoute({ ...options, _module: moduleId } as any) as AnyRoute
}

/**
 * root
 * ├── /                    (app index)
 * └── /shop                (app layout)
 *     └── @acme/products   (module root, mounted at /products)
 *         ├── /            (module index)
 *         ├── /$productId
 *         └── /_layout     (pathless)
 *             └── /reviews
 */
function setup(initialEntry = '/', routerOptions: object = {}) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const shopRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/shop',
  })

  const productsRoot = createModuleRoot('@acme/products')
  const productsIndex = new BaseRoute({
    getParentRoute: () => productsRoot,
    path: '/',
  })
  const productRoute = new BaseRoute({
    getParentRoute: () => productsRoot,
    path: '/$productId',
  })
  const layoutRoute = new BaseRoute({
    getParentRoute: () => productsRoot,
    id: '/_layout',
  })
  const reviewsRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/reviews',
  })
  productsRoot.addChildren([
    productsIndex,
    productRoute,
    layoutRoute.addChildren([reviewsRoute]),
  ])

  mountRouteModule(productsRoot, {
    parent: () => shopRoute as AnyRoute,
    at: '/products',
  } as any)

  const routeTree = rootRoute.addChildren([
    indexRoute,
    shopRoute.addChildren([productsRoot]),
  ])
  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    ...routerOptions,
  })
  return { router, productsRoot, productRoute, reviewsRoute }
}

describe('route module ids and paths', () => {
  test('module routes get qualified ids and mounted full paths', () => {
    const { router } = setup()

    expect(
      Object.fromEntries(
        Object.values(router.routesById).map((route: AnyRoute) => [
          route.id,
          route.fullPath,
        ]),
      ),
    ).toEqual({
      __root__: '/',
      '/': '/',
      '/shop': '/shop',
      '@acme/products:': '/shop/products',
      '@acme/products:/': '/shop/products/',
      '@acme/products:/$productId': '/shop/products/$productId',
      '@acme/products:/_layout': '/shop/products',
      '@acme/products:/_layout/reviews': '/shop/products/reviews',
    })
  })

  test('mounted module routes match by their final paths', () => {
    const { router } = setup()

    expect(
      router.matchRoutes('/shop/products/42').map((match) => match.routeId),
    ).toEqual([
      '__root__',
      '/shop',
      '@acme/products:',
      '@acme/products:/$productId',
    ])
    expect(
      router.matchRoutes('/shop/products').map((match) => match.routeId),
    ).toEqual(['__root__', '/shop', '@acme/products:', '@acme/products:/'])
  })

  test('a module mounted without a path adds no path segment', () => {
    const rootRoute = new BaseRootRoute({})
    const moduleRoot = createModuleRoot('account')
    const settingsRoute = new BaseRoute({
      getParentRoute: () => moduleRoot,
      path: '/settings',
    })
    moduleRoot.addChildren([settingsRoute])
    mountRouteModule(moduleRoot, { parent: () => rootRoute } as any)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([moduleRoot]),
      history: createMemoryHistory(),
    })

    expect(router.routesById['account:']!.fullPath).toBe('/')
    expect(router.routesById['account:/settings']!.fullPath).toBe('/settings')
    expect(
      router.matchRoutes('/settings').map((match) => match.routeId),
    ).toEqual(['__root__', 'account:', 'account:/settings'])
  })

  test('nested modules keep their own qualified ids', () => {
    const rootRoute = new BaseRootRoute({})
    const storefrontRoot = createModuleRoot('@acme/storefront')
    const cartRoute = new BaseRoute({
      getParentRoute: () => storefrontRoot,
      path: '/cart',
    })
    const productsRoot = createModuleRoot('@acme/products')
    const productRoute = new BaseRoute({
      getParentRoute: () => productsRoot,
      path: '/$productId',
    })
    productsRoot.addChildren([productRoute])
    mountRouteModule(productsRoot, {
      parent: () => storefrontRoot,
      at: '/products',
    } as any)
    storefrontRoot.addChildren([cartRoute, productsRoot])
    mountRouteModule(storefrontRoot, {
      parent: () => rootRoute,
      at: '/shop',
    } as any)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([storefrontRoot]),
      history: createMemoryHistory(),
    })

    expect(router.routesById['@acme/storefront:/cart']!.fullPath).toBe(
      '/shop/cart',
    )
    expect(router.routesById['@acme/products:/$productId']!.fullPath).toBe(
      '/shop/products/$productId',
    )
  })

  test('mountRouteModule rejects a route that is not a module root', () => {
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/x',
    })
    expect(() =>
      mountRouteModule(route as AnyRoute, { parent: () => rootRoute } as any),
    ).toThrow(/createModuleRoot/)
  })
})

describe('getRouteModuleId', () => {
  const cases = [
    ['@acme/products:/$productId', '@acme/products'],
    ['@acme/products:', '@acme/products'],
    ['account:/settings', 'account'],
    ['/posts', undefined],
    ['/a:b', undefined],
    [':/x', undefined],
    ['__root__', undefined],
    ['404', undefined],
  ] as const

  test.each(cases)('%s -> %s', (routeId, moduleId) => {
    expect(getRouteModuleId(routeId)).toBe(moduleId)
  })

  test.each(cases)(
    'getRouteNavigationScope agrees for %s',
    (routeId, moduleId) => {
      expect(getRouteNavigationScope(routeId, '/full')).toEqual(
        moduleId === undefined
          ? { from: '/full' }
          : { _module: moduleId, _fromRoute: routeId },
      )
    },
  )
})

describe('application route ids', () => {
  // Application ids always start with `/`, even when a custom id or a path
  // contains `:`, so route-bound APIs never treat them as module routes.
  test('ids with ":" stay application routes', () => {
    const rootRoute = new BaseRootRoute({})
    const customIdRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: 'foo:bar',
    })
    const downloadRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: 'files/{$id}:download',
    })
    createTestRouter({
      routeTree: rootRoute.addChildren([customIdRoute, downloadRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    expect(customIdRoute.id).toBe('/foo:bar')
    expect(downloadRoute.id).toBe('/files/{$id}:download')
    for (const route of [customIdRoute, downloadRoute]) {
      const { options } = route.redirect({ to: './x' } as any) as any
      expect(options.from).toBe(route.fullPath)
      expect(options._module).toBeUndefined()
    }
  })
})

describe('module-local navigation', () => {
  test('absolute destinations resolve inside the module', () => {
    const { router } = setup()

    expect(
      router.buildLocation({
        _module: '@acme/products',
        to: '/$productId',
        params: { productId: '42' },
      } as any).pathname,
    ).toBe('/shop/products/42')
    expect(
      router.buildLocation({ _module: '@acme/products', to: '/' } as any)
        .pathname,
    ).toBe('/shop/products')
    expect(
      router.buildLocation({
        _module: '@acme/products',
        to: '/reviews',
      } as any).pathname,
    ).toBe('/shop/products/reviews')
  })

  test('application destinations are unchanged', () => {
    const { router } = setup()

    expect(router.buildLocation({ to: '/shop' } as any).pathname).toBe('/shop')
  })

  test('a module-local from resolves relative destinations', () => {
    const { router } = setup('/shop/products/42')

    expect(
      router.buildLocation({
        _module: '@acme/products',
        from: '/$productId',
        to: '..',
      } as any).pathname,
    ).toBe('/shop/products')
  })

  test('_fromRoute resolves from the route full path unless from is given', () => {
    const { router } = setup('/shop/products/42')

    expect(
      router.buildLocation({
        _module: '@acme/products',
        _fromRoute: '@acme/products:/$productId',
        to: './',
        params: { productId: '7' },
      } as any).pathname,
    ).toBe('/shop/products/7')
    expect(
      router.buildLocation({
        _module: '@acme/products',
        _fromRoute: '@acme/products:/$productId',
        from: '/reviews',
        to: '..',
      } as any).pathname,
    ).toBe('/shop/products')
  })

  test('masks are module-local too', () => {
    const { router } = setup()

    const location = router.buildLocation({
      _module: '@acme/products',
      to: '/$productId',
      params: { productId: '42' },
      mask: { to: '/' },
    } as any)
    expect(location.pathname).toBe('/shop/products/42')
    expect(location.maskedLocation?.pathname).toBe('/shop/products')
  })

  test('navigating to a module that is not installed fails', () => {
    const { router } = setup()

    expect(() =>
      router.buildLocation({ _module: '@acme/unknown', to: '/' } as any),
    ).toThrow(/@acme\/unknown/)
  })

  test('the scoped router view navigates in module coordinates', async () => {
    const { router } = setup()
    await router.load()
    const view = getScopedRouterView<typeof router>(router, '@acme/products')

    expect(getScopedRouterView(router, '@acme/products')).toBe(view)
    expect(view.state.location.pathname).toBe('/')

    await view.navigate({
      to: '/$productId',
      params: { productId: '3' },
    } as any)
    expect(router.state.location.pathname).toBe('/shop/products/3')
    expect(view.buildLocation({ to: '/' } as any).pathname).toBe(
      '/shop/products',
    )
  })
})

describe('module-local redirects', () => {
  test('the scoped redirect resolves inside the module', async () => {
    const { router, reviewsRoute } = setup('/shop/products/reviews')
    const redirect = createScopedRedirect('@acme/products')
    reviewsRoute.update({
      beforeLoad: () => {
        throw redirect({ to: '/$productId', params: { productId: '9' } } as any)
      },
    } as any)

    await router.load()
    expect(router.state.location.pathname).toBe('/shop/products/9')
  })

  test('Route.redirect resolves absolute and relative destinations', async () => {
    const { router, productRoute, reviewsRoute } = setup(
      '/shop/products/reviews',
    )
    reviewsRoute.update({
      beforeLoad: () => {
        throw reviewsRoute.redirect({ to: '/' } as any)
      },
    } as any)
    await router.load()
    expect(router.state.location.pathname).toBe('/shop/products')

    productRoute.update({
      beforeLoad: ({ params }: any) => {
        if (params.productId === 'old') {
          throw productRoute.redirect({
            to: '.',
            params: { productId: 'new' },
          } as any)
        }
      },
    } as any)
    await router.navigate({ to: '/shop/products/old' } as any)
    expect(router.state.location.pathname).toBe('/shop/products/new')
  })
})

describe('module navigation paths', () => {
  test('the scoped view preloads module routes', async () => {
    const { router } = setup()
    await router.load()
    const view = getScopedRouterView<typeof router>(router, '@acme/products')

    const matches = await view.preloadRoute({
      to: '/$productId',
      params: { productId: '9' },
    } as any)
    expect(matches?.map((match) => match.routeId).at(-1)).toBe(
      '@acme/products:/$productId',
    )
    expect(matches?.at(-1)?.params).toEqual({ productId: '9' })
  })

  test('matchRoute of the scoped view takes module-local paths', async () => {
    const { router } = setup('/shop/products/3')
    await router.load()
    const view = getScopedRouterView<typeof router>(router, '@acme/products')

    expect(view.matchRoute({ to: '/$productId' } as any)).toEqual({
      productId: '3',
    })
    expect(router.matchRoute({ to: '/$productId' } as any)).toBe(false)
  })

  test('a scoped redirect resolves to the final path without changing it', () => {
    const { router } = setup()
    const thrown = createScopedRedirect<typeof router>('@acme/products')({
      to: '/$productId',
      params: { productId: '9' },
    } as any)

    const resolved = router.resolveRedirect(thrown)
    expect(resolved.options.href).toBe('/shop/products/9')
    expect(thrown.options.to).toBe('/$productId')
  })

  test('route masks apply to module destinations', () => {
    const { router } = setup('/', {
      routeMasks: [{ from: '/shop/products/$productId', to: '/shop' }],
    })

    const location = router.buildLocation({
      _module: '@acme/products',
      to: '/$productId',
      params: { productId: '42' },
    } as any)
    expect(location.pathname).toBe('/shop/products/42')
    expect(location.maskedLocation?.pathname).toBe('/shop')
  })

  test('routers in one process navigate to their own mount of a module', () => {
    const { router } = setup()
    const rootRoute = new BaseRootRoute({})
    const productsRoot = createModuleRoot('@acme/products')
    productsRoot.addChildren([
      new BaseRoute({
        getParentRoute: () => productsRoot,
        path: '/$productId',
      }),
    ])
    mountRouteModule(productsRoot, {
      parent: () => rootRoute as AnyRoute,
      at: '/catalog',
    } as any)
    const other = createTestRouter({
      routeTree: rootRoute.addChildren([productsRoot]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const build = (target: typeof router | typeof other) =>
      target.buildLocation({
        _module: '@acme/products',
        to: '/$productId',
        params: { productId: '42' },
      } as any).pathname
    expect(build(router)).toBe('/shop/products/42')
    expect(build(other)).toBe('/catalog/42')
  })
})

/**
 * root
 * ├── /
 * └── /orgs/$orgId
 *     └── @acme/settings   (module root, mounted at /settings)
 *         ├── /
 *         ├── /profile
 *         └── /members/$memberId
 */
function setupUnderParams(initialEntry = '/') {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const orgRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/orgs/$orgId',
  })
  const settingsRoot = createModuleRoot('@acme/settings')
  settingsRoot.addChildren([
    new BaseRoute({ getParentRoute: () => settingsRoot, path: '/' }),
    new BaseRoute({ getParentRoute: () => settingsRoot, path: '/profile' }),
    new BaseRoute({
      getParentRoute: () => settingsRoot,
      path: '/members/$memberId',
    }),
  ])
  mountRouteModule(settingsRoot, {
    parent: () => orgRoute as AnyRoute,
    at: '/settings',
  } as any)
  const routeTree = rootRoute.addChildren([
    indexRoute,
    orgRoute.addChildren([settingsRoot]),
  ])
  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return { router }
}

describe('a module mounted under path params', () => {
  test('module routes match with the host params', () => {
    const { router } = setupUnderParams()

    const matches = router.matchRoutes('/orgs/7/settings/members/3', {})
    const leaf = matches[matches.length - 1]!
    expect(leaf.routeId).toBe('@acme/settings:/members/$memberId')
    expect(leaf.params).toEqual({ orgId: '7', memberId: '3' })
  })

  test('module-local destinations keep the host params of the location', async () => {
    const { router } = setupUnderParams('/orgs/7/settings')
    await router.load()

    expect(
      router.buildLocation({ _module: '@acme/settings', to: '/profile' } as any)
        .pathname,
    ).toBe('/orgs/7/settings/profile')
    expect(
      router.buildLocation({
        _module: '@acme/settings',
        to: '/members/$memberId',
        params: { memberId: '3' },
      } as any).pathname,
    ).toBe('/orgs/7/settings/members/3')
  })

  test('destinations from outside the installation pass the host params', async () => {
    const { router } = setupUnderParams('/')
    await router.load()

    expect(
      router.buildLocation({
        _module: '@acme/settings',
        to: '/members/$memberId',
        params: { orgId: '9', memberId: '3' },
      } as any).pathname,
    ).toBe('/orgs/9/settings/members/3')
  })
})

/**
 * root
 * ├── /orgs/$orgId
 * │   ├── @acme/settings#orgSettings   (mounted at /settings)
 * │   └── @acme/billing                (mounted at /billing, uses orgSettings)
 * └── /users/$userId
 *     └── @acme/settings#userSettings  (mounted at /settings)
 *
 * @acme/settings: /, /profile, /members/$memberId
 */
function setupInstallations(
  initialEntry = '/',
  settingsOptions: {
    members?: object
    root?: object
  } = {},
  routerOptions: object = {},
) {
  const rootRoute = new BaseRootRoute({})
  const orgRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/orgs/$orgId',
  })
  const userRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$userId',
  })

  const settingsRoot = createModuleRoot('@acme/settings', settingsOptions.root)
  const settingsIndex = new BaseRoute({
    getParentRoute: () => settingsRoot,
    path: '/',
  })
  const profileRoute = new BaseRoute({
    getParentRoute: () => settingsRoot,
    path: '/profile',
    loader: () => 'profile',
  })
  const membersRoute = new BaseRoute({
    getParentRoute: () => settingsRoot,
    path: '/members/$memberId',
    ...settingsOptions.members,
  })
  settingsRoot.addChildren([settingsIndex, profileRoute, membersRoute])

  const billingRoot = createModuleRoot('@acme/billing')
  billingRoot.addChildren([
    new BaseRoute({ getParentRoute: () => billingRoot, path: '/' }),
  ])

  const orgSettings = mountRouteModule(settingsRoot, {
    parent: () => orgRoute as AnyRoute,
    at: '/settings',
    as: 'orgSettings',
  } as any)
  const userSettings = mountRouteModule(settingsRoot, {
    parent: () => userRoute as AnyRoute,
    at: '/settings',
    as: 'userSettings',
  } as any)
  mountRouteModule(billingRoot, {
    parent: () => orgRoute as AnyRoute,
    at: '/billing',
    uses: { '@acme/settings': '@acme/settings#orgSettings' },
  } as any)

  const routeTree = rootRoute.addChildren([
    orgRoute.addChildren([orgSettings, billingRoot]),
    userRoute.addChildren([userSettings]),
  ])
  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    ...routerOptions,
  })
  return { router, settingsRoot, profileRoute, membersRoute }
}

describe('a module installed several times', () => {
  test('each installation has its own routes', () => {
    const { router } = setupInstallations()

    expect(
      Object.fromEntries(
        Object.values(router.routesById)
          .filter((route: AnyRoute) => route.id.startsWith('@acme/settings'))
          .map((route: AnyRoute) => [route.id, route.fullPath]),
      ),
    ).toEqual({
      '@acme/settings#orgSettings:': '/orgs/$orgId/settings',
      '@acme/settings#orgSettings:/': '/orgs/$orgId/settings/',
      '@acme/settings#orgSettings:/profile': '/orgs/$orgId/settings/profile',
      '@acme/settings#orgSettings:/members/$memberId':
        '/orgs/$orgId/settings/members/$memberId',
      '@acme/settings#userSettings:': '/users/$userId/settings',
      '@acme/settings#userSettings:/': '/users/$userId/settings/',
      '@acme/settings#userSettings:/profile': '/users/$userId/settings/profile',
      '@acme/settings#userSettings:/members/$memberId':
        '/users/$userId/settings/members/$memberId',
    })
    expect(
      router.matchRoutes('/users/u1/settings/profile').map((m) => m.routeId),
    ).toEqual([
      '__root__',
      '/users/$userId',
      '@acme/settings#userSettings:',
      '@acme/settings#userSettings:/profile',
    ])
  })

  test("the module's routes stay templates with module-local ids and paths", () => {
    const { router, settingsRoot, profileRoute } = setupInstallations()

    expect([settingsRoot.id, settingsRoot.fullPath]).toEqual([
      '@acme/settings:',
      '/',
    ])
    expect([profileRoute.id, profileRoute.fullPath]).toEqual([
      '@acme/settings:/profile',
      '/profile',
    ])
    const copy = router.routesById['@acme/settings#orgSettings:/profile']
    expect(copy).not.toBe(profileRoute)
    expect(copy!.options.loader).toBe(profileRoute.options.loader)
    expect(router.routesById['@acme/settings:/profile']).toBeUndefined()
  })

  test('module ids resolve to the installation of the nearest match', () => {
    const { router } = setupInstallations()

    expect(
      resolveRouteId!(
        router,
        '@acme/settings:/profile',
        '@acme/settings#userSettings:/',
      ),
    ).toBe('@acme/settings#userSettings:/profile')
    expect(
      resolveRouteId!(router, '@acme/settings:/profile', '@acme/billing:/'),
    ).toBe('@acme/settings#orgSettings:/profile')
    expect(
      resolveRouteId!(router, '@acme/settings:/profile', '/orgs/$orgId'),
    ).toBe('@acme/settings:/profile')
    expect(resolveRouteId!(router, '/orgs/$orgId', '@acme/billing:/')).toBe(
      '/orgs/$orgId',
    )
  })

  test('module-local destinations stay in the installation of the caller', async () => {
    const { router } = setupInstallations('/users/u1/settings/profile')
    await router.load()

    const build = (options: object) =>
      router.buildLocation({ _module: '@acme/settings', ...options } as any)
        .pathname
    expect(
      build({ to: '/profile', _nearestRoute: '@acme/settings#userSettings:/' }),
    ).toBe('/users/u1/settings/profile')
    // Route-bound APIs resolve from their route in the caller's installation.
    expect(
      build({
        to: '.',
        params: { memberId: '4' },
        _fromRoute: '@acme/settings:/members/$memberId',
        _nearestRoute: '@acme/settings#userSettings:/members/$memberId',
      }),
    ).toBe('/users/u1/settings/members/4')
  })

  test('a module that uses the module links to the installation it uses', async () => {
    const { router } = setupInstallations('/orgs/7/billing')
    await router.load()

    expect(
      router.buildLocation({
        _module: '@acme/settings',
        to: '/profile',
        _nearestRoute: '@acme/billing:/',
      } as any).pathname,
    ).toBe('/orgs/7/settings/profile')
  })

  test('code outside the module addresses one installation', async () => {
    const { router } = setupInstallations('/')
    await router.load()

    expect(
      router.buildLocation({
        _module: '@acme/settings#userSettings',
        to: '/profile',
        params: { userId: 'u2' },
      } as any).pathname,
    ).toBe('/users/u2/settings/profile')
    expect(() =>
      router.buildLocation({
        _module: '@acme/settings',
        to: '/profile',
      } as any),
    ).toThrow('installed several times')
  })

  test('redirects resolve in the installation of the route that threw', async () => {
    const redirect = createScopedRedirect('@acme/settings')
    const { router } = setupInstallations('/users/u1/settings/members/3', {
      members: {
        beforeLoad: () => {
          throw redirect({ to: '/profile' } as any)
        },
      },
    })

    await router.load()
    expect(router.state.location.pathname).toBe('/users/u1/settings/profile')

    await router.navigate({ to: '/orgs/7/settings/members/3' } as any)
    expect(router.state.location.pathname).toBe('/orgs/7/settings/profile')
  })

  test('not-found errors target the installation of the route that threw', async () => {
    const { router } = setupInstallations('/orgs/7/settings/members/3', {
      root: { notFoundComponent: () => null },
      members: {
        loader: () => {
          throw notFound({ routeId: '@acme/settings:' as never })
        },
      },
    })

    await router.load()
    expect(
      router.state.matches.find((match) => match.status === 'notFound')
        ?.routeId,
    ).toBe('@acme/settings#orgSettings:')
  })

  test('not-found errors with an application route id ignore installations', async () => {
    const { router } = setupInstallations('/users/u1/settings/members/3', {
      members: {
        loader: () => {
          throw notFound({ routeId: '/users/$userId' as never })
        },
      },
    })

    await router.load()
    expect(
      router.state.matches.find((match) => match.status === 'notFound')
        ?.routeId,
    ).toBe('/users/$userId')
  })

  test.each([
    ['/users/u1/settings/members/3', '/users/u1/settings/profile'],
    ['/orgs/7/settings/members/3', '/orgs/7/settings/profile'],
  ])(
    'server redirects from %s resolve in its installation',
    async (path, location) => {
      const redirect = createScopedRedirect('@acme/settings')
      const { router } = setupInstallations(
        '/',
        {
          members: {
            loader: () => {
              throw redirect({ to: '/profile' } as any)
            },
          },
        },
        { isServer: true },
      )

      const response = await loadServerResponse(router, path)
      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe(location)
    },
  )

  test('server not-found errors target the installation of the route that threw', async () => {
    const { router } = setupInstallations(
      '/',
      {
        root: { notFoundComponent: () => null },
        members: {
          beforeLoad: () => {
            throw notFound({ routeId: '@acme/settings:' as never })
          },
        },
      },
      { isServer: true },
    )

    const response = await loadServerResponse(
      router,
      '/users/u1/settings/members/3',
    )
    expect(response.status).toBe(404)
    expect(
      router.state.matches.find((match) => match.status === 'notFound')
        ?.routeId,
    ).toBe('@acme/settings#userSettings:')
  })
})
