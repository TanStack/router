import { afterEach, describe, expect, test, vi } from 'vitest'
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Link,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  isMatch,
  useMatchRoute,
  useMatches,
} from '../src'
import { Match, MatchInner } from '../src/Match'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return <Link to="/invoices/">To Invoices</Link>
  },
})

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices',
  loader: () => [{ id: '1' }, { id: '2' }],
  component: () => <Outlet />,
})

const InvoicesIndex = () => {
  const matches = useMatches<DefaultRouter>()

  const loaderDataMatches = matches.filter((match) =>
    isMatch(match, 'loaderData.0.id'),
  )

  const contextMatches = matches.filter((match) =>
    isMatch(match, 'context.permissions'),
  )

  const incorrectMatches = matches.filter((match) =>
    isMatch(match, 'loaderData.6.id'),
  )

  return (
    <div>
      <section>
        Loader Matches -{' '}
        {loaderDataMatches.map((match) => match.fullPath).join(',')}
      </section>
      <section>
        Context Matches -{' '}
        {contextMatches.map((match) => match.fullPath).join(',')}
      </section>
      <section>
        Incorrect Matches -{' '}
        {incorrectMatches.map((match) => match.fullPath).join(',')}
      </section>
    </div>
  )
}

const invoicesIndexRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '/',
  component: InvoicesIndex,
  context: () => ({
    permissions: 'permission',
  }),
})

const invoiceRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '$invoiceId',
  validateSearch: () => ({ page: 0 }),
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
})

const commentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'comments/$id',
  validateSearch: () => ({
    page: 0,
    search: '',
  }),
  loader: () =>
    [{ comment: 'one comment' }, { comment: 'two comment' }] as const,
})

const routeTree = rootRoute.addChildren([
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  indexRoute,
  layoutRoute.addChildren([commentsRoute]),
])

const defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof defaultRouter

test('when filtering useMatches by loaderData', async () => {
  render(<RouterProvider router={defaultRouter} />)

  const searchLink = await screen.findByRole('link', { name: 'To Invoices' })

  fireEvent.click(searchLink)

  expect(
    await screen.findByText('Loader Matches - /invoices'),
  ).toBeInTheDocument()

  expect(
    await screen.findByText('Context Matches - /invoices/'),
  ).toBeInTheDocument()

  expect(await screen.findByText('Incorrect Matches -')).toBeInTheDocument()
})

test('should show pendingComponent of root route', async () => {
  const root = createRootRoute({
    pendingComponent: () => <div data-testId="root-pending" />,
    loader: async () => {
      await new Promise((r) => setTimeout(r, 50))
    },
    component: () => <div data-testId="root-content" />,
  })

  const router = createRouter({
    routeTree: root,
    defaultPendingMs: 0,
    defaultPendingComponent: () => <div>default pending...</div>,
  })

  const rendered = render(<RouterProvider router={router} />)

  expect(await rendered.findByTestId('root-pending')).toBeInTheDocument()
  expect(await rendered.findByTestId('root-content')).toBeInTheDocument()
})

test('pending fallback remains visible through pendingMinMs', async () => {
  vi.useFakeTimers()

  try {
    let navigation!: Promise<void>
    const root = createRootRoute({
      component: () => <Outlet />,
    })
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <div>Index</div>,
    })
    const slow = createRoute({
      getParentRoute: () => root,
      path: '/slow',
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => <div>Slow pending</div>,
      loader: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
      },
      component: () => <div>Slow content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([index, slow]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingMs: 0,
    })

    await router.load()
    render(<RouterProvider router={router} />)
    expect(screen.getByText('Index')).toBeInTheDocument()

    await act(async () => {
      navigation = router.navigate({ to: '/slow' })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Slow pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99)
    })
    expect(screen.getByText('Slow pending')).toBeInTheDocument()
    expect(screen.queryByText('Slow content')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await navigation
    })
    expect(screen.getByText('Slow content')).toBeInTheDocument()
  } finally {
    cleanup()
    vi.useRealTimers()
  }
})

