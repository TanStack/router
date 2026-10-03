import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

test('a visible pending fallback inherits its destination source until a superseding revisit renders', async () => {
  let releaseB!: () => void
  let releaseA!: () => void
  const pendingB = new Promise<void>((resolve) => {
    releaseB = resolve
  })
  const returningA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a/$id',
    loader: ({ params }) => (params.id === 'return' ? returningA : undefined),
    component: () => (
      <Link to="/a/$id" params={true} search={true} data-testid="a-link">
        a
      </Link>
    ),
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b/$id',
    pendingMs: 0,
    pendingMinMs: 0,
    loader: () => pendingB,
    pendingComponent: () => (
      <Link to="/b/$id" params={true} search={true} data-testid="pending-link">
        pending b
      </Link>
    ),
    component: () => <div>completed b</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a/source?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  expect((await screen.findByTestId('a-link')).getAttribute('href')).toBe(
    '/a/source?visit=1',
  )
  let obsolete!: Promise<void>
  await act(async () => {
    obsolete = router.navigate({
      to: '/b/$id',
      params: { id: 'next' },
      search: { visit: 2 },
    })
  })
  const fallback = await screen.findByTestId('pending-link')
  expect(fallback.getAttribute('href')).toBe('/b/next?visit=2')
  expect(fallback.getAttribute('data-status')).toBe('active')

  let revisit!: Promise<void>
  await act(async () => {
    revisit = router.navigate({
      to: '/a/$id',
      params: { id: 'return' },
      search: { visit: 3 },
    })
  })
  expect(router.state.location.href).toBe('/a/return?visit=3')
  expect(screen.getByTestId('pending-link')).toBe(fallback)
  expect(fallback.getAttribute('href')).toBe('/b/next?visit=2')
  expect(fallback.getAttribute('data-status')).toBe('active')
  await act(async () => {
    releaseA()
    await revisit
  })
  const returned = await screen.findByTestId('a-link')
  expect(returned.getAttribute('href')).toBe('/a/return?visit=3')
  expect(returned.getAttribute('data-status')).toBe('active')
  expect(screen.queryByTestId('pending-link')).toBeNull()
  await act(async () => {
    releaseB()
    await obsolete
  })
  expect(screen.getByTestId('a-link')).toBe(returned)
  expect(returned.getAttribute('href')).toBe('/a/return?visit=3')
  expect(screen.queryByText('completed b')).toBeNull()
})

test('mounted inherited Links follow an input rewrite update without navigation', async () => {
  const inputFor =
    (id: string) =>
    ({ url }: { url: URL }) => {
      if (url.pathname === '/public') {
        url.pathname = `/items/${id}`
      }
      return url
    }
  const output = ({ url }: { url: URL }) => {
    if (url.pathname.startsWith('/items/')) {
      url.pathname = '/public'
    }
    return url
  }
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    component: () => (
      <>
        <Link
          to="/inspect/$id"
          params={true}
          search={true}
          data-testid="inherited"
        >
          inspect
        </Link>
        <Link
          to="/items/$id"
          params={{ id: 'source' }}
          search={true}
          data-testid="fixed-source"
        >
          source
        </Link>
      </>
    ),
  })
  const inspect = createRoute({
    getParentRoute: () => root,
    path: '/inspect/$id',
  })
  const router = createRouter({
    routeTree: root.addChildren([item, inspect]),
    history: createMemoryHistory({ initialEntries: ['/public?visit=1'] }),
    rewrite: { input: inputFor('source'), output },
  })
  render(<RouterProvider router={router} />)
  const inherited = await screen.findByTestId('inherited')
  const fixed = screen.getByTestId('fixed-source')
  expect(inherited.getAttribute('href')).toBe('/inspect/source?visit=1')
  expect(inherited.getAttribute('data-status')).toBeNull()
  expect(fixed.getAttribute('href')).toBe('/public?visit=1')
  expect(fixed.getAttribute('data-status')).toBe('active')
  act(() => {
    router.update({ rewrite: { input: inputFor('next'), output } })
  })
  expect(router.history.location.href).toBe('/public?visit=1')
  expect(router.state.location.pathname).toBe('/items/next')
  expect(screen.getByTestId('inherited')).toBe(inherited)
  expect(inherited.getAttribute('href')).toBe('/inspect/next?visit=1')
  expect(inherited.getAttribute('data-status')).toBeNull()
  expect(screen.getByTestId('fixed-source')).toBe(fixed)
  expect(fixed.getAttribute('href')).toBe('/public?visit=1')
  expect(fixed.getAttribute('data-status')).toBeNull()
})

