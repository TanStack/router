import * as React from 'react'
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
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  defaultStringifySearch,
  useLinkProps,
} from '../src'

afterEach(cleanup)

test('a Link keeps its source when search formatting navigates before inherited fields are read', async () => {
  const states: Array<string> = []
  const maskSources: Array<string> = []
  const hrefs: Array<string | undefined> = []
  let navigation: Promise<void> | undefined
  let triggered = false
  function SourceLink() {
    const [armed, setArmed] = React.useState(false)
    const props = useLinkProps({
      to: '/target',
      search: { value: armed ? 'trigger' : 'initial' },
      hash: true,
      state: (state: any) => {
        if (armed) {
          states.push(state.source)
        }
        return state
      },
      mask: {
        to: '/visible',
        search: (search: Record<string, unknown>) => {
          if (armed) {
            maskSources.push(String(search.value))
          }
          return search
        },
        hash: true,
        state: true,
      },
    })
    if (armed) {
      hrefs.push(props.href)
    }
    return (
      <>
        <button onClick={() => setArmed(true)}>Rebuild source</button>
        <a {...props}>Target</a>
      </>
    )
  }
  const root = createRootRoute({
    validateSearch: (search) => ({ value: String(search.value ?? '') }),
    component: () => (
      <>
        <SourceLink />
        <Outlet />
      </>
    ),
  })
  const routes = ['/a', '/b', '/target', '/visible'].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  )
  const history = createMemoryHistory({ initialEntries: ['/a?value=a#old'] })
  history.replace('/a?value=a#old', { source: 'a' } as any)
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history,
    stringifySearch: (search) => {
      if (search.value === 'trigger' && !triggered) {
        triggered = true
        navigation = router.navigate({
          to: '/b',
          search: { value: 'b' },
          hash: 'new',
          state: { source: 'b' } as any,
        })
      }
      return defaultStringifySearch(search)
    },
  })
  try {
    render(<RouterProvider router={router} />)
    await screen.findByRole('link', { name: 'Target' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rebuild source' }))
    })
    expect(triggered).toBe(true)
    expect(states[0]).toBe('a')
    expect(maskSources[0]).toBe('a')
    expect(hrefs).toContain('/visible?value=a#old')
  } finally {
    await act(async () => navigation)
    history.destroy()
  }
})

test('click uses current navigation options when the destination is unchanged', async () => {
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: function Index() {
      const [replace, setReplace] = React.useState(false)
      return (
        <>
          <button onClick={() => setReplace(true)}>Replace on click</button>
          <Link to="/target" replace={replace}>
            Target
          </Link>
        </>
      )
    },
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory()
  const router = createRouter({
    routeTree: root.addChildren([index, target]),
    history,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Target' })
  fireEvent.click(screen.getByRole('button', { name: 'Replace on click' }))
  await act(async () => {
    fireEvent.click(link)
  })
  expect(history.location.pathname).toBe('/target')
  expect(history.length).toBe(1)
})

test('departing Links cancel only scheduled intent preloads', async () => {
  const loader = vi.fn(() => null)
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <>
        {Array.from({ length: 1000 }, (_, i) => (
          <Link key={i} to="/target" preload="intent" preloadDelay={50}>
            Target {i}
          </Link>
        ))}
      </>
    ),
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    loader,
  })
  const router = createRouter({
    routeTree: root.addChildren([index, target]),
    history: createMemoryHistory(),
  })
  const view = render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Target 0' })
  vi.useFakeTimers()
  const cancel = vi.spyOn(globalThis, 'clearTimeout')
  try {
    fireEvent.mouseEnter(link)
    view.unmount()
    expect(
      cancel.mock.calls.filter(([timer]) => timer === undefined),
    ).toHaveLength(0)
    expect(
      cancel.mock.calls.filter(([timer]) => timer !== undefined),
    ).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(loader).not.toHaveBeenCalled()
  } finally {
    cancel.mockRestore()
    vi.useRealTimers()
  }
})

