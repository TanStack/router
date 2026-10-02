import { afterEach, describe, expect, test, vi } from 'vitest'
import {
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
  createControlledPromise,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useParams,
  useRouterState,
  useSearch,
} from '../src'
import type { AnyRouter, RouterState } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

/**
 * Describe a published router state by value, so the trace still explains a
 * publication after later mutations of the same match objects.
 */
function describeState(state: RouterState) {
  const matches = state.matches
    .map(
      (match) =>
        `${match.routeId}:${match.status}${match.isFetching ? `+${match.isFetching}` : ''}`,
    )
    .join(' ')
  return `${state.status} ${state.location.pathname} → ${state.resolvedLocation?.pathname} [${matches}]`
}

function setup({
  beforeLoad,
  loader,
  head,
  headers,
  scripts,
  defaultPendingMs,
  defaultPendingMinMs,
  staleTime,
  rootBeforeLoad,
}: {
  beforeLoad?: () => any
  loader?: () => any
  head?: () => any
  headers?: () => any
  scripts?: () => any
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  staleTime?: number
  rootBeforeLoad?: () => any
}) {
  // One entry per store notification (plus one per render of the root).
  const trace: Array<string> = []
  const select = vi.fn((state: RouterState) => {
    trace.push(describeState(state))
  })
  const rootRenders = vi.fn()
  // A genuine whole-state consumer: renders when the router starts and stops
  // loading, and never for intermediate publications.
  const indicatorRenders = vi.fn()
  const Indicator = () => {
    indicatorRenders(useRouterState({ select: (state) => state.isLoading }))
    return null
  }
  // An object-valued selection with structural sharing keeps its reference
  // while the selected values are equal.
  const sharedSelections: Array<{ pathname: string }> = []
  const Shared = () => {
    sharedSelections.push(
      useRouterState({
        select: (state) => ({ pathname: state.location.pathname }),
        structuralSharing: true,
      }),
    )
    return null
  }

  const rootRoute = createRootRoute({
    beforeLoad: rootBeforeLoad,
    component: function RootComponent() {
      useRouterState({ select })
      // Persistent narrow consumers: unchanged selections must not re-render.
      useSearch({ strict: false })
      useParams({ strict: false })
      rootRenders()
      return (
        <>
          <Indicator />
          <Shared />
          <Link to="/">Back</Link>
          <Link to="/posts">Posts</Link>
          <Link to="/other">Other</Link>
          <Outlet />
        </>
      )
    },
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index</h1>,
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    beforeLoad,
    loader,
    head,
    headers,
    scripts,
    component: () => <h1>Posts Title</h1>,
  })

  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: () => <h1>Other Title</h1>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute, otherRoute]),
    defaultPendingMs,
    defaultPendingMinMs,
    defaultPendingComponent: () => <p>Loading...</p>,
    defaultNotFoundComponent: () => <h1>Not Found Title</h1>,
    defaultPreload: 'intent',
    defaultStaleTime: staleTime,
    defaultGcTime: staleTime,
  })

  render(<RouterProvider router={router} />)

  return {
    select,
    router,
    trace,
    rootRenders,
    indicatorRenders,
    sharedSelections,
  }
}

/** Wait until a navigation has been acknowledged and nothing else publishes. */
async function settled(router: AnyRouter, pathname: string) {
  await waitFor(() => {
    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe(pathname)
  })
}

async function back() {
  const link = await waitFor(() => screen.getByRole('link', { name: 'Back' }))
  fireEvent.click(link)
  const title = await waitFor(() =>
    screen.getByRole('heading', { name: /Index/ }),
  )
  expect(title).toBeInTheDocument()
}

async function run({ select }: ReturnType<typeof setup>) {
  // navigate to /posts
  const link = await waitFor(() => screen.getByRole('link', { name: 'Posts' }))
  const before = select.mock.calls.length
  fireEvent.click(link)
  const title = await waitFor(
    () => screen.getByRole('heading', { name: /Title$/ }), // matches /posts and /other and not found
  )
  expect(title).toBeInTheDocument()
  const after = select.mock.calls.length

  return after - before
}

function resolveAfter(ms: number, value: any) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(value), ms))
}

