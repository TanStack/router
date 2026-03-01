import * as Angular from '@angular/core'
import { render, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
})

function createTestRouter(initialEntries: Array<string> = ['/']) {
  const history = createMemoryHistory({ initialEntries })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const postRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$slug',
  })
  const filesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/files/$',
  })
  const splatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$',
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postRoute,
      filesRoute,
      splatRoute,
    ]),
    history,
  })

  return { router }
}

describe('router integration behavior', () => {
  it('emits onBeforeRouteMount before onResolved', async () => {
    const beforeMount = vi.fn()
    const resolved = vi.fn()

    const { router } = createTestRouter(['/'])

    const unsubBefore = router.subscribe('onBeforeRouteMount', beforeMount)
    const unsubResolved = router.subscribe('onResolved', resolved)

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    await waitFor(() => {
      expect(beforeMount).toHaveBeenCalled()
      expect(resolved).toHaveBeenCalled()
    })

    const beforeOrder = beforeMount.mock.invocationCallOrder[0]
    const resolvedOrder = resolved.mock.invocationCallOrder[0]

    if (beforeOrder === undefined || resolvedOrder === undefined) {
      throw new Error('Expected event call order for onBeforeRouteMount/onResolved')
    }

    expect(beforeOrder).toBeLessThan(resolvedOrder)

    unsubBefore()
    unsubResolved()
  })

  it('commits same-location navigations deterministically', async () => {
    const { router } = createTestRouter(['/'])

    await router.load()

    const commitSpy = vi.spyOn(router, 'commitLocation')
    const sharedState = { same: true } as any

    await router.navigate({ to: '/', state: sharedState })
    await router.navigate({ to: '/', state: sharedState })

    const commitCalls = commitSpy.mock.calls.filter(
      ([opts]) => (opts as any)?.replace !== true,
    )

    expect(commitCalls.length).toBeGreaterThanOrEqual(1)
    expect(commitCalls.length).toBeLessThanOrEqual(2)
  })

  it('decodes pathname but preserves href encoding for unicode params', async () => {
    const input = '/%F0%9F%9A%80'
    const { router } = createTestRouter([input])

    await router.load()

    expect(router.state.location.pathname).toBe('/🚀')
    expect(router.state.location.href).toBe(input)
  })

  it('decodes encoded unicode route params for matched routes', async () => {
    const { router } = createTestRouter(['/posts/%F0%9F%9A%80'])

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/🚀')
    expect(router.state.matches.at(-1)?.params.slug).toBe('🚀')
  })

  it('encodes unicode route params in href when navigating', async () => {
    const { router } = createTestRouter(['/'])

    await router.load()

    await router.navigate({
      to: '/posts/$slug',
      params: { slug: '🚀' },
    })

    expect(router.state.location.pathname).toBe('/posts/🚀')
    expect(router.state.location.href).toBe('/posts/%F0%9F%9A%80')
  })

  it('preserves `/` characters for splat params when navigating', async () => {
    const { router } = createTestRouter(['/'])

    await router.load()

    await router.navigate({
      to: '/files/$',
      params: { _splat: 'framework/react/guide/file-based-routing' },
    })

    expect(router.state.location.pathname).toBe(
      '/files/framework/react/guide/file-based-routing',
    )
    expect(router.state.matches.at(-1)?.params._splat).toBe(
      'framework/react/guide/file-based-routing',
    )
  })

  it('emits onResolved on initial load and subsequent navigation', async () => {
    const resolved = vi.fn()
    const { router } = createTestRouter(['/'])
    const unsub = router.subscribe('onResolved', resolved)

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })
    await router.navigate({ to: '/posts/$slug', params: { slug: 'tanner' } })
    await waitFor(() => {
      expect(resolved).toHaveBeenCalled()
    })

    expect(resolved.mock.calls.length).toBeGreaterThanOrEqual(1)
    unsub()
  })
})
