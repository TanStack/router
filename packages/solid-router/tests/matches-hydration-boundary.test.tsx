import { afterEach, describe, expect, test, vi } from 'vitest'
import { sharedConfig } from 'solid-js'
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

describe('Matches pending UI (router state, no router-owned boundaries)', () => {
  test('navigating to a route with an unresolved chunk presents the configured pending UI', async () => {
    const { router, resolveIndexChunk, resolveOtherChunk } =
      createChunkedTestRouter({
        defaultPendingComponent: () => <div>Pending...</div>,
        defaultPendingMs: 0,
        defaultPendingMinMs: 0,
      })
    resolveIndexChunk({ default: () => <div>Index loaded</div> })
    await router.load()

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Index loaded')).toBeInTheDocument()

    router.navigate({ to: '/other' })
    expect(await screen.findByText('Pending...')).toBeInTheDocument()

    resolveOtherChunk({ default: () => <div>Other loaded</div> })
    expect(await screen.findByText('Other loaded')).toBeInTheDocument()
  })

  test('the $_TSR stream protocol (Start / RouterClient) hydrates pending data-only matches without errors', async () => {
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
    expect(
      router.state.matches.some((match) => match.status === 'pending'),
    ).toBe(true)
    expect(error).not.toHaveBeenCalled()
  })

  test('CSR with no pending UI and an unresolved chunk renders nothing, then content, without errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { router, resolveIndexChunk } = createChunkedTestRouter()

    const { container } = render(() => <RouterProvider router={router} />)

    expect(container.textContent).toBe('')

    resolveIndexChunk({ default: () => <div>Index loaded</div> })

    expect(await screen.findByText('Index loaded')).toBeInTheDocument()
    expect(error).not.toHaveBeenCalled()
  })
})
