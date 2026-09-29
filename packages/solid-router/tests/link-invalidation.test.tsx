import * as Solid from 'solid-js'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useLinkProps,
} from '../src'

const histories: Array<{ destroy: () => void }> = []
afterEach(() => {
  cleanup()
  for (const history of histories.splice(0)) {
    history.destroy()
  }
  vi.restoreAllMocks()
})

test.each(['departure', 'redirect', 'supersession'] as const)(
  'persistent links update while leaving links defer work across %s',
  async (outcome) => {
    const gate = createControlledPromise<void>()
    const updateSearch = vi.fn((search: { marker?: string }) => ({
      marker: search.marker,
    }))
    const root = createRootRoute({
      validateSearch: (search) => ({ marker: String(search.marker || '') }),
      component: () => (
        <>
          <Link to="/away" activeOptions={{ includeSearch: false }}>
            Persistent away
          </Link>
          <Outlet />
        </>
      ),
    })
    const home = createRoute({
      getParentRoute: () => root,
      path: '/home',
      component: () => (
        <Link to="/item" search={updateSearch}>
          Departing item
        </Link>
      ),
    })
    const away = createRoute({
      getParentRoute: () => root,
      path: '/away',
      loader: async () => {
        await gate
        if (outcome === 'redirect') {
          throw redirect({ to: '/home', search: { marker: 'returned' } })
        }
      },
      component: () => <p>Away page</p>,
    })
    const item = createRoute({ getParentRoute: () => root, path: '/item' })
    const history = createMemoryHistory({
      initialEntries: ['/home?marker=before'],
    })
    histories.push(history)
    const router = createRouter({
      routeTree: root.addChildren([home, away, item]),
      history,
      defaultPendingMs: 60_000,
    })
    render(() => <RouterProvider router={router} />)
    const departing = await screen.findByRole('link', {
      name: 'Departing item',
    })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(departing).toHaveAttribute('href', '/item?marker=before')
    updateSearch.mockClear()

    const navigation = router.navigate({
      to: '/away',
      search: { marker: 'leaving' },
    })
    try {
      await waitFor(() => expect(router.state.location.pathname).toBe('/away'))
      await waitFor(() =>
        expect(
          screen.getByRole('link', { name: 'Persistent away' }),
        ).toHaveAttribute('aria-current', 'page'),
      )
      expect(departing).toBeInTheDocument()
      expect(updateSearch).not.toHaveBeenCalled()
      if (outcome === 'supersession') {
        await router.navigate({ to: '/home', search: { marker: 'returned' } })
      }
    } finally {
      gate.resolve()
      await navigation
    }

    if (outcome === 'departure') {
      await screen.findByText('Away page')
      expect(departing).not.toBeInTheDocument()
      expect(updateSearch).not.toHaveBeenCalled()
    } else {
      await waitFor(() => {
        expect(departing).toHaveAttribute('href', '/item?marker=returned')
        expect(router.state.status).toBe('idle')
      })
      expect(screen.getByRole('link', { name: 'Departing item' })).toBe(
        departing,
      )
      expect(screen.queryByText('Away page')).not.toBeInTheDocument()
    }
  },
)

test('destination changes replace subscriptions without rebuilding for element props', async () => {
  const [to, setTo] = Solid.createSignal('.')
  const [title, setTitle] = Solid.createSignal('Before')
  const updateSearch = vi.fn((search: { marker?: string }) => ({
    marker: search.marker,
  }))
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: () => (
      <>
        <Link to={to()} params={true} search={updateSearch} title={title()}>
          Changing destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const item = createRoute({ getParentRoute: () => root, path: '/items/$id' })
  const history = createMemoryHistory({
    initialEntries: ['/items/one?marker=first'],
  })
  histories.push(history)
  const router = createRouter({ routeTree: root.addChildren([item]), history })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Changing destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/items/one?marker=first')
  updateSearch.mockClear()

  setTitle('After')
  await waitFor(() => expect(link).toHaveAttribute('title', 'After'))
  expect(updateSearch).not.toHaveBeenCalled()

  setTo('https://other.example/')
  await waitFor(() =>
    expect(link).toHaveAttribute('href', 'https://other.example/'),
  )
  await router.navigate({
    to: '/items/$id',
    params: { id: 'two' },
    search: { marker: 'second' },
  })
  expect(link).toHaveAttribute('href', 'https://other.example/')
  expect(updateSearch).not.toHaveBeenCalled()

  setTo('.')
  await waitFor(() => {
    expect(link).toHaveAttribute('href', '/items/two?marker=second')
    expect(link).toHaveAttribute('aria-current', 'page')
  })
  await router.navigate({
    to: '/items/$id',
    params: { id: 'three' },
    search: { marker: 'third' },
  })
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/items/three?marker=third'),
  )
})

