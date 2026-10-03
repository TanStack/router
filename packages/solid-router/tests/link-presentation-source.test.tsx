import * as Solid from 'solid-js'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'
import type { ControlledPromise } from '@tanstack/router-core'

declare module '@tanstack/history' {
  interface HistoryState {
    revision?: number
  }
}

const gates = new Set<ControlledPromise<void>>()
const operations = new Set<Promise<unknown>>()

function controlled() {
  const gate = createControlledPromise<void>()
  gates.add(gate)
  return gate
}

function track<T>(operation: Promise<T>) {
  operations.add(operation)
  return operation
}

afterEach(async () => {
  for (const gate of gates) {
    gate.resolve()
  }
  await Promise.allSettled(operations)
  gates.clear()
  operations.clear()
  cleanup()
  vi.restoreAllMocks()
})

function setupHeldSource() {
  const started = controlled()
  const pending = controlled()
  const visits: Array<{ id: string; page: number; preload: boolean }> = []
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => (
      <>
        <Link
          data-testid="root-link"
          to="/items/$id/detail"
          params={{ id: 'one' }}
          search={true}
        >
          Root
        </Link>
        <Outlet />
      </>
    ),
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    component: () => (
      <>
        <Link
          data-testid="item-link"
          from="/items/$id"
          to="./detail"
          params={true}
          search={true}
          preload="intent"
          preloadDelay={0}
        >
          Item detail
        </Link>
        <Outlet />
      </>
    ),
  })
  const detail = createRoute({
    getParentRoute: () => item,
    path: '/detail',
    beforeLoad: ({ params, search, preload }) => {
      visits.push({ id: params.id, page: search.page, preload })
    },
    component: () => <div>Detail</div>,
  })
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other/$id',
    pendingMs: 10_000,
    loader: () => {
      started.resolve()
      return pending
    },
    component: () => <div>Other</div>,
  })
  const bounce = createRoute({
    getParentRoute: () => root,
    path: '/bounce',
    beforeLoad: () => {
      throw redirect({
        to: '/items/$id',
        params: { id: 'one' },
        search: { page: 3 },
      })
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([item.addChildren([detail]), other, bounce]),
    history: createMemoryHistory({ initialEntries: ['/items/one?page=1'] }),
  })
  return { router, started, pending, visits }
}

