import { describe, expect, test } from 'vitest'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '../src/routeTree.gen'
import {
  account,
  products,
  storefront,
  orgSettings,
  personSettings,
} from '../src/routeScope.gen'
import { isScopedMatch } from '@route-modules/settings/scope'

function createApp(pathname: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
    // This server harness drives load explicitly. Browser e2e tests exercise
    // the navigation subscription owned by a mounted RouterProvider.
    isServer: true,
    context: {
      productsApi: {
        getProduct: async (id) => ({ id, name: id, price: 10 as never }),
        listProducts: async () => [],
      },
    },
  })
}

describe('installed module match identity', () => {
  test.each([
    ['/orgs/globex/settings/profile', 'orgSettings', '/orgs/$orgId'],
    ['/people/ada/settings/profile', 'personSettings', '/people/$personId'],
  ])(
    'keeps final and module-local identities for %s',
    async (pathname, installation, parent) => {
      const router = createApp(pathname)
      await router.load()
      expect(
        router.state.matches.map(({ routeId, localRouteId }) => ({
          routeId,
          localRouteId,
        })),
      ).toEqual([
        { routeId: '__root__', localRouteId: undefined },
        { routeId: parent, localRouteId: undefined },
        {
          routeId: `@route-modules/settings#${installation}:`,
          localRouteId: '@route-modules/settings:',
        },
        {
          routeId: `@route-modules/settings#${installation}:/profile`,
          localRouteId: '@route-modules/settings:/profile',
        },
      ])
      expect(Object.hasOwn(router.state.matches[0]!, 'localRouteId')).toBe(
        false,
      )
      expect(Object.hasOwn(router.state.matches[1]!, 'localRouteId')).toBe(
        false,
      )
    },
  )

  test('loading a new location keeps local identity across installations', async () => {
    const router = createApp('/orgs/globex/settings/profile')
    await router.load()
    router.history.push('/people/ada/settings/profile')
    await router.load()
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: '@route-modules/settings#personSettings:/profile',
      localRouteId: '@route-modules/settings:/profile',
      loaderData: { kind: 'person', handle: '@ada' },
    })
  })
})

test('context-free match guards select the installed subtree and exact namespace', async () => {
  const router = createApp('/orgs/globex/settings/profile')
  await router.load()
  expect(
    router.state.matches
      .filter(orgSettings.isScopedMatch)
      .map((match) => match.routeId),
  ).toEqual([
    '@route-modules/settings#orgSettings:',
    '@route-modules/settings#orgSettings:/profile',
  ])
  expect(router.state.matches.filter(personSettings.isScopedMatch)).toEqual([])
  expect(
    router.state.matches
      .filter(isScopedMatch)
      .map((match) => match.localRouteId),
  ).toEqual(['@route-modules/settings:', '@route-modules/settings:/profile'])

  // The server load needs the canonical search value supplied by this route.
  router.history.push('/shop/products/1?tab=specs')
  await router.load()
  // Descendant module matches belong to the storefront's installed subtree.
  expect(
    router.state.matches
      .filter(storefront.isScopedMatch)
      .map((match) => match.routeId),
  ).toEqual([
    '@route-modules/storefront:',
    '@route-modules/products:',
    '@route-modules/products:/$productId',
  ])
  // The host's namespace for the nested include selects the nested module only.
  expect(
    router.state.matches
      .filter(products.isScopedMatch)
      .map((match) => match.routeId),
  ).toEqual(['@route-modules/products:', '@route-modules/products:/$productId'])
  // Account only declares `uses: products`; that dependency is not installed
  // beneath account and must not be classified as an account subtree match.
  expect(router.state.matches.filter(account.isScopedMatch)).toEqual([])
})

test('application route objects expose the installed graph', async () => {
  const router = createApp('/orgs/globex/settings/profile')
  await router.load()
  const root = router.routesById['@route-modules/settings#orgSettings:']
  const profile =
    router.routesById['@route-modules/settings#orgSettings:/profile']
  // `path` is the normalized segment; options.path is the authored mount path.
  expect(root.path).toBe('settings')
  expect(root.options.path).toBe('/settings')
  expect(root.fullPath).toBe('/orgs/$orgId/settings')
  expect(profile.parentRoute).toBe(root)
  expect(profile.options.getParentRoute?.()).toBe(root)
  expect(profile.parentRoute.id).toBe('@route-modules/settings#orgSettings:')

  const layout = router.routesById['@route-modules/products:/_layout']
  const children = Object.values(layout.children ?? {})
  expect(children.map((child) => child.fullPath)).toEqual([
    '/shop/products/deals',
  ])
  expect(children[0]?.parentRoute).toBe(layout)
})
