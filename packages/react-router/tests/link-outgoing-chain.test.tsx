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
} from '../src'

afterEach(cleanup)

test('departure retains the active presentation of an earlier pending navigation within the same owner', async () => {
  const tableGate = createControlledPromise<void>()
  const detailGate = createControlledPromise<void>()
  const root = createRootRoute({
    validateSearch: (search) => search as { page?: number },
    component: Outlet,
  })
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    beforeLoad: ({ search }) => {
      if (search.page === 2) {
        return tableGate
      }
      return undefined
    },
    component: () => (
      <>
        <Link to="/table" search={{ page: 1 }}>
          first page
        </Link>
        <Link to="/table" search={{ page: 2 }}>
          second page
        </Link>
        <Link to="." search={true}>
          current location
        </Link>
      </>
    ),
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    loader: () => detailGate,
    component: () => <div>Detail page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({ initialEntries: ['/table?page=1'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('first page')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(screen.getByText('first page')).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('second page')).not.toHaveAttribute('aria-current')

  let retainedNavigation: Promise<void> | undefined
  let departure: Promise<void> | undefined
  try {
    await act(async () => {
      retainedNavigation = router.navigate({
        to: '/table',
        search: { page: 2 },
      })
    })
    expect(router.state.status).toBe('pending')
    expect(screen.getByText('first page')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('second page')).toHaveAttribute(
      'aria-current',
      'page',
    )

    await act(async () => {
      departure = router.navigate({ to: '/detail' })
    })
    expect(router.state.location.pathname).toBe('/detail')
    expect(router.state.status).toBe('pending')
    expect(screen.getByText('first page')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('second page')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByText('current location')).toHaveAttribute(
      'href',
      '/detail',
    )
  } finally {
    await act(async () => {
      tableGate.resolve()
      detailGate.resolve()
      await Promise.all([retainedNavigation, departure])
    })
  }
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})

test('a superseded pending fallback retains its own active presentation', async () => {
  const detailGate = createControlledPromise<void>()
  const otherGate = createControlledPromise<void>()
  const root = createRootRoute({ component: Outlet })
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    component: () => <div>Table page</div>,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    loader: () => detailGate,
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => (
      <>
        <Link to="/detail">pending detail</Link>
        <Link to="/table">previous table</Link>
        <Link to=".">pending current location</Link>
      </>
    ),
    component: () => <div>Detail page</div>,
  })
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    loader: () => otherGate,
    component: () => <div>Other page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail, other]),
    history: createMemoryHistory({ initialEntries: ['/table'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('Table page')
  await waitFor(() => expect(router.state.status).toBe('idle'))

  let pendingNavigation: Promise<void> | undefined
  let departure: Promise<void> | undefined
  try {
    await act(async () => {
      pendingNavigation = router.navigate({ to: '/detail' })
    })
    await screen.findByText('pending detail')
    expect(router.state.status).toBe('pending')
    expect(screen.getByText('pending detail')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByText('previous table')).not.toHaveAttribute(
      'aria-current',
    )

    await act(async () => {
      departure = router.navigate({ to: '/other' })
    })
    expect(router.state.location.pathname).toBe('/other')
    expect(router.state.status).toBe('pending')
    expect(screen.getByText('pending detail')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByText('previous table')).not.toHaveAttribute(
      'aria-current',
    )
    expect(screen.getByText('pending current location')).toHaveAttribute(
      'href',
      '/other',
    )
  } finally {
    await act(async () => {
      detailGate.resolve()
      otherGate.resolve()
      await Promise.all([pendingNavigation, departure])
    })
  }
  expect(screen.getByText('Other page')).toBeInTheDocument()
})

test('a first Link mounted during departure uses the current visit after an earlier visit with Links', async () => {
  const gate = createControlledPromise<void>()
  const root = createRootRoute({
    validateSearch: (search) => search as { page?: number },
    component: Outlet,
  })
  function Table() {
    const { page } = table.useSearch()
    const [showLinks, setShowLinks] = React.useState(page === 1)
    return (
      <>
        <div>Table page {page}</div>
        <button onClick={() => setShowLinks(true)}>Show links</button>
        {showLinks && (
          <>
            <Link to="/table" search={{ page: 1 }}>
              first page
            </Link>
            <Link to="/table" search={{ page: 2 }}>
              second page
            </Link>
            <Link to="." search={true}>
              current location
            </Link>
          </>
        )}
      </>
    )
  }
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table',
    component: Table,
  })
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    component: () => <div>Other page</div>,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail',
    loader: () => gate,
    component: () => <div>Detail page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, other, detail]),
    history: createMemoryHistory({ initialEntries: ['/table?page=1'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('first page')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(screen.getByText('first page')).toHaveAttribute('aria-current', 'page')

  await act(() => router.navigate({ to: '/other' }))
  expect(screen.getByText('Other page')).toBeInTheDocument()
  await act(() => router.navigate({ to: '/table', search: { page: 2 } }))
  expect(screen.getByText('Table page 2')).toBeInTheDocument()
  expect(router.state.status).toBe('idle')
  expect(screen.queryByText('second page')).not.toBeInTheDocument()

  let departure: Promise<void> | undefined
  try {
    await act(async () => {
      departure = router.navigate({ to: '/detail' })
    })
    expect(router.state.status).toBe('pending')
    expect(router.state.location.pathname).toBe('/detail')
    fireEvent.click(screen.getByText('Show links'))
    expect(screen.getByText('first page')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('second page')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByText('current location')).toHaveAttribute(
      'href',
      '/detail',
    )
  } finally {
    await act(async () => {
      gate.resolve()
      await departure
    })
  }
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})
