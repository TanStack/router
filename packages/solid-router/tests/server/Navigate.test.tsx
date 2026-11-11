import { renderToString } from 'solid-js/web'
import { expect, test, vi } from 'vitest'
import {
  Navigate,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'

test('Navigate leaves the request location unchanged during server rendering', () => {
  const root = createRootRoute()
  const next = createRoute({ getParentRoute: () => root, path: '/next' })
  const router = createRouter({
    routeTree: root.addChildren([next]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
  const navigate = vi.spyOn(router, 'navigate')
  const html = renderToString(() => (
    <RouterContextProvider router={router}>
      {() => (
        <>
          <Navigate to="/next" />
          <span>Request content</span>
        </>
      )}
    </RouterContextProvider>
  ))
  expect(html).toContain('Request content')
  expect(navigate).not.toHaveBeenCalled()
  expect(router.state.location.href).toBe('/')
})
