import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import type { AnyRouter } from '../src'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

const manifest = { routes: {} }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('supersedes unresolved head and scripts after completing async serial hydration', async () => {
  const entered = createControlledPromise<void>()
  const head = createControlledPromise<{ meta: Array<{ title: string }> }>()
  const scripts = createControlledPromise<Array<{ children: string }>>()
  const transformed = vi.fn()
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      beforeLoad: {
        handler: () => ({ ready: true }),
        dehydrate: true,
        hydrate: async ({ data }) => {
          await Promise.resolve()
          transformed()
          return data
        },
      },
      head: () => {
        if (isServer) {
          return { meta: [{ title: 'server' }] }
        }
        entered.resolve()
        return head
      },
      scripts: () => (isServer ? [] : scripts),
    })
    const other = new BaseRoute({
      getParentRoute: () => root,
      path: '/other',
      head: () => ({ meta: [{ title: 'other' }] }),
    })
    return createTestRouter({
      routeTree: root.addChildren([page, other]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
    })
  }
  vi.stubGlobal('window', {
    $_TSR: await dehydrateToBootstrap(build(true), manifest),
  })
  const router = build(false)
  let finished = false
  const hydration = hydrate(router).then(() => {
    finished = true
  })
  try {
    await entered
    expect(transformed).toHaveBeenCalledTimes(1)
    await router.navigate({ to: '/other' })
    await expect.poll(() => finished, { timeout: 500 }).toBe(true)
    expect(router.state.matches.at(-1)?.meta).toEqual([{ title: 'other' }])
    head.resolve({ meta: [{ title: 'obsolete' }] })
    scripts.resolve([{ children: 'obsolete()' }])
    await hydration
    await new Promise((resolve) => setTimeout(resolve))
    expect(router.state.location.pathname).toBe('/other')
    expect(router.state.matches.at(-1)?.meta).toEqual([{ title: 'other' }])
  } finally {
    head.resolve({ meta: [] })
    scripts.resolve([])
    await hydration
    router.clearCache()
    router.history.destroy()
  }
})

test('settling an earlier scripts promise cannot finish a later head wait', async () => {
  const error = new Error('root head failed')
  const lateScripts = createControlledPromise<Array<{ children: string }>>()
  const childHead = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  const childEntered = createControlledPromise<void>()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({
      head: () => (isServer ? {} : Promise.reject(error)),
      scripts: () => (isServer ? [] : lateScripts),
    })
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      head: () => {
        if (isServer) {
          return {}
        }
        childEntered.resolve()
        return childHead
      },
    })
    return createTestRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
    })
  }
  vi.stubGlobal('window', {
    $_TSR: await dehydrateToBootstrap(build(true), manifest),
  })
  const router = build(false)
  let finished = false
  const hydration = hydrate(router).then(() => {
    finished = true
  })
  try {
    await childEntered
    lateScripts.reject(new Error('late scripts failure'))
    await new Promise((resolve) => setTimeout(resolve))
    expect(finished).toBe(false)
    childHead.resolve({ meta: [{ title: 'child' }] })
    await hydration
    expect(router.state.matches.at(-1)?.meta).toEqual([{ title: 'child' }])
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(error)
  } finally {
    lateScripts.resolve([])
    childHead.resolve({ meta: [] })
    await hydration
    router.clearCache()
    router.history.destroy()
  }
})

for (const lifecycle of ['context', 'beforeLoad'] as const) {
  for (const action of ['abort', 'navigate'] as const) {
    test.each(['pending', 'rejected'] as const)(
      `${lifecycle}.hydrate can synchronously ${action} and return a %s promise`,
      async (outcome) => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const laterContext = vi.fn(() => ({}))
        const laterLoader = vi.fn(() => 'client')
        let router: AnyRouter
        const build = (isServer: boolean) => {
          const root = new BaseRootRoute({})
          const page = new BaseRoute({
            getParentRoute: () => root,
            path: '/page',
            [lifecycle]: {
              handler: () => ({ ready: true }),
              dehydrate: true,
              hydrate: ({
                abortController,
              }: {
                abortController: AbortController
              }) => {
                if (action === 'abort') {
                  abortController.abort()
                } else {
                  void router.navigate({ to: '/other' })
                }
                return outcome === 'pending'
                  ? new Promise<{ ready: boolean }>(() => {})
                  : Promise.reject(new Error('ignored lifecycle rejection'))
              },
            },
          })
          const child = new BaseRoute({
            getParentRoute: () => page,
            path: '/child',
            context: isServer ? () => ({}) : laterContext,
            loader: {
              handler: isServer ? () => 'server' : laterLoader,
              dehydrate: false,
            },
          })
          const other = new BaseRoute({
            getParentRoute: () => root,
            path: '/other',
          })
          return createTestRouter({
            routeTree: root.addChildren([page.addChildren([child]), other]),
            history: createMemoryHistory({ initialEntries: ['/page/child'] }),
            isServer,
          })
        }
        vi.stubGlobal('window', {
          $_TSR: await dehydrateToBootstrap(build(true), manifest),
        })
        router = build(false)
        let finished = false
        const hydration = hydrate(router).then(() => {
          finished = true
        })
        try {
          await expect.poll(() => finished, { timeout: 500 }).toBe(true)
          await hydration
          expect(laterContext).not.toHaveBeenCalled()
          expect(laterLoader).not.toHaveBeenCalled()
          if (action === 'navigate') {
            await router.load()
            expect(router.state.location.pathname).toBe('/other')
            expect(router.state.matches.at(-1)?.status).toBe('success')
          }
        } finally {
          router.clearCache()
          router.history.destroy()
        }
      },
    )
  }
}