describe("Store doesn't update *too many* times during navigation", () => {
  test('async loader, async beforeLoad, pendingMs', async () => {
    const params = setup({
      beforeLoad: () => resolveAfter(100, { foo: 'bar' }),
      loader: () => resolveAfter(100, { hello: 'world' }),
      defaultPendingMs: 100,
      defaultPendingMinMs: 300,
    })

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    // 1. location + status, 2. pending placeholder after pendingMs,
    // 3. beforeLoad → loader fetching transition (one synchronous frame),
    // 4. loader settled, 5. matches committed, 6. resolvedLocation + status.
    expect(updates).toBe(6)
  })

  test('redirection in preload', async () => {
    const { select, router } = setup({
      loader: () => {
        throw redirect({ to: '/other' })
      },
    })

    const before = select.mock.calls.length
    await router.preloadRoute({ to: '/posts' })
    const after = select.mock.calls.length
    const updates = after - before

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(2)
  })

  test('sync beforeLoad', async () => {
    const params = setup({
      beforeLoad: () => ({ foo: 'bar' }),
      loader: () => resolveAfter(100, { hello: 'world' }),
      defaultPendingMs: 100,
      defaultPendingMinMs: 300,
    })

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(5)
  })

  test('nothing', async () => {
    const params = setup({})

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(3)
  })

  test('not found in beforeLoad', async () => {
    const params = setup({
      beforeLoad: () => {
        throw notFound()
      },
    })

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(3)
  })

  test('hover preload, then navigate, w/ async loaders', async () => {
    const { select } = setup({
      beforeLoad: () => Promise.resolve({ foo: 'bar' }),
      loader: () => resolveAfter(100, { hello: 'world' }),
    })

    const link = await waitFor(() =>
      screen.getByRole('link', { name: 'Posts' }),
    )
    const before = select.mock.calls.length
    fireEvent.focus(link)
    await new Promise((resolve) => setTimeout(resolve, 100))
    fireEvent.click(link)
    const title = await waitFor(() =>
      screen.getByRole('heading', { name: /Title$/ }),
    )
    expect(title).toBeInTheDocument()
    const after = select.mock.calls.length
    const updates = after - before

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(3)
  })

  test('navigate, w/ preloaded & async loaders', async () => {
    const params = setup({
      beforeLoad: () => Promise.resolve({ foo: 'bar' }),
      loader: () => resolveAfter(100, { hello: 'world' }),
      staleTime: 1000,
    })

    await params.router.preloadRoute({ to: '/posts' })
    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(3)
  })

  test('navigate, w/ preloaded & sync loaders', async () => {
    const params = setup({
      beforeLoad: () => ({ foo: 'bar' }),
      loader: () => ({ hello: 'world' }),
      staleTime: 1000,
    })

    await params.router.preloadRoute({ to: '/posts' })
    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(3)
  })

  test('navigate, w/ previous navigation & async loader', async () => {
    const params = setup({
      loader: () => resolveAfter(100, { hello: 'world' }),
      staleTime: 1000,
    })

    await run(params)
    await back()
    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(3)
  })

  test('preload a preloaded route w/ async loader', async () => {
    const params = setup({
      loader: () => resolveAfter(100, { hello: 'world' }),
    })

    await params.router.preloadRoute({ to: '/posts' })
    await new Promise((r) => setTimeout(r, 20))
    const before = params.select.mock.calls.length
    await params.router.preloadRoute({ to: '/posts' })
    const after = params.select.mock.calls.length
    const updates = after - before

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(0)
  })
})

