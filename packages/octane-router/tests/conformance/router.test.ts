import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/octane-router'
import { makeRouter } from '../_fixtures/basic.tsrx'

// router-core resolves matches asynchronously (load/navigate return promises) and
// the store notifications drive octane re-renders on a macrotask — flush a few
// cycles + paints, the same shape the query binding tests use.
async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

function deferViewTransitionCommit() {
  const originalStartViewTransition = (document as any).startViewTransition
  let runUpdate: (() => Promise<void>) | undefined
  let signalUpdateQueued: (() => void) | undefined
  const updateQueued = new Promise<void>((resolve) => {
    signalUpdateQueued = resolve
  })

  ;(document as any).startViewTransition = (
    update: () => void | Promise<void>,
  ) => {
    runUpdate = async () => {
      await update()
    }
    signalUpdateQueued!()
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }
  }

  return {
    updateQueued,
    runUpdate: () => runUpdate!(),
    restore() {
      if (originalStartViewTransition === undefined) {
        delete (document as any).startViewTransition
      } else {
        ;(document as any).startViewTransition = originalStartViewTransition
      }
    },
  }
}

function queueViewTransitionCommits() {
  const originalStartViewTransition = (document as any).startViewTransition
  const updates: Array<() => Promise<void>> = []
  const waiters = new Set<() => void>()

  ;(document as any).startViewTransition = (
    update: () => void | Promise<void>,
  ) => {
    updates.push(async () => {
      await update()
    })
    for (const resolve of waiters) {
      resolve()
    }
    waiters.clear()
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }
  }

  return {
    async waitForCount(count: number) {
      while (updates.length < count) {
        await new Promise<void>((resolve) => waiters.add(resolve))
      }
    },
    runUpdate(index: number) {
      return updates[index]!()
    },
    restore() {
      if (originalStartViewTransition === undefined) {
        delete (document as any).startViewTransition
      } else {
        ;(document as any).startViewTransition = originalStartViewTransition
      }
    },
  }
}

function makeRecoverableStatusRouter() {
  let shouldFail = true
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => {
      if (shouldFail) {
        throw new Error('recoverable load failed')
      }
    },
  })

  return {
    router: createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
    recover: () => {
      shouldFail = false
    },
  }
}