function createFixture(
  redirectBack: boolean | 'document' = false,
  showOnReturn = false,
) {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: () => (
      <>
        <Link to="/b" search={true} data-testid="staying">
          staying
        </Link>
        <Outlet />
      </>
    ),
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: () => {
      const { visit } = root.useSearch()
      return showOnReturn && visit === 1 ? (
        <div>no links</div>
      ) : (
        <Link to="/a" search={true} data-testid="departing">
          departing
        </Link>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: async () => {
      await pending
      if (redirectBack === 'document') {
        throw redirect({
          href: 'https://example.com/next',
          reloadDocument: true,
        })
      }
      if (redirectBack) {
        throw redirect({ to: '/a', search: { visit: 4 } })
      }
    },
    component: () => <div>destination</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  return { router, release }
}

test('updates staying Links urgently and retains departing Link hrefs until the destination renders', async () => {
  const { router, release } = createFixture()
  render(<RouterProvider router={router} />)
  await screen.findByTestId('departing')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/b', search: { visit: 2 } })
  })
  await waitFor(() => {
    expect(screen.getByTestId('staying').getAttribute('href')).toBe(
      '/b?visit=2',
    )
    expect(screen.getByTestId('staying').getAttribute('data-status')).toBe(
      'active',
    )
  })
  expect(screen.getByTestId('departing').getAttribute('href')).toBe(
    '/a?visit=1',
  )
  await act(async () => {
    release()
    await navigation
  })
  expect(screen.getByText('destination')).toBeTruthy()
})

test('a departing Link catches up when the destination redirects back to its still-mounted route', async () => {
  const { router, release } = createFixture(true)
  render(<RouterProvider router={router} />)
  const departing = await screen.findByTestId('departing')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/b', search: { visit: 2 } })
  })
  expect(departing.getAttribute('href')).toBe('/a?visit=1')
  await act(async () => {
    release()
    await navigation
  })
  expect(screen.getByTestId('departing')).toBe(departing)
  expect(departing.getAttribute('href')).toBe('/a?visit=4')
  expect(departing.getAttribute('data-status')).toBe('active')
})

test('a superseding navigation updates the still-mounted returning route without waiting for the obsolete loader', async () => {
  const { router, release } = createFixture()
  render(<RouterProvider router={router} />)
  const departing = await screen.findByTestId('departing')
  let obsolete!: Promise<void>
  await act(async () => {
    obsolete = router.navigate({ to: '/b', search: { visit: 2 } })
  })
  expect(departing.getAttribute('href')).toBe('/a?visit=1')
  await act(async () => {
    await router.navigate({ to: '/a', search: { visit: 3 } })
  })
  expect(screen.getByTestId('departing')).toBe(departing)
  expect(departing.getAttribute('href')).toBe('/a?visit=3')
  await act(async () => {
    release()
    await obsolete
  })
  expect(departing.getAttribute('href')).toBe('/a?visit=3')
})

test('a retained departing Link catches up after a document redirect leaves its route mounted', async () => {
  const { router, release } = createFixture('document')
  render(<RouterProvider router={router} />)
  const departing = await screen.findByTestId('departing')
  await act(async () => {
    void router.navigate({ to: '/b', search: { visit: 2 } })
  })
  expect(departing.getAttribute('href')).toBe('/a?visit=1')
  const replace = vi.fn()
  const browserWindow = window
  vi.stubGlobal(
    'window',
    new Proxy(browserWindow, {
      get(target, key) {
        return key === 'location'
          ? { href: browserWindow.location.href, replace }
          : Reflect.get(target, key, target)
      },
    }),
  )
  await act(async () => {
    release()
  })
  await waitFor(() => {
    expect(replace).toHaveBeenCalledWith('https://example.com/next')
    expect(departing.getAttribute('href')).toBe('/a?visit=2')
  })
  expect(screen.getByTestId('departing')).toBe(departing)
})

