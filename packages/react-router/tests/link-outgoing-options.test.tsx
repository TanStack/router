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

async function setup(component: React.FunctionComponent) {
  const gate = createControlledPromise<void>()
  const root = createRootRoute({
    component: Outlet,
    validateSearch: (search) => search as { filter?: string },
  })
  const table = createRoute({
    getParentRoute: () => root,
    path: '/table/$id',
    component,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/detail/$id',
    loader: () => gate,
    component: () => <div>Detail page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([table, detail]),
    history: createMemoryHistory({
      initialEntries: ['/table/1?filter=old#old'],
    }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  return { router, gate, link }
}

test('outgoing relative Links keep both href and hash-sensitive active presentation live', async () => {
  function Table() {
    const [hash, setHash] = React.useState<true | string>(true)
    const [includeHash, setIncludeHash] = React.useState(true)
    return (
      <>
        <Link
          to="."
          params={true}
          search={true}
          hash={hash}
          activeOptions={{ exact: true, includeHash }}
        >
          relative
        </Link>
        <button onClick={() => setHash('new')}>change hash</button>
        <button onClick={() => setHash('old')}>old hash</button>
        <button onClick={() => setIncludeHash(false)}>ignore hash</button>
      </>
    )
  }
  const { router, gate, link } = await setup(Table)
  expect(link).toHaveAttribute('href', '/table/1?filter=old#old')
  expect(link).toHaveAttribute('aria-current', 'page')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/detail/$id',
      params: { id: '2' },
      search: { filter: 'new' },
      hash: 'new',
    })
  })
  expect(router.state.status).toBe('pending')
  expect(link).toHaveAttribute('href', '/detail/2?filter=new#new')
  expect(link).toHaveAttribute('aria-current', 'page')

  // Relative destinations stay on the live path, including their active state.
  fireEvent.click(screen.getByRole('button', { name: 'change hash' }))
  expect(link).toHaveAttribute('href', '/detail/2?filter=new#new')
  expect(link).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'old hash' }))
  expect(link).toHaveAttribute('href', '/detail/2?filter=new#old')
  expect(link).not.toHaveAttribute('aria-current')
  fireEvent.click(screen.getByRole('button', { name: 'ignore hash' }))
  expect(link).toHaveAttribute('aria-current', 'page')

  await act(async () => {
    gate.resolve()
    await navigation
  })
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})

test('outgoing search presentation distinguishes absent keys and explicit undefined and responds to exact matching changes', async () => {
  function Table() {
    const [search, setSearch] = React.useState<{ filter?: undefined }>({})
    const [explicitUndefined, setExplicitUndefined] = React.useState(true)
    const [exact, setExact] = React.useState(false)
    return (
      <>
        <Link
          to="/table/$id"
          params={{ id: '1' }}
          search={search}
          activeOptions={{ exact, explicitUndefined }}
        >
          table
        </Link>
        <button onClick={() => setSearch({ filter: undefined })}>
          require absent filter
        </button>
        <button onClick={() => setExplicitUndefined(false)}>
          ignore undefined
        </button>
        <button onClick={() => setExact(true)}>match exactly</button>
      </>
    )
  }
  const { router, gate, link } = await setup(Table)
  expect(link).toHaveAttribute('aria-current', 'page')
  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({
      to: '/detail/$id',
      params: { id: '2' },
    })
  })
  expect(router.state.status).toBe('pending')
  expect(link).toHaveAttribute('aria-current', 'page')

  fireEvent.click(screen.getByRole('button', { name: 'require absent filter' }))
  expect(link).toHaveAttribute('href', '/table/1')
  expect(link).not.toHaveAttribute('aria-current')
  fireEvent.click(screen.getByRole('button', { name: 'ignore undefined' }))
  expect(link).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'match exactly' }))
  expect(link).not.toHaveAttribute('aria-current')

  await act(async () => {
    gate.resolve()
    await navigation
  })
  expect(screen.getByText('Detail page')).toBeInTheDocument()
})