test.each(['head', 'scripts'] as const)(
  'consumes a rejected %s result after that callback aborts hydration',
  async (abortingHook) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    const laterHead = vi.fn(() => ({}))
    let controller: AbortController | undefined
    let armed = true
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({
        context: ({ abortController }) => {
          if (!isServer) {
            controller = abortController
          }
          return {}
        },
        head: () => {
          if (!isServer && armed && abortingHook === 'head') {
            controller!.abort()
            return Promise.reject(new Error('aborted head'))
          }
          return {}
        },
        scripts: () => {
          if (!isServer && armed && abortingHook === 'scripts') {
            controller!.abort()
            return Promise.reject(new Error('aborted scripts'))
          }
          return []
        },
        onError,
      })
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        head: isServer ? () => ({}) : laterHead,
      })
      return createTestRouter({
        routeTree: root.addChildren([page]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    vi.stubGlobal('window', {
      $_TSR: await dehydrateToBootstrap(build(true), manifest),
    })
    const router = build(false)
    try {
      await hydrate(router)
      expect(laterHead).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      armed = false
      await router.load()
      expect(router.state.matches.at(-1)?.status).toBe('success')
      expect(laterHead).toHaveBeenCalledTimes(1)
    } finally {
      router.clearCache()
      router.history.destroy()
    }
  },
)

test('verifies an omitted structural descendant below a data-only terminal boundary', async () => {
  let generation = 0
  const clientBeforeLoad = vi.fn()
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const parent = new BaseRoute({
      getParentRoute: () => root,
      path: '/parent',
      ssr: 'data-only',
    })
    const boundary = new BaseRoute({
      getParentRoute: () => parent,
      path: '/boundary',
      beforeLoad: () => {
        if (isServer) {
          throw new Error('server boundary')
        }
        clientBeforeLoad()
      },
      errorComponent: () => null,
    })
    const tail = new BaseRoute({
      getParentRoute: () => boundary,
      path: '/tail',
      loaderDeps: () => ({ generation }),
      loader: ({ deps }) => `tail data:${deps.generation}`,
    })
    return createTestRouter({
      routeTree: root.addChildren([
        parent.addChildren([boundary.addChildren([tail])]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/parent/boundary/tail'],
      }),
      isServer,
    })
  }
  vi.stubGlobal('window', {
    $_TSR: await dehydrateToBootstrap(build(true), manifest),
  })
  const router = build(false)
  let unsubscribe: (() => void) | undefined
  try {
    await hydrate(router)
    expect(router.state.matches[2]?.status).toBe('error')
    unsubscribe = router.subscribe('onBeforeNavigate', () => {
      generation = 1
    })
    await router.load()
    expect(clientBeforeLoad).toHaveBeenCalledTimes(1)
    expect(router.state.matches[2]?.status).toBe('success')
    expect(router.state.matches.at(-1)?.loaderData).toBe('tail data:1')
    expect(router.state.matches.at(-1)?.loaderDeps).toEqual({ generation: 1 })
  } finally {
    unsubscribe?.()
    router.clearCache()
    router.history.destroy()
  }
})

test.each(['context', 'beforeLoad'] as const)(
  'ignores a late rejection from superseded %s hydration',
  async (lifecycle) => {
    const entered = createControlledPromise<void>()
    const release = createControlledPromise<{ ready: boolean }>()
    const onError = vi.fn()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
            return release
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
    vi.stubGlobal('window', {
      $_TSR: await dehydrateToBootstrap(build(true), manifest),
    })
    const router = build(false)
    let finished = false
    const hydration = hydrate(router).then(() => {
      finished = true
    })
    try {
      await entered
      await router.navigate({ to: '/other' })
      await expect.poll(() => finished, { timeout: 500 }).toBe(true)
      release.reject(new Error('obsolete serial rejection'))
      await hydration
      await new Promise((resolve) => setTimeout(resolve))
      expect(router.state.location.pathname).toBe('/other')
      expect(router.state.matches.at(-1)?.status).toBe('success')
      expect(onError).not.toHaveBeenCalled()
      expect(warning).not.toHaveBeenCalled()
    } finally {
      release.resolve({ ready: true })
      await hydration
      router.clearCache()
      router.history.destroy()
    }
  },
)
