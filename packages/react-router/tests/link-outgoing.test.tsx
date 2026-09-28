import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
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

afterEach(cleanup)

async function setup(
  outcome: 'success' | 'redirect' | 'error' = 'success',
  slowReturn = false,
) {
  const returnGate = createControlledPromise<void>()
  const gate = createControlledPromise<void>()
  const speculative = createControlledPromise<void>()
  let attempted = false
  function Suspend({ enabled }: { enabled: boolean }) {
    if (enabled) {
      attempted = true
      throw speculative
    }
    return null
  }
  function Table() {
    const [changed, setChanged] = React.useState(false)
    const [destination, setDestination] = React.useState('/table')
    return (
      <>
        <Link
          to="/table"
          activeOptions={{ includeSearch: false }}
          data-testid="outgoing"
        >
          {({ isActive }) => `outgoing:${isActive}`}
        </Link>
        <Link to="/detail" data-testid="outgoing-destination">
          detail
        </Link>
        <Link to="." search={true} data-testid="relative">
          relative
        </Link>
        <Link
          to="/table"
          search={{ returned: true }}
          data-testid="return-search"
        >
          return search
        </Link>
        <Link to={destination} data-testid="new-destination">
          new destination
        </Link>
        <button onClick={() => setDestination('/detail')}>
          change destination
        </button>
        <React.Suspense fallback="speculative fallback">
          <Link to={changed ? '/detail' : '/table'} data-testid="changing">
            changing
          </Link>
          <Suspend enabled={changed} />
        </React.Suspense>
        <button onClick={() => React.startTransition(() => setChanged(true))}>
          speculate
        </button>
      </>
    )
  }
  const root = createRootRoute({
    validateSearch: (search) => search as { returned?: boolean; page?: number },
    component: () => (
      <>
        <Link to="/detail" data-testid="persistent">
          persistent
        </Link>
        <Outlet />
      </>
    ),
  })
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    beforeLoad: ({ search }) => {
      if (slowReturn && search.returned) {
        return returnGate
      }
      return undefined
    },
    component: Table,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    loader: async () => {
      await gate
      if (outcome === 'redirect') {
        throw redirect({ to: '/table', search: { returned: true } })
      }
      if (outcome === 'error') {
        throw new Error('detail failed')
      }
    },
    component: () => <div>Detail page</div>,
    errorComponent: () => <div>Detail failed</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({ initialEntries: ['/table'] }),
    defaultPendingMs: 60_000,
    InnerWrap: ({ children }) => (
      <>
        <Link to="/detail" data-testid="unknown">
          unknown
        </Link>
        {children}
      </>
    ),
  })
  render(<RouterProvider router={router} />)
  await screen.findByTestId('outgoing')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  return { router, gate, returnGate, attempted: () => attempted }
}

function expectPendingPresentation() {
  expect(screen.getByTestId('outgoing')).toHaveAttribute('aria-current', 'page')
  expect(screen.getByTestId('outgoing')).toHaveTextContent('outgoing:true')
  expect(screen.getByTestId('outgoing-destination')).not.toHaveAttribute(
    'aria-current',
  )
  expect(screen.getByTestId('persistent')).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByTestId('unknown')).toHaveAttribute('aria-current', 'page')
}

test('outgoing active presentation is retained while hrefs and persistent links follow a slow navigation', async () => {
  const { router, gate } = await setup()
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/detail', search: { page: 2 } })
  })
  expect(router.state.location.pathname).toBe('/detail')
  expectPendingPresentation()
  expect(screen.getByTestId('relative')).toHaveAttribute(
    'href',
    '/detail?page=2',
  )
  await act(async () => {
    gate.resolve()
    await navigation
  })
  expect(screen.getByText('Detail page')).toBeInTheDocument()
  expect(screen.queryByTestId('outgoing')).not.toBeInTheDocument()
})

test('replacement navigation makes the outgoing owner urgent again before either loader settles', async () => {
  const { router, gate, returnGate } = await setup('success', true)
  let obsolete!: Promise<void>
  await act(async () => {
    obsolete = router.navigate({ to: '/detail' })
  })
  expectPendingPresentation()
  expect(screen.getByTestId('return-search')).not.toHaveAttribute(
    'aria-current',
  )
  let replacement!: Promise<void>
  await act(async () => {
    replacement = router.navigate({ to: '/table', search: { returned: true } })
  })
  expect(router.state.status).toBe('pending')
  expect(screen.getByTestId('return-search')).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByTestId('outgoing')).toHaveAttribute('aria-current', 'page')
  expect(screen.getByTestId('outgoing-destination')).not.toHaveAttribute(
    'aria-current',
  )
  expect(screen.getByTestId('persistent')).not.toHaveAttribute('aria-current')
  await act(async () => {
    returnGate.resolve()
    await replacement
    gate.resolve()
    await obsolete
  })
  expect(router.state.location.pathname).toBe('/table')
})

