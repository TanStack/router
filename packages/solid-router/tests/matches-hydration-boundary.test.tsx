import { afterEach, describe, expect, test, vi } from 'vitest'
import { Loading, sharedConfig } from 'solid-js'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { _resolveMatchesLoadingBoundary } from '../src/Matches'
import { SafeFragment } from '../src/SafeFragment'
import { lazyRouteComponent } from '../src/lazyRouteComponent'

afterEach(() => {
  sharedConfig.hydrating = false
  delete (window as any).$_TSR
  vi.restoreAllMocks()
  cleanup()
})

function createChunkedTestRouter(routerOptions?: Record<string, unknown>) {
  let resolveIndexChunk!: (mod: { default: () => any }) => void
  const indexChunkPromise = new Promise<{ default: () => any }>((resolve) => {
    resolveIndexChunk = resolve
  })
  let resolveOtherChunk!: (mod: { default: () => any }) => void
  const otherChunkPromise = new Promise<{ default: () => any }>((resolve) => {
    resolveOtherChunk = resolve
  })

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: lazyRouteComponent(() => indexChunkPromise),
  })
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: lazyRouteComponent(() => otherChunkPromise),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    ...routerOptions,
  } as any)

  return { router, resolveIndexChunk, resolveOtherChunk }
}

describe('Matches global loading boundary', () => {
  test('renders the wrapper only when the app configured pending UI', async () => {
    const { router, resolveIndexChunk } = createChunkedTestRouter({
      defaultPendingComponent: () => <div>Pending...</div>,
    })
    resolveIndexChunk({ default: () => <div>Index</div> })
    await router.load()

    expect(_resolveMatchesLoadingBoundary(router)).toBe(Loading)
  })

  test('renders no wrapper when nothing is configured', async () => {
    const { router, resolveIndexChunk } = createChunkedTestRouter()
    resolveIndexChunk({ default: () => <div>Index</div> })
    await router.load()

    expect(_resolveMatchesLoadingBoundary(router)).toBe(SafeFragment)
  })

  test('the boundary decision ignores hydration state, so hydrated apps keep their configured pending UI for later navigations', async () => {
    const { router, resolveIndexChunk } = createChunkedTestRouter({
      defaultPendingComponent: () => <div>Pending...</div>,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })
    resolveIndexChunk({ default: () => <div>Index loaded</div> })
    await router.load()

    // Regression guard for the frozen-decision bug: the decision is made
    // once per `Matches` instance, so consulting "currently hydrating" here
    // would permanently disable the configured pending UI for every
    // post-hydration navigation of a hydrated app. The wrapper decision must
    // be identical whether or not a hydration pass is in flight — the
    // matching server render contains the same boundary (see the symmetry
    // notes on `_resolveMatchesLoadingBoundary`).
    sharedConfig.hydrating = true
    try {
      expect(_resolveMatchesLoadingBoundary(router)).toBe(Loading)
    } finally {
      sharedConfig.hydrating = false
    }
    expect(_resolveMatchesLoadingBoundary(router)).toBe(Loading)

    // And behaviorally: navigating to a route whose chunk is unresolved
    // must present the configured pending UI.
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Index loaded')).toBeInTheDocument()

    router.navigate({ to: '/other' })
    expect(await screen.findByText('Pending...')).toBeInTheDocument()
  })

  test('disableGlobalCatchBoundary always skips, even with configured pending UI', () => {
    const rootRoute = createRootRoute({})
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      disableGlobalCatchBoundary: true,
      defaultPendingComponent: () => <div>Pending...</div>,
    })

    expect(_resolveMatchesLoadingBoundary(router)).toBe(SafeFragment)
  })

  test('the $_TSR stream protocol (Start / RouterClient) still skips via router.ssr, even with pending data-only matches', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rootRoute = createRootRoute({})
    const reportRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/report',
      ssr: 'data-only',
      loader: () => 'report',
      component: () => <div>Report</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([reportRoute]),
      history: createMemoryHistory({ initialEntries: ['/report'] }),
      defaultPendingComponent: () => <div>Pending...</div>,
    })

    const matches = router.matchRoutes(router.latestLocation)
    window.$_TSR = {
      router: {
        dehydratedData: {},
        manifest: { routes: {} },
        matches: matches.map((match, index) => ({
          i: dehydrateSsrMatchId(match.id),
          s: 'success',
          ssr: index === 1 ? 'data-only' : true,
          l: index === 1 ? 'report' : undefined,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
    }

    await hydrate(router)

    expect(router.ssr).toBeTruthy()
    // The data-only match hydrates as pending — a legitimate protocol state
    // where a settled boundary is not guaranteed, so the wrapper is skipped.
    // `attachRouterServerSsrUtils` sets `router.ssr` on the server too, so
    // the skip is symmetric with the server-rendered tree.
    expect(
      router.state.matches.some((match) => match.status === 'pending'),
    ).toBe(true)
    expect(_resolveMatchesLoadingBoundary(router)).toBe(SafeFragment)
    expect(error).not.toHaveBeenCalled()
  })

  test('CSR with no pending UI and an unresolved chunk renders nothing, then content, without errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router, resolveIndexChunk } = createChunkedTestRouter()

    const { container } = render(() => <RouterProvider router={router} />)

    // No implicit fallback: pending chunk state propagates as ordinary
    // Solid async, so nothing is presented until the chunk resolves.
    expect(container.textContent).toBe('')

    resolveIndexChunk({ default: () => <div>Index loaded</div> })

    expect(await screen.findByText('Index loaded')).toBeInTheDocument()
    expect(error).not.toHaveBeenCalled()
  })
})
