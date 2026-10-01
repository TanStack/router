import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemo, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  useLinkProps,
} from '../src'

afterEach(cleanup)

test('switches between cached literals and mutable store destinations', async () => {
  const [mutable, setMutable] = createSignal(false)
  const [params, setParams] = createStore({ id: 'one' })
  const [search, setSearch] = createStore({ destination: 'store', page: 1 })
  const stringifyDestination = vi.fn(defaultStringifySearch)
  const root = createRootRoute({
    component: () => (
      <Link
        to="/target/$id"
        params={mutable() ? params : { id: 'fixed' }}
        search={mutable() ? search : { destination: 'literal' }}
        data-testid="switching"
      />
    ),
  })
  const source = createRoute({ getParentRoute: () => root, path: '/source' })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
    stringifySearch: (value) =>
      value.destination
        ? stringifyDestination(value)
        : defaultStringifySearch(value),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('switching')
    expect(link).toHaveAttribute('href', '/target/fixed?destination=literal')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const initial = stringifyDestination.mock.calls.length
    await router.navigate({ to: '/source', hash: 'first' })
    expect(stringifyDestination).toHaveBeenCalledTimes(initial)
    setMutable(true)
    expect(link).toHaveAttribute('href', '/target/one?destination=store&page=1')
    setParams('id', 'two')
    setSearch('page', 2)
    await router.navigate({ to: '/source', hash: 'second' })
    expect(link).toHaveAttribute('href', '/target/two?destination=store&page=2')
    setMutable(false)
    expect(link).toHaveAttribute('href', '/target/fixed?destination=literal')
    const restored = stringifyDestination.mock.calls.length
    await router.navigate({ to: '/source', hash: 'third' })
    expect(stringifyDestination).toHaveBeenCalledTimes(restored)
    setMutable(true)
    setParams('id', 'three')
    setSearch('page', 3)
    await router.navigate({ to: '/source', hash: 'fourth' })
    expect(link).toHaveAttribute(
      'href',
      '/target/three?destination=store&page=3',
    )
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('preserves public buildLocation tracking and an explicit hook source', async () => {
  const root = createRootRoute({
    component: () => {
      const href = createMemo(
        () =>
          router.buildLocation({ to: '/target/$id', params: true } as any).href,
      )
      const props = useLinkProps(
        Object.freeze({
          to: '/target/$id',
          params: true,
          _fromLocation: router.buildLocation({
            to: '/source/$id',
            params: { id: 'explicit' },
          } as any),
          'data-testid': 'explicit-source',
        }) as any,
      )
      return (
        <>
          <a href={href()} data-testid="public-build" />
          <a {...props} />
        </>
      )
    },
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/one'] }),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('public-build')
    const explicit = await screen.findByTestId('explicit-source')
    expect(link).toHaveAttribute('href', '/target/one')
    expect(explicit).toHaveAttribute('href', '/target/explicit')
    expect(
      [
        { to: '/target/$id', params: true } as const,
        { to: '/target/$id', params: true } as const,
      ]
        .map(router.buildLocation)
        .map((location) => location.href),
    ).toEqual(['/target/one', '/target/one'])
    await router.navigate({ to: '/source/$id', params: { id: 'two' } })
    expect(link).toHaveAttribute('href', '/target/two')
    expect(explicit).toHaveAttribute('href', '/target/explicit')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('refreshes masked store inputs and functional destination inputs after navigation', async () => {
  const [params, setParams] = createStore({ id: 'one' })
  const [page, setPage] = createSignal(1)
  const root = createRootRoute({
    component: () => (
      <Link
        to="/target/$id"
        params={{ id: 'fixed' }}
        mask={{
          to: '/visible/$id',
          params,
          search: () => ({ page: page() }),
          hash: () => `page-${page()}`,
        }}
        data-testid="masked"
      />
    ),
  })
  const source = createRoute({ getParentRoute: () => root, path: '/source' })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const visible = createRoute({
    getParentRoute: () => root,
    path: '/visible/$id',
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target, visible]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('masked')
    expect(link).toHaveAttribute('href', '/visible/one?page=1#page-1')
    await router.navigate({ to: '/source', hash: 'next' })
    setParams('id', 'two')
    setPage(2)
    await router.navigate({ to: '/source', hash: 'last' })
    expect(link).toHaveAttribute('href', '/visible/two?page=2#page-2')
    setPage(3)
    await router.navigate({ to: '/source', hash: 'again' })
    expect(link).toHaveAttribute('href', '/visible/two?page=3#page-3')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('reuses a fixed Link destination across unrelated navigations', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link
          to="/target/$id"
          params={{ id: 'fixed' }}
          search={{ destination: 'fixed' }}
          hash="details"
          activeOptions={{ includeSearch: false }}
          data-testid="target"
        />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const stringifyDestination = vi.fn(defaultStringifySearch)
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/one'] }),
    stringifySearch: (search) =>
      search.destination === 'fixed'
        ? stringifyDestination(search)
        : defaultStringifySearch(search),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('target')
    expect(link).toHaveAttribute(
      'href',
      '/target/fixed?destination=fixed#details',
    )
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const builds = stringifyDestination.mock.calls.length
    expect(builds).toBeGreaterThan(0)

    await router.navigate({ to: '/source/$id', params: { id: 'two' } })
    expect(link).toHaveAttribute(
      'href',
      '/target/fixed?destination=fixed#details',
    )
    expect(stringifyDestination).toHaveBeenCalledTimes(builds)

    await router.navigate({ to: '/target/$id', params: { id: 'fixed' } })
    expect(link).toHaveAttribute('data-status', 'active')
    expect(stringifyDestination).toHaveBeenCalledTimes(builds)
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('refreshes reactive destination props without mutating frozen hook options', async () => {
  const [to, setTo] = createSignal('/target/$id')
  const [id, setId] = createSignal('one')
  const [search, setSearch] = createSignal<Record<string, unknown>>({ page: 1 })
  const [hash, setHash] = createSignal('first')
  const options = Object.freeze({
    get to() {
      return to()
    },
    get params() {
      return { id: id() }
    },
    get search() {
      return search()
    },
    get hash() {
      return hash()
    },
    'data-testid': 'reactive',
  })
  const root = createRootRoute({
    component: () => {
      const props = useLinkProps(options)
      return (
        <>
          <a {...props} />
          <Outlet />
        </>
      )
    },
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/initial'] }),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('reactive')
    expect(link).toHaveAttribute('href', '/target/one?page=1#first')
    await router.navigate({ to: '/source/$id', params: { id: 'next' } })

    setId('two')
    expect(link).toHaveAttribute('href', '/target/two?page=1#first')
    setSearch({ page: 2, filters: { value: 'new' } })
    expect(link).toHaveAttribute(
      'href',
      '/target/two?page=2&filters=%7B%22value%22%3A%22new%22%7D#first',
    )
    setHash('second')
    expect(link.getAttribute('href')).toMatch(/#second$/)
    setTo('/source/$id')
    expect(link.getAttribute('href')).toMatch(/^\/source\/two\?/)
    setSearch({})
    expect(link).toHaveAttribute('href', '/source/two#second')

    await router.navigate({ to: '/source/$id', params: { id: 'last' } })
    expect(link).toHaveAttribute('href', '/source/two#second')
    expect(Object.keys(options)).not.toContain('_fromLocation')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('invalidates a cached destination after router configuration changes', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="configured" />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/one'] }),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('configured')
    expect(link).toHaveAttribute('href', '/target')
    await router.navigate({ to: '/source/$id', params: { id: 'two' } })
    router.update({ trailingSlash: 'always' } as any)
    await router.navigate({ to: '/source/$id', params: { id: 'three' } })
    expect(link).toHaveAttribute('href', '/target/')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test.each([false, true])(
  'observes nested Solid stores (wrapped=%s)',
  async (wrapped) => {
    const [params, setParams] = createStore({ id: 'one' })
    const [search, setSearch] = createStore({ filters: { page: 1 } })
    const linkSearch = wrapped ? { filters: search.filters } : search
    const root = createRootRoute({
      component: () => (
        <>
          <Link
            to="/target/$id"
            params={params}
            search={linkSearch}
            data-testid="store"
          />
          <Outlet />
        </>
      ),
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source/$id',
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target/$id',
    })
    const router = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({ initialEntries: ['/source/one'] }),
    })
    try {
      render(() => <RouterProvider router={router} />)
      const link = await screen.findByTestId('store')
      expect(link).toHaveAttribute(
        'href',
        '/target/one?filters=%7B%22page%22%3A1%7D',
      )
      await router.navigate({ to: '/source/$id', params: { id: 'two' } })
      setParams('id', 'two')
      setSearch('filters', 'page', 2)
      await router.navigate({ to: '/source/$id', params: { id: 'three' } })
      expect(link).toHaveAttribute(
        'href',
        '/target/two?filters=%7B%22page%22%3A2%7D',
      )
      setSearch('filters', 'page', undefined as any)
      await router.navigate({ to: '/source/$id', params: { id: 'four' } })
      expect(link).toHaveAttribute('href', '/target/two?filters=%7B%7D')
      setSearch('filters', 'page', 3)
      await router.navigate({ to: '/source/$id', params: { id: 'five' } })
      expect(link).toHaveAttribute(
        'href',
        '/target/two?filters=%7B%22page%22%3A3%7D',
      )
    } finally {
      cleanup()
      router.history.destroy()
    }
  },
)

test('switches cached literal destinations to inherited params and search', async () => {
  const [inherit, setInherit] = createSignal(false)
  const root = createRootRoute({
    component: () => (
      <>
        <Link
          to="/target/$id"
          params={inherit() ? true : { id: 'fixed' }}
          search={inherit() ? true : { page: 1 }}
          data-testid="inherited"
        />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/one?page=2'] }),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('inherited')
    await router.navigate({
      to: '/source/$id',
      params: { id: 'two' },
      search: { page: 3 },
    } as any)
    expect(link).toHaveAttribute('href', '/target/fixed?page=1')
    setInherit(true)
    expect(link).toHaveAttribute('href', '/target/two?page=3')
    await router.navigate({
      to: '/source/$id',
      params: { id: 'three' },
      search: { page: 4 },
    } as any)
    expect(link).toHaveAttribute('href', '/target/three?page=4')
    setInherit(false)
    expect(link).toHaveAttribute('href', '/target/fixed?page=1')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('preserves custom search values while tracking arrays and cyclic records', async () => {
  const [filter, setFilter] = createStore({ page: 1 })
  const date = new Date('2026-01-01')
  const search = { filters: [filter], date, self: undefined as unknown }
  search.self = search
  const stringify = vi.fn((value: any) => {
    expect(value).toBe(search)
    expect(value.date).toBe(date)
    expect(value.self).toBe(search)
    return `?page=${value.filters[0].page}`
  })
  const root = createRootRoute({
    component: () => (
      <Link to="/target" search={search} data-testid="custom-search" />
    ),
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([target]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    stringifySearch: (value) =>
      value.filters ? stringify(value) : defaultStringifySearch(value),
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('custom-search')
    expect(link).toHaveAttribute('href', '/target?page=1')
    setFilter('page', 2)
    await router.navigate({ to: '/target', hash: 'other' })
    expect(link).toHaveAttribute('href', '/target?page=2')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('refreshes history formatting even when the built destination is cached', async () => {
  let suffix = 'old'
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="formatted" />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory({ initialEntries: ['/source/one'] })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: {
      ...history,
      get location() {
        return history.location
      },
      createHref: (href) => `${href}#${suffix}`,
    },
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('formatted')
    expect(link).toHaveAttribute('href', '/target#old')
    suffix = 'new'
    await router.navigate({ to: '/source/$id', params: { id: 'two' } })
    expect(link).toHaveAttribute('href', '/target#new')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('reuses a simple Link destination and invalidates reactive routing props', async () => {
  const [to, setTo] = createSignal('/target/$id')
  const [params, setParams] = createStore({ id: 'one' })
  const formatDestination = vi.fn((url: URL) => url)
  const root = createRootRoute({
    component: () => (
      <>
        <Link
          to={to()}
          params={{ id: params.id }}
          data-testid="simple-target"
        />
        <Outlet />
      </>
    ),
  })
  const source = createRoute({ getParentRoute: () => root, path: '/source' })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
  })
  const other = createRoute({ getParentRoute: () => root, path: '/other/$id' })
  const router = createRouter({
    routeTree: root.addChildren([source, target, other]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
    rewrite: {
      output: ({ url }) =>
        url.pathname.startsWith('/target/') ||
        url.pathname.startsWith('/other/')
          ? formatDestination(url)
          : url,
    },
  })
  try {
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('simple-target')
    expect(link).toHaveAttribute('href', '/target/one')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const builds = formatDestination.mock.calls.length
    expect(builds).toBeGreaterThan(0)
    await router.navigate({ to: '/source', hash: 'next' })
    expect(link).toHaveAttribute('href', '/target/one')
    expect(formatDestination).toHaveBeenCalledTimes(builds)
    setParams('id', 'two')
    await router.navigate({ to: '/source', hash: 'params-updated' })
    expect(link).toHaveAttribute('href', '/target/two')
    setTo('/other/$id')
    expect(link).toHaveAttribute('href', '/other/two')
    const updatedBuilds = formatDestination.mock.calls.length
    expect(updatedBuilds).toBeGreaterThan(builds)
    await router.navigate({ to: '/source', hash: 'last' })
    expect(link).toHaveAttribute('href', '/other/two')
    expect(formatDestination).toHaveBeenCalledTimes(updatedBuilds)
    setParams('id', 'three')
    await router.navigate({ to: '/source', hash: 'mutated-again' })
    expect(link).toHaveAttribute('href', '/other/three')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test.each(['custom', 'toJSON'] as const)(
  'tracks actual serialization without visiting ignored getters (%s)',
  async (mode) => {
    const [filter, setFilter] = createStore({ page: 1 })
    const value = {
      toJSON() {
        return { page: filter.page }
      },
      get unused() {
        throw new Error('serialization must not visit unused')
      },
    }
    const search =
      mode === 'custom' ? { filter, metadata: value } : { filter: value }
    const root = createRootRoute({
      component: () => (
        <Link to="/target" search={search} data-testid="selective" />
      ),
    })
    const source = createRoute({ getParentRoute: () => root, path: '/source' })
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const router = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      stringifySearch: (search) =>
        mode === 'custom' && search.filter
          ? `?page=${search.filter.page}`
          : defaultStringifySearch(search),
    })
    try {
      render(() => <RouterProvider router={router} />)
      const link = await screen.findByTestId('selective')
      expect(link).toHaveAttribute(
        'href',
        mode === 'custom'
          ? '/target?page=1'
          : '/target?filter=%7B%22page%22%3A1%7D',
      )
      setFilter('page', 2)
      await router.navigate({ to: '/source', hash: 'next' })
      expect(link).toHaveAttribute(
        'href',
        mode === 'custom'
          ? '/target?page=2'
          : '/target?filter=%7B%22page%22%3A2%7D',
      )
    } finally {
      cleanup()
      router.history.destroy()
    }
  },
)
