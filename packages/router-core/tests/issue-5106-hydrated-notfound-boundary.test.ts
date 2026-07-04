import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, isNotFound } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = { routes: {} }

// https://github.com/TanStack/router/issues/5106
// SSR: a child loader throws notFound(). The server commits a notFound-capped
// lane and the client hydrates it. The parent route must not "freeze": every
// hydrated match has to settle (a still-pending loadPromise suspends the
// parent subtree forever in React) and no server loader may re-run client-side.
describe('issue #5106 - hydrating a server-committed notFound boundary', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    ;(global as any).window = mockWindow
  })

  afterEach(() => {
    delete (global as any).window
    vi.restoreAllMocks()
  })

  it('child-owned boundary settles all matches without re-running loaders', async () => {
    const postsLoader = vi.fn(() => 'posts-data')
    const postLoader = vi.fn(() => 'post-data')
    const history = createMemoryHistory({
      initialEntries: ['/posts/i-do-not-exist'],
    })

    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: postsLoader,
      component: () => 'Posts',
    })
    const postRoute = new BaseRoute({
      getParentRoute: () => postsRoute,
      path: '/$postId',
      loader: postLoader,
      component: () => 'Post',
      notFoundComponent: () => 'Post not found',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postsRoute.addChildren([postRoute])]),
      history,
      isServer: false,
    })

    const matches = router.matchRoutes(router.stores.location.get())
    expect(matches).toHaveLength(3)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        // The child is its own notFound boundary, so the server lane still
        // ends at the child match.
        lastMatchId: matches[2]!.id,
        matches: [
          {
            i: matches[0]!.id,
            s: 'success' as const,
            ssr: true,
            u: Date.now(),
          },
          {
            i: matches[1]!.id,
            s: 'success' as const,
            l: 'posts-data',
            ssr: true,
            u: Date.now(),
          },
          {
            i: matches[2]!.id,
            s: 'notFound' as const,
            e: { isNotFound: true },
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)

    const stateMatches = router.stores.matches.get()
    expect(stateMatches).toHaveLength(3)

    // Parent keeps its server data and status.
    expect(stateMatches[1]!.status).toBe('success')
    expect(stateMatches[1]!.loaderData).toBe('posts-data')

    // Child hydrated as the notFound boundary.
    expect(stateMatches[2]!.status).toBe('notFound')
    expect(isNotFound(stateMatches[2]!.error)).toBe(true)

    // No server loader re-ran on the client.
    expect(postsLoader).not.toHaveBeenCalled()
    expect(postLoader).not.toHaveBeenCalled()

    // Every match settled: an unsettled loadPromise here is the #5106 freeze -
    // the framework Match suspends on it and the parent never hydrates.
    for (const match of stateMatches) {
      expect(match._.dehydrated).toBeUndefined()
      expect(match._.loadPromise).toBeUndefined()
    }

    // Hydration finished without needing a follow-up router.load().
    expect(router.stores.resolvedLocation.get()).toBeDefined()
    expect(router.stores.isLoading.get()).toBe(false)
  })

  it('ancestor boundary replays the dehydrated notFound in the follow-up load instead of loading the omitted child', async () => {
    const postsLoader = vi.fn(() => 'posts-data')
    const postLoader = vi.fn(() => 'post-data')
    const history = createMemoryHistory({
      initialEntries: ['/posts/i-do-not-exist'],
    })

    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: postsLoader,
      component: () => 'Posts',
      notFoundComponent: () => 'Posts not found',
    })
    // The child has no notFoundComponent, so the server selected the parent
    // as the boundary and omitted the child match from the dehydrated lane.
    const postRoute = new BaseRoute({
      getParentRoute: () => postsRoute,
      path: '/$postId',
      loader: postLoader,
      component: () => 'Post',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postsRoute.addChildren([postRoute])]),
      history,
      isServer: false,
    })

    const matches = router.matchRoutes(router.stores.location.get())
    expect(matches).toHaveLength(3)

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        // Server lane was capped at the parent boundary.
        lastMatchId: matches[1]!.id,
        matches: [
          {
            i: matches[0]!.id,
            s: 'success' as const,
            ssr: true,
            u: Date.now(),
          },
          {
            i: matches[1]!.id,
            s: 'notFound' as const,
            l: 'posts-data',
            e: { isNotFound: true },
            ssr: true,
            u: Date.now(),
          },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)

    // hydrate() schedules a follow-up router.load() for the ssr:false hole
    // left by the omitted child. The dehydrated parent boundary must replay
    // and cap the lane exactly like the server did.
    await vi.waitFor(() => {
      expect(router.stores.isLoading.get()).toBe(false)
      expect(router.state.matches).toHaveLength(2)
    })

    const stateMatches = router.stores.matches.get()
    expect(stateMatches[1]!.routeId).toBe(postsRoute.id)
    expect(stateMatches[1]!.status).toBe('notFound')
    expect(isNotFound(stateMatches[1]!.error)).toBe(true)
    // The boundary keeps the parent's server loader data (the e2e
    // parent-boundary spec renders it).
    expect(stateMatches[1]!.loaderData).toBe('posts-data')

    // Neither the omitted child nor the dehydrated parent re-ran client-side.
    expect(postLoader).not.toHaveBeenCalled()
    expect(postsLoader).not.toHaveBeenCalled()

    // The committed lane is fully settled - nothing left for React to
    // suspend on (the #5106 freeze).
    for (const match of stateMatches) {
      expect(match._.dehydrated).toBeUndefined()
      expect(match._.loadPromise).toBeUndefined()
    }
  })
})
