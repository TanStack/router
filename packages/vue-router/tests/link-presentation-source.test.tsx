import * as Vue from 'vue'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import { createControlledPromise } from '@tanstack/router-core'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function linkFixture(outcome: 'stay' | 'redirect' = 'stay') {
  const gate = createControlledPromise<void>()
  const preloads: Array<{ id: string; visit: number }> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: () => (
      <>
        <Link
          to="/b/$id"
          params={{ id: 'fixed' }}
          search={true}
          hash={true}
          data-testid="staying"
        >
          staying
        </Link>
        <Outlet />
      </>
    ),
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a/$id',
    component: () => (
      <Link
        to="/inspect/$id"
        params={true}
        search={true}
        hash={true}
        preload="intent"
        preloadDelay={0}
        data-testid="departing"
      >
        departing
      </Link>
    ),
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b/$id',
    loader: async () => {
      await gate
      if (outcome === 'redirect') {
        throw redirect({
          to: '/a/$id',
          params: { id: 'returned' },
          search: { visit: 4 },
          hash: 'returned',
        })
      }
    },
    component: () => <div>b content</div>,
  })
  const inspect = createRoute({
    getParentRoute: () => root,
    path: '/inspect/$id',
    loaderDeps: ({ search }) => ({ visit: search.visit }),
    loader: ({ params, deps, preload }) => {
      if (preload) {
        preloads.push({ id: params.id, visit: deps.visit })
      }
    },
    component: () => <div>inspected content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b, inspect]),
    history: createMemoryHistory({
      initialEntries: ['/a/source?visit=1#first'],
    }),
    defaultPendingMs: 10_000,
  })
  return { router, gate, preloads }
}

test('staying Links update urgently while departing href, preload and click retain their rendered source', async () => {
  const { router, gate, preloads } = linkFixture()
  render(<RouterProvider router={router} />)
  const departing = await screen.findByTestId('departing')
  const staying = screen.getByTestId('staying')
  expect(departing).toHaveAttribute('href', '/inspect/source?visit=1#first')
  let pending!: Promise<void>
  try {
    pending = router.navigate({
      to: '/b/$id',
      params: { id: 'next' },
      search: { visit: 2 },
      hash: 'next',
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/b/next')
      expect(staying).toHaveAttribute('href', '/b/fixed?visit=2#next')
    })
    expect(screen.getByTestId('departing')).toBe(departing)
    expect(departing).toHaveAttribute('href', '/inspect/source?visit=1#first')
    await fireEvent.focus(departing)
    await waitFor(() => {
      expect(preloads).toEqual([{ id: 'source', visit: 1 }])
    })
    await fireEvent.click(departing)
    await screen.findByText('inspected content')
    expect(router.state.location.href).toBe('/inspect/source?visit=1#first')
  } finally {
    gate.resolve()
    await pending
  }
  expect(screen.queryByText('b content')).toBeNull()
})

test.each(['cancel', 'redirect'] as const)(
  'a %s returns retained Links to the successor source without an obsolete destination commit',
  async (outcome) => {
    const { router, gate } = linkFixture(
      outcome === 'redirect' ? 'redirect' : 'stay',
    )
    render(<RouterProvider router={router} />)
    const departing = await screen.findByTestId('departing')
    let pending!: Promise<void>
    try {
      pending = router.navigate({
        to: '/b/$id',
        params: { id: 'next' },
        search: { visit: 2 },
        hash: 'next',
      })
      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/b/next'),
      )
      expect(screen.getByTestId('departing')).toBe(departing)
      expect(departing).toHaveAttribute('href', '/inspect/source?visit=1#first')
      if (outcome === 'cancel') {
        await router.navigate({
          to: '/a/$id',
          params: { id: 'returned' },
          search: { visit: 4 },
          hash: 'returned',
        })
      }
      gate.resolve()
      await pending
      await waitFor(() => {
        expect(screen.getByTestId('departing')).toBe(departing)
        expect(departing).toHaveAttribute(
          'href',
          '/inspect/returned?visit=4#returned',
        )
      })
      expect(router.state.location.href).toBe('/a/returned?visit=4#returned')
      expect(screen.queryByText('b content')).toBeNull()
    } finally {
      gate.resolve()
      await pending
    }
  },
)

