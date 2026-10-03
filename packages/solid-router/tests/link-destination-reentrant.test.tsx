import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
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

const operations = new Set<Promise<unknown>>()
afterEach(async () => {
  await Promise.allSettled(operations)
  operations.clear()
  cleanup()
})

test('a bounded updater can read and write its own signal without self-invalidating builds', async () => {
  const [stamp, setStamp] = createSignal(0)
  const reads: Array<number> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => (
      <>
        <Link
          to="/target"
          search={(previous: { page: number }) => {
            const value = stamp()
            reads.push(value)
            // A finite write bounds the probe even if a candidate retracks itself.
            if (value < 2) {
              setStamp(value + 1)
            }
            return { page: previous.page, stamp: value }
          }}
        >
          Writing updater
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
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Writing updater')
  expect(reads).toEqual([0])
  expect(stamp()).toBe(1)
  expect(link).toHaveAttribute('href', '/target?page=1&stamp=0')
  await router.navigate({ to: '/source', search: { page: 2 } })
  expect(reads).toEqual([0, 1])
  expect(stamp()).toBe(2)
  expect(link).toHaveAttribute('href', '/target?page=2&stamp=1')
})

test('a once-only synchronous navigation from an updater preserves its source and navigates once', async () => {
  let navigations = 0
  const reads: Array<number> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => (
      <>
        <Link
          to="/target"
          search={(previous: { page: number }) => {
            reads.push(previous.page)
            if (!navigations) {
              navigations++
              operations.add(
                router.navigate({ to: '/source', search: { page: 2 } }),
              )
            }
            return previous
          }}
        >
          Navigating updater
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
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory({ initialEntries: ['/source?page=1'] })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history,
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Navigating updater')
  await Promise.all(operations)
  await waitFor(() => expect(link).toHaveAttribute('href', '/target?page=2'))
  expect(navigations).toBe(1)
  expect(history.length).toBe(2)
  expect(router.state.location.search.page).toBe(2)
  expect(reads[0]).toBe(1)
  expect(reads.at(-1)).toBe(2)
  console.info('Solid reentrant updater evaluations', reads)
})