describe('@tanstack/octane-router core seam', () => {
  it('renders the matched route through the layout Outlet', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.root').length).toBe(1) // root layout rendered
    expect(r.findAll('.index').length).toBe(1) // index child via <Outlet/>
    expect(r.find('.index').textContent).toBe('Index')
    expect(router.state.location.pathname).toBe('/')
    r.unmount()
  })

  it('await router.load leaves the initial route ready for the first render', async () => {
    const router = makeRouter('/')
    router.options.defaultViewTransition = true
    const transition = deferViewTransitionCommit()

    try {
      let loadSettled = false
      const load = router.load().then(() => {
        loadSettled = true
      })
      await transition.updateQueued
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(loadSettled).toBe(false)
      await transition.runUpdate()
      await load

      const r = mount(RouterProvider as any, { router })
      expect(r.findAll('.root').length).toBe(1)
      expect(r.findAll('.index').length).toBe(1)
      r.unmount()
    } finally {
      transition.restore()
    }
  })

  it.each([
    ['/load-failure', 500],
    ['/load-not-found', 404],
  ])(
    'finalizes the %s status after a deferred match commit',
    async (path, expectedStatus) => {
      const router = makeRouter(path)
      router.options.defaultViewTransition = true
      const transition = deferViewTransitionCommit()

      try {
        const load = router.load()
        await transition.updateQueued
        expect(router.state.matches).toHaveLength(0)
        expect(router.state.statusCode).toBe(200)

        await transition.runUpdate()
        await load

        expect(router.state.matches).not.toHaveLength(0)
        expect(router.state.statusCode).toBe(expectedStatus)
      } finally {
        transition.restore()
      }
    },
  )

  it('resets a stale failure status after a deferred successful reload', async () => {
    const { router, recover } = makeRecoverableStatusRouter()
    router.options.defaultViewTransition = true
    const failedTransition = deferViewTransitionCommit()

    try {
      const failedLoad = router.load()
      await failedTransition.updateQueued
      await failedTransition.runUpdate()
      await failedLoad
      expect(router.state.statusCode).toBe(500)
    } finally {
      failedTransition.restore()
    }

    recover()
    const successfulTransition = deferViewTransitionCommit()
    try {
      const successfulLoad = router.load()
      await successfulTransition.updateQueued
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(router.state.statusCode).toBe(500)
      await successfulTransition.runUpdate()
      await successfulLoad

      expect(
        router.state.matches.some((match) => match.status === 'error'),
      ).toBe(false)
      expect(router.state.statusCode).toBe(200)
    } finally {
      successfulTransition.restore()
    }
  })

  it('does not carry a failed commit into the next load when its core load rejects', async () => {
    const router = makeRouter('/')
    const originalStartTransition = router.startTransition
    let rejectCoreLoad = true
    router.startTransition = (fn: () => void) => {
      if (rejectCoreLoad) {
        rejectCoreLoad = false
        router.startViewTransition(async () => {
          throw new Error('orphaned commit failure')
        })
        throw new Error('core load failure')
      }
      return originalStartTransition(fn)
    }

    try {
      await expect(router.load()).rejects.toThrow('core load failure')
    } finally {
      router.startTransition = originalStartTransition
    }

    await expect(router.load()).resolves.toBeUndefined()
    expect(router.state.statusCode).toBe(200)
  })

  it('waits for a prior platform commit without inheriting its failure', async () => {
    const router = makeRouter('/')
    router.options.defaultViewTransition = true
    const transitions = queueViewTransitionCommits()

    try {
      router.startViewTransition(async () => {
        throw new Error('prior commit failure')
      })
      await transitions.waitForCount(1)

      let loadSettled = false
      const load = router.load().then(() => {
        loadSettled = true
      })
      await transitions.waitForCount(2)

      await transitions.runUpdate(1)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(loadSettled).toBe(false)

      await transitions.runUpdate(0)
      await load
      expect(loadSettled).toBe(true)
      expect(router.state.statusCode).toBe(200)
    } finally {
      transitions.restore()
    }
  })

  it('rejects load when a synchronous view-transition commit throws', async () => {
    const router = makeRouter('/enter-failure')
    await expect(router.load()).rejects.toThrow('enter failed')
  })

  it('navigation swaps the Outlet content + updates location', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.findAll('.index').length).toBe(1)

    await router.navigate({ to: '/about' })
    await flush()

    expect(r.findAll('.about').length).toBe(1) // about now rendered
    expect(r.findAll('.index').length).toBe(0) // index unmounted
    expect(r.findAll('.root').length).toBe(1) // layout stayed mounted
    expect(router.state.location.pathname).toBe('/about')
    r.unmount()
  })

  it('a Link click navigates and reflects active state', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.nav-home').getAttribute('data-status')).toBe('active')
    expect(r.find('.nav-about').getAttribute('data-status')).toBe(null)

    r.click('.nav-about') // delegated onClick → preventDefault → router.navigate
    await flush()

    expect(r.findAll('.about').length).toBe(1)
    expect(router.state.location.pathname).toBe('/about')
    expect(r.find('.nav-about').getAttribute('data-status')).toBe('active')
    expect(r.find('.nav-home').getAttribute('data-status')).toBe(null)
    r.unmount()
  })

  it('useParams reads a path param', async () => {
    const router = makeRouter('/item/42')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.item').textContent).toBe('Item 42')
    expect(router.state.location.pathname).toBe('/item/42')
    r.unmount()
  })

  it('nested routes render through a chain of Outlets', async () => {
    const router = makeRouter('/posts')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.root').length).toBe(1) // root layout (Outlet #1)
    expect(r.findAll('.posts').length).toBe(1) // posts layout (Outlet #2)
    expect(r.findAll('.posts-index').length).toBe(1) // posts index (3rd match)
    r.unmount()
  })
})
