import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function setup(
  history = createMemoryHistory({ initialEntries: ['/items/0'] }),
  stringifySearch = defaultStringifySearch,
) {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/items/$id' }),
      createRoute({ getParentRoute: () => root, path: '/other' }),
    ]),
    history,
    stringifySearch,
  })
  await router.load()
  return router
}

test('unrelated navigation does not rebuild fixed Link destinations', async () => {
  const stringifySearch = vi.fn(defaultStringifySearch)
  const router = await setup(undefined, stringifySearch)
  const build = vi.spyOn(router, 'buildLocation')
  const view = render(
    <RouterContextProvider router={router}>
      {Array.from({ length: 50 }, (_, id) => (
        <Link
          key={id}
          to="/items/$id"
          params={{ id: String(id) }}
          search={{ link: id }}
          activeOptions={{ includeSearch: false }}
        >
          {id}
        </Link>
      ))}
    </RouterContextProvider>,
  )
  build.mockClear()
  stringifySearch.mockClear()
  await act(() => router.navigate({ to: '/other' }))
  expect(view.getByText('0')).not.toHaveAttribute('aria-current')
  expect(view.getByText('49')).toHaveAttribute('href', '/items/49?link=49')
  // Path changes check active state, but reuse the built destinations.
  expect(
    stringifySearch.mock.calls.filter(([search]) => 'link' in search),
  ).toHaveLength(0)
  build.mockClear()
  await act(() => router.navigate({ to: '/other', search: { page: 2 } }))
  expect(
    build.mock.calls.filter(([options]) => options.to === '/items/$id'),
  ).toHaveLength(0)
  await act(() => router.navigate({ to: '/items/$id', params: { id: '49' } }))
  expect(view.getByText('49')).toHaveAttribute('aria-current', 'page')
})

test('shared path buckets preserve independent exact, search and hash predicates', async () => {
  const router = await setup()
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/0" activeOptions={{ includeSearch: false }}>
        fuzzy
      </Link>
      <Link to="/items/0" activeOptions={{ exact: true }}>
        exact
      </Link>
      <Link to="/items/0" search={{ page: 2 }}>
        search
      </Link>
      <Link to="/items/0" hash="details" activeOptions={{ includeHash: true }}>
        hash
      </Link>
    </RouterContextProvider>,
  )
  for (const [to, search, hash, active] of [
    ['/items/0', { page: 2 }, 'details', ['fuzzy', 'search', 'hash']],
    ['/items/0', {}, '', ['fuzzy', 'exact']],
    ['/items/0/details', {}, '', ['fuzzy']],
    ['/items/01', {}, '', []],
    ['/items/01', { page: 2 }, 'details', []],
    ['/items/0', { page: 3 }, 'details', ['fuzzy', 'hash']],
    ['/items/0', { page: 2 }, '', ['fuzzy', 'search']],
  ] as const) {
    await act(() => router.navigate({ to, search, hash }))
    for (const name of ['fuzzy', 'exact', 'search', 'hash']) {
      expect(view.getByText(name).getAttribute('aria-current')).toBe(
        (active as ReadonlyArray<string>).includes(name) ? 'page' : null,
      )
    }
  }
})

test('custom href formatting keeps unrelated destinations current', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/items/0')
  let shell = 'first'
  const history = createBrowserHistory({
    createHref: (href) => `${href}?shell=${shell}`,
  })
  try {
    const router = await setup(history)
    const view = render(
      <RouterContextProvider router={router}>
        <Link to="/items/9">target</Link>
      </RouterContextProvider>,
    )
    expect(view.getByText('target')).toHaveAttribute(
      'href',
      '/items/9?shell=first',
    )
    shell = 'second'
    await act(() => router.navigate({ to: '/other' }))
    expect(view.getByText('target')).toHaveAttribute(
      'href',
      '/items/9?shell=second',
    )
  } finally {
    cleanup()
    history.destroy()
    window.history.replaceState(null, '', original)
  }
})

