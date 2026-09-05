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
  retainSearchParams,
} from '../src'
import type { AnyRouter } from '../src'

afterEach(cleanup)

function setup(links: () => React.ReactNode) {
  const root = createRootRoute({
    component: () => (
      <>
        <nav>{links()}</nav>
        <Outlet />
      </>
    ),
  })
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const item = createRoute({ getParentRoute: () => root, path: '/items/$id' })
  const optional = createRoute({
    getParentRoute: () => root,
    path: '/optional/{-$id}',
  })
  const router = createRouter({
    routeTree: root.addChildren([index, item, optional]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const build = router.buildLocation
  let hits = 0
  vi.spyOn(router, 'buildLocation').mockImplementation((options) => {
    const cache = (options as { _buildCache?: { value?: unknown } })._buildCache
    const entry = cache?.value
    const result = build(options)
    if (entry && entry === cache?.value) {
      hits++
    }
    return result
  })
  return { router, item, hits: () => hits }
}

async function mount(router: AnyRouter) {
  await act(async () => {
    render(<RouterProvider router={router} />)
    await router.load()
  })
}

function href() {
  return screen.getByTestId('link').getAttribute('href')
}

test('a cached destination keeps its href while active state follows navigation', async () => {
  const { router, hits } = setup(() => (
    <Link
      to="/items/$id"
      params={{ id: '9' }}
      data-testid="link"
      activeProps={{ className: 'active' }}
    >
      item
    </Link>
  ))
  await mount(router)
  const before = hits()
  expect(href()).toBe('/items/9')
  expect(screen.getByTestId('link').className).not.toContain('active')
  await act(() => router.navigate({ to: '/items/$id', params: { id: '9' } }))
  expect(hits()).toBeGreaterThan(before)
  expect(href()).toBe('/items/9')
  expect(screen.getByTestId('link').className).toContain('active')
  await act(() => router.navigate({ to: '/' }))
  expect(screen.getByTestId('link').className).not.toContain('active')
})

test('changed link options discard the previous cache', async () => {
  function Links() {
    const [id, setId] = React.useState('1')
    return (
      <>
        <button onClick={() => setId('2')}>change</button>
        <Link
          to="/items/$id"
          params={{ id }}
          search={{ tab: Number(id) }}
          hash={id}
          data-testid="link"
        >
          item
        </Link>
      </>
    )
  }
  const { router, hits } = setup(() => <Links />)
  await mount(router)
  await act(() => router.navigate({ to: '/items/$id', params: { id: '9' } }))
  expect(hits()).toBeGreaterThan(0)
  expect(href()).toBe('/items/1?tab=1#1')
  fireEvent.click(screen.getByText('change'))
  expect(href()).toBe('/items/2?tab=2#2')
})

test('cache hits still apply changed locale rewrites', async () => {
  const { router, hits } = setup(() => (
    <Link to="/items/$id" params={{ id: '9' }} data-testid="link">
      item
    </Link>
  ))
  let locale = 'en'
  router.update({
    rewrite: {
      input: ({ url }) => {
        url.pathname = url.pathname.replace(/^\/(en|fr)(?=\/|$)/, '') || '/'
        return url
      },
      output: ({ url }) => {
        url.pathname = `/${locale}${url.pathname}`
        return url
      },
    },
  })
  await mount(router)
  expect(href()).toBe('/en/items/9')
  const before = hits()
  locale = 'fr'
  await act(() => router.navigate({ to: '/items/$id', params: { id: '2' } }))
  expect(hits()).toBeGreaterThan(before)
  expect(href()).toBe('/fr/items/9')
})

test('an absent optional param is inherited after navigation', async () => {
  const { router } = setup(() => (
    <Link to="/optional/{-$id}" params={{}} data-testid="link">
      optional
    </Link>
  ))
  await mount(router)
  expect(href()).toBe('/optional')
  await act(() => router.navigate({ to: '/items/$id', params: { id: '2' } }))
  expect(href()).toBe('/optional/2')
})

test('route.update can add middleware after the link has served cache hits', async () => {
  const { router, item, hits } = setup(() => (
    <Link to="/items/$id" params={{ id: '9' }} data-testid="link">
      item
    </Link>
  ))
  await mount(router)
  await act(() => router.navigate({ to: '/items/$id', params: { id: '2' } }))
  expect(hits()).toBeGreaterThan(0)
  item.update({ search: { middlewares: [retainSearchParams(true)] } })
  await act(() => router.navigate({ to: '/', search: { tab: 'new' } } as any))
  expect(href()).toBe('/items/9?tab=new')
})

test('clicking a cached link still validates search during navigation', async () => {
  const { router, item, hits } = setup(() => (
    <Link to="/items/$id" params={{ id: '9' }} data-testid="link">
      item
    </Link>
  ))
  item.update({
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 1),
    }),
  } as any)
  await mount(router)
  await act(() => router.navigate({ to: '/items/$id', params: { id: '2' } }))
  expect(hits()).toBeGreaterThan(0)
  expect(href()).toBe('/items/9')
  await act(async () => {
    fireEvent.click(screen.getByTestId('link'))
  })
  expect(router.state.location.href).toBe('/items/9?page=1')
})

