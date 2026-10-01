import React from 'react'
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
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
} from '../src'

afterEach(cleanup)

test('an abandoned suspended Link destination cannot replace the committed subscription', async () => {
  const gate = createControlledPromise<void>()
  const attemptedDestination = vi.fn()
  const updateCommittedSearch = vi.fn(
    (search: Record<string, unknown>) => search,
  )
  const updateSuspendedSearch = vi.fn(
    (search: Record<string, unknown>) => search,
  )
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      (['/a', '/b', '/c'] as const).map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: ['/a?marker=initial'] }),
  })
  await router.load()

  function Suspend({ enabled }: { enabled: boolean }) {
    if (enabled) {
      throw gate
    }
    return null
  }

  function Example() {
    const [destination, setDestination] = React.useState<'/a' | '/b'>('/a')
    return (
      <>
        <button
          onClick={() => React.startTransition(() => setDestination('/b'))}
        >
          Suspend destination
        </button>
        <button onClick={() => setDestination('/a')}>Keep destination</button>
        <React.Suspense fallback={<p>Waiting for destination</p>}>
          <Link
            to={destination}
            search={
              destination === '/a'
                ? updateCommittedSearch
                : updateSuspendedSearch
            }
            activeOptions={{ includeSearch: false }}
          >
            {() => {
              attemptedDestination(destination)
              return 'Destination'
            }}
          </Link>
          <Suspend enabled={destination === '/b'} />
        </React.Suspense>
      </>
    )
  }

  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  const link = screen.getByRole('link', { name: 'Destination' })
  expect(link).toHaveAttribute('href', '/a?marker=initial')
  expect(link).toHaveAttribute('aria-current', 'page')

  fireEvent.click(screen.getByRole('button', { name: 'Suspend destination' }))
  await waitFor(() => expect(attemptedDestination).toHaveBeenCalledWith('/b'))
  expect(link).toHaveAttribute('href', '/a?marker=initial')
  fireEvent.click(screen.getByRole('button', { name: 'Keep destination' }))
  updateSuspendedSearch.mockClear()

  await act(() => router.navigate({ to: '/c', search: { marker: 'next' } }))
  expect(link).toHaveAttribute('href', '/a?marker=next')
  expect(link).not.toHaveAttribute('aria-current')
  await act(() => router.navigate({ to: '/a', search: { marker: 'returned' } }))
  expect(link).toHaveAttribute('href', '/a?marker=returned')
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(updateSuspendedSearch).not.toHaveBeenCalled()
})

test('StrictMode links can leave and rejoin a live router after its last Link unmounts', async () => {
  const updateSearch = vi.fn((search: Record<string, unknown>) => search)
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      (['/a', '/b'] as const).map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: ['/a?page=1'] }),
  })
  await router.load()

  function Example() {
    const [visible, setVisible] = React.useState(true)
    return (
      <>
        <button onClick={() => setVisible((previous) => !previous)}>
          Toggle Link
        </button>
        {visible ? (
          <Link
            to="/a"
            search={updateSearch}
            activeOptions={{ includeSearch: false }}
          >
            Remounted destination
          </Link>
        ) : null}
      </>
    )
  }

  render(
    <React.StrictMode>
      <RouterContextProvider router={router}>
        <Example />
      </RouterContextProvider>
    </React.StrictMode>,
  )
  expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Link' }))
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  updateSearch.mockClear()
  await act(() => router.navigate({ to: '/b', search: { page: 2 } }))
  expect(updateSearch).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Link' }))
  const link = screen.getByRole('link')
  expect(link).toHaveAttribute('href', '/a?page=2')
  expect(link).not.toHaveAttribute('aria-current')
  await act(() => router.navigate({ to: '/a', search: { page: 3 } }))
  expect(link).toHaveAttribute('href', '/a?page=3')
  expect(link).toHaveAttribute('aria-current', 'page')
})