test('pending fallback remains visible while beforeLoad outlives pending timers', async () => {
  vi.useFakeTimers()

  try {
    let navigation!: Promise<void>
    const beforeLoadGate = createControlledPromise<void>()
    const root = createRootRoute({
      component: () => <Outlet />,
    })
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <div>Index</div>,
    })
    const slow = createRoute({
      getParentRoute: () => root,
      path: '/slow',
      pendingMs: 10,
      pendingMinMs: 50,
      pendingComponent: () => <div>Slow pending</div>,
      beforeLoad: () => beforeLoadGate,
      component: () => <div>Slow content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([index, slow]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingMs: 0,
    })

    await router.load()
    render(<RouterProvider router={router} />)
    expect(screen.getByText('Index')).toBeInTheDocument()

    await act(async () => {
      navigation = router.navigate({ to: '/slow' })
      await vi.advanceTimersByTimeAsync(9)
    })
    expect(screen.queryByText('Slow pending')).not.toBeInTheDocument()
    expect(screen.queryByText('Slow content')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText('Slow pending')).toBeInTheDocument()
    expect(screen.queryByText('Slow content')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(screen.getByText('Slow pending')).toBeInTheDocument()
    expect(screen.queryByText('Slow content')).not.toBeInTheDocument()

    await act(async () => {
      beforeLoadGate.resolve()
      await navigation
    })
    expect(screen.queryByText('Slow pending')).not.toBeInTheDocument()
    expect(screen.getByText('Slow content')).toBeInTheDocument()
  } finally {
    cleanup()
    vi.useRealTimers()
  }
})

test('hidden child pending fallback does not delay parent pending completion', async () => {
  vi.useFakeTimers()

  try {
    let resolveParent!: () => void
    let resolveChild!: () => void
    let navigation!: Promise<void>
    const ChildPending = vi.fn(() => <div>Child pending</div>)

    const root = createRootRoute({
      component: () => <Outlet />,
    })
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <div>Index</div>,
    })
    const parent = createRoute({
      getParentRoute: () => root,
      path: '/parent',
      pendingMs: 0,
      pendingMinMs: 50,
      pendingComponent: () => <div>Parent pending</div>,
      loader: () =>
        new Promise<void>((resolve) => {
          resolveParent = resolve
        }),
      component: () => <Outlet />,
    })
    const child = createRoute({
      getParentRoute: () => parent,
      path: '/child',
      pendingMs: 0,
      pendingMinMs: 5000,
      pendingComponent: ChildPending,
      loader: () =>
        new Promise<void>((resolve) => {
          resolveChild = resolve
        }),
      component: () => <div>Child content</div>,
    })

    const router = createRouter({
      routeTree: root.addChildren([index, parent.addChildren([child])]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingMs: 0,
    })

    render(<RouterProvider router={router} />)

    await act(async () => {
      navigation = router.navigate({ to: '/parent/child' })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Parent pending')).toBeInTheDocument()
    expect(screen.queryByText('Child pending')).not.toBeInTheDocument()
    expect(ChildPending).not.toHaveBeenCalled()

    resolveParent()
    resolveChild()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(49)
    })
    expect(screen.queryByText('Child content')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await navigation
    })

    expect(screen.getByText('Child content')).toBeInTheDocument()
    expect(ChildPending).not.toHaveBeenCalled()
  } finally {
    cleanup()
    vi.useRealTimers()
  }
})

test('pending match without fallback does not arm pendingMinMs', async () => {
  vi.useFakeTimers()

  try {
    const loaderGate = createControlledPromise<void>()
    const root = createRootRoute({
      component: () => <Outlet />,
    })
    const slow = createRoute({
      getParentRoute: () => root,
      path: '/slow',
      wrapInSuspense: true,
      pendingMinMs: 100,
      loader: async () => {
        await loaderGate
      },
      component: () => <div>Slow content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([slow]),
      history: createMemoryHistory({ initialEntries: ['/slow'] }),
      defaultPendingMs: 0,
    })
    router.stores.setMatches(router.matchRoutes(router.latestLocation))

    render(<RouterProvider router={router} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const slowMatch = router.state.matches.find(
      (match) => match.routeId === slow.id,
    )!
    const loadPromise = slowMatch._.loadPromise

    expect(slowMatch.status).toBe('pending')
    expect(loadPromise?.pendingUntil).toBeUndefined()

    loaderGate.resolve()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
      await router.latestLoadPromise
    })

    expect(screen.getByText('Slow content')).toBeInTheDocument()
  } finally {
    cleanup()
    vi.useRealTimers()
  }
})