test.each(['canceled', 'rejected'] as const)(
  'a retained departing Link catches up when native document navigation is %s',
  async (outcome) => {
    const { router, release } = createFixture('document')
    // Observe the real public load promise without replacing its work or result.
    const load = router.load
    let observedLoad: Promise<void> | undefined
    vi.spyOn(router, 'load').mockImplementation((options) => {
      const result = load(options)
      observedLoad = result
      void result.catch(() => {})
      return result
    })
    render(<RouterProvider router={router} />)
    const departing = await screen.findByTestId('departing')
    await act(async () => {
      void router.navigate({ to: '/b', search: { visit: 2 } })
    })
    expect(departing.getAttribute('href')).toBe('/a?visit=1')
    const completion = observedLoad!
    const failure = new DOMException(
      'Document navigation rejected',
      'SecurityError',
    )
    const beforeUnload = (event: Event) => event.preventDefault()
    const browserWindow = window
    const replace = vi.fn(() => {
      if (outcome === 'rejected') {
        throw failure
      }
      // Browser cancellation leaves the currently presented document mounted.
      const event = new Event('beforeunload', { cancelable: true })
      expect(browserWindow.dispatchEvent(event)).toBe(false)
      expect(event.defaultPrevented).toBe(true)
    })
    browserWindow.addEventListener('beforeunload', beforeUnload)
    vi.stubGlobal(
      'window',
      new Proxy(browserWindow, {
        get(target, key) {
          return key === 'location'
            ? { href: browserWindow.location.href, replace }
            : Reflect.get(target, key, target)
        },
      }),
    )
    try {
      await act(async () => {
        release()
        if (outcome === 'rejected') {
          await expect(completion).rejects.toBe(failure)
        } else {
          await completion
        }
      })
      expect(replace).toHaveBeenCalledWith('https://example.com/next')
      expect(router.history.location.href).toBe('/b?visit=2')
      expect(screen.getByTestId('departing')).toBe(departing)
      expect(departing.getAttribute('href')).toBe('/a?visit=2')
    } finally {
      browserWindow.removeEventListener('beforeunload', beforeUnload)
    }
  },
)

test('clicking a retained departing Link navigates to its displayed href', async () => {
  const { router, release } = createFixture()
  render(<RouterProvider router={router} />)
  const departing = await screen.findByTestId('departing')
  let obsolete!: Promise<void>
  await act(async () => {
    obsolete = router.navigate({ to: '/b', search: { visit: 2 } })
  })
  expect(departing.getAttribute('href')).toBe('/a?visit=1')
  await act(async () => {
    fireEvent.click(departing)
  })
  await waitFor(() => {
    expect(router.state.location.href).toBe('/a?visit=1')
    expect(departing.getAttribute('href')).toBe('/a?visit=1')
  })
  await act(async () => {
    release()
    await obsolete
  })
})

test('a route that previously rendered no Links gets a fresh source when revisited', async () => {
  const { router, release } = createFixture(false, true)
  render(<RouterProvider router={router} />)
  await screen.findByText('no links')
  await act(async () => {
    release()
    await router.navigate({ to: '/b', search: { visit: 2 } })
  })
  await screen.findByText('destination')
  await act(async () => {
    await router.navigate({ to: '/a', search: { visit: 3 } })
  })
  expect(screen.getByTestId('departing').getAttribute('href')).toBe(
    '/a?visit=3',
  )
})

