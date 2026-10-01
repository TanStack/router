import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const histories: Array<{ destroy: () => void }> = []
afterEach(() => {
  cleanup()
  histories.splice(0).forEach((history) => history.destroy())
  vi.restoreAllMocks()
})

test('equal destination props preserve the subscribed derivation across parent renders', async () => {
  const version = Vue.ref(0)
  const search = vi.fn(() => ({ marker: 'current' }))
  const root = createRootRoute({
    component: () => (
      <>
        <Link
          to="/items/$id"
          params={{ id: 'one' }}
          search={search}
          activeOptions={{ exact: true }}
          title={`Render ${version.value}`}
        >
          Stable destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const item = createRoute({ getParentRoute: () => root, path: '/items/$id' })
  const history = createMemoryHistory({ initialEntries: ['/items/one'] })
  histories.push(history)
  const router = createRouter({ routeTree: root.addChildren([item]), history })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Stable destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/items/one?marker=current')
  search.mockClear()

  for (let value = 1; value <= 3; value++) {
    version.value = value
    await waitFor(() => expect(link).toHaveAttribute('title', `Render ${value}`))
    await Vue.nextTick()
    expect(link).toHaveAttribute('href', '/items/one?marker=current')
    expect(search).not.toHaveBeenCalled()
  }
})

test('replacing a callback replaces native dependencies without retaining old captures', async () => {
  const firstValue = Vue.ref('first')
  const secondValue = Vue.ref('second')
  const first = vi.fn(() => ({ marker: firstValue.value }))
  const second = vi.fn(() => ({ marker: secondValue.value }))
  const search = Vue.shallowRef(first)
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" search={search.value}>
          Reactive destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const home = createRoute({ getParentRoute: () => root, path: '/home' })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory({ initialEntries: ['/home'] })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([home, target]),
    history,
  })
  const view = render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Reactive destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/target?marker=first')

  search.value = second
  await waitFor(() => expect(link).toHaveAttribute('href', '/target?marker=second'))
  first.mockClear()
  second.mockClear()

  firstValue.value = 'obsolete'
  await Vue.nextTick()
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
  expect(link).toHaveAttribute('href', '/target?marker=second')

  secondValue.value = 'latest'
  await waitFor(() => expect(link).toHaveAttribute('href', '/target?marker=latest'))
  expect(second).toHaveBeenCalled()

  view.unmount()
  first.mockClear()
  second.mockClear()
  firstValue.value = 'disposed-first'
  secondValue.value = 'disposed-second'
  await Vue.nextTick()
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
})
