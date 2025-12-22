import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

describe('skipRouteOnParseError optimization', () => {
  it('should call params.parse only once for routes with skipRouteOnParseError', async () => {
    const rootRoute = new BaseRootRoute()

    const parseSpy = vi.fn((params: { id: string }) => ({
      id: Number(params.id),
    }))

    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$id',
      params: {
        parse: parseSpy,
      },
      skipRouteOnParseError: true,
    })

    const routeTree = rootRoute.addChildren([route])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/posts/123'] }),
    })

    await router.load()

    // params.parse should be called exactly once during matching
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledWith({ id: '123' })

    // Verify the parsed params are available in the match
    const match = router.state.matches.find((m) => m.routeId === '/posts/$id')
    expect(match?.params).toEqual({ id: 123 })
  })

  it('should call params.parse for nested routes with skipRouteOnParseError only once each', async () => {
    const rootRoute = new BaseRootRoute()

    const parentParseSpy = vi.fn((params: { userId: string }) => ({
      userId: Number(params.userId),
    }))

    const childParseSpy = vi.fn((params: { postId: string }) => ({
      postId: Number(params.postId),
    }))

    const userRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/users/$userId',
      params: {
        parse: parentParseSpy,
      },
      skipRouteOnParseError: true,
    })

    const postRoute = new BaseRoute({
      getParentRoute: () => userRoute,
      path: 'posts/$postId',
      params: {
        parse: childParseSpy,
      },
      skipRouteOnParseError: true,
    })

    const routeTree = rootRoute.addChildren([
      userRoute.addChildren([postRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/users/456/posts/789'],
      }),
    })

    await router.load()

    // Each params.parse should be called exactly once during matching
    expect(parentParseSpy).toHaveBeenCalledTimes(1)
    expect(parentParseSpy).toHaveBeenCalledWith({ userId: '456' })

    expect(childParseSpy).toHaveBeenCalledTimes(1)
    expect(childParseSpy).toHaveBeenCalledWith({ userId: '456', postId: '789' })

    // Verify the parsed params are available and accumulated
    const userMatch = router.state.matches.find(
      (m) => m.routeId === '/users/$userId',
    )
    expect(userMatch?.params).toEqual({ userId: 456, postId: 789 })

    const postMatch = router.state.matches.find(
      (m) => m.routeId === '/users/$userId/posts/$postId',
    )
    expect(postMatch?.params).toEqual({ userId: 456, postId: 789 })
  })

  it('should still call params.parse for routes WITHOUT skipRouteOnParseError', async () => {
    const rootRoute = new BaseRootRoute()

    const parseSpy = vi.fn((params: { id: string }) => ({
      id: Number(params.id),
    }))

    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$id',
      params: {
        parse: parseSpy,
      },
      // skipRouteOnParseError is NOT set (defaults to false)
    })

    const routeTree = rootRoute.addChildren([route])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/posts/123'] }),
    })

    await router.load()

    // params.parse should be called during matchRoutesInternal (not during matching)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    // Note: receives parsed params because parent doesn't exist, so strictParams contains the parsed value
    expect(parseSpy).toHaveBeenCalledWith({ id: 123 })

    // Verify the parsed params are available
    const match = router.state.matches.find((m) => m.routeId === '/posts/$id')
    expect(match?.params).toEqual({ id: 123 })
  })

  it('should skip route during matching if params.parse throws with skipRouteOnParseError', async () => {
    const rootRoute = new BaseRootRoute()

    const strictParseSpy = vi.fn((params: { id: string }) => {
      const num = Number(params.id)
      if (isNaN(num)) {
        throw new Error('Invalid ID')
      }
      return { id: num }
    })

    const fallbackParseSpy = vi.fn((params: { slug: string }) => ({
      slug: params.slug,
    }))

    const strictRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$id',
      params: {
        parse: strictParseSpy,
      },
      skipRouteOnParseError: true,
    })

    const fallbackRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$slug',
      params: {
        parse: fallbackParseSpy,
      },
    })

    const routeTree = rootRoute.addChildren([strictRoute, fallbackRoute])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/posts/invalid'] }),
    })

    await router.load()

    // strictParseSpy should be called and throw, causing the route to be skipped
    expect(strictParseSpy).toHaveBeenCalledTimes(1)
    expect(strictParseSpy).toHaveBeenCalledWith({ id: 'invalid' })

    // fallbackParseSpy should be called for the fallback route
    expect(fallbackParseSpy).toHaveBeenCalledTimes(1)
    expect(fallbackParseSpy).toHaveBeenCalledWith({ slug: 'invalid' })

    // Verify we matched the fallback route, not the strict route
    const matches = router.state.matches.map((m) => m.routeId)
    expect(matches).toContain('/posts/$slug')
    expect(matches).not.toContain('/posts/$id')
  })

  it('should handle mixed routes with and without skipRouteOnParseError', async () => {
    const rootRoute = new BaseRootRoute()

    const skipParseSpy = vi.fn((params: { userId: string }) => ({
      userId: Number(params.userId),
    }))

    const normalParseSpy = vi.fn((params: { postId: string }) => ({
      postId: Number(params.postId),
    }))

    const userRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/users/$userId',
      params: {
        parse: skipParseSpy,
      },
      skipRouteOnParseError: true,
    })

    const postRoute = new BaseRoute({
      getParentRoute: () => userRoute,
      path: 'posts/$postId',
      params: {
        parse: normalParseSpy,
      },
      // skipRouteOnParseError NOT set
    })

    const routeTree = rootRoute.addChildren([
      userRoute.addChildren([postRoute]),
    ])

    const router = new RouterCore({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/users/456/posts/789'],
      }),
    })

    await router.load()

    // skipParseSpy should be called once during matching
    expect(skipParseSpy).toHaveBeenCalledTimes(1)

    // normalParseSpy should be called once during matchRoutesInternal
    expect(normalParseSpy).toHaveBeenCalledTimes(1)

    // Both should have correct params
    const userMatch = router.state.matches.find(
      (m) => m.routeId === '/users/$userId',
    )
    expect(userMatch?.params).toEqual({ userId: 456, postId: 789 })

    const postMatch = router.state.matches.find(
      (m) => m.routeId === '/users/$userId/posts/$postId',
    )
    expect(postMatch?.params).toEqual({ userId: 456, postId: 789 })
  })
})
