import * as Solid from 'solid-js'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'

const operations = new Set<Promise<unknown>>()
function track<T>(operation: Promise<T>) {
  operations.add(operation)
  return operation
}

afterEach(async () => {
  if (vi.isFakeTimers()) {
    await vi.runAllTimersAsync()
  }
  await Promise.allSettled(operations)
  operations.clear()
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('frozen caller options preserve the destination across source changes, intent and validated click', async () => {
  const visits: Array<{ preload: boolean; checked: boolean }> = []
  const borrowed = Object.freeze({
    to: '/target' as const,
    search: Object.freeze({ tracked: 'static' }),
    preload: 'intent' as const,
    preloadDelay: 0,
  })
  function StaticLink() {
    const props = useLinkProps(borrowed)
    return <a {...props}>Static target</a>
  }
  const root = createRootRoute({
    component: () => (
      <>
        <StaticLink />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>Source</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    validateSearch: (search) => ({
      tracked: String(search.tracked),
      checked: true,
    }),
    beforeLoad: ({ preload, search }) => {
      visits.push({ preload, checked: search.checked })
    },
    component: () => <div>Target</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Static target')
  expect(link).toHaveAttribute('href', '/target?tracked=static')
  await track(router.navigate({ to: '/source', search: { page: 2 } }))
  expect(link).toHaveAttribute('href', '/target?tracked=static')
  fireEvent.focus(link)
  await waitFor(() =>
    expect(visits).toContainEqual({ preload: true, checked: true }),
  )
  fireEvent.click(link)
  expect(await screen.findByText('Target')).toBeInTheDocument()
  expect(visits).toContainEqual({ preload: false, checked: true })
  expect(router.state.location.search).toEqual({
    tracked: 'static',
    checked: true,
  })
  expect(borrowed).not.toHaveProperty('_fromLocation')
  expect(borrowed.search).toEqual({ tracked: 'static' })
})

test('navigation controls and handlers stay live while intent is queued', async () => {
  const [replace, setReplace] = Solid.createSignal(false)
  const [handler, setHandler] = Solid.createSignal<
    Solid.JSX.EventHandler<HTMLAnchorElement, MouseEvent>
  >(() => {})
  const reads: Array<number> = []
  const visits: Array<boolean> = []
  const currentHandler = vi.fn()
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => (
      <>
        <Link
          to="/target"
          search={(previous: { page: number }) => {
            reads.push(previous.page)
            return { page: previous.page }
          }}
          replace={replace()}
          onClick={handler()}
          preload="intent"
          preloadDelay={50}
        >
          Live target
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>Source</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    beforeLoad: ({ preload }) => {
      visits.push(preload)
    },
    component: () => <div>Target</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/source?page=1'] })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history,
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Live target')
  expect(reads).toEqual([1])
  vi.useFakeTimers()
  fireEvent.focus(link)
  await vi.advanceTimersByTimeAsync(25)
  setReplace(true)
  setHandler(() => currentHandler)
  expect(reads.every((page) => page === 1)).toBe(true)
  await vi.advanceTimersByTimeAsync(26)
  expect(visits).toContain(true)
  fireEvent.click(link)
  await vi.runAllTimersAsync()
  expect(screen.getByText('Target')).toBeInTheDocument()
  expect(currentHandler).toHaveBeenCalledOnce()
  expect(visits).toContain(false)
  expect(history.location.state.__TSR_index).toBe(0)
  expect(router.state.location.search).toEqual({ page: 1 })
})

test('updater-captured signals remain untracked until the owning source changes', async () => {
  const [marker, setMarker] = Solid.createSignal(0)
  const reads: Array<number> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => (
      <>
        <Link
          to="/target"
          search={(previous: { page: number }) => {
            reads.push(marker())
            return previous
          }}
        >
          Tracked source
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>Source</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    component: () => <div>Target</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Tracked source')
  expect(reads).toEqual([0])
  setMarker(1)
  expect(reads).toEqual([0])
  expect(link).toHaveAttribute('href', '/target?page=1')
  await track(router.navigate({ to: '/source', search: { page: 2 } }))
  expect(reads).toEqual([0, 1])
  expect(link).toHaveAttribute('href', '/target?page=2')
})

test('reactive destination params/search and external transitions update the destination', async () => {
  const [id, setId] = Solid.createSignal('one')
  const [page, setPage] = Solid.createSignal(1)
  const [to, setTo] = Solid.createSignal('/items/$id')
  const root = createRootRoute({
    component: () => (
      <>
        <Link to={to()} params={{ id: id() }} search={{ page: page() }}>
          Changing target
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Source</div>,
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    component: () => <div>Item</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, item]),
    history: createMemoryHistory(),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByText('Changing target')
  expect(link).toHaveAttribute('href', '/items/one?page=1')
  Solid.batch(() => {
    setId('two')
    setPage(2)
  })
  expect(link).toHaveAttribute('href', '/items/two?page=2')
  setTo('https://example.com/path')
  expect(link).toHaveAttribute('href', 'https://example.com/path')
  expect(link).not.toHaveAttribute('aria-current')
  setTo('/items/$id')
  expect(link).toHaveAttribute('href', '/items/two?page=2')
  fireEvent.click(link)
  expect(await screen.findByText('Item')).toBeInTheDocument()
  expect(router.state.location.href).toBe('/items/two?page=2')
})
