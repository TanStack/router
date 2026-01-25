import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

describe('buildLocation - params function receives parsed params', () => {
  test('prev params should contain parsed params from route params.parse', async () => {
    const rootRoute = new BaseRootRoute({})

    // Create a route with params.parse that transforms string to number
    const userRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/users/$userId',
      params: {
        parse: ({ userId }: { userId: string }) => ({
          userId: parseInt(userId, 10),
        }),
      },
    })

    const routeTree = rootRoute.addChildren([userRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/users/123'] }),
    })

    // Load to establish current location with parsed params
    await router.load()

    // Track what params the function receives (clone to avoid mutation)
    const updater = vi.fn()

    router.buildLocation({
      from: '/users/$userId',
      to: '/users/$userId',
      params: updater,
    })

    // The prev params should be parsed (number), not raw string
    expect(updater).toHaveBeenCalledOnce()
    expect(updater).toHaveBeenCalledWith({ userId: 123 })
  })

  test('prev params should accumulate parsed params from all routes in the branch', async () => {
    const rootRoute = new BaseRootRoute({})

    // Parent route with params.parse
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      params: {
        parse: ({ orgId }: { orgId: string }) => ({
          orgId: parseInt(orgId, 10),
        }),
      },
    })

    // Child route with its own params.parse
    const userRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/users/$userId',
      params: {
        parse: ({ userId }: { userId: string }) => ({
          userId: parseInt(userId, 10),
        }),
      },
    })

    const routeTree = rootRoute.addChildren([orgRoute.addChildren([userRoute])])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/orgs/42/users/123'] }),
    })

    await router.load()

    const updater = vi.fn()

    router.buildLocation({
      from: '/orgs/$orgId/users/$userId',
      to: '/orgs/$orgId/users/$userId',
      params: updater,
    })

    // Both params should be parsed (numbers)
    expect(updater).toHaveBeenCalledOnce()
    expect(updater).toHaveBeenCalledWith({ orgId: 42, userId: 123 })
  })

  test('prev params should contain parsed params when navigating to different route', async () => {
    const rootRoute = new BaseRootRoute({})

    const userRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/users/$userId',
      params: {
        parse: ({ userId }: { userId: string }) => ({
          userId: parseInt(userId, 10),
        }),
      },
    })

    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      params: {
        parse: ({ postId }: { postId: string }) => ({
          postId: parseInt(postId, 10),
        }),
      },
    })

    const routeTree = rootRoute.addChildren([userRoute, postRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/users/123'] }),
    })

    await router.load()

    const updater = vi.fn()

    // Navigate from /users/$userId to /posts/$postId
    // The prev should contain parsed params from the current (from) route
    router.buildLocation({
      from: '/users/$userId',
      to: '/posts/$postId',
      params: updater,
    })

    // The prev params should be from the current route (parsed userId)
    // Note: prev may also contain the new postId param merged in
    expect(updater).toHaveBeenCalledOnce()
    expect(updater).toHaveBeenCalledWith({ userId: 123 })
  })

  test('params without parse function remain as strings in prev', async () => {
    const rootRoute = new BaseRootRoute({})

    // Route without params.parse
    const userRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/users/$userId',
    })

    const routeTree = rootRoute.addChildren([userRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/users/123'] }),
    })

    await router.load()

    const updater = vi.fn()

    router.buildLocation({
      from: '/users/$userId',
      to: '/users/$userId',
      params: updater,
    })

    // Without params.parse, the param should remain a string
    expect(updater).toHaveBeenCalledOnce()
    expect(updater).toHaveBeenCalledWith({ userId: '123' })
  })

  test('mixed routes with and without params.parse', async () => {
    const rootRoute = new BaseRootRoute({})

    // Parent route WITH params.parse
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      params: {
        parse: ({ orgId }: { orgId: string }) => ({
          orgId: parseInt(orgId, 10),
        }),
      },
    })

    // Child route WITHOUT params.parse
    const teamRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/teams/$teamSlug',
    })

    const routeTree = rootRoute.addChildren([orgRoute.addChildren([teamRoute])])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/orgs/42/teams/engineering'],
      }),
    })

    await router.load()

    const updater = vi.fn()

    router.buildLocation({
      from: '/orgs/$orgId/teams/$teamSlug',
      to: '/orgs/$orgId/teams/$teamSlug',
      params: updater,
    })

    expect(updater).toHaveBeenCalledOnce()
    expect(updater).toHaveBeenCalledWith({ orgId: 42, teamSlug: 'engineering' })
  })
})
