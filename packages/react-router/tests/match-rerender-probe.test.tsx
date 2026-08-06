import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import * as React from 'react'
import type * as ReactNS from 'react'

// ---------------------------------------------------------------------------
// Render counter: patch React.memo so every `React.memo(function XImpl(){})`
// component in the router source is wrapped with a counter keyed on the inner
// function name. This is applied identically to the baseline and the patched
// build, so the counts are directly comparable.
// ---------------------------------------------------------------------------
const renderCounts: Record<string, number> = {}

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactNS>()
  const origMemo = actual.memo
  const memo = ((fn: any, cmp: any) => {
    if (typeof fn !== 'function' || !fn.name) return origMemo(fn, cmp)
    const name = fn.name
    const wrapper = (props: any, ref: any) => {
      renderCounts[name] = (renderCounts[name] ?? 0) + 1
      return fn(props, ref)
    }
    Object.defineProperty(wrapper, 'name', { value: name })
    return origMemo(wrapper as any, cmp)
  }) as typeof actual.memo
  return { ...actual, memo, default: { ...(actual as any), memo } }
})

const {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} = await import('../src')

function resetCounts() {
  for (const k of Object.keys(renderCounts)) delete renderCounts[k]
}

// naive structural equality used only for reporting (does NOT ignore undefined)
function sameDeep(a: any, b: any, seen = new Set<any>()): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (seen.has(a)) return true
  seen.add(a)
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => sameDeep(a[k], b[k], seen))
}

function createTestRouter() {
  const rootRoute = createRootRoute({
    component: function RootComp() {
      // A root that genuinely re-renders on every navigation.
      const href = useRouterState({ select: (s) => s.location.href })
      return (
        <div>
          <span data-testid="href">{href}</span>
          <Outlet />
        </div>
      )
    },
  })

  const sectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'section',
    validateSearch: (search: Record<string, unknown>) => ({
      tab: (search.tab as string) ?? 'all',
    }),
    loader: () => ({ section: true }),
    component: () => <Outlet />,
  })

  const listRoute = createRoute({
    getParentRoute: () => sectionRoute,
    path: 'list',
    loader: () => ({ list: [1, 2, 3] }),
    component: () => (
      <div>
        {/* inline literals on purpose: fresh object identity every render */}
        <Link to="/section/list/a" search={{ tab: 'all' }}>
          go a
        </Link>
        <Link to="/section/list/b" search={{ tab: 'all' }}>
          go b
        </Link>
        <Outlet />
      </div>
    ),
  })

  const leafA = createRoute({
    getParentRoute: () => listRoute,
    path: 'a',
    component: () => <div data-testid="leaf">leaf-a</div>,
  })
  const leafB = createRoute({
    getParentRoute: () => listRoute,
    path: 'b',
    component: () => <div data-testid="leaf">leaf-b</div>,
  })

  const routeTree = rootRoute.addChildren([
    sectionRoute.addChildren([listRoute.addChildren([leafA, leafB])]),
  ])

  return createRouter({
    routeTree,
    basepath: '/app',
    history: createMemoryHistory({
      initialEntries: ['/app/section/list/a?tab=all'],
    }),
  })
}

type Probe = {
  publishes: Array<{
    routeId: string
    deepEqual: boolean
    changedKeys: Array<string>
  }>
}

function instrument(router: any): Probe {
  const probe: Probe = { publishes: [] }
  for (const [routeId, store] of router.stores.byRoute as Map<string, any>) {
    let prev = store.get()
    store.subscribe(() => {
      const next = store.get()
      if (!prev || !next) {
        prev = next
        return
      }
      const changedKeys = [
        ...new Set([...Object.keys(prev), ...Object.keys(next)]),
      ]
        .filter((k) => !Object.is(prev[k], next[k]))
        .map((k) =>
          sameDeep(prev[k], next[k]) ? `${k}(identity-only)` : `${k}(value)`,
        )
      probe.publishes.push({
        routeId,
        deepEqual: sameDeep(prev, next),
        changedKeys,
      })
      prev = next
    })
  }
  return probe
}