test('a visible pending fallback keeps its visit source until an A to B to A successor renders', async () => {
  const pendingB = createControlledPromise<void>()
  const returningA = createControlledPromise<void>()
  const setups: Array<string> = []
  const unmounts: Array<string> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const A = Vue.defineComponent({
    setup() {
      setups.push('a')
      Vue.onUnmounted(() => unmounts.push('a'))
      return () => (
        <Link to="/a/$id" params={true} search={true} data-testid="a-link">
          a
        </Link>
      )
    },
  })
  const BPending = Vue.defineComponent({
    setup() {
      setups.push('b-pending')
      Vue.onUnmounted(() => unmounts.push('b-pending'))
      return () => (
        <Link
          to="/b/$id"
          params={true}
          search={true}
          data-testid="pending-link"
        >
          pending b
        </Link>
      )
    },
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a/$id',
    loader: ({ params }) => (params.id === 'return' ? returningA : undefined),
    component: A,
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b/$id',
    pendingMs: 0,
    pendingMinMs: 0,
    loader: () => pendingB,
    pendingComponent: BPending,
    component: () => <div>completed b</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a/source?visit=1'] }),
    defaultPendingMs: 10_000,
  })
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('a-link')).toHaveAttribute(
    'href',
    '/a/source?visit=1',
  )
  let obsolete!: Promise<void>
  let successor!: Promise<void>
  try {
    obsolete = router.navigate({
      to: '/b/$id',
      params: { id: 'next' },
      search: { visit: 2 },
    })
    const fallback = await screen.findByTestId('pending-link')
    expect(fallback).toHaveAttribute('href', '/b/next?visit=2')
    expect(fallback).toHaveAttribute('aria-current', 'page')
    expect(setups).toEqual(['a', 'b-pending'])
    expect(unmounts).toEqual(['a'])
    successor = router.navigate({
      to: '/a/$id',
      params: { id: 'return' },
      search: { visit: 3 },
    })
    await waitFor(() =>
      expect(router.state.location.href).toBe('/a/return?visit=3'),
    )
    expect(screen.getByTestId('pending-link')).toBe(fallback)
    expect(fallback).toHaveAttribute('href', '/b/next?visit=2')
    expect(fallback).toHaveAttribute('aria-current', 'page')
    returningA.resolve()
    await successor
    expect(await screen.findByTestId('a-link')).toHaveAttribute(
      'href',
      '/a/return?visit=3',
    )
    expect(setups).toEqual(['a', 'b-pending', 'a'])
    expect(unmounts).toEqual(['a', 'b-pending'])
    pendingB.resolve()
    await obsolete
    expect(screen.queryByText('completed b')).toBeNull()
  } finally {
    returningA.resolve()
    pendingB.resolve()
    await successor
    await obsolete
  }
})

test('same-href state changes refresh a Link updater despite an unchanged URL', async () => {
  const root = createRootRoute({ validateSearch: (search) => search })
  const item = createRoute({ getParentRoute: () => root, path: '/items/$id' })
  const router = createRouter({
    routeTree: root.addChildren([item]),
    history: createMemoryHistory({ initialEntries: ['/items/one'] }),
  })
  await router.load()
  await router.navigate({
    to: '/items/$id',
    params: { id: 'one' },
    state: { revision: 1 } as any,
  })
  const search = () => ({
    seen: (
      router.state.location.state as typeof router.state.location.state & {
        revision: number
      }
    ).revision,
  })
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/$id" params={{ id: 'one' }} search={search}>
        same href
      </Link>
    </RouterContextProvider>,
  )
  const link = view.getByText('same href')
  expect(link).toHaveAttribute('href', '/items/one?seen=1')
  const before = router.state.location
  await router.navigate({
    to: '/items/$id',
    params: { id: 'one' },
    state: { revision: 2 } as any,
  })
  expect(router.state.location.href).toBe(before.href)
  expect(router.state.location.state.__TSR_key).not.toBe(before.state.__TSR_key)
  await waitFor(() => expect(link).toHaveAttribute('href', '/items/one?seen=2'))
})