test('retargeted and newly mounted departing Links use their most recent pending presentation location', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    loaderDeps: ({ search }) => ({ visit: search.visit }),
    loader: ({ deps }) => (deps.visit === 1 ? undefined : pending),
    component: function RetargetedLinks() {
      const [retargeted, setRetargeted] = React.useState(false)
      return (
        <>
          <button onClick={() => setRetargeted(true)}>retarget</button>
          <Link
            to={retargeted ? '/b' : '/a'}
            search={true}
            data-testid="retargeted"
          >
            retargeted
          </Link>
          {retargeted && (
            <Link to="/a" search={true} data-testid="new">
              new
            </Link>
          )}
        </>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: () => pending,
    component: () => <div>destination</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('retargeted')
  let previous!: Promise<void>
  let navigation!: Promise<void>
  await act(async () => {
    previous = router.navigate({ to: '/a', search: { visit: 2 } })
  })
  expect(link.getAttribute('href')).toBe('/a?visit=2')
  await act(async () => {
    navigation = router.navigate({ to: '/b', search: { visit: 3 } })
  })
  await act(async () => {
    fireEvent.click(screen.getByText('retarget'))
  })
  expect(link.getAttribute('href')).toBe('/b?visit=2')
  expect(screen.getByTestId('new').getAttribute('href')).toBe('/a?visit=2')
  await act(async () => {
    release()
    await navigation
    await previous
  })
})

test('a legacy fallback Link updates urgently across different ancestry and depth', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const one = createRoute({
    getParentRoute: () => root,
    path: '/one',
    component: Outlet,
  })
  const two = createRoute({
    getParentRoute: () => root,
    path: '/two',
    component: Outlet,
  })
  const deep = createRoute({
    getParentRoute: () => two,
    path: '/deep',
    loader: () => pending,
    component: Outlet,
  })
  const inspect = createRoute({ getParentRoute: () => root, path: '/inspect' })
  const legacy = createRoute({
    getParentRoute: () => root,
    path: '/404',
    component: () => (
      <Link to="/inspect" search={true} data-testid="fallback-link">
        inspect
      </Link>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([one, two.addChildren([deep]), inspect]),
    notFoundRoute: legacy,
    history: createMemoryHistory({ initialEntries: ['/one/missing?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('fallback-link')
  expect(link.getAttribute('href')).toBe('/inspect?visit=1')
  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({ href: '/two/deep/missing?visit=2' })
    })
    expect(router.state.location.href).toBe('/two/deep/missing?visit=2')
    expect(screen.getByTestId('fallback-link')).toBe(link)
    expect(link.getAttribute('href')).toBe('/inspect?visit=2')
  } finally {
    await act(async () => {
      release()
      await navigation
    })
    vi.restoreAllMocks()
  }
  expect(screen.getByTestId('fallback-link').getAttribute('href')).toBe(
    '/inspect?visit=2',
  )
})

test('a fully retained nonroot Link does not recompute its updater at completion', async () => {
  let calls = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const updateSearch = (previous: { visit: number }) => {
    calls++
    return { visit: previous.visit + 10 }
  }
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const items = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    loaderDeps: ({ search }) => ({ visit: search.visit }),
    loader: ({ deps }) => (deps.visit === 1 ? undefined : pending),
    component: React.memo(function Retained() {
      return (
        <Link
          from="/items/$id"
          to="."
          params={true}
          search={updateSearch}
          data-testid="retained-updater"
        >
          retained
        </Link>
      )
    }),
  })
  const router = createRouter({
    routeTree: root.addChildren([items]),
    history: createMemoryHistory({ initialEntries: ['/items/first?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('retained-updater')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link.getAttribute('href')).toBe('/items/first?visit=11')
  const before = calls
  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({
        to: '/items/$id',
        params: { id: 'next' },
        search: { visit: 2 },
      })
    })
    expect(screen.getByTestId('retained-updater')).toBe(link)
    expect(link.getAttribute('href')).toBe('/items/next?visit=12')
    expect(calls).toBe(before + 1)
  } finally {
    await act(async () => {
      release()
      await navigation
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
  }
  expect(screen.getByTestId('retained-updater')).toBe(link)
  expect(link.getAttribute('href')).toBe('/items/next?visit=12')
  expect(calls).toBe(before + 1)
})

test.each(['synchronous', 'microtask'] as const)(
  'a redirected held Link stays retained through a %s onRendered successor',
  async (timing) => {
    let releaseRedirect!: () => void
    let releaseDestination!: () => void
    const redirectReady = new Promise<void>((resolve) => {
      releaseRedirect = resolve
    })
    const destinationReady = new Promise<void>((resolve) => {
      releaseDestination = resolve
    })
    const root = createRootRoute({
      validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
      component: Outlet,
    })
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      component: () => (
        <Link to="/a" search={true} data-testid="redirected-held-link">
          retained a
        </Link>
      ),
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loaderDeps: ({ search }) => ({ visit: search.visit }),
      loader: async ({ deps }) => {
        if (deps.visit === 2) {
          await redirectReady
          throw redirect({ to: '/a', search: { visit: 4 } })
        }
        await destinationReady
      },
      component: () => <div>successor destination</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([a, b]),
      history: createMemoryHistory({ initialEntries: ['/a?visit=1'] }),
      defaultPendingMs: 10_000,
    })
    // Observe the original public load completion without replacing its work.
    const load = router.load
    let departureLoad: Promise<void> | undefined
    let departureLoadSettled = false
    vi.spyOn(router, 'load').mockImplementation((options) => {
      const href = router.history.location.href
      const result = load(options)
      if (href === '/b?visit=2' && !departureLoad) {
        departureLoad = result
        void result.then(
          () => {
            departureLoadSettled = true
          },
          () => {
            departureLoadSettled = true
          },
        )
      }
      return result
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByTestId('redirected-held-link')
    let successor: Promise<void> | undefined
    let navigation!: Promise<void>
    const unsubscribe = router.subscribe('onRendered', (event) => {
      if (event.toLocation.href !== '/a?visit=4') {
        return
      }
      const navigate = () => {
        successor = router.navigate({ to: '/b', search: { visit: 5 } })
      }
      if (timing === 'microtask') {
        queueMicrotask(navigate)
      } else {
        navigate()
      }
    })
    try {
      await act(async () => {
        navigation = router.navigate({ to: '/b', search: { visit: 2 } })
      })
      expect(link.getAttribute('href')).toBe('/a?visit=1')
      expect(departureLoad).toBeDefined()
      await act(async () => {
        releaseRedirect()
      })
      await waitFor(() => expect(router.state.location.href).toBe('/b?visit=5'))
      expect(successor).toBeDefined()
      expect(screen.getByTestId('redirected-held-link')).toBe(link)
      expect(link.getAttribute('href')).toBe('/a?visit=4')
      expect(link.getAttribute('data-status')).toBe('active')
      expect(departureLoadSettled).toBe(false)
    } finally {
      unsubscribe()
      await act(async () => {
        releaseRedirect()
        releaseDestination()
        await Promise.all([navigation, successor, departureLoad])
      })
    }
    expect(screen.getByText('successor destination')).toBeTruthy()
    expect(departureLoadSettled).toBe(true)
  },
)

test('an onRendered successor retains the nonroot Link source until its loader completes', async () => {
  const { router, release } = createFixture()
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('departing')
  let successor: Promise<void> | undefined
  let navigation!: Promise<void>
  const unsubscribe = router.subscribe('onRendered', (event) => {
    if (event.toLocation.href === '/a?visit=2') {
      successor = router.navigate({ to: '/b', search: { visit: 3 } })
    }
  })
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/a', search: { visit: 2 } })
    })
    await waitFor(() => expect(router.state.location.href).toBe('/b?visit=3'))
    expect(successor).toBeDefined()
    expect(screen.getByTestId('departing')).toBe(link)
    expect(link.getAttribute('href')).toBe('/a?visit=2')
    expect(screen.getByTestId('staying').getAttribute('href')).toBe(
      '/b?visit=3',
    )
  } finally {
    unsubscribe()
    await act(async () => {
      release()
      await Promise.all([navigation, successor])
    })
  }
  expect(screen.getByText('destination')).toBeTruthy()
})

test('a microtask onRendered successor retains the nonroot Link source until its loader completes', async () => {
  const { router, release } = createFixture()
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('departing')
  let successor: Promise<void> | undefined
  let navigation!: Promise<void>
  const unsubscribe = router.subscribe('onRendered', (event) => {
    if (event.toLocation.href === '/a?visit=2') {
      queueMicrotask(() => {
        successor = router.navigate({ to: '/b', search: { visit: 3 } })
      })
    }
  })
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/a', search: { visit: 2 } })
    })
    await waitFor(() => expect(router.state.location.href).toBe('/b?visit=3'))
    expect(successor).toBeDefined()
    expect(screen.getByTestId('departing')).toBe(link)
    expect(link.getAttribute('href')).toBe('/a?visit=2')
    expect(link.getAttribute('data-status')).toBe('active')
    expect(screen.getByTestId('staying').getAttribute('href')).toBe(
      '/b?visit=3',
    )
  } finally {
    unsubscribe()
    await act(async () => {
      release()
      await Promise.all([navigation, successor])
    })
  }
  expect(screen.getByText('destination')).toBeTruthy()
})

