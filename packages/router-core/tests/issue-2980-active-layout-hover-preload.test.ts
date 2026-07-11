import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Repro for https://github.com/TanStack/router/issues/2980
 *
 * While sitting on a layout route (`/posts`) whose data is older than
 * staleTime, hovering child links must not keep re-running the active
 * layout's loader on every hover. Preloads borrow the active layout match
 * read-only; staleness of the active lane is the foreground/background
 * loaders' concern, not the preload's.
 */
test('hover preloads of child routes do not re-run the active stale layout loader', async () => {
  const postsLoader = vi.fn(() => 'posts data')
  const postLoader = vi.fn(({ params }: any) => `post ${params.postId}`)

  const rootRoute = new BaseRootRoute({})
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    loader: postsLoader,
  })
  const postRoute = new BaseRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    loader: postLoader,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([postsRoute.addChildren([postRoute])]),
    history: createMemoryHistory({ initialEntries: ['/posts'] }),
    // Mirrors the basic-file-based example's defaultStaleTime: 5000, scaled
    // down so the test can get past it quickly.
    defaultStaleTime: 10,
  })

  await router.load()
  expect(postsLoader).toHaveBeenCalledTimes(1)

  // Let the active layout data go stale.
  await sleep(50)

  // Hover several post links "like crazy".
  await router.preloadRoute({
    to: '/posts/$postId',
    params: { postId: '1' },
  } as any)
  await router.preloadRoute({
    to: '/posts/$postId',
    params: { postId: '2' },
  } as any)
  await router.preloadRoute({
    to: '/posts/$postId',
    params: { postId: '1' },
  } as any)

  // The active layout loader must not have been re-run by hover preloads.
  expect(postsLoader).toHaveBeenCalledTimes(1)

  // Each distinct post was preloaded once; the repeat hover of post 1 was
  // served from the preload cache (within preloadStaleTime).
  expect(postLoader).toHaveBeenCalledTimes(2)

  // The active layout match is still the rendered success match.
  const active = router.stores.matches.get()
  expect(active.find((match) => match.routeId === postsRoute.id)?.status).toBe(
    'success',
  )
})