describe('Link presented location source', () => {
  test('staying root links update while an outgoing route holds its source', async () => {
    const { router, started, pending } = setupHeldSource()
    render(() => <RouterProvider router={router} />)
    const item = await screen.findByTestId('item-link')
    const root = screen.getByTestId('root-link')
    const navigation = track(
      router.navigate({
        to: '/other/$id',
        params: { id: 'two' },
        search: { page: 2 },
      }),
    )
    await started
    await waitFor(() =>
      expect(root).toHaveAttribute('href', '/items/one/detail?page=2'),
    )
    expect(item).toHaveAttribute('href', '/items/one/detail?page=1')
    expect(screen.queryByText('Other')).not.toBeInTheDocument()
    pending.resolve()
    await navigation
    expect(screen.queryByTestId('item-link')).not.toBeInTheDocument()
  })

  test('preload and click inherit the source of the outgoing Link', async () => {
    const { router, started, pending, visits } = setupHeldSource()
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('item-link')
    const navigation = track(
      router.navigate({
        to: '/other/$id',
        params: { id: 'two' },
        search: { page: 2 },
      }),
    )
    await started
    fireEvent.focus(link)
    await waitFor(() =>
      expect(visits).toContainEqual({ id: 'one', page: 1, preload: true }),
    )
    fireEvent.click(link)
    expect(await screen.findByText('Detail')).toBeInTheDocument()
    expect(visits).toContainEqual({ id: 'one', page: 1, preload: false })
    expect(router.state.location.href).toBe('/items/one/detail?page=1')
    pending.resolve()
    await navigation
  })

  test.each(['supersede', 'redirect'] as const)(
    'a held source catches up after %s',
    async (outcome) => {
      const { router, started, pending } = setupHeldSource()
      render(() => <RouterProvider router={router} />)
      const link = await screen.findByTestId('item-link')
      const navigation = track(
        router.navigate({
          to: '/other/$id',
          params: { id: 'two' },
          search: { page: 2 },
        }),
      )
      await started
      const successor = track(
        outcome === 'redirect'
          ? router.navigate({ to: '/bounce' })
          : router.navigate({
              to: '/items/$id',
              params: { id: 'one' },
              search: { page: 3 },
            }),
      )
      pending.resolve()
      await Promise.all([navigation, successor])
      expect(await screen.findByTestId('item-link')).toHaveAttribute(
        'href',
        '/items/one/detail?page=3',
      )
      expect(link).toBe(screen.getByTestId('item-link'))
    },
  )

  test('same-href visits refresh inherited state and release updaters on unmount', async () => {
    const reads: Array<number> = []
    const root = createRootRoute({ component: () => <Outlet /> })
    const item = createRoute({
      getParentRoute: () => root,
      path: '/items',
      component: () => (
        <Link
          to="/target"
          state={(previous) => {
            const revision = Number(previous.revision)
            reads.push(revision)
            return { revision }
          }}
        >
          State link
        </Link>
      ),
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      component: () => <div>Target</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([item, target]),
      history: createMemoryHistory({ initialEntries: ['/items'] }),
    })
    await router.load()
    await router.navigate({ to: '/items', state: { revision: 1 } })
    const view = render(() => <RouterProvider router={router} />)
    await screen.findByText('State link')
    expect(reads).toEqual([1])
    const previousKey = router.state.location.state.__TSR_key
    await router.navigate({ to: '/items', state: { revision: 2 } })
    expect(router.state.location.href).toBe('/items')
    expect(router.state.location.state.__TSR_key).not.toBe(previousKey)
    expect(reads).toEqual([1, 2])
    fireEvent.click(screen.getByText('State link'))
    expect(await screen.findByText('Target')).toBeInTheDocument()
    expect(router.state.location.state.revision).toBe(2)
    const afterClick = reads.slice()
    view.unmount()
    await router.navigate({ to: '/items', state: { revision: 3 } })
    expect(reads).toEqual(afterClick)
  })

  test('a suspended departure followed by return preserves the live visit source', async () => {
    const started = controlled()
    const resource = controlled()
    let mounts = 0
    let cleanups = 0
    const visits: Array<{ page: number; preload: boolean }> = []
    const published: Array<string> = []
    const root = createRootRoute({
      validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
      component: () => <Outlet />,
    })
    const first = createRoute({
      getParentRoute: () => root,
      path: '/first',
      component: () => {
        const instance = ++mounts
        Solid.onCleanup(() => {
          cleanups++
        })
        return (
          <Link
            data-testid="visit-link"
            data-instance={instance}
            to="/target"
            search={true}
            preload="intent"
            preloadDelay={0}
          >
            First
          </Link>
        )
      },
    })
    const second = createRoute({
      getParentRoute: () => root,
      path: '/second',
      component: () => {
        const [data] = Solid.createResource(() => {
          started.resolve()
          return resource.then(() => 'Second')
        })
        return <div>{data()}</div>
      },
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      beforeLoad: ({ search, preload }) => {
        visits.push({ page: search.page, preload })
      },
      component: () => <div>Target</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([first, second, target]),
      history: createMemoryHistory({ initialEntries: ['/first?page=1'] }),
    })
    const unsubscribe = router.subscribe(
      'onBeforeRouteMount',
      ({ toLocation }) => {
        published.push(toLocation.pathname)
      },
    )
    render(() => <RouterProvider router={router} />)
    const original = await screen.findByTestId('visit-link')
    const departure = track(
      router.navigate({ to: '/second', search: { page: 2 } }),
    )
    await started
    // A newly created Suspense may publish its fallback immediately. Record
    // the actual lifetime instead of requiring the outgoing tree to survive.
    console.info('Solid suspended departure lifecycle', {
      mounts,
      cleanups,
      retainedElement: screen.queryByTestId('visit-link') === original,
    })
    expect(published).toContain('/second')
    const returned = track(
      router.navigate({ to: '/first', search: { page: 3 } }),
    )
    await waitFor(() =>
      expect(router.state.location.href).toBe('/first?page=3'),
    )
    resource.resolve()
    await Promise.all([departure, returned])
    const link = screen.getByTestId('visit-link')
    expect(link).toHaveAttribute('href', '/target?page=3')
    // Record reachability without imposing a new component-remount contract.
    console.info('Solid suspended source lifecycle', {
      mounts,
      cleanups,
      sameElement: link === original,
    })
    await router.navigate({ to: '/first', search: { page: 4 } })
    expect(screen.getByTestId('visit-link')).toHaveAttribute(
      'href',
      '/target?page=4',
    )
    fireEvent.focus(screen.getByTestId('visit-link'))
    await waitFor(() =>
      expect(visits).toContainEqual({ page: 4, preload: true }),
    )
    fireEvent.click(screen.getByTestId('visit-link'))
    expect(await screen.findByText('Target')).toBeInTheDocument()
    expect(visits).toContainEqual({ page: 4, preload: false })
    unsubscribe()
  })
})

