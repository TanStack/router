import { renderToString } from 'react-dom/server'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('intent preload of a departing Link receives its displayed params and search', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const seen: Array<{ id: string; visit: number; preload: boolean }> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a/$id',
    component: () => (
      <Link
        to="/inspect/$id"
        params={true}
        search={true}
        preload="intent"
        preloadDelay={0}
        data-testid="preload"
      >
        inspect
      </Link>
    ),
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b/$id',
    loader: () => pending,
    component: () => <div>destination</div>,
  })
  const inspect = createRoute({
    getParentRoute: () => root,
    path: '/inspect/$id',
    loaderDeps: ({ search }) => ({ visit: search.visit }),
    loader: ({ params, deps, preload }) => {
      seen.push({ id: params.id, visit: deps.visit, preload })
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b, inspect]),
    history: createMemoryHistory({ initialEntries: ['/a/source?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('preload')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/b/$id',
      params: { id: 'next' },
      search: { visit: 2 },
    })
  })
  expect(link.getAttribute('href')).toBe('/inspect/source?visit=1')
  fireEvent.mouseEnter(link)
  await waitFor(() =>
    expect(seen).toEqual([{ id: 'source', visit: 1, preload: true }]),
  )
  await act(async () => {
    release()
    await navigation
  })
})

test('server route components receive the exact router instance and render inherited Links', async () => {
  const seen: Array<ReturnType<typeof useRouter>> = []
  const root = createRootRoute({ component: Outlet })
  const route = createRoute({
    getParentRoute: () => root,
    path: '/server',
    component: function ServerLinks() {
      seen.push(useRouter())
      return (
        <Link to="/server" search={true}>
          server
        </Link>
      )
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/server?visit=3'] }),
    isServer: true,
  })
  await router.load()
  const html = renderToString(<RouterProvider router={router} />)
  expect(seen).toHaveLength(1)
  expect(seen[0]).toBe(router)
  expect(html).toContain('href="/server?visit=3"')
})

test('useRouter with warnings disabled preserves its missing-provider result', () => {
  const warn = vi.spyOn(console, 'warn')
  let received: unknown
  function Probe() {
    received = useRouter({ warn: false })
    return null
  }
  render(<Probe />)
  expect(received).toBeNull()
  expect(warn).not.toHaveBeenCalled()
})

test('a server context provider supports router identity and external Links before history is configured', () => {
  const root = createRootRoute({})
  const router = createRouter({ routeTree: root, isServer: true })
  let received: unknown
  function Probe() {
    received = useRouter()
    return <Link to="https://example.com/next">external</Link>
  }
  const html = renderToString(
    <RouterContextProvider router={router}>
      <Probe />
    </RouterContextProvider>,
  )
  expect(received).toBe(router)
  expect(html).toContain('href="https://example.com/next"')
})
