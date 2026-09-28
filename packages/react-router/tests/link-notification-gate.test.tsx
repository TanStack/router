import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import { hydrate } from '../src/ssr/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test.each([false, true])(
  'a retained owner catches navigation before it connects (StrictMode: %s)',
  async (strict) => {
    const gate = createControlledPromise<void>()
    const root = createRootRoute({ component: Outlet })
    const layout = createRoute({
      getParentRoute: () => root,
      path: '/layout',
      component: () => (
        <>
          <Link to="/layout/a">page a</Link>
          <Link to="/layout/b">page b</Link>
          <Outlet />
        </>
      ),
    })
    let navigation: Promise<void> | undefined
    const a = createRoute({
      getParentRoute: () => layout,
      path: 'a',
      component: function PageA() {
        const started = React.useRef(false)
        React.useLayoutEffect(() => {
          if (!started.current) {
            started.current = true
            navigation = router.navigate({ to: '/layout/b' })
          }
        }, [])
        return <div>Page A</div>
      },
    })
    const b = createRoute({
      getParentRoute: () => layout,
      path: 'b',
      loader: () => gate,
    })
    const router = createRouter({
      routeTree: root.addChildren([layout.addChildren([a, b])]),
      history: createMemoryHistory({ initialEntries: ['/layout/a'] }),
      defaultPendingMs: 60_000,
    })
    try {
      const app = <RouterProvider router={router} />
      render(strict ? <React.StrictMode>{app}</React.StrictMode> : app)
      await waitFor(() =>
        expect(screen.getByText('page b')).toHaveAttribute(
          'aria-current',
          'page',
        ),
      )
      expect(screen.getByText('page a')).not.toHaveAttribute('aria-current')
      expect(screen.getByText('Page A')).toBeInTheDocument()
    } finally {
      await act(async () => {
        gate.resolve()
        await navigation
      })
    }
  },
)