describe('Match re-render churn probe', () => {
  afterEach(() => {
    cleanup()
    resetCounts()
  })

  test('sibling navigation /section/list/a -> /section/list/b', async () => {
    const router = createTestRouter()
    await act(() => router.load())
    render(<RouterProvider router={router} />)
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(screen.getByTestId('leaf')).toHaveTextContent('leaf-a')

    const stayingIds = [
      ...(router.stores.byRoute as Map<string, any>).keys(),
    ].filter((id) => id !== '/section/list/a')
    const probe = instrument(router)
    resetCounts()

    await act(async () => {
      await router.navigate({ to: '/section/list/b', search: { tab: 'all' } })
    })
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(screen.getByTestId('leaf')).toHaveTextContent('leaf-b')

    const report = {
      MatchImpl: renderCounts.MatchImpl ?? 0,
      MatchInnerImpl: renderCounts.MatchInnerImpl ?? 0,
      OutletImpl: renderCounts.OutletImpl ?? 0,
      LinkImpl: renderCounts.LinkComponentImpl ?? renderCounts.LinkImpl ?? 0,
      stayingMatchPublishes: probe.publishes.filter((p) =>
        stayingIds.includes(p.routeId),
      ).length,
      stayingMatchPublishesDeepEqual: probe.publishes.filter(
        (p) => stayingIds.includes(p.routeId) && p.deepEqual,
      ).length,
      publishDetail: probe.publishes.map((p) => ({
        routeId: p.routeId,
        changedKeys: p.changedKeys,
      })),
      allRenderCounts: { ...renderCounts },
    }

    console.log('PROBE_SIBLING_NAV ' + JSON.stringify(report, null, 2))

    expect(report).toBeTruthy()
  })

  test('search-only navigation ?tab=all -> ?tab=mine', async () => {
    const router = createTestRouter()
    await act(() => router.load())
    render(<RouterProvider router={router} />)
    await act(() => new Promise((r) => setTimeout(r, 0)))

    const probe = instrument(router)
    resetCounts()

    await act(async () => {
      await router.navigate({ to: '/section/list/a', search: { tab: 'mine' } })
    })
    await act(() => new Promise((r) => setTimeout(r, 0)))

    const report = {
      MatchImpl: renderCounts.MatchImpl ?? 0,
      MatchInnerImpl: renderCounts.MatchInnerImpl ?? 0,
      OutletImpl: renderCounts.OutletImpl ?? 0,
      publishes: probe.publishes.length,
      publishDetail: probe.publishes.map((p) => ({
        routeId: p.routeId,
        changedKeys: p.changedKeys,
      })),
    }

    console.log('PROBE_SEARCH_NAV ' + JSON.stringify(report, null, 2))

    expect(report).toBeTruthy()
  })

  test('same-route re-navigation (no-op href change)', async () => {
    const router = createTestRouter()
    await act(() => router.load())
    render(<RouterProvider router={router} />)
    await act(() => new Promise((r) => setTimeout(r, 0)))

    const probe = instrument(router)
    resetCounts()

    await act(async () => {
      await router.navigate({ to: '/section/list/b', search: { tab: 'all' } })
    })
    await act(async () => {
      await router.navigate({ to: '/section/list/a', search: { tab: 'all' } })
    })
    await act(() => new Promise((r) => setTimeout(r, 0)))

    const report = {
      MatchImpl: renderCounts.MatchImpl ?? 0,
      MatchInnerImpl: renderCounts.MatchInnerImpl ?? 0,
      OutletImpl: renderCounts.OutletImpl ?? 0,
      publishes: probe.publishes.length,
      publishDetail: probe.publishes.map((p) => ({
        routeId: p.routeId,
        changedKeys: p.changedKeys,
      })),
    }

    console.log('PROBE_TWO_NAVS ' + JSON.stringify(report, null, 2))

    expect(report).toBeTruthy()
  })
})

describe('error boundary reset semantics', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    resetCounts()
    vi.restoreAllMocks()
  })

  test('a layout that throws during render resets its boundary on the next navigation', async () => {
    // The layout route stays mounted across the sibling navigation, so the
    // ONLY thing that can clear its CatchBoundary is a resetKey change.
    let shouldThrow = true

    const rootRoute = createRootRoute({ component: () => <Outlet /> })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'layout',
      errorComponent: () => <div data-testid="boundary">boundary</div>,
      component: function LayoutComp() {
        if (shouldThrow) throw new Error('boom')
        return (
          <div>
            <span data-testid="layout">layout-ok</span>
            <Outlet />
          </div>
        )
      },
    })
    const a = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'a',
      component: () => <div data-testid="leaf">a</div>,
    })
    const b = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'b',
      component: () => <div data-testid="leaf">b</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([a, b])]),
      history: createMemoryHistory({ initialEntries: ['/layout/a'] }),
    })

    await act(() => router.load())
    render(<RouterProvider router={router} />)
    await act(() => new Promise((r) => setTimeout(r, 0)))

    expect(screen.getByTestId('boundary')).toBeInTheDocument()

    shouldThrow = false
    await act(async () => {
      await router.navigate({ to: '/layout/b' })
    })
    await act(() => new Promise((r) => setTimeout(r, 0)))

    expect(screen.queryByTestId('boundary')).not.toBeInTheDocument()
    expect(screen.getByTestId('layout')).toHaveTextContent('layout-ok')
    expect(screen.getByTestId('leaf')).toHaveTextContent('b')
  })

  test('error thrown by a staying layout after the last commit still resets on the next navigation', async () => {
    // Timing edge: the component renders fine on the first commit, then a
    // later state change makes it throw *after* the match store last changed.
    // The next navigation must still reset the boundary.
    let shouldThrow = false
    let forceRerender: (() => void) | undefined

    const rootRoute = createRootRoute({ component: () => <Outlet /> })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'layout',
      errorComponent: () => <div data-testid="boundary">boundary</div>,
      component: function LayoutComp() {
        const [, setTick] = React.useState(0)
        forceRerender = () => setTick((t) => t + 1)
        if (shouldThrow) throw new Error('late boom')
        return (
          <div>
            <span data-testid="layout">layout-ok</span>
            <Outlet />
          </div>
        )
      },
    })
    const a = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'a',
      component: () => <div data-testid="leaf">a</div>,
    })
    const b = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'b',
      component: () => <div data-testid="leaf">b</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([a, b])]),
      history: createMemoryHistory({ initialEntries: ['/layout/a'] }),
    })

    await act(() => router.load())
    render(<RouterProvider router={router} />)
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(screen.getByTestId('layout')).toBeInTheDocument()

    // trip the error well after the last match-store change
    shouldThrow = true
    act(() => {
      forceRerender!()
    })
    expect(screen.getByTestId('boundary')).toBeInTheDocument()

    shouldThrow = false
    await act(async () => {
      await router.navigate({ to: '/layout/b' })
    })
    await act(() => new Promise((r) => setTimeout(r, 0)))

    expect(screen.queryByTestId('boundary')).not.toBeInTheDocument()
    expect(screen.getByTestId('leaf')).toHaveTextContent('b')
  })
})