test.each(['redirect', 'error'] as const)(
  'outgoing presentation catches up after %s',
  async (outcome) => {
    const { router, gate } = await setup(outcome)
    let navigation!: Promise<void>
    await act(async () => {
      navigation = router.navigate({ to: '/detail' })
    })
    expectPendingPresentation()
    await act(async () => {
      gate.resolve()
      await navigation
    })
    if (outcome === 'redirect') {
      expect(screen.getByTestId('outgoing')).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.getByTestId('persistent')).not.toHaveAttribute(
        'aria-current',
      )
      expect(router.state.location.search).toEqual({ returned: true })
    } else {
      expect(screen.getByText('Detail failed')).toBeInTheDocument()
    }
    expect(router.state.status).toBe('idle')
  },
)

test('blocked navigation does not change active presentation', async () => {
  const { router } = await setup()
  const unblock = router.history.block({ blockerFn: () => true })
  await act(async () => {
    void router.navigate({ to: '/detail' })
  })
  expect(router.state.location.pathname).toBe('/table')
  expect(screen.getByTestId('outgoing')).toHaveAttribute('aria-current', 'page')
  expect(screen.getByTestId('persistent')).not.toHaveAttribute('aria-current')
  unblock()
})

test('an abandoned suspended Link render cannot change the outgoing presentation snapshot', async () => {
  const { router, gate, attempted } = await setup()
  fireEvent.click(screen.getByText('speculate'))
  await waitFor(() => expect(attempted()).toBe(true))
  expect(screen.getByTestId('changing')).toHaveAttribute('aria-current', 'page')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/detail' })
  })
  expectPendingPresentation()
  expect(screen.getByTestId('changing')).toHaveAttribute('aria-current', 'page')
  await act(async () => {
    gate.resolve()
    await navigation
  })
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})

test('retained route IDs remain urgent across parameter changes with remountDeps', async () => {
  const gate = createControlledPromise<void>()
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/page/$id',
    remountDeps: ({ params }) => params.id,
    loader: ({ params }) => (params.id === '2' ? gate : undefined),
    component: () => (
      <Link to="/page/$id" params={{ id: '2' }}>
        second
      </Link>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/page/1'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByText('second')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).not.toHaveAttribute('aria-current')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/page/$id', params: { id: '2' } })
  })
  expect(link).toHaveAttribute('aria-current', 'page')
  await act(async () => {
    gate.resolve()
    await navigation
  })
  expect(screen.getByText('second')).toHaveAttribute('aria-current', 'page')
})

test('incoming Links use live presentation before settlement, including a revisited owner', async () => {
  const observations: Array<{ active: string | null; status: string }> = []
  const root = createRootRoute({ component: Outlet })
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    component: () => <Link to="/detail">detail</Link>,
  })
  function Detail() {
    const ref = React.useRef<HTMLAnchorElement>(null)
    React.useLayoutEffect(() => {
      observations.push({
        active: ref.current!.getAttribute('aria-current'),
        status: router.state.status,
      })
    }, [])
    return (
      <Link to="/detail" ref={ref}>
        current detail
      </Link>
    )
  }
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    component: Detail,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({ initialEntries: ['/table'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('detail')
  for (let visit = 0; visit < 2; visit++) {
    await act(() => router.navigate({ to: '/detail' }))
    expect(screen.getByText('current detail')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await act(() => router.navigate({ to: '/table' }))
  }
  expect(observations).toEqual([
    { active: 'page', status: 'pending' },
    { active: 'page', status: 'pending' },
  ])
})

test('changing Link props while its owner is outgoing recomputes frozen active presentation', async () => {
  const { router, gate } = await setup()
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/detail' })
  })
  expect(screen.getByTestId('new-destination')).toHaveAttribute(
    'aria-current',
    'page',
  )
  fireEvent.click(screen.getByText('change destination'))
  expect(screen.getByTestId('new-destination')).toHaveAttribute(
    'href',
    '/detail',
  )
  expect(screen.getByTestId('new-destination')).not.toHaveAttribute(
    'aria-current',
  )
  await act(async () => {
    gate.resolve()
    await navigation
  })
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})