test('the first departing Link uses the latest retained presentation from a visit that had no Links', async () => {
  let releaseA!: () => void
  let releaseB!: () => void
  const pendingA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  const pendingB = new Promise<void>((resolve) => {
    releaseB = resolve
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    loaderDeps: ({ search }) => ({ visit: search.visit }),
    loader: ({ deps }) => (deps.visit === 1 ? undefined : pendingA),
    component: function InitiallyWithoutLinks() {
      const [show, setShow] = React.useState(false)
      return (
        <>
          <button onClick={() => setShow(true)}>reveal first Link</button>
          {show && (
            <Link to="/a" search={true} data-testid="first-departing">
              first departing Link
            </Link>
          )}
        </>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: () => pendingB,
    component: () => <div>destination</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('reveal first Link')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(screen.queryByTestId('first-departing')).toBeNull()

  let retained: Promise<void> | undefined
  let departing: Promise<void> | undefined
  try {
    await act(async () => {
      retained = router.navigate({ to: '/a', search: { visit: 2 } })
    })
    expect(router.state.location.href).toBe('/a?visit=2')
    expect(screen.queryByTestId('first-departing')).toBeNull()
    await act(async () => {
      departing = router.navigate({ to: '/b', search: { visit: 3 } })
    })
    expect(router.state.location.href).toBe('/b?visit=3')
    act(() => {
      fireEvent.click(screen.getByText('reveal first Link'))
    })
    const link = screen.getByTestId('first-departing')
    expect(link.getAttribute('href')).toBe('/a?visit=2')
    expect(link.getAttribute('data-status')).toBe('active')
  } finally {
    await act(async () => {
      releaseA()
      releaseB()
      await Promise.all([retained, departing])
    })
  }
  expect(screen.getByText('destination')).toBeTruthy()
  expect(screen.queryByTestId('first-departing')).toBeNull()
})
