import { createMemoryHistory } from '@tanstack/history'
import { afterEach, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a detached hydration transform cannot clear its replacement handler fetching state', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const obsoleteStarted = createControlledPromise<void>()
  const obsoleteRelease = createControlledPromise<void>()
  const replacementStarted = createControlledPromise<void>()
  const replacementRelease = createControlledPromise<void>()
  const clientHandler = vi.fn(async () => {
    replacementStarted.resolve()
    await replacementRelease
    return 'replacement child'
  })
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const parent = new BaseRoute({
      getParentRoute: () => root,
      path: '/parent',
      loader: {
        handler: () => 'parent data',
        dehydrate: true,
        hydrate: () => {
          throw new Error('parent transform failed')
        },
      },
    })
    const child = new BaseRoute({
      getParentRoute: () => parent,
      path: '/child',
      loader: {
        handler: isServer ? () => 'server child' : clientHandler,
        dehydrate: true,
        hydrate: async ({ data }) => {
          obsoleteStarted.resolve()
          await obsoleteRelease
          return `${data}: obsolete transform`
        },
      },
    })
    return createTestRouter({
      routeTree: root.addChildren([parent.addChildren([child])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
      isServer,
    })
  }
  const server = build(true)
  const router = build(false)
  let loading: ReturnType<typeof router.load> | undefined
  try {
    vi.stubGlobal('window', {
      $_TSR: await dehydrateToBootstrap(server, { routes: {} }),
    })
    await hydrate(router)
    await obsoleteStarted

    loading = router.load()
    await replacementStarted
    await expect
      .poll(() => router.state.matches.at(-1)?.isFetching)
      .toBe('loader')

    obsoleteRelease.resolve()
    // The old transform completes while its replacement handler is pending.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.state.matches.at(-1)?.isFetching).toBe('loader')

    replacementRelease.resolve()
    await loading
    expect(clientHandler).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      isFetching: false,
      loaderData: 'replacement child',
    })
  } finally {
    obsoleteRelease.resolve()
    replacementRelease.resolve()
    await loading
    router.clearCache()
    server.history.destroy()
    router.history.destroy()
  }
})
