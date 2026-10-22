import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

function callablePromise<T>(promise: Promise<T>) {
  return Object.assign(() => undefined, {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    [Symbol.toStringTag]: 'Promise' as const,
  })
}

test.each([
  [false, 'context'],
  [true, 'context'],
  [false, 'beforeLoad'],
  [true, 'beforeLoad'],
] as const)(
  'awaits a callable lifecycle promise: isServer %s, %s',
  async (isServer, lifecycle) => {
    const entered = createControlledPromise<void>()
    const release = createControlledPromise<{ ready: boolean }>()
    const handler = () => {
      entered.resolve()
      return callablePromise(release)
    }
    const beforeLoad = vi.fn(({ context }: { context: { ready: boolean } }) => {
      if (lifecycle === 'beforeLoad') {
        return handler()
      }
      expect(context.ready).toBe(true)
      return { ready: true }
    })
    const loader = vi.fn(
      ({ context }: { context: { ready: boolean } }) => context.ready,
    )
    const root = new BaseRootRoute({})
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      context: {
        handler: lifecycle === 'context' ? handler : () => ({ ready: false }),
        dehydrate: false,
      },
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
    })
    const loading = router.load()
    try {
      await entered
      expect(loader).not.toHaveBeenCalled()
      if (lifecycle === 'context') {
        expect(beforeLoad).not.toHaveBeenCalled()
      }
      release.resolve({ ready: true })
      await loading
      expect(beforeLoad).toHaveBeenCalledOnce()
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        context: { ready: true },
        loaderData: true,
      })
    } finally {
      release.resolve({ ready: true })
      await loading
      router.clearCache()
      router.history.destroy()
    }
  },
)

test.each(['context', 'beforeLoad'] as const)(
  'supersedes a callable %s.hydrate promise without waiting for its work',
  async (lifecycle) => {
    const entered = createControlledPromise<void>()
    const release = createControlledPromise<{ ready: boolean }>()
    const onError = vi.fn()
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({})
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        [lifecycle]: {
          handler: () => ({ ready: true }),
          dehydrate: true,
          hydrate: () => {
            entered.resolve()
            return callablePromise(release)
          },
        },
        onError,
      })
      const other = new BaseRoute({
        getParentRoute: () => root,
        path: '/other',
      })
      return createTestRouter({
        routeTree: root.addChildren([page, other]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    window.$_TSR = await dehydrateToBootstrap(build(true), { routes: {} })
    const router = build(false)
    let finished = false
    const hydration = hydrate(router).then(() => {
      finished = true
    })
    try {
      await entered
      await router.navigate({ to: '/other' })
      await expect.poll(() => finished, { timeout: 500 }).toBe(true)
      expect(router.state.matches.at(-1)?.routeId).toBe('/other')
      expect(onError).not.toHaveBeenCalled()
    } finally {
      release.resolve({ ready: true })
      await hydration
      router.clearCache()
      router.history.destroy()
      delete window.$_TSR
    }
  },
)