describe('every publication during a navigation is explained', () => {
  const start = 'pending /posts → / [__root__:success /:success]'
  const committed = 'pending /posts → / [__root__:success /posts:success]'
  const resolved = 'idle /posts → /posts [__root__:success /posts:success]'
  const placeholder = (fetching: '' | '+beforeLoad' | '+loader') =>
    `pending /posts → / [__root__:success /posts:pending${fetching}]`

  async function navigate({
    router,
    trace,
    indicatorRenders,
    sharedSelections,
  }: ReturnType<typeof setup>) {
    await settled(router, '/')
    const from = trace.length
    indicatorRenders.mockClear()
    sharedSelections.length = 0
    fireEvent.click(screen.getByRole('link', { name: 'Posts' }))
    return () => trace.slice(from)
  }

  async function finish(params: ReturnType<typeof setup>) {
    await screen.findByRole('heading', { name: 'Posts Title' })
    await settled(params.router, '/posts')
    const published = params.trace.length
    // Nothing else may publish once the navigation is resolved.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(params.trace.length).toBe(published)
    expect(params.rootRenders).toHaveBeenCalledTimes(1)
    // Whole-state consumers only re-render when their selection changes:
    // the indicator once for pending and once for idle, the shared object
    // once for the new pathname.
    expect(params.indicatorRenders.mock.calls).toEqual([[true], [false]])
    expect(params.sharedSelections).toEqual([{ pathname: '/posts' }])
  }

  test('no fallback: hooks settle before pendingMs', async () => {
    const beforeLoad = createControlledPromise<void>()
    const loader = createControlledPromise<void>()
    const params = setup({
      beforeLoad: () => beforeLoad,
      loader: () => loader,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 0,
    })

    const published = await navigate(params)
    beforeLoad.resolve()
    loader.resolve()
    await finish(params)

    // Nothing is presented while the hooks run, so their fetching transitions
    // never publish: location, matches, resolution.
    expect(published()).toEqual([start, committed, resolved])
  })

  test('fallback during beforeLoad', async () => {
    const beforeLoad = createControlledPromise<void>()
    const loader = createControlledPromise<void>()
    const params = setup({
      beforeLoad: () => beforeLoad,
      loader: () => loader,
      defaultPendingMs: 20,
      defaultPendingMinMs: 0,
    })

    const published = await navigate(params)
    await screen.findByText('Loading...')
    expect(published()).toEqual([start, placeholder('+beforeLoad')])

    beforeLoad.resolve()
    // Ending beforeLoad and starting the loader is one synchronous frame.
    await waitFor(() =>
      expect(published()).toEqual([
        start,
        placeholder('+beforeLoad'),
        placeholder('+loader'),
      ]),
    )

    loader.resolve()
    await finish(params)
    expect(published()).toEqual([
      start,
      placeholder('+beforeLoad'),
      placeholder('+loader'),
      placeholder(''),
      committed,
      resolved,
    ])
  })

  test('fallback during the loader', async () => {
    const beforeLoad = createControlledPromise<void>()
    const loader = createControlledPromise<void>()
    const params = setup({
      beforeLoad: () => beforeLoad,
      loader: () => loader,
      defaultPendingMs: 20,
      defaultPendingMinMs: 0,
    })

    const published = await navigate(params)
    beforeLoad.resolve()
    await screen.findByText('Loading...')
    // The placeholder is revealed with the loader already running.
    expect(published()).toEqual([start, placeholder('+loader')])

    loader.resolve()
    await finish(params)
    expect(published()).toEqual([
      start,
      placeholder('+loader'),
      placeholder(''),
      committed,
      resolved,
    ])
  })

  test('ready before the pending minimum expires', async () => {
    const loader = createControlledPromise<void>()
    const params = setup({
      loader: () => loader,
      defaultPendingMs: 20,
      defaultPendingMinMs: 200,
    })

    const published = await navigate(params)
    await screen.findByText('Loading...')
    loader.resolve()
    // The loader has settled but the fallback must stay visible: that is a
    // real presentation delay, so fetching ends before the matches commit.
    await waitFor(() =>
      expect(published()).toEqual([
        start,
        placeholder('+loader'),
        placeholder(''),
      ]),
    )
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await finish(params)
    expect(published()).toEqual([
      start,
      placeholder('+loader'),
      placeholder(''),
      committed,
      resolved,
    ])
  })

  test('a replacement while the fallback is visible resets the placeholder with its first publication', async () => {
    const loader = createControlledPromise<void>()
    const params = setup({
      loader: () => loader,
      defaultPendingMs: 20,
      defaultPendingMinMs: 0,
    })
    const { router, trace } = params

    const published = await navigate(params)
    await screen.findByText('Loading...')
    expect(published()).toEqual([start, placeholder('+loader')])

    fireEvent.click(screen.getByRole('link', { name: 'Other' }))
    await screen.findByRole('heading', { name: 'Other Title' })
    await settled(router, '/other')
    const count = trace.length
    loader.resolve()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(trace.length).toBe(count)

    expect(published()).toEqual([
      start,
      placeholder('+loader'),
      // The visible placeholder stops fetching in the same update that
      // publishes the replacement location; the abandoned loader never
      // publishes again.
      'pending /other → / [__root__:success /posts:pending]',
      'pending /other → / [__root__:success /other:success]',
      'idle /other → /other [__root__:success /other:success]',
    ])
    expect(params.rootRenders).toHaveBeenCalledTimes(1)
  })

  test('a superseding navigation resets fetching state in its first publication', async () => {
    const rootGate = createControlledPromise<void>()
    let rootCalls = 0
    const params = setup({
      // The presented root re-runs beforeLoad for every navigation; only the
      // superseded navigation blocks on it.
      rootBeforeLoad: () => (++rootCalls === 2 ? rootGate : undefined),
      defaultPendingMs: 1000,
    })
    const { router, trace } = params

    await settled(router, '/')
    const from = trace.length
    fireEvent.click(screen.getByRole('link', { name: 'Posts' }))
    await waitFor(() =>
      expect(trace.slice(from)).toEqual([
        start,
        'pending /posts → / [__root__:success+beforeLoad /:success]',
      ]),
    )

    fireEvent.click(screen.getByRole('link', { name: 'Other' }))
    await screen.findByRole('heading', { name: 'Other Title' })
    await settled(router, '/other')
    const published = trace.length
    rootGate.resolve()
    // The superseded lane settles as canceled and must not publish anything.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(trace.length).toBe(published)

    expect(trace.slice(from)).toEqual([
      start,
      'pending /posts → / [__root__:success+beforeLoad /:success]',
      // Clearing the superseded lane's fetching state and publishing the new
      // location is one update.
      'pending /other → / [__root__:success /:success]',
      // The new lane runs the root beforeLoad again (synchronously this time).
      'pending /other → / [__root__:success+beforeLoad /:success]',
      'pending /other → / [__root__:success /:success]',
      'pending /other → / [__root__:success /other:success]',
      'idle /other → /other [__root__:success /other:success]',
    ])
    expect(params.rootRenders).toHaveBeenCalledTimes(1)
  })
})