test.each(['return', 'third'] as const)(
  'an existing app Suspense preserves live sources after a %s successor',
  async (outcome) => {
    const barrier = controlled()
    const [holding, setHolding] = Solid.createSignal(false)
    let mounts = 0
    let cleanups = 0
    const visits: Array<{ page: number; preload: boolean }> = []
    const published: Array<string> = []
    function AppResource() {
      const [data] = Solid.createResource(holding, () =>
        barrier.then(() => 'Ready'),
      )
      return <span>{data()}</span>
    }
    const root = createRootRoute({
      validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
      component: () => <Outlet />,
    })
    const first = createRoute({
      getParentRoute: () => root,
      path: '/first',
      component: () => {
        const instance = ++mounts
        Solid.onCleanup(() => {
          cleanups++
        })
        return (
          <Link
            data-testid="app-visit-link"
            data-instance={instance}
            to="/target"
            search={true}
            preload="intent"
            preloadDelay={0}
          >
            First
          </Link>
        )
      },
    })
    const second = createRoute({
      getParentRoute: () => root,
      path: '/second',
      component: () => (
        <div>
          Second
          <Link
            data-testid="app-other-link"
            to="/target"
            search={true}
            preload="intent"
            preloadDelay={0}
          >
            Second target
          </Link>
        </div>
      ),
    })
    const third = createRoute({
      getParentRoute: () => root,
      path: '/third',
      component: () => <div>Third</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      beforeLoad: ({ search, preload }) => {
        visits.push({ page: search.page, preload })
      },
      component: () => <div>Target</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([first, second, third, target]),
      history: createMemoryHistory({ initialEntries: ['/first?page=1'] }),
    })
    const unsubscribe = router.subscribe(
      'onBeforeRouteMount',
      ({ toLocation }) => {
        published.push(toLocation.pathname)
        if (toLocation.pathname === '/second') {
          setHolding(true)
        }
      },
    )
    render(() => (
      <Solid.Suspense fallback={<div>App waiting</div>}>
        <AppResource />
        <RouterProvider router={router} />
      </Solid.Suspense>
    ))
    const original = await screen.findByTestId('app-visit-link')
    const departure = track(
      router.navigate({ to: '/second', search: { page: 2 } }),
    )
    await waitFor(() => expect(published).toContain('/second'))
    console.info('Solid app Suspense departure lifecycle', {
      mounts,
      cleanups,
      retainedElement: screen.queryByTestId('app-visit-link') === original,
    })
    const destination = outcome === 'return' ? '/first' : '/third'
    const returned = track(
      router.navigate({ to: destination, search: { page: 3 } }),
    )
    await waitFor(() =>
      expect(router.latestLocation.href).toBe(`${destination}?page=3`),
    )
    barrier.resolve()
    // Navigation promises and Vitest's unhandled-error gate both cover the
    // publication boundary, including errors from the history listener.
    await expect(Promise.all([departure, returned])).resolves.toEqual([
      undefined,
      undefined,
    ])
    if (outcome === 'return') {
      const link = await screen.findByTestId('app-visit-link')
      expect(link).toHaveAttribute('href', '/target?page=3')
      console.info('Solid app Suspense return lifecycle', {
        mounts,
        cleanups,
        sameElement: link === original,
      })
    } else {
      expect(await screen.findByText('Third')).toBeInTheDocument()
    }
    await router.navigate({
      to: outcome === 'return' ? '/first' : '/second',
      search: { page: 4 },
    })
    const link = screen.getByTestId(
      outcome === 'return' ? 'app-visit-link' : 'app-other-link',
    )
    expect(link).toHaveAttribute('href', '/target?page=4')
    fireEvent.focus(link)
    await waitFor(() =>
      expect(visits).toContainEqual({ page: 4, preload: true }),
    )
    fireEvent.click(link)
    expect(await screen.findByText('Target')).toBeInTheDocument()
    expect(visits).toContainEqual({ page: 4, preload: false })
    unsubscribe()
  },
)
