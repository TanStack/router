import { createSignal } from 'solid-js'
import { afterEach, expect, test } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('Navigate responds to option changes while mounted', async () => {
  function component() {
    const [id, setId] = createSignal('one')
    const [q, setQ] = createSignal('first')
    const [replace, setReplace] = createSignal(true)
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
          params={{ id: id() }}
          search={{ q: q() }}
          replace={replace()}
        />
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({ component })
  const item = createRoute({ getParentRoute: () => root, path: '/items/$id' })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({ routeTree: root.addChildren([item]), history })
  render(() => <RouterProvider router={router} />)
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