test('stale pending render ignores a resolved local promise and waits for latestLoadPromise', async () => {
  const latestLoadPromise = createControlledPromise<void>()
  const root = createRootRoute()
  const slow = createRoute({
    getParentRoute: () => root,
    path: '/slow',
    loader: () => latestLoadPromise,
    component: () => <div>Slow content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([slow]),
    history: createMemoryHistory({ initialEntries: ['/slow'] }),
  })
  const matches = router.matchRoutes(router.latestLocation)
  router.stores.setMatches(matches)
  const slowMatch = matches.find((match) => match.routeId === slow.id)!
  const localPromise = slowMatch._.loadPromise!
  localPromise.resolve()
  router.latestLoadPromise = latestLoadPromise

  render(
    <RouterContextProvider router={router}>
      <React.Suspense fallback={<div>Fallback</div>}>
        <MatchInner matchId={slowMatch.id} />
      </React.Suspense>
    </RouterContextProvider>,
  )

  expect(screen.getByText('Fallback')).toBeInTheDocument()
  expect(screen.queryByText('Slow content')).not.toBeInTheDocument()

  await act(async () => {
    router.updateMatch(slowMatch.id, (prev) => ({
      ...prev,
      status: 'success',
      _: {
        ...prev._,
        loadPromise: undefined,
      },
    }))
    router.latestLoadPromise = undefined
    latestLoadPromise.resolve()
    await latestLoadPromise
  })

  expect(screen.getByText('Slow content')).toBeInTheDocument()
})

test('Match view does not re-render for non-view match updates', () => {
  const shellRender = vi.fn()
  const root = createRootRoute({
    shellComponent: function ShellComponent({
      children,
    }: {
      children: React.ReactNode
    }) {
      shellRender()
      return <>{children}</>
    },
    component: () => <div>Root content</div>,
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const matches = router.matchRoutes(router.latestLocation)
  router.stores.setMatches(matches)
  const rootMatch = matches[0]!

  const rendered = render(
    <RouterContextProvider router={router}>
      <Match matchId={rootMatch.id} />
    </RouterContextProvider>,
  )

  expect(rendered.container).toHaveTextContent('Root content')
  expect(shellRender).toHaveBeenCalledTimes(1)

  act(() => {
    router.updateMatch(rootMatch.id, (prev) => ({
      ...prev,
      loaderData: { updated: true },
    }))
  })

  expect(shellRender).toHaveBeenCalledTimes(1)
})

test('MatchInner does not re-render route component for non-rendering match updates', () => {
  const routeRender = vi.fn()
  const root = createRootRoute({
    component: function RootComponent() {
      routeRender()
      return <div>Root content</div>
    },
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const matches = router.matchRoutes(router.latestLocation)
  router.stores.setMatches(matches)
  const rootMatch = matches[0]!

  const rendered = render(
    <RouterContextProvider router={router}>
      <MatchInner matchId={rootMatch.id} />
    </RouterContextProvider>,
  )

  expect(rendered.container).toHaveTextContent('Root content')
  expect(routeRender).toHaveBeenCalledTimes(1)

  act(() => {
    router.updateMatch(rootMatch.id, (prev) => ({
      ...prev,
      loaderData: { updated: true },
    }))
  })

  expect(routeRender).toHaveBeenCalledTimes(1)
  rendered.unmount()
})

test('Match view re-renders when same-id ssr field changes', () => {
  const shellRender = vi.fn()
  const root = createRootRoute({
    shellComponent: function ShellComponent({
      children,
    }: {
      children: React.ReactNode
    }) {
      shellRender()
      return <>{children}</>
    },
    component: () => <div>Root content</div>,
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const matches = router.matchRoutes(router.latestLocation)
  matches[0]!.ssr = true
  router.stores.setMatches(matches)
  const rootMatch = matches[0]!

  const rendered = render(
    <RouterContextProvider router={router}>
      <Match matchId={rootMatch.id} />
    </RouterContextProvider>,
  )

  expect(rendered.container).toHaveTextContent('Root content')
  expect(shellRender).toHaveBeenCalledTimes(1)
  ;([false, 'data-only', true] as const).forEach((ssr, index) => {
    act(() => {
      router.updateMatch(rootMatch.id, (prev) => ({
        ...prev,
        ssr,
      }))
    })

    expect(shellRender).toHaveBeenCalledTimes(index + 2)
  })
  rendered.unmount()
})

test('Outlet follows a legacy notFoundRoute when its same-id match moves to a shallower index', async () => {
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: () => (
      <div>
        Parent layout
        <Outlet />
      </div>
    ),
  })
  const known = createRoute({
    getParentRoute: () => parent,
    path: '/known',
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div>Home</div>,
  })
  const legacyNotFound = createRoute({
    getParentRoute: () => root,
    path: '/404',
    loader: () => 'not found',
    component: () => <div>Legacy not found</div>,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([known]), home]),
    history: createMemoryHistory({ initialEntries: ['/parent/missing'] }),
    notFoundRoute: legacyNotFound,
  })

  await router.load()
  const rootMatchId = router.stores.matches.get()[0]!.id
  const rendered = render(
    <RouterContextProvider router={router}>
      <Match matchId={rootMatchId} />
    </RouterContextProvider>,
  )

  expect(rendered.container).toHaveTextContent('Parent layout')
  expect(rendered.container).toHaveTextContent('Legacy not found')

  await act(async () => {
    await router.navigate({ to: '/home' })
  })
  expect(
    router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === legacyNotFound.id)?.index,
  ).toBe(2)

  await act(async () => {
    await router.navigate({ to: '/missing' } as any)
  })

  expect(rendered.container).not.toHaveTextContent('Parent layout')
  expect(rendered.container).toHaveTextContent('Legacy not found')
  expect(
    router.stores.matches
      .get()
      .find((match) => match.routeId === legacyNotFound.id)?.index,
  ).toBe(1)
  rendered.unmount()
})

test('fast load before pendingMs does not arm pendingUntil', async () => {
  vi.useFakeTimers()

  try {
    let navigation!: Promise<void>
    const root = createRootRoute({
      component: () => <Outlet />,
    })
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <div>Index</div>,
    })
    const fast = createRoute({
      getParentRoute: () => root,
      path: '/fast',
      pendingMs: 100,
      pendingMinMs: 10_000,
      pendingComponent: () => <div>Fast pending</div>,
      loader: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
      },
      component: () => <div>Fast content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([index, fast]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingMs: 0,
    })

    await router.load()
    render(<RouterProvider router={router} />)
    expect(screen.getByText('Index')).toBeInTheDocument()

    await act(async () => {
      navigation = router.navigate({ to: '/fast' })
      await vi.advanceTimersByTimeAsync(10)
      await navigation
    })

    expect(screen.queryByText('Fast pending')).not.toBeInTheDocument()
    expect(screen.getByText('Fast content')).toBeInTheDocument()
    const fastMatch = router.state.matches.find(
      (match) => match.routeId === fast.id,
    )!
    expect(fastMatch._.loadPromise?.pendingUntil).toBeUndefined()
  } finally {
    cleanup()
    vi.useRealTimers()
  }
})

