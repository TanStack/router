import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
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
    render(<RouterProvider router={router} />)
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

test('reactive callback inputs refresh a departing link and remain current after a redirect', async () => {
  const gate = createControlledPromise<void>()
  const value = Vue.ref('initial')
  const updateSearch = (search: { marker?: string }) => ({
    marker: search.marker,
    value: value.value,
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: Outlet,
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => (
      <Link to="/item" search={updateSearch}>
        Reactive departing item
      </Link>
    ),
  })
  const away = createRoute({
    getParentRoute: () => root,
    path: '/away',
    loader: async () => {
      await gate
      throw redirect({ to: '/home', search: { marker: 'returned' } })
    },
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
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', {
    name: 'Reactive departing item',
  })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/item?marker=before&value=initial')

  const navigation = router.navigate({
    to: '/away',
    search: { marker: 'leaving' },
  })
  try {
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/away')
      expect(router.state.status).toBe('pending')
    })
    expect(link).toBeInTheDocument()
    value.value = 'changed'
    await waitFor(() =>
      expect(link).toHaveAttribute(
        'href',
        '/item?marker=leaving&value=changed',
      ),
    )
  } finally {
    gate.resolve()
    await navigation
  }

  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/home')
    expect(router.state.status).toBe('idle')
    expect(link).toHaveAttribute('href', '/item?marker=returned&value=changed')
  })
  expect(screen.getByRole('link', { name: 'Reactive departing item' })).toBe(
    link,
  )
  value.value = 'settled'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/item?marker=returned&value=settled'),
  )
})

test('destination changes replace subscriptions without rebuilding for element props', async () => {
  const to = Vue.ref('.')
  const title = Vue.ref('Before')
  const updateSearch = vi.fn((search: { marker?: string }) => ({
    marker: search.marker,
  }))
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: () => (
      <>
        <Link
          to={to.value}
          params={true}
          search={updateSearch}
          title={title.value}
        >
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
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Changing destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/items/one?marker=first')
  updateSearch.mockClear()

  title.value = 'After'
  await waitFor(() => expect(link).toHaveAttribute('title', 'After'))
  expect(updateSearch).not.toHaveBeenCalled()

  to.value = 'https://other.example/'
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

  to.value = '.'
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
  const FirstLink = Vue.defineComponent({
    setup() {
      const props = useLinkProps({ to: '/a' })
      Vue.watch(
        () => Vue.unref(props)['aria-current'],
        (active) => {
          if (armed && active !== 'page') {
            armed = false
            reentry = router.navigate({ to: '/c' })
          }
        },
        { flush: 'sync' },
      )
      return () => Vue.h('a', { ...Vue.unref(props) }, 'First A')
    },
  })
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
  render(<RouterProvider router={router} />)
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
  render(<RouterProvider router={router} />)
  await screen.findByRole('link', { name: 'Destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))

  await expect(
    router.navigate({ to: '/a', search: { marker: 'broken' } }),
  ).resolves.toBeUndefined()
  await screen.findByText('Link failed: Cannot derive this link')
})

test('functional destinations track reactive dependencies selected by a navigation', async () => {
  const left = Vue.ref('left-before')
  const right = Vue.ref('right-before')
  const root = createRootRoute({
    validateSearch: (search) => ({ side: String(search.side || 'left') }),
    component: () => (
      <>
        <Link
          to="/target"
          search={(search: { side?: string }) => ({
            side: search.side,
            value: search.side === 'left' ? left.value : right.value,
          })}
        >
          Reactive destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const history = createMemoryHistory({ initialEntries: ['/source?side=left'] })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Reactive destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/target?side=left&value=left-before')

  await router.navigate({ to: '/source', search: { side: 'right' } })
  await waitFor(() =>
    expect(link).toHaveAttribute(
      'href',
      '/target?side=right&value=right-before',
    ),
  )
  right.value = 'right-after'
  await waitFor(() =>
    expect(link).toHaveAttribute(
      'href',
      '/target?side=right&value=right-after',
    ),
  )
  await router.navigate({ to: '/source', search: { side: 'left' } })
  left.value = 'left-after'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/target?side=left&value=left-after'),
  )
})

test('a sibling destination updater cannot overwrite a newer reactive destination', async () => {
  const value = Vue.ref('before')
  let armed = false
  const firstSearch = (search: { marker?: string }) => ({
    marker: search.marker,
    value: value.value,
  })
  const secondSearch = (search: { marker?: string }) => {
    if (armed && search.marker === 'after') {
      armed = false
      value.value = 'latest'
    }
    return { marker: search.marker }
  }
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || 'before') }),
    component: () => (
      <>
        <Link to="/first" search={firstSearch}>
          First reactive destination
        </Link>
        <Link to="/second" search={secondSearch}>
          Mutating sibling destination
        </Link>
        <Outlet />
      </>
    ),
  })
  const history = createMemoryHistory({
    initialEntries: ['/source?marker=before'],
  })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/first' }),
      createRoute({ getParentRoute: () => root, path: '/second' }),
    ]),
    history,
  })
  render(<RouterProvider router={router} />)
  const first = await screen.findByRole('link', {
    name: 'First reactive destination',
  })
  await screen.findByRole('link', { name: 'Mutating sibling destination' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(first).toHaveAttribute('href', '/first?marker=before&value=before')
  armed = true

  await router.navigate({ to: '/source', search: { marker: 'after' } })
  expect(value.value).toBe('latest')
  await waitFor(() =>
    expect(first).toHaveAttribute('href', '/first?marker=after&value=latest'),
  )
  expect(screen.getByRole('link', { name: 'First reactive destination' })).toBe(
    first,
  )
})

test('an initially failing link releases its work when its boundary removes it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const derive = vi.fn(() => {
    throw new Error('Initial link failure')
  })
  const Boundary = Vue.defineComponent({
    setup(_, { slots }) {
      const failed = Vue.ref(false)
      Vue.onErrorCaptured(() => {
        failed.value = true
        return false
      })
      return () =>
        failed.value ? Vue.h('p', 'Initial link failed') : slots.default?.()
    },
  })
  const root = createRootRoute({
    component: () =>
      Vue.h(Vue.Fragment, [
        Vue.h(Boundary, null, {
          default: () =>
            Vue.h(Link, { to: '/target', search: derive }, () => 'Broken link'),
        }),
        Vue.h(Outlet),
      ]),
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
  render(<RouterProvider router={router} />)
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

test('retargeting callbacks replaces reactive dependencies and survives an external destination', async () => {
  const left = Vue.ref('left')
  const right = Vue.ref('right')
  const to = Vue.ref('/target')
  const deriveRight = vi.fn(() => ({ value: right.value }))
  const derive = Vue.shallowRef(() => ({ value: left.value }))
  const root = createRootRoute({
    component: () => (
      <>
        <Link to={to.value} search={derive.value}>
          Retargeted callback
        </Link>
        <Outlet />
      </>
    ),
  })
  const history = createMemoryHistory({ initialEntries: ['/source'] })
  histories.push(history)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Retargeted callback' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/target?value=left')

  derive.value = deriveRight
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/target?value=right'),
  )
  deriveRight.mockClear()
  left.value = 'obsolete'
  await Vue.nextTick()
  expect(deriveRight).not.toHaveBeenCalled()
  right.value = 'updated'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/target?value=updated'),
  )

  to.value = 'https://other.example/'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', 'https://other.example/'),
  )
  deriveRight.mockClear()
  right.value = 'returned'
  await Vue.nextTick()
  expect(deriveRight).not.toHaveBeenCalled()
  to.value = '/target'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/target?value=returned'),
  )
})
