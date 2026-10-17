import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../src'

const message = 'Failed to fetch dynamically imported module: /assets/page.js'
const storageKey = `tanstack_router_reload:${message}`

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

function renderMissingPage() {
  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: lazyRouteComponent(() => Promise.reject(new Error(message))),
    errorComponent: ({ error }) => (
      <p>Route error: {(error as Error).message}</p>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

test('a missing module reloads the document once instead of rendering an error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const router = renderMissingPage()
  await router.load()
  await vi.waitFor(() => expect(sessionStorage.getItem(storageKey)).toBe('1'))
  expect(screen.queryByText(/Route error/)).toBeNull()
})

test('a missing module that already reloaded goes to the route error boundary', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sessionStorage.setItem(storageKey, '1')
  renderMissingPage()
  expect(await screen.findByText(`Route error: ${message}`)).toBeTruthy()
})