test('StrictMode subscriptions follow changed destinations and stop on unmount', async () => {
  const router = await setup()
  const build = vi.spyOn(router, 'buildLocation')
  function tree(to: string, exact: boolean, show = true) {
    return (
      <React.StrictMode>
        <RouterContextProvider router={router}>
          <Link to="/other">persistent</Link>
          {show && (
            <Link to={to} activeOptions={{ exact }}>
              target
            </Link>
          )}
        </RouterContextProvider>
      </React.StrictMode>
    )
  }
  const view = render(tree('/items/9', true))
  view.rerender(tree('/items/0', true))
  expect(view.getByText('target')).toHaveAttribute('aria-current', 'page')
  await act(() => router.navigate({ to: '/items/0/details' }))
  expect(view.getByText('target')).not.toHaveAttribute('aria-current')
  view.rerender(tree('/items/0', false))
  expect(view.getByText('target')).toHaveAttribute('aria-current', 'page')
  view.rerender(tree('/items/0', false, false))
  build.mockClear()
  await act(() => router.navigate({ to: '/items/0' }))
  // The only build is navigation itself. The unmounted link has no work left.
  expect(
    build.mock.calls.filter(([options]) => options.to === '/items/0'),
  ).toHaveLength(1)
  view.unmount()
  const remounted = render(tree('/items/0', true))
  await act(() => router.navigate({ to: '/other' }))
  expect(remounted.getByText('target')).not.toHaveAttribute('aria-current')
  expect(remounted.getByText('persistent')).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('identical destinations in different routers observe their own location', async () => {
  const first = await setup()
  const second = await setup()
  const view = render(
    <>
      <RouterContextProvider router={first}>
        <Link to="/items/0">first</Link>
      </RouterContextProvider>
      <RouterContextProvider router={second}>
        <Link to="/items/0">second</Link>
      </RouterContextProvider>
    </>,
  )
  await act(() => first.navigate({ to: '/other' }))
  expect(view.getByText('first')).not.toHaveAttribute('aria-current')
  expect(view.getByText('second')).toHaveAttribute('aria-current', 'page')
  await act(() => second.navigate({ to: '/other' }))
  expect(view.getByText('second')).not.toHaveAttribute('aria-current')
  await act(() => first.navigate({ to: '/items/0' }))
  expect(view.getByText('first')).toHaveAttribute('aria-current', 'page')
  expect(view.getByText('second')).not.toHaveAttribute('aria-current')
})

test('unrelated fixed destinations refresh when router configuration changes', async () => {
  const router = await setup()
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/9">target</Link>
    </RouterContextProvider>,
  )
  await act(() => router.navigate({ to: '/other' }))
  act(() => router.update({ basepath: '/app' }))
  expect(view.getByText('target')).toHaveAttribute('href', '/app/items/9')
  await act(() => router.navigate({ to: '/items/1' }))
  expect(view.getByText('target')).toHaveAttribute('href', '/app/items/9')
  await act(() => router.navigate({ to: '/items/9' }))
  expect(view.getByText('target')).toHaveAttribute('aria-current', 'page')
})

test('a mounted Link switches between fixed and inherited search while its sibling stays subscribed', async () => {
  const router = await setup()
  function tree(inherit: boolean) {
    return (
      <RouterContextProvider router={router}>
        <Link to="/items/9">sibling</Link>
        <Link
          to="/items/9"
          search={
            inherit
              ? (previous: Record<string, unknown>) => ({ page: previous.page })
              : {}
          }
        >
          target
        </Link>
      </RouterContextProvider>
    )
  }
  const view = render(tree(false))
  view.rerender(tree(true))
  await act(() => router.navigate({ to: '/other', search: { page: 2 } }))
  expect(view.getByText('target')).toHaveAttribute('href', '/items/9?page=2')
  expect(view.getByText('sibling')).toHaveAttribute('href', '/items/9')
  view.rerender(tree(false))
  await act(() => router.navigate({ to: '/items/9', search: { page: 3 } }))
  expect(view.getByText('target')).toHaveAttribute('href', '/items/9')
  expect(view.getByText('target')).toHaveAttribute('aria-current', 'page')
  expect(view.getByText('sibling')).toHaveAttribute('aria-current', 'page')
})

test('links catch a navigation between render and initial subscription', async () => {
  const router = await setup()
  function NavigateOnMount() {
    React.useLayoutEffect(() => {
      void router.navigate({ to: '/other', search: { page: 2 } })
    }, [])
    return null
  }
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/0">old</Link>
      <Link to="/other">new</Link>
      <Link
        to="/items/9"
        search={(previous: Record<string, unknown>) => ({
          page: previous.page,
        })}
      >
        dynamic
      </Link>
      <NavigateOnMount />
    </RouterContextProvider>,
  )
  await act(async () => {
    await router.load()
  })
  expect(view.getByText('old')).not.toHaveAttribute('aria-current')
  expect(view.getByText('new')).toHaveAttribute('aria-current', 'page')
  expect(view.getByText('dynamic')).toHaveAttribute('href', '/items/9?page=2')
})