test('an owned dynamic destination is built only once on its initial render', async () => {
  const search = vi.fn(() => ({ q: 'value' }))
  const root = createRootRoute({
    component: Outlet,
    validateSearch: (value) => value as { q?: string },
  })
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    component: () => (
      <Link to="/detail" search={search}>
        dynamic detail
      </Link>
    ),
  })
  const detail = createRoute({ getParentRoute: () => root, path: '/detail' })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({ initialEntries: ['/table'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByText('dynamic detail')
  expect(link).toHaveAttribute('href', '/detail?q=value')
  expect(search).toHaveBeenCalledTimes(1)
})

test('a Link-free owner remembers a retained pending location before departure', async () => {
  const retainedGate = createControlledPromise<void>()
  const departureGate = createControlledPromise<void>()
  const root = createRootRoute({
    component: Outlet,
    validateSearch: (search) => search as { page?: number },
  })
  function Table() {
    const [show, setShow] = React.useState(false)
    return (
      <>
        <button onClick={() => setShow(true)}>show links</button>
        {show && (
          <>
            <Link to="/table" search={{ page: 1 }}>
              page one
            </Link>
            <Link to="/table" search={{ page: 2 }}>
              page two
            </Link>
          </>
        )}
      </>
    )
  }
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    beforeLoad: ({ search }) => (search.page === 2 ? retainedGate : undefined),
    component: Table,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    loader: () => departureGate,
    component: () => <div>Detail page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({ initialEntries: ['/table?page=1'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('show links')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  let retained: Promise<void> | undefined
  let departure: Promise<void> | undefined
  try {
    await act(async () => {
      retained = router.navigate({ to: '/table', search: { page: 2 } })
    })
    await act(async () => {
      departure = router.navigate({ to: '/detail' })
    })
    fireEvent.click(screen.getByText('show links'))
    expect(screen.getByText('page one')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('page two')).toHaveAttribute('aria-current', 'page')
  } finally {
    await act(async () => {
      retainedGate.resolve()
      departureGate.resolve()
      await Promise.all([retained, departure])
    })
  }
})

test('matched fixed Links hydrate in place and suppress outgoing selections', async () => {
  const gate = createControlledPromise<void>()
  const makeRouter = (isServer: boolean) => {
    const root = createRootRoute({ component: Outlet })
    const table = createRoute({
      getParentRoute: () => root,
      path: '/table',
      component: () => (
        <Link to="/detail" data-probe="hydrated">
          detail link
        </Link>
      ),
    })
    const detail = createRoute({
      getParentRoute: () => root,
      path: '/detail',
      loader: () => gate,
      component: () => <div>Detail page</div>,
    })
    return createRouter({
      routeTree: root.addChildren([table, detail]),
      history: createMemoryHistory({ initialEntries: ['/table'] }),
      isServer,
      defaultPendingMs: 60_000,
    })
  }
  const serverRouter = makeRouter(true)
  const router = makeRouter(false)
  await serverRouter.load()
  // Supply the public SSR bootstrap consumed by hydrate(), including its mode.
  // These fixture IDs contain only ordinary route slashes.
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      matches: serverRouter.state.matches.map((match) => ({
        i: match.id.replaceAll('/', '\0'),
        s: match.status,
        u: match.updatedAt,
        ssr: true,
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }
  await hydrate(router)
  const container = document.createElement('div')
  container.innerHTML = renderToString(<RouterProvider router={serverRouter} />)
  document.body.append(container)
  const anchor = container.querySelector('a')!
  const onRecoverableError = vi.fn()
  let hydrated: ReturnType<typeof hydrateRoot> | undefined
  let navigation: Promise<void> | undefined
  try {
    await act(async () => {
      hydrated = hydrateRoot(container, <RouterProvider router={router} />, {
        onRecoverableError,
      })
    })
    expect(container.querySelector('a')).toBe(anchor)
    expect(onRecoverableError).not.toHaveBeenCalled()
    const builds = vi.spyOn(router, 'buildLocation')
    await act(async () => {
      navigation = router.navigate({ to: '/detail' })
    })
    expect(container.querySelector('a')).toBe(anchor)
    expect(anchor).not.toHaveAttribute('aria-current')
    expect(
      builds.mock.calls.filter(
        ([options]) =>
          (options as { 'data-probe'?: string })['data-probe'] === 'hydrated',
      ),
    ).toHaveLength(0)
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
      hydrated?.unmount()
    })
    container.remove()
    serverRouter.history.destroy()
    router.history.destroy()
    delete window.$_TSR
  }
})

test.each(['router options', 'browser history options'] as const)(
  '%s changes revoke destination certification',
  async (kind) => {
    window.history.replaceState(null, '', '/table')
    const options: { createHref?: (href: string) => string } = {}
    const history =
      kind === 'router options'
        ? createMemoryHistory({ initialEntries: ['/table'] })
        : createBrowserHistory(options)
    const gate = createControlledPromise<void>()
    const root = createRootRoute({ component: Outlet })
    const table = createRoute({
      getParentRoute: () => root,
      path: '/table',
      component: () => <Link to="/detail">detail link</Link>,
    })
    const detail = createRoute({
      getParentRoute: () => root,
      path: '/detail',
      loader: () => gate,
      component: () => <div>Detail page</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([table, detail]),
      history,
      defaultPendingMs: 60_000,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByText('detail link')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(link).toHaveAttribute('href', '/detail')
    if (kind === 'router options') {
      router.update({ stringifySearch: () => '?changed=true' })
    } else {
      options.createHref = (href) => `${href}?changed=true`
    }
    let navigation: Promise<void> | undefined
    try {
      await act(async () => {
        navigation = router.navigate({ to: '/detail' })
      })
      expect(link).toHaveAttribute('href', '/detail?changed=true')
    } finally {
      await act(async () => {
        gate.resolve()
        await navigation
      })
      cleanup()
      history.destroy()
      window.history.replaceState(null, '', '/')
    }
  },
)

test('an outgoing Link switches fixed to dynamic to fixed without losing either source', async () => {
  const gate = createControlledPromise<void>()
  const root = createRootRoute({ component: Outlet })
  function Table() {
    const [dynamic, setDynamic] = React.useState(false)
    return (
      <>
        <Link to={dynamic ? '.' : '/table'} search={dynamic ? true : undefined}>
          switching
        </Link>
        <button onClick={() => setDynamic((value) => !value)}>switch</button>
      </>
    )
  }
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    component: Table,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    loader: () => gate,
    component: () => <div>Detail page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({ initialEntries: ['/table'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByText('switching')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  let navigation: Promise<void> | undefined
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/detail' })
    })
    expect(link).toHaveAttribute('href', '/table')
    expect(link).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByText('switch'))
    expect(link).toHaveAttribute('href', '/detail')
    expect(link).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByText('switch'))
    expect(link).toHaveAttribute('href', '/table')
    expect(link).toHaveAttribute('aria-current', 'page')
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})

test.each(['outgoing', 'retained', 'layout'] as const)(
  '%s owner selects fixed Links only when necessary',
  async (placement) => {
    const gate = createControlledPromise<void>()
    let selections = 0
    const activeOptions = {
      get exact() {
        selections++
        return true
      },
      includeSearch: false,
    }
    const root = createRootRoute({
      component: () => (
        <>
          <Link to="/detail/$id" params={{ id: '0' }} data-testid="retained">
            retained
          </Link>
          {placement === 'retained' && <Rows />}
          <Outlet />
        </>
      ),
    })
    function Rows() {
      return (
        <>
          {Array.from({ length: 1_000 }, (_, id) => (
            <Link
              key={id}
              to="/detail/$id"
              params={{ id: String(id) }}
              data-probe="fixed"
              activeOptions={activeOptions}
            >
              row {id}
            </Link>
          ))}
          <Link
            to="."
            search={true}
            data-testid="relative"
            data-probe="dynamic"
          >
            relative
          </Link>
        </>
      )
    }
    const layout = createRoute({
      getParentRoute: () => root,
      id: 'layout',
      component: () => (
        <>
          {placement === 'layout' && <Rows />}
          <Outlet />
        </>
      ),
    })
    const table = createRoute({
      getParentRoute: () => layout,
      path: '/table',
      component: () =>
        placement === 'outgoing' ? <Rows /> : <div>Table page</div>,
    })
    const detail = createRoute({
      getParentRoute: () => layout,
      path: '/detail/$id',
      loader: () => gate,
      component: () => <div>Detail page</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([layout.addChildren([table, detail])]),
      history: createMemoryHistory({ initialEntries: ['/table'] }),
      defaultPendingMs: 60_000,
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('row 0')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    // Count active comparisons independently of destination-cache lookups.
    selections = 0
    const builds = vi.spyOn(router, 'buildLocation')
    let navigation: Promise<void> | undefined
    try {
      await act(async () => {
        navigation = router.navigate({ to: '/detail/$id', params: { id: '0' } })
      })
      expect(screen.getByTestId('retained')).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.getByTestId('relative')).toHaveAttribute(
        'href',
        '/detail/0',
      )
      expect(screen.getByText('row 0').getAttribute('aria-current')).toBe(
        placement !== 'outgoing' ? 'page' : null,
      )
      const probes = builds.mock.calls.map(
        ([options]) => (options as { 'data-probe'?: string })['data-probe'],
      )
      expect(
        probes.filter((probe) => probe === 'dynamic').length,
      ).toBeGreaterThan(0)
      expect(selections).toBe(placement !== 'outgoing' ? 1_000 : 0)
      expect(probes.filter((probe) => probe === 'fixed')).toHaveLength(0)
    } finally {
      await act(async () => {
        gate.resolve()
        await navigation
      })
    }
    if (placement !== 'outgoing') {
      expect(selections).toBe(1_000)
      expect(
        builds.mock.calls.filter(
          ([options]) =>
            (options as { 'data-probe'?: string })['data-probe'] === 'fixed',
        ),
      ).toHaveLength(0)
    }
    expect(screen.getByText('Detail page')).toBeInTheDocument()
  },
)

test.each(['before mount', 'after mount'] as const)(
  'custom href formatters installed %s remain live during departure',
  async (when) => {
    const gate = createControlledPromise<void>()
    const history = createMemoryHistory({ initialEntries: ['/table'] })
    const format = (href: string) =>
      `${href}?from=${encodeURIComponent(history.location.pathname)}`
    if (when === 'before mount') {
      history.createHref = format
    }
    const root = createRootRoute({ component: Outlet })
    const table = createRoute({
      getParentRoute: () => root,
      path: '/table',
      component: () => <Link to="/detail">detail link</Link>,
    })
    const detail = createRoute({
      getParentRoute: () => root,
      path: '/detail',
      loader: () => gate,
      component: () => <div>Detail page</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([table, detail]),
      history,
      defaultPendingMs: 60_000,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByText('detail link')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    if (when === 'after mount') {
      history.createHref = format
    }
    let navigation: Promise<void> | undefined
    try {
      await act(async () => {
        navigation = router.navigate({ to: '/detail' })
      })
      expect(link).toHaveAttribute('href', '/detail?from=%2Fdetail')
      expect(link).toHaveAttribute('aria-current', 'page')
    } finally {
      await act(async () => {
        gate.resolve()
        await navigation
      })
    }
  },
)

test.each(['browser', 'hash'] as const)(
  '%s history preserves its href behavior through the notification gate',
  async (kind) => {
    window.history.replaceState(
      null,
      '',
      kind === 'hash' ? '/host#/table' : '/table',
    )
    const history =
      kind === 'hash' ? createHashHistory() : createBrowserHistory()
    const gate = createControlledPromise<void>()
    const root = createRootRoute({ component: Outlet })
    const table = createRoute({
      getParentRoute: () => root,
      path: '/table',
      component: () => (
        <Link to="/detail" data-probe="fixed">
          detail link
        </Link>
      ),
    })
    const detail = createRoute({
      getParentRoute: () => root,
      path: '/detail',
      loader: () => gate,
      component: () => <div>Detail page</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([table, detail]),
      history,
      defaultPendingMs: 60_000,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByText('detail link')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const builds = vi.spyOn(router, 'buildLocation')
    let navigation: Promise<void> | undefined
    try {
      await act(async () => {
        navigation = router.navigate({ to: '/detail' })
      })
      expect(link).toHaveAttribute(
        'href',
        kind === 'hash' ? '/host#/detail' : '/detail',
      )
      if (kind === 'hash') {
        expect(link).toHaveAttribute('aria-current', 'page')
      } else {
        expect(link).not.toHaveAttribute('aria-current')
      }
      const selections = builds.mock.calls.filter(
        ([options]) =>
          (options as { 'data-probe'?: string })['data-probe'] === 'fixed',
      )
      expect(selections).toHaveLength(0)
    } finally {
      await act(async () => {
        gate.resolve()
        await navigation
      })
      cleanup()
      history.destroy()
      window.history.replaceState(null, '', '/')
    }
  },
)
