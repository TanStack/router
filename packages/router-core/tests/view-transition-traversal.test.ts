import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { ViewTransitionOptions } from '../src'

/**
 * Tests for `replayViewTransitionOnTraversal`: a view transition opted into during a
 * navigation (PUSH/REPLACE) should be replayed when the user traverses that entry with the
 * browser Back/Forward buttons (BACK/FORWARD/GO), and should be a no-op otherwise.
 */

type StartVT = (arg: any) => any

let startViewTransitionSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // jsdom has no document.startViewTransition; mock one that runs the update callback
  // synchronously and records how it was invoked.
  startViewTransitionSpy = vi.fn<StartVT>((arg) => {
    const update = typeof arg === 'function' ? arg : arg.update
    update?.()
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => {},
    }
  })
  ;(document as any).startViewTransition = startViewTransitionSpy
})

afterEach(() => {
  delete (document as any).startViewTransition
  vi.restoreAllMocks()
})

function createRouter(
  options: {
    replayViewTransitionOnTraversal?: boolean
    defaultViewTransition?: boolean
  } = {},
) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const aRoute = new BaseRoute({ getParentRoute: () => rootRoute, path: '/a' })
  const bRoute = new BaseRoute({ getParentRoute: () => rootRoute, path: '/b' })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, aRoute, bRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    ...options,
  })
}

/** Mimics the Transitioner: load runs on every history event. */
async function mount(router: ReturnType<typeof createRouter>) {
  router.history.subscribe(router.load)
  await router.load()
}

/** Drive a browser-style traversal and await the load it triggers. */
async function traverse(
  router: ReturnType<typeof createRouter>,
  fn: () => void,
) {
  fn()
  await router.latestLoadPromise
}

describe('replayViewTransitionOnTraversal', () => {
  test('replays the view transition on browser back', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    await mount(router)

    await router.navigate({ to: '/a', viewTransition: true })
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1) // the forward navigation itself
    startViewTransitionSpy.mockClear()

    await traverse(router, () => router.history.back())

    // Back to "/" replays the transition recorded for the "/a" entry.
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/')
  })

  test('replays the view transition on browser forward', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    await mount(router)

    await router.navigate({ to: '/a', viewTransition: true })
    await traverse(router, () => router.history.back())
    startViewTransitionSpy.mockClear()

    await traverse(router, () => router.history.forward())

    // Forward to "/a" replays via the arriving entry's recorded transition.
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/a')
  })

  test('does not transition a traversal across an edge that never opted in', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    await mount(router)

    await router.navigate({ to: '/a' }) // plain navigation, no viewTransition
    expect(startViewTransitionSpy).not.toHaveBeenCalled()

    await traverse(router, () => router.history.back())

    expect(startViewTransitionSpy).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/')
  })

  test('does not clobber an explicitly-set shouldViewTransition during a traversal', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    router.isViewTransitionTypesSupported = true
    await mount(router)

    const recorded: ViewTransitionOptions = { types: ['recorded'] }
    await router.navigate({ to: '/a', viewTransition: recorded })
    startViewTransitionSpy.mockClear()

    // Something set a transition for this traversal explicitly; replay must not override it.
    const explicit: ViewTransitionOptions = { types: ['explicit'] }
    router.shouldViewTransition = explicit

    await traverse(router, () => router.history.back())

    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
    expect(startViewTransitionSpy.mock.calls[0]![0]).toMatchObject({
      types: ['explicit'],
    })
  })

  test('preserves a ViewTransitionOptions object with functional types by identity', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    router.isViewTransitionTypesSupported = true
    await mount(router)

    // A function is NOT structured-cloneable, so this value could not survive being written
    // to history.state — it survives only because the map holds it by reference.
    const typesFn = vi.fn(() => ['slide'])
    const vt: ViewTransitionOptions = { types: typesFn }

    await router.navigate({ to: '/a', viewTransition: vt })

    // The exact object is held by reference for the "/a" entry (index 1).
    expect(router.viewTransitionsByIndex.get(1)).toBe(vt)

    startViewTransitionSpy.mockClear()
    typesFn.mockClear()

    await traverse(router, () => router.history.back())

    // The functional `types` was invoked and resolved on replay.
    expect(typesFn).toHaveBeenCalledTimes(1)
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
    expect(startViewTransitionSpy.mock.calls[0]![0]).toMatchObject({
      types: ['slide'],
    })
  })

  test('only traversals touching the transitioned entry replay', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    await mount(router)

    await router.navigate({ to: '/a' }) // "/a" = index 1, plain
    await router.navigate({ to: '/b', viewTransition: true }) // "/b" = index 2, recorded
    startViewTransitionSpy.mockClear()

    // Leaving the transitioned "/b" entry replays.
    await traverse(router, () => router.history.back())
    expect(router.state.location.pathname).toBe('/a')
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
    startViewTransitionSpy.mockClear()

    // A traversal between two non-transitioned entries ("/a" -> "/") does not.
    await traverse(router, () => router.history.back())
    expect(router.state.location.pathname).toBe('/')
    expect(startViewTransitionSpy).not.toHaveBeenCalled()
  })

  test('is a no-op when the option is disabled (default)', async () => {
    const router = createRouter() // option not set
    await mount(router)

    await router.navigate({ to: '/a', viewTransition: true })
    startViewTransitionSpy.mockClear()

    await traverse(router, () => router.history.back())

    // No replay: browser back is a hard cut by default.
    expect(startViewTransitionSpy).not.toHaveBeenCalled()
    expect(router.viewTransitionsByIndex.size).toBe(0)
  })

  test('replays on a multi-step GO traversal', async () => {
    const router = createRouter({ replayViewTransitionOnTraversal: true })
    await mount(router)

    await router.navigate({ to: '/a' }) // index 1, plain
    await router.navigate({ to: '/b', viewTransition: true }) // index 2, recorded
    startViewTransitionSpy.mockClear()

    // history.go(-2): "/b" (2) -> "/" (0). The transitioned entry (2) is the leaving
    // endpoint, so the GO branch replays it.
    await traverse(router, () => router.history.go(-2))

    expect(router.state.location.pathname).toBe('/')
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
  })

  test('falls back to defaultViewTransition when nothing is recorded', async () => {
    const router = createRouter({
      replayViewTransitionOnTraversal: true,
      defaultViewTransition: true,
    })
    await mount(router)

    await router.navigate({ to: '/a' }) // plain: no per-navigation opt-in recorded
    expect(router.viewTransitionsByIndex.has(1)).toBe(false)
    startViewTransitionSpy.mockClear()

    await traverse(router, () => router.history.back())

    // The traversal still transitions, but via defaultViewTransition — the option
    // does not suppress it.
    expect(startViewTransitionSpy).toHaveBeenCalledTimes(1)
  })
})