describe('matching on different param types', () => {
  const testCases = [
    {
      name: 'param with braces',
      path: '/$id',
      nav: '/1',
      params: { id: '1' },
      matchParams: { id: '1' },
    },
    {
      name: 'param without braces',
      path: '/{$id}',
      nav: '/2',
      params: { id: '2' },
      matchParams: { id: '2' },
    },
    {
      name: 'param with prefix',
      path: '/prefix-{$id}',
      nav: '/prefix-3',
      params: { id: '3' },
      matchParams: { id: '3' },
    },
    {
      name: 'param with suffix',
      path: '/{$id}-suffix',
      nav: '/4-suffix',
      params: { id: '4' },
      matchParams: { id: '4' },
    },
    {
      name: 'param with prefix and suffix',
      path: '/prefix-{$id}-suffix',
      nav: '/prefix-5-suffix',
      params: { id: '5' },
      matchParams: { id: '5' },
    },
    {
      name: 'wildcard with no braces',
      path: '/abc/$',
      nav: '/abc/6',
      params: { '*': '6', _splat: '6' },
      matchParams: { '*': '6', _splat: '6' },
    },
    {
      name: 'wildcard with braces',
      path: '/abc/{$}',
      nav: '/abc/7',
      params: { '*': '7', _splat: '7' },
      matchParams: { '*': '7', _splat: '7' },
    },
    {
      name: 'wildcard with prefix',
      path: '/abc/prefix{$}',
      nav: '/abc/prefix/8',
      params: { '*': '/8', _splat: '/8' },
      matchParams: { '*': '/8', _splat: '/8' },
    },
    {
      name: 'wildcard with suffix',
      path: '/abc/{$}suffix',
      nav: '/abc/9/suffix',
      params: { _splat: '9/', '*': '9/' },
      matchParams: { _splat: '9/', '*': '9/' },
    },
    {
      name: 'optional param with no prefix/suffix and value',
      path: '/abc/{-$id}/def',
      nav: '/abc/10/def',
      params: { id: '10' },
      matchParams: { id: '10' },
    },
    {
      name: 'optional param with no prefix/suffix and requiredParam and no value',
      path: '/abc/{-$id}/$foo/def',
      nav: '/abc/bar/def',
      params: { foo: 'bar' },
      matchParams: { foo: 'bar' },
    },
    {
      name: 'optional param with no prefix/suffix and requiredParam and value',
      path: '/abc/{-$id}/$foo/def',
      nav: '/abc/10/bar/def',
      params: { id: '10', foo: 'bar' },
      matchParams: { id: '10', foo: 'bar' },
    },
    {
      name: 'optional param with no prefix/suffix and no value',
      path: '/abc/{-$id}/def',
      nav: '/abc/def',
      params: {},
      matchParams: {},
    },
    {
      name: 'multiple optional params with no prefix/suffix and no value',
      path: '/{-$a}/{-$b}/{-$c}',
      nav: '/',
      params: {},
      matchParams: {},
    },
    {
      name: 'multiple optional params with no prefix/suffix and values',
      path: '/{-$a}/{-$b}/{-$c}',
      nav: '/foo/bar/qux',
      params: { a: 'foo', b: 'bar', c: 'qux' },
      matchParams: { a: 'foo', b: 'bar', c: 'qux' },
    },
    {
      name: 'multiple optional params with no prefix/suffix and mixed values',
      path: '/{-$a}/{-$b}/{-$c}',
      nav: '/foo/qux',
      params: { a: 'foo', b: 'qux' },
      matchParams: { a: 'foo', b: 'qux' },
    },
    {
      name: 'optional param with prefix and value',
      path: '/optional-{-$id}',
      nav: '/optional-12',
      params: { id: '12' },
      matchParams: { id: '12' },
    },
    {
      name: 'optional param with prefix and no value',
      path: '/optional-{-$id}',
      nav: '/optional-',
      params: {},
      matchParams: {},
    },
    {
      name: 'optional param with suffix and value',
      path: '/{-$id}-optional',
      nav: '/13-optional',
      params: { id: '13' },
      matchParams: { id: '13' },
    },
    {
      name: 'optional param with suffix and no value',
      path: '/{-$id}-optional',
      nav: '/-optional',
      params: {},
      matchParams: {},
    },
    {
      name: 'optional param with required param, prefix, suffix, wildcard and no value',
      path: `/$foo/a{-$id}-optional/$`,
      nav: '/bar/a-optional/qux',
      params: { foo: 'bar', _splat: 'qux', '*': 'qux' },
      matchParams: { foo: 'bar', _splat: 'qux', '*': 'qux' },
    },
    {
      name: 'optional param with required param, prefix, suffix, wildcard and value',
      path: `/$foo/a{-$id}-optional/$`,
      nav: '/bar/a14-optional/qux',
      params: { foo: 'bar', id: '14', _splat: 'qux', '*': 'qux' },
      matchParams: { foo: 'bar', id: '14', _splat: 'qux', '*': 'qux' },
    },
  ]

  afterEach(() => cleanup())
  test.each(testCases)(
    '$name',
    async ({ name, path, params, matchParams, nav }) => {
      const rootRoute = createRootRoute()

      const Route = createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: RouteComponent,
      })

      function RouteComponent() {
        const routeParams = Route.useParams()
        const matchRoute = useMatchRoute()
        const matchRouteMatch = matchRoute({
          to: path,
        })

        return (
          <div>
            <h1 data-testid="heading">{name}</h1>
            <div>
              Params{' '}
              <span data-testid="params">{JSON.stringify(routeParams)}</span>
              Matches{' '}
              <span data-testid="matches">
                {JSON.stringify(matchRouteMatch)}
              </span>
            </div>
          </div>
        )
      }

      const router = createRouter({
        routeTree: rootRoute.addChildren([Route]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await act(() => render(<RouterProvider router={router} />))

      act(() => router.history.push(nav))

      const paramsToCheck = await screen.findByTestId('params')
      const matchesToCheck = await screen.findByTestId('matches')

      expect(JSON.parse(paramsToCheck.textContent)).toEqual(params)
      expect(JSON.parse(matchesToCheck.textContent)).toEqual(matchParams)
    },
  )
})
