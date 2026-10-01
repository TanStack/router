import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('queued link consumers observe configuration updated after location publication', async () => {
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: () => (
      <>
        <Link to="/target" search={true}>
          Configured destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    trailingSlash: 'never' as 'never' | 'always',
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/source?marker=before'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', {
    name: 'Configured destination',
  })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/target?marker=before')
  const navigation = router.navigate({
    to: '/source',
    search: { marker: 'after' },
  })
  router.update({ trailingSlash: 'always' })
  await navigation
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/?marker=after')
  router.history.destroy()
})