test('intent preloading validates search after cache hits', async () => {
  const { router, item, hits } = setup(() => (
    <Link
      to="/items/$id"
      params={{ id: '9' }}
      preload="intent"
      preloadDelay={0}
      data-testid="link"
    >
      item
    </Link>
  ))
  const loader = vi.fn(() => null)
  item.update({
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 1),
    }),
    loaderDeps: ({ search }: any) => ({ page: search.page }),
    loader,
  } as any)
  const preload = vi.spyOn(router, 'preloadRoute')
  await mount(router)
  await act(() => router.navigate({ to: '/items/$id', params: { id: '2' } }))
  expect(hits()).toBeGreaterThan(0)
  loader.mockClear()
  fireEvent.focus(screen.getByTestId('link'))
  await waitFor(() => expect(loader).toHaveBeenCalled())
  expect(preload.mock.calls[0]![0]).not.toHaveProperty('_buildCache')
  expect(loader).toHaveBeenCalledWith(
    expect.objectContaining({ deps: { page: 1 }, params: { id: '9' } }),
  )
})

test('hash-only navigation updates href and active state on cache hits', async () => {
  const { router, hits } = setup(() => (
    <>
      <Link to="/items/$id" params={{ id: '9' }} hash={true} data-testid="link">
        inherited
      </Link>
      <Link
        to="/items/$id"
        params={{ id: '9' }}
        hash="one"
        activeOptions={{ includeHash: true }}
        activeProps={{ className: 'active' }}
        data-testid="fixed"
      >
        fixed
      </Link>
    </>
  ))
  await mount(router)
  await act(() =>
    router.navigate({ to: '/items/$id', params: { id: '9' }, hash: 'one' }),
  )
  expect(href()).toBe('/items/9#one')
  expect(screen.getByTestId('fixed').className).toContain('active')
  const before = hits()
  await act(() =>
    router.navigate({ to: '/items/$id', params: { id: '9' }, hash: 'two' }),
  )
  expect(hits()).toBeGreaterThan(before)
  expect(href()).toBe('/items/9#two')
  expect(screen.getByTestId('fixed').className).not.toContain('active')
})

test.each([
  ['supplied', { id: 'fixed' }, '/optional/fixed'],
  ['absent', { id: undefined }, '/optional'],
  ['inherited', {}, '/optional/1'],
] as const)(
  'an optional link with %s params hits on search-only changes',
  async (_, params, expectedHref) => {
    const { router, hits } = setup(() => (
      <Link to="/optional/{-$id}" params={params} data-testid="link">
        optional
      </Link>
    ))
    await router.navigate({ to: '/items/$id', params: { id: '1' } })
    await mount(router)
    expect(href()).toBe(expectedHref)
    const before = hits()
    await act(() =>
      router.navigate({
        to: '/items/$id',
        params: { id: '1' },
        search: { page: 2 },
      } as any),
    )
    expect(href()).toBe(expectedHref)
    expect(hits()).toBeGreaterThan(before)
  },
)

test('search and hash prop changes preserve the pathname cache', async () => {
  function Links() {
    const [page, setPage] = React.useState(1)
    return (
      <>
        <button onClick={() => setPage(2)}>change search</button>
        <Link
          to="/optional/{-$id}"
          params={{ id: 'fixed' }}
          search={{ page } as any}
          hash={`section-${page}`}
          data-testid="link"
        >
          optional
        </Link>
      </>
    )
  }
  const { router, hits } = setup(() => <Links />)
  await mount(router)
  expect(href()).toBe('/optional/fixed?page=1#section-1')
  const before = hits()
  fireEvent.click(screen.getByText('change search'))
  expect(href()).toBe('/optional/fixed?page=2#section-2')
  expect(hits()).toBeGreaterThan(before)
})

test('a suspended option transition cannot change the committed link pathname', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let waiting = true
  let suspended = false
  function Suspend({ id }: { id: string }) {
    if (id === '2' && waiting) {
      suspended = true
      throw pending
    }
    return null
  }
  function Links() {
    const [id, setId] = React.useState('1')
    return (
      <>
        <button onClick={() => React.startTransition(() => setId('2'))}>
          transition
        </button>
        <React.Suspense fallback={<span>loading</span>}>
          <Link to="/optional/{-$id}" params={{ id }} data-testid="link">
            optional
          </Link>
          <Suspend id={id} />
        </React.Suspense>
      </>
    )
  }
  const { router } = setup(() => <Links />)
  await mount(router)
  expect(href()).toBe('/optional/1')
  fireEvent.click(screen.getByText('transition'))
  expect(suspended).toBe(true)
  expect(href()).toBe('/optional/1')
  await act(() => router.navigate({ to: '/items/$id', params: { id: '3' } }))
  expect(href()).toBe('/optional/1')
  await act(async () => {
    waiting = false
    release()
    await pending
  })
  expect(href()).toBe('/optional/2')
})