test('a synchronous link observer can navigate without leaving sibling links stale', async () => {
  let armed = false
  let reentry: Promise<void> | undefined
  const FirstLink = () => {
    const props = useLinkProps({ to: '/a' })
    Solid.createComputed(() => {
      const active = props['aria-current'] === 'page'
      if (armed && !active) {
        armed = false
        reentry = router.navigate({ to: '/c' })
      }
    })
    return <a {...props}>First A</a>
  }
  const root = createRootRoute({
    component: () => (
      <>
        <FirstLink />
        <Link to="/a">Second A</Link>
        <Link to="/b">B link</Link>
        <Link to="/c">C link</Link>
        <Outlet />
      </>
    ),
  })
  const history = createMemoryHistory({ initialEntries: ['/a'] })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/a' }),
      createRoute({ getParentRoute: () => root, path: '/b' }),
      createRoute({ getParentRoute: () => root, path: '/c' }),
    ]),
    history,
  })
  render(() => <RouterProvider router={router} />)
  const first = await screen.findByRole('link', { name: 'First A' })
  const second = screen.getByRole('link', { name: 'Second A' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(first).toHaveAttribute('aria-current', 'page')
  expect(second).toHaveAttribute('aria-current', 'page')
  armed = true

  await router.navigate({ to: '/b' })
  await reentry
  await waitFor(() => expect(router.state.location.pathname).toBe('/c'))
  expect(reentry).toBeDefined()
  await waitFor(() => {
    expect(first).not.toHaveAttribute('aria-current')
    expect(second).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'B link' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(screen.getByRole('link', { name: 'C link' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

test('link derivation errors reach the route boundary without rejecting navigation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: () => (
      <>
        <Link
          to="/b"
          search={(search: { marker?: string }) => {
            if (search.marker === 'broken') {
              throw new Error('Cannot derive this link')
            }
            return { marker: search.marker }
          }}
        >
          Destination
        </Link>
        <Outlet />
      </>
    ),
    errorComponent: ({ error }) => (
      <p>
        Link failed: {error instanceof Error ? error.message : String(error)}
      </p>
    ),
  })
  const history = createMemoryHistory({ initialEntries: ['/a?marker=ready'] })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/a' }),
      createRoute({ getParentRoute: () => root, path: '/b' }),
    ]),
    history,
  })
  render(() => <RouterProvider router={router} />)
  await screen.findByRole('link', { name: 'Destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))

  await expect(
    router.navigate({ to: '/a', search: { marker: 'broken' } }),
  ).resolves.toBeUndefined()
  await screen.findByText('Link failed: Cannot derive this link')
})

test('an initially failing link releases its work when its boundary removes it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const derive = vi.fn(() => {
    throw new Error('Initial link failure')
  })
  const root = createRootRoute({
    component: () => (
      <>
        <Solid.ErrorBoundary fallback={<p>Initial link failed</p>}>
          <Link to="/target" search={derive}>
            Broken link
          </Link>
        </Solid.ErrorBoundary>
        <Outlet />
      </>
    ),
  })
  const history = createMemoryHistory({ initialEntries: ['/a'] })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/a' }),
      createRoute({ getParentRoute: () => root, path: '/b' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
  })
  render(() => <RouterProvider router={router} />)
  await screen.findByText('Initial link failed')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(
    screen.queryByRole('link', { name: 'Broken link' }),
  ).not.toBeInTheDocument()
  derive.mockClear()

  await router.navigate({ to: '/b' })
  expect(router.state.location.pathname).toBe('/b')
  expect(screen.getByText('Initial link failed')).toBeInTheDocument()
  expect(derive).not.toHaveBeenCalled()
})
