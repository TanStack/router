import { expect, test } from 'vitest'
import { renderToStringAsync } from 'solid-js/web'
import {
  RouteAnnouncer,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'

test('renders an empty live region during SSR', async () => {
  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <main>
        <RouteAnnouncer />
        <h1>Home</h1>
      </main>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  const html = await renderToStringAsync(() => (
    <RouterProvider router={router} />
  ))

  expect(html).toMatch(/<div[^>]*aria-live="polite"[^>]*><\/div>/)
  expect(html).include('aria-atomic="true"')
})
