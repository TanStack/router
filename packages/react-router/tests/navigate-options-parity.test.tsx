import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  Navigate,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('Navigate leaves the request location unchanged during server rendering', () => {
  const root = createRootRoute()
  const next = createRoute({ getParentRoute: () => root, path: '/next' })
  const router = createRouter({
    routeTree: root.addChildren([next]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
  const navigate = vi.spyOn(router, 'navigate')
  const html = renderToString(
    <RouterContextProvider router={router}>
      <Navigate to="/next" />
      <span>Request content</span>
    </RouterContextProvider>,
  )
  expect(html).toContain('Request content')
  expect(navigate).not.toHaveBeenCalled()
  expect(router.state.location.href).toBe('/')
})

test('Navigate responds to option changes while mounted', async () => {
  function TestRoot() {
    const [id, setId] = React.useState('one')
    const [q, setQ] = React.useState('first')
    const [replace, setReplace] = React.useState(true)
    return (
      <>
        <button
          onClick={() => {
            setReplace(false)
            setId('two')
          }}
        >
          Change params
        </button>
        <button
          onClick={() => {
            setReplace(true)
            setQ('second')
          }}
        >
          Change search
        </button>
        <Navigate
          to="/items/$id"
          params={{ id: id }}
          search={{ q: q }}
          replace={replace}
        />
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({ component: TestRoot })
  const item = createRoute({ getParentRoute: () => root, path: '/items/$id' })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({ routeTree: root.addChildren([item]), history })
  render(<RouterProvider router={router} />)
  await waitFor(() =>
    expect(router.state.location.href).toBe('/items/one?q=first'),
  )
  const initialLength = history.length
  await fireEvent.click(screen.getByText('Change params'))
  await waitFor(() =>
    expect(router.state.location.href).toBe('/items/two?q=first'),
  )
  expect(history.length).toBe(initialLength + 1)
  await fireEvent.click(screen.getByText('Change search'))
  await waitFor(() =>
    expect(router.state.location.href).toBe('/items/two?q=second'),
  )
  expect(history.length).toBe(initialLength + 1)
})