test.each([
  { mask: 'explicit', operation: 'click' },
  { mask: 'explicit', operation: 'preload' },
  { mask: 'configured', operation: 'click' },
  { mask: 'configured', operation: 'preload' },
] as const)(
  'departing Link $operation preserves its $mask mask source',
  async ({ mask, operation }) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const maskSearch = vi.fn((previous) => previous)
    const root = createRootRoute({
      component: Outlet,
      validateSearch: (search) => ({ value: String(search.value ?? '') }),
    })
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      component: () => (
        <Link
          to="/target"
          search={{ value: 'destination' }}
          mask={
            mask === 'explicit'
              ? { to: '/visible', search: maskSearch }
              : undefined
          }
          preload="intent"
          preloadDelay={0}
          data-testid="masked-source"
        />
      ),
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loader: () => pending,
    })
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const visible = createRoute({
      getParentRoute: () => root,
      path: '/visible',
    })
    const routeTree = root.addChildren([a, b, target, visible])
    const routeMask = createRouteMask({
      routeTree,
      from: '/target',
      to: '/visible',
      search: maskSearch,
    })
    const history = createMemoryHistory({ initialEntries: ['/a?value=old'] })
    const router = createRouter({
      routeTree,
      routeMasks: mask === 'configured' ? [routeMask] : undefined,
      history,
      defaultPendingMs: Infinity,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByTestId('masked-source')
    expect(link).toHaveAttribute('href', '/visible?value=old')
    let navigation!: Promise<void>
    try {
      act(() => {
        navigation = router.navigate({
          to: '/b',
          search: { value: 'new' },
        })
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
      const displayedHref = link.getAttribute('href')
      expect(displayedHref).toBe('/visible?value=old')
      maskSearch.mockClear()
      await act(async () => {
        fireEvent[operation === 'click' ? 'click' : 'mouseEnter'](link)
      })
      await waitFor(() => expect(maskSearch).toHaveBeenCalled())
      for (const [source] of maskSearch.mock.calls) {
        expect(source).toEqual({ value: 'old' })
      }
      if (operation === 'click') {
        await waitFor(() => {
          expect(router.state.location.pathname).toBe('/target')
          expect(history.location.href).toBe(displayedHref)
        })
      } else {
        expect(history.location.pathname).toBe('/b')
      }
    } finally {
      release()
      await act(() => navigation)
      history.destroy()
    }
  },
)

test.each(['click', 'preload'] as const)(
  'departing Link %s resolves from its displayed source',
  async (operation) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const search = vi.fn((previous) => previous)
    const root = createRootRoute({
      component: Outlet,
      validateSearch: (search) => ({ value: String(search.value ?? '') }),
    })
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      component: () => (
        <Link
          to="/a"
          search={search}
          preload="intent"
          preloadDelay={0}
          data-testid="source"
        />
      ),
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loader: () => pending,
    })
    const history = createMemoryHistory({ initialEntries: ['/a?value=old'] })
    const router = createRouter({
      routeTree: root.addChildren([a, b]),
      history,
      defaultPendingMs: Infinity,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByTestId('source')
    let navigation!: Promise<void>
    try {
      act(() => {
        navigation = router.navigate({
          to: '/b',
          search: { value: 'new' },
        } as any)
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
      expect(link).toHaveAttribute('href', '/a?value=old')
      search.mockClear()
      await act(async () => {
        fireEvent[operation === 'click' ? 'click' : 'mouseEnter'](link)
      })
      await waitFor(() => expect(search).toHaveBeenCalled())
      expect(search).toHaveBeenLastCalledWith({ value: 'old' })
      if (operation === 'click') {
        await waitFor(() => {
          expect(router.state.location.pathname).toBe('/a')
          expect(router.state.location.search.value).toBe('old')
        })
      }
    } finally {
      release()
      await act(() => navigation)
      history.destroy()
    }
  },
)

test('an abandoned speculative target does not retarget the committed Link subscription', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const attempted = vi.fn()
  function SuspendAfterLink({ target }: { target: '/a' | '/b' }) {
    if (target === '/b') {
      attempted()
      throw pending
    }
    return null
  }
  function Targets() {
    const [target, setTarget] = React.useState<'/a' | '/b'>('/a')
    return (
      <>
        <button onClick={() => React.startTransition(() => setTarget('/b'))}>
          Try suspended target
        </button>
        <button onClick={() => setTarget('/a')}>Keep committed target</button>
        <React.Suspense fallback={<p>Suspended target</p>}>
          <Link to={target} data-testid="committed-target" />
          <SuspendAfterLink target={target} />
        </React.Suspense>
      </>
    )
  }
  const root = createRootRoute({
    component: () => (
      <>
        <Targets />
        <Outlet />
      </>
    ),
  })
  const routes = ['/a', '/b', '/c'].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('committed-target')
  expect(link).toHaveAttribute('href', '/a')
  expect(link).toHaveAttribute('aria-current', 'page')

  fireEvent.click(screen.getByRole('button', { name: 'Try suspended target' }))
  await waitFor(() => expect(attempted).toHaveBeenCalled())
  expect(screen.queryByText('Suspended target')).not.toBeInTheDocument()
  expect(link).toHaveAttribute('href', '/a')

  await act(() => router.navigate({ to: '/c' }))
  expect(link).toHaveAttribute('href', '/a')
  expect(link).not.toHaveAttribute('aria-current')
  await act(() => router.navigate({ to: '/a' }))
  expect(link).toHaveAttribute('aria-current', 'page')

  fireEvent.click(screen.getByRole('button', { name: 'Keep committed target' }))
  await act(async () => release())
  await act(() => router.navigate({ to: '/b' }))
  expect(screen.getByTestId('committed-target')).toBe(link)
  expect(link).toHaveAttribute('href', '/a')
  expect(link).not.toHaveAttribute('aria-current')
  router.history.destroy()
})

test('departing Links retain their published source, including during parent renders, and catch up on a successor', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const leavingSearch = vi.fn((search) => search)
  const stayingSearch = vi.fn((search) => search)
  const root = createRootRoute({
    component: () => (
      <>
        <Link from="/a" to="/a" search={stayingSearch} data-testid="staying" />
        <Outlet />
      </>
    ),
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: function A() {
      const [count, setCount] = React.useState(0)
      return (
        <>
          <button onClick={() => setCount(count + 1)}>render {count}</button>
          <Link from="/" to="/a" search={leavingSearch} data-testid="leaving" />
        </>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: () => pending,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a?value=old'] }),
    defaultPendingMs: Infinity,
  })
  render(<RouterProvider router={router} />)
  const leaving = await screen.findByTestId('leaving')
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  const before = leavingSearch.mock.calls.length
  let navigation!: Promise<void>
  act(() => {
    navigation = router.navigate({ to: '/b', search: { value: 'new' } } as any)
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
  expect(screen.getByTestId('staying')).toHaveAttribute('href', '/a?value=new')
  expect(leavingSearch).toHaveBeenCalledTimes(before)
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  fireEvent.click(screen.getByRole('button', { name: 'render 0' }))
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  expect(leavingSearch).toHaveBeenCalledTimes(before)
  await act(() =>
    router.navigate({ to: '/a', search: { value: 'latest' } } as any),
  )
  expect(leaving).toHaveAttribute('href', '/a?value=latest')
  release()
  await act(() => navigation)
  expect(leaving).toHaveAttribute('href', '/a?value=latest')
  router.history.destroy()
})

test('fixed destinations observe custom history formatting on unrelated navigation', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="target" />
        <Outlet />
      </>
    ),
  })
  const a = createRoute({ getParentRoute: () => root, path: '/a' })
  const b = createRoute({ getParentRoute: () => root, path: '/b' })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory({ initialEntries: ['/a'] })
  const router = createRouter({
    routeTree: root.addChildren([a, b, target]),
    history: {
      ...history,
      createHref: (href) => `${href}#${history.location.pathname}`,
    },
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target#/a')
  await act(() => router.navigate({ to: '/b' }))

  await waitFor(() => expect(link).toHaveAttribute('href', '/target#/b'))
  history.destroy()
})

test('configuration changes invalidate a fixed destination immediately', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="target" />
        <Outlet />
      </>
    ),
  })
  const a = createRoute({ getParentRoute: () => root, path: '/a' })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([a, target]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target')
  act(() => router.update({ trailingSlash: 'always' } as any))

  await waitFor(() => expect(link).toHaveAttribute('href', '/target/'))
  router.history.destroy()
})

test('inherited params invalidate independently of the old activity pathname', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/teams/$teamId/settings" params={true} data-testid="target" />
        <Outlet />
      </>
    ),
  })
  const team = createRoute({
    getParentRoute: () => root,
    path: '/teams/$teamId',
  })
  const dashboard = createRoute({
    getParentRoute: () => team,
    path: 'dashboard',
  })
  const settings = createRoute({ getParentRoute: () => team, path: 'settings' })
  const router = createRouter({
    routeTree: root.addChildren([team.addChildren([dashboard, settings])]),
    history: createMemoryHistory({ initialEntries: ['/teams/a/dashboard'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/teams/a/settings')
  await act(() =>
    router.navigate({
      to: '/teams/$teamId/dashboard',
      params: { teamId: 'b' },
    }),
  )

  await waitFor(() => expect(link).toHaveAttribute('href', '/teams/b/settings'))
  expect(link).not.toHaveAttribute('aria-current')
  router.history.destroy()
})