test('Links in a retained parameterized route update while the next params are loading', async () => {
  const gate = createControlledPromise<void>()
  const rootRoute = createRootRoute({ component: Outlet })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    loader: ({ params }) => (params.id === '2' ? gate : undefined),
    component: () => (
      <Link to="/items/$id/details" params={true}>
        Item details
      </Link>
    ),
  })
  const detailsRoute = createRoute({
    getParentRoute: () => itemRoute,
    path: '/details',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute.addChildren([detailsRoute])]),
    history: createMemoryHistory({ initialEntries: ['/items/1'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Item details' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/items/1/details')

  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/items/$id', params: { id: '2' } })
      await Promise.resolve()
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/items/2'))
    expect(router.state.status).toBe('pending')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/items/2/details')
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
})

test.each(['earlier sibling', 'parent'] as const)(
  'changed Link props catch navigation from the %s layout effect',
  async (effectOwner) => {
    const readSearch = vi.fn()
    const rootRoute = createRootRoute()
    const router = createRouter({
      routeTree: rootRoute.addChildren(
        (['/a', '/b', '/c'] as const).map((path) =>
          createRoute({ getParentRoute: () => rootRoute, path }),
        ),
      ),
      history: createMemoryHistory({ initialEntries: ['/a?marker=initial'] }),
    })
    await router.load()
    let navigation: Promise<void> | undefined

    function EarlierSibling({ changed }: { changed: boolean }) {
      React.useLayoutEffect(() => {
        if (changed && effectOwner === 'earlier sibling') {
          navigation = router.navigate({
            to: '/c',
            search: { marker: 'layout' },
          })
        }
      }, [changed])
      return null
    }

    function Example() {
      const [changed, setChanged] = React.useState(false)
      React.useLayoutEffect(() => {
        if (changed && effectOwner === 'parent') {
          navigation = router.navigate({
            to: '/c',
            search: { marker: 'layout' },
          })
        }
      }, [changed])
      return (
        <>
          <button onClick={() => setChanged(true)}>Change destination</button>
          <EarlierSibling changed={changed} />
          <Link
            to={changed ? '/b' : '/a'}
            search={(search: Record<string, unknown>) => {
              const generation = changed ? 'next' : 'old'
              readSearch(generation)
              return { marker: search.marker, generation }
            }}
            activeOptions={{ includeSearch: false }}
          >
            Layout destination
          </Link>
        </>
      )
    }

    render(
      <RouterContextProvider router={router}>
        <Example />
      </RouterContextProvider>,
    )
    const link = screen.getByRole('link', { name: 'Layout destination' })
    expect(link).toHaveAttribute('href', '/a?marker=initial&generation=old')
    expect(link).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Change destination' }))
    expect(navigation).toBeDefined()
    await act(async () => {
      await navigation
    })
    expect(link).toHaveAttribute('href', '/b?marker=layout&generation=next')
    expect(link).not.toHaveAttribute('aria-current')

    readSearch.mockClear()
    await act(() => router.navigate({ to: '/b', search: { marker: 'later' } }))
    expect(link).toHaveAttribute('href', '/b?marker=later&generation=next')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(readSearch).toHaveBeenCalledWith('next')
    expect(readSearch).not.toHaveBeenCalledWith('old')
  },
)

test('a Link revealed from Suspense uses props and location changed while hidden', async () => {
  const gate = createControlledPromise<void>()
  let ready = false
  const readSearch = vi.fn()
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      (['/a', '/b', '/c'] as const).map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: ['/a?marker=initial'] }),
  })
  await router.load()

  function Suspend({ enabled }: { enabled: boolean }) {
    if (enabled && !ready) {
      throw gate
    }
    return null
  }

  function Example() {
    const [phase, setPhase] = React.useState(0)
    return (
      <>
        <button onClick={() => setPhase(1)}>Hide destination</button>
        <button onClick={() => setPhase(2)}>Change hidden destination</button>
        <React.Suspense fallback={<p>Destination is suspended</p>}>
          <Link
            to={phase === 0 ? '/a' : phase === 1 ? '/b' : '/c'}
            search={(search: Record<string, unknown>) => {
              readSearch(phase)
              return { marker: search.marker, phase }
            }}
            activeOptions={{ includeSearch: false }}
          >
            Revealed destination
          </Link>
          <Suspend enabled={phase !== 0} />
        </React.Suspense>
      </>
    )
  }

  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/a?marker=initial&phase=0',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Hide destination' }))
  expect(screen.getByText('Destination is suspended')).toBeVisible()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Change hidden destination' }),
  )
  await act(() => router.navigate({ to: '/c', search: { marker: 'hidden' } }))
  expect(screen.getByText('Destination is suspended')).toBeVisible()

  await act(async () => {
    ready = true
    gate.resolve()
    await gate
  })
  const link = await screen.findByRole('link', { name: 'Revealed destination' })
  expect(link).toHaveAttribute('href', '/c?marker=hidden&phase=2')
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByText('Destination is suspended')).not.toBeInTheDocument()

  readSearch.mockClear()
  await act(() => router.navigate({ to: '/a', search: { marker: 'revealed' } }))
  expect(link).toHaveAttribute('href', '/c?marker=revealed&phase=2')
  expect(link).not.toHaveAttribute('aria-current')
  expect(readSearch).toHaveBeenCalledWith(2)
  expect(readSearch).not.toHaveBeenCalledWith(0)
  expect(readSearch).not.toHaveBeenCalledWith(1)
})