test('application Suspense retires an obsolete async setup visit before the A successor handles intent and click', async () => {
  const asyncB = createControlledPromise<void>()
  const lifetime: Array<string> = []
  const preloads: Array<string> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
    component: Outlet,
  })
  const A = Vue.defineComponent({
    setup() {
      lifetime.push('setup:a')
      Vue.onUnmounted(() => lifetime.push('unmount:a'))
      return () => (
        <Link
          to="/inspect/$id"
          params={true}
          search={true}
          preload="intent"
          preloadDelay={0}
          data-testid="async-a-link"
        >
          inspect a
        </Link>
      )
    },
  })
  const B = Vue.defineComponent({
    async setup() {
      lifetime.push('setup:b')
      Vue.onUnmounted(() => lifetime.push('unmount:b'))
      await asyncB
      return () => <div>obsolete async b</div>
    },
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a/$id',
    component: A,
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b/$id',
    component: B,
  })
  const inspect = createRoute({
    getParentRoute: () => root,
    path: '/inspect/$id',
    loaderDeps: ({ search }) => ({ visit: search.visit }),
    loader: ({ params, deps, preload }) => {
      if (preload) {
        preloads.push(`${params.id}:${deps.visit}`)
      }
    },
    component: () => <div>async successor inspected</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b, inspect]),
    history: createMemoryHistory({ initialEntries: ['/a/first?visit=1'] }),
  })
  render(
    Vue.defineComponent({
      setup: () => () =>
        Vue.h(Vue.Suspense, null, {
          default: () => Vue.h(RouterProvider, { router }),
          fallback: () => Vue.h('div', 'application pending'),
        }),
    }),
  )
  const original = await screen.findByTestId('async-a-link')
  expect(original).toHaveAttribute('href', '/inspect/first?visit=1')
  try {
    await router.navigate({
      to: '/b/$id',
      params: { id: 'obsolete' },
      search: { visit: 2 },
    })
    await waitFor(() => expect(lifetime).toContain('setup:b'))
    await router.navigate({
      to: '/a/$id',
      params: { id: 'returned' },
      search: { visit: 3 },
    })
    const successor = await screen.findByTestId('async-a-link')
    await waitFor(() =>
      expect(successor).toHaveAttribute('href', '/inspect/returned?visit=3'),
    )
    // Observe Vue's real visit lifetime; do not require Suspense to retain A.
    expect(lifetime[0]).toBe('setup:a')
    expect(lifetime.filter((event) => event === 'unmount:a').length).toBe(
      lifetime.filter((event) => event === 'setup:a').length - 1,
    )
    if (successor !== original) {
      expect(original.isConnected).toBe(false)
    }
    asyncB.resolve()
    await Vue.nextTick()
    expect(screen.queryByText('obsolete async b')).toBeNull()
    console.info('Vue application Suspense visit lifetime', lifetime)
    await fireEvent.focus(successor)
    await waitFor(() => expect(preloads).toEqual(['returned:3']))
    await fireEvent.click(successor)
    await screen.findByText('async successor inspected')
    expect(router.state.location.href).toBe('/inspect/returned?visit=3')
    expect(screen.queryByText('obsolete async b')).toBeNull()
  } finally {
    asyncB.resolve()
  }
})

test.each(['error', 'not-found'] as const)(
  '%s boundary Links retain their inherited source during a delayed successor',
  async (kind) => {
    const gate = createControlledPromise<void>()
    const preloads: Array<string> = []
    const root = createRootRoute({
      validateSearch: (search) => ({ visit: Number(search.visit) || 0 }),
      component: Outlet,
    })
    const Boundary = () => (
      <Link
        to="/inspect/$id"
        params={true}
        search={true}
        hash={true}
        preload="intent"
        preloadDelay={0}
        data-testid="boundary-link"
      >
        inspect boundary
      </Link>
    )
    const failed = createRoute({
      getParentRoute: () => root,
      path: '/failed/$id',
      loader: () => {
        if (kind === 'not-found') {
          throw notFound()
        }
        throw new Error('expected boundary failure')
      },
      errorComponent: Boundary,
      notFoundComponent: Boundary,
    })
    const delayed = createRoute({
      getParentRoute: () => root,
      path: '/delayed/$id',
      loader: () => gate,
      component: () => <div>obsolete delayed boundary successor</div>,
    })
    const inspect = createRoute({
      getParentRoute: () => root,
      path: '/inspect/$id',
      loaderDeps: ({ search }) => ({ visit: search.visit }),
      loader: ({ params, deps, preload }) => {
        if (preload) {
          preloads.push(`${params.id}:${deps.visit}`)
        }
      },
      component: () => <div>boundary inspected</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([failed, delayed, inspect]),
      history: createMemoryHistory({
        initialEntries: ['/failed/first?visit=1#initial'],
      }),
      defaultPendingMs: 10_000,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByTestId('boundary-link')
    expect(link).toHaveAttribute('href', '/inspect/first?visit=1#initial')
    let pending!: Promise<void>
    try {
      pending = router.navigate({
        to: '/delayed/$id',
        params: { id: 'next' },
        search: { visit: 2 },
        hash: 'next',
      })
      await waitFor(() =>
        expect(router.state.location.href).toBe('/delayed/next?visit=2#next'),
      )
      expect(screen.getByTestId('boundary-link')).toBe(link)
      expect(link).toHaveAttribute('href', '/inspect/first?visit=1#initial')
      await fireEvent.focus(link)
      await waitFor(() => expect(preloads).toEqual(['first:1']))
      await fireEvent.click(link)
      await screen.findByText('boundary inspected')
      expect(router.state.location.href).toBe('/inspect/first?visit=1#initial')
      gate.resolve()
      await pending
      expect(
        screen.queryByText('obsolete delayed boundary successor'),
      ).toBeNull()
    } finally {
      gate.resolve()
      await pending
    }
  },
)
