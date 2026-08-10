import { describe, expect, it } from 'vitest'
import { Loading } from 'solid-js'
import { renderToString } from '@solidjs/web'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'
import { RouterProvider } from '../../src/RouterProvider'
import { _resolveMatchesLoadingBoundary } from '../../src/Matches'
import { SafeFragment } from '../../src/SafeFragment'

function createTestRouter(routerOptions?: Record<string, unknown>) {
  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    ...routerOptions,
  } as any)
}

describe('Matches global loading boundary (server)', () => {
  // The boundary decision must be symmetric between server and client:
  // Solid claims server nodes positionally through boundary structure, so
  // the hydrating client may only render the wrapper where the server
  // rendered it. External SSR (no `router.ssr`) with configured pending UI
  // therefore renders the wrapper on the server too.
  it('renders the wrapper on the server when pending UI is configured (external SSR shape)', async () => {
    const router = createTestRouter({
      defaultPendingComponent: () => <div>Pending...</div>,
    })
    await router.load()

    expect(_resolveMatchesLoadingBoundary(router)).toBe(Loading)

    const html = await renderToString(() => (
      <RouterProvider router={router} />
    ))
    expect(html).toContain('Index')
    expect(html).not.toContain('Pending...')
  })

  it('renders no wrapper on the server when nothing is configured', async () => {
    const router = createTestRouter()
    await router.load()

    expect(_resolveMatchesLoadingBoundary(router)).toBe(SafeFragment)

    const html = await renderToString(() => (
      <RouterProvider router={router} />
    ))
    expect(html).toContain('Index')
  })
})