test('a Link configuration refresh cannot overwrite navigation started by its stable updater', async () => {
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      (['/a', '/b'] as const).map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: ['/a?marker=initial'] }),
  })
  await router.load()
  let armed = false
  let navigation: Promise<void> | undefined
  const updateSearch = (search: Record<string, unknown>) => {
    if (armed) {
      armed = false
      navigation = router.navigate({
        to: '/b',
        search: { marker: 'navigated' },
      })
    }
    return search
  }

  function Example() {
    const [title, setTitle] = React.useState('Initial title')
    const [exact, setExact] = React.useState(false)
    return (
      <>
        <button onClick={() => setTitle('Changed title')}>Change title</button>
        <button onClick={() => setExact(true)}>Refresh active options</button>
        <Link
          to="/b"
          search={updateSearch}
          activeOptions={{ exact }}
          title={title}
        >
          Configuration destination
        </Link>
      </>
    )
  }

  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  const link = screen.getByRole('link', { name: 'Configuration destination' })
  expect(link).toHaveAttribute('href', '/b?marker=initial')
  expect(link).not.toHaveAttribute('aria-current')

  router.update({ stringifySearch: (search) => defaultStringifySearch(search) })
  armed = true
  fireEvent.click(screen.getByRole('button', { name: 'Change title' }))
  expect(link).toHaveAttribute('title', 'Changed title')
  if (!navigation) {
    // The previous selector implementation observes changed configuration
    // when its active options change rather than on a title-only render.
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh active options' }),
    )
  }
  expect(navigation).toBeDefined()
  await act(async () => {
    await navigation
  })

  expect(router.state.location.pathname).toBe('/b')
  expect(router.state.location.search).toEqual({ marker: 'navigated' })
  expect(link).toHaveAttribute('href', '/b?marker=navigated')
  expect(link).toHaveAttribute('aria-current', 'page')
})

test('an inline updater with unchanged output does not cause another render after its parent commits', async () => {
  const renderContent = vi.fn(() => 'Stable destination')
  const rootRoute = createRootRoute()
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/a' })
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/a?marker=fixed'] }),
  })
  await router.load()

  function Example() {
    const [parentRender, setParentRender] = React.useState(0)
    return (
      <>
        <button onClick={() => setParentRender((previous) => previous + 1)}>
          Rerender parent
        </button>
        <Link
          to="/a"
          search={() => ({ marker: 'fixed' })}
          title={`Parent render ${parentRender}`}
        >
          {renderContent}
        </Link>
      </>
    )
  }

  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  const link = screen.getByRole('link', { name: 'Stable destination' })
  expect(link).toHaveAttribute('href', '/a?marker=fixed')
  expect(link).toHaveAttribute('aria-current', 'page')
  renderContent.mockClear()

  fireEvent.click(screen.getByRole('button', { name: 'Rerender parent' }))

  expect(link).toHaveAttribute('title', 'Parent render 1')
  expect(link).toHaveAttribute('href', '/a?marker=fixed')
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(renderContent).toHaveBeenCalledTimes(1)
})
