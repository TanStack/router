/**
 * Pure-logic tests against the router instance — no DOM, no SSR. These
 * exercise the router-core machinery through the Remix binding's
 * `createRouter` factory to confirm the reactivity adapter doesn't break
 * navigation, loaders, redirects, or 404 handling.
 *
 * Mirrors the most representative tests from
 * `packages/react-router/tests/router.test.tsx` and
 * `tests/loaders.test.tsx` — but stripped to the parts that don't depend
 * on rendering.
 */
import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { createRootRoute, createRoute, createRouter } from '../src'

function makeRouter(routeTree: any) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('navigation', () => {
  test('matches the first matching route on load', async () => {
    const root = createRootRoute()
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
    })
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
    })
    root.addChildren([index, posts])

    const router = makeRouter(root)
    await router.load()

    const matches = router.stores.matches.get()
    expect(matches).toHaveLength(2)
    expect(matches[0]?.routeId).toBe('__root__')
    expect(matches[1]?.routeId).toBe('/')
  })

  test('navigates to a new route', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
    })
    root.addChildren([index, posts])

    const router = makeRouter(root)
    await router.load()
    await router.navigate({ to: '/posts' })
    await router.load()

    const matches = router.stores.matches.get()
    expect(matches.at(-1)?.routeId).toBe('/posts')
  })

  test('parses path params for nested route', async () => {
    const root = createRootRoute()
    const users = createRoute({ getParentRoute: () => root, path: '/users' })
    const detail = createRoute({
      getParentRoute: () => users,
      path: '$id',
    })
    users.addChildren([detail])
    root.addChildren([users])

    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/users/42'] }),
    })
    await router.load()

    const last = router.stores.matches.get().at(-1)
    expect(last?.routeId).toBe('/users/$id')
    expect(last?.params).toEqual({ id: '42' })
  })
})

describe('loaders', () => {
  test('loader data lands on the match', async () => {
    const root = createRootRoute()
    const items = createRoute({
      getParentRoute: () => root,
      path: '/items',
      loader: async () => ['a', 'b', 'c'],
    })
    root.addChildren([items])

    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/items'] }),
    })
    await router.load()

    const match = router.stores.matches.get().find((m) => m.routeId === '/items')
    expect(match?.status).toBe('success')
    expect(match?.loaderData).toEqual(['a', 'b', 'c'])
  })

  test('loader receives params and search', async () => {
    const root = createRootRoute()
    let received: any
    const detail = createRoute({
      getParentRoute: () => root,
      path: 'users/$id',
      loader: async ({ params }: { params: { id: string } }) => {
        received = params
        return params
      },
    })
    root.addChildren([detail])

    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/users/777'] }),
    })
    await router.load()

    expect(received).toEqual({ id: '777' })
  })

  test('parent loader runs before child loader', async () => {
    const order: Array<string> = []
    const root = createRootRoute()
    const layout = createRoute({
      getParentRoute: () => root,
      path: '/layout',
      loader: async () => {
        order.push('layout')
        return 'layout-data'
      },
    })
    const child = createRoute({
      getParentRoute: () => layout,
      path: 'child',
      loader: async () => {
        order.push('child')
        return 'child-data'
      },
    })
    layout.addChildren([child])
    root.addChildren([layout])

    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/layout/child'] }),
    })
    await router.load()

    expect(order).toEqual(['layout', 'child'])
    const matches = router.stores.matches.get()
    expect(matches.find((m) => m.routeId === '/layout')?.loaderData).toBe(
      'layout-data',
    )
    expect(matches.find((m) => m.routeId === '/layout/child')?.loaderData).toBe(
      'child-data',
    )
  })
})

describe('not-found', () => {
  test('loader-thrown notFound() flips the match status', async () => {
    const root = createRootRoute()
    const detail = createRoute({
      getParentRoute: () => root,
      path: 'users/$id',
      loader: ({ params }: { params: { id: string } }) => {
        if (params.id === 'missing') {
          // notFound() lives on router-core; throw via the standard helper.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw { isNotFound: true, data: undefined }
        }
        return { id: params.id }
      },
    })
    root.addChildren([detail])

    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/users/missing'] }),
    })
    await router.load()

    const last = router.stores.matches.get().at(-1)
    expect(last?.status).toBe('notFound')
  })
})
