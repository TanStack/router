import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, expect, test } from 'vitest'
import { defaultStringifySearch } from '@tanstack/router-core'
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

test('stable destination proxies catch up to nested mutations on the next source publication', async () => {
  const [params, setParams] = createStore({ id: 'one' })
  const [search, setSearch] = createStore({ page: 1 })
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/items/$id" params={params} search={search}>
          Mutable destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <h1>Source</h1>,
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    component: () => <h1>Item</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, item]),
    history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Mutable destination')
  expect(link).toHaveAttribute('href', '/items/one?page=1')
  setParams('id', 'two')
  setSearch('page', 2)
  // Existing core build reads are untracked; source publication is the catchup.
  expect(link).toHaveAttribute('href', '/items/one?page=1')
  await router.navigate({ to: '/source', search: { page: 2 } })
  expect(link).toHaveAttribute('href', '/items/two?page=2')
})

test('an untracked search formatter signal catches up on the next source publication', async () => {
  const [stamp, setStamp] = createSignal('one')
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" search={{ fixed: true }}>
          Formatted destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <h1>Source</h1>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    component: () => <h1>Target</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
    stringifySearch: (search) =>
      defaultStringifySearch({ ...search, stamp: stamp() }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Formatted destination')
  expect(link).toHaveAttribute('href', '/target?fixed=true&stamp=one')
  setStamp('two')
  expect(link).toHaveAttribute('href', '/target?fixed=true&stamp=one')
  await router.navigate({ to: '/source', search: { page: 2 } })
  expect(link).toHaveAttribute('href', '/target?fixed=true&stamp=two')
})

test('events observe stable proxy mutations made before another source publication', async () => {
  const [params, setParams] = createStore({ id: 'one' })
  const [search, setSearch] = createStore({ page: 1 })
  const visits: Array<{ id: string; page: number; preload: boolean }> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => (
      <>
        <Link
          to="/items/$id"
          params={params}
          search={search}
          preload="intent"
          preloadDelay={0}
        >
          Live proxy target
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <h1>Source</h1>,
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    beforeLoad: ({ params, search, preload }) => {
      visits.push({ id: params.id, page: Number(search.page), preload })
    },
    component: () => <h1>Item</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, item]),
    history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Live proxy target')
  expect(link).toHaveAttribute('href', '/items/one?page=1')
  setParams('id', 'two')
  setSearch('page', 2)
  expect(router.state.location.href).toBe('/source?page=1')
  fireEvent.focus(link)
  await waitFor(() =>
    expect(visits).toContainEqual({ id: 'two', page: 2, preload: true }),
  )
  expect(router.state.location.href).toBe('/source?page=1')
  fireEvent.click(link)
  await screen.findByText('Item')
  expect(visits).toContainEqual({ id: 'two', page: 2, preload: false })
  expect(router.state.location.pathname).toBe('/items/two')
  expect(router.state.location.search.page).toBe(2)
})