test('replacing a formatter invalidates unrelated indexed links', async () => {
  const router = await setup()
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/9">target</Link>
    </RouterContextProvider>,
  )
  router.history.createHref = (href) => `${href}?shell=changed`
  await act(() => router.navigate({ to: '/other' }))
  expect(view.getByText('target')).toHaveAttribute(
    'href',
    '/items/9?shell=changed',
  )
  router.history.createHref = (href) => `${href}?shell=again`
  await act(() => router.navigate({ to: '/items/1' }))
  expect(view.getByText('target')).toHaveAttribute(
    'href',
    '/items/9?shell=again',
  )
})

test('remounting after navigation without subscribers reads the latest location', async () => {
  const router = await setup()
  function tree() {
    return (
      <React.StrictMode>
        <RouterContextProvider router={router}>
          <Link to="/other">target</Link>
        </RouterContextProvider>
      </React.StrictMode>
    )
  }
  const first = render(tree())
  first.unmount()
  await act(() => router.navigate({ to: '/other' }))
  const second = render(tree())
  expect(second.getByText('target')).toHaveAttribute('aria-current', 'page')
  await act(() => router.navigate({ to: '/items/0' }))
  expect(second.getByText('target')).not.toHaveAttribute('aria-current')
})

test('explicit source locations remain pinned while active state follows navigation', async () => {
  const router = await setup()
  await router.navigate({ to: '/items/0', search: { page: 1 } })
  const source = router.state.location
  const view = render(
    <RouterContextProvider router={router}>
      <Link from="/items/$id" to="." params search _fromLocation={source}>
        pinned
      </Link>
    </RouterContextProvider>,
  )
  await act(() => router.navigate({ to: '/items/1', search: { page: 2 } }))
  expect(view.getByText('pinned')).toHaveAttribute('href', '/items/0?page=1')
  expect(view.getByText('pinned')).not.toHaveAttribute('aria-current')
})

test('configuration invalidation refreshes inactive links without a pathname change', async () => {
  const router = await setup()
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/9" search={{ page: 1 }}>
        target
      </Link>
    </RouterContextProvider>,
  )
  expect(view.getByText('target')).toHaveAttribute('href', '/items/9?page=1')
  router.update({
    stringifySearch: (search) =>
      defaultStringifySearch({ ...search, configured: true }),
  })
  await act(() => router.navigate({ to: '/items/0', search: { page: 2 } }))
  expect(view.getByText('target')).toHaveAttribute(
    'href',
    '/items/9?page=1&configured=true',
  )
})

test('replacing history refreshes inactive links on same-path navigation', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/items/0')
  const replacement = createBrowserHistory({
    createHref: (href) => `${href}#shell`,
  })
  try {
    const router = await setup()
    const view = render(
      <RouterContextProvider router={router}>
        <Link to="/items/9">target</Link>
      </RouterContextProvider>,
    )
    router.update({ history: replacement })
    await act(() => router.navigate({ to: '/items/0', search: { page: 2 } }))
    expect(view.getByText('target')).toHaveAttribute('href', '/items/9#shell')
    router.update({
      history: createMemoryHistory({ initialEntries: ['/items/0'] }),
    })
    await act(() => router.navigate({ to: '/items/0', search: { page: 3 } }))
    expect(view.getByText('target')).toHaveAttribute('href', '/items/9')
  } finally {
    cleanup()
    replacement.destroy()
    window.history.replaceState(null, '', original)
  }
})
