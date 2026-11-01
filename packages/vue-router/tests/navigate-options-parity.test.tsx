import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
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

test('Navigate leaves the request location unchanged during server rendering', async () => {
  const root = createRootRoute()
  const next = createRoute({ getParentRoute: () => root, path: '/next' })
  const router = createRouter({
    routeTree: root.addChildren([next]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
  const navigate = vi.spyOn(router, 'navigate')
  const html = await renderToString(
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
  const component = Vue.defineComponent({
    setup() {
      const id = Vue.ref('one')
      const q = Vue.ref('first')
      const replace = Vue.ref(true)
      const setId = (value: string) => {
        id.value = value
      }
      const setQ = (value: string) => {
        q.value = value
      }
      const setReplace = (value: boolean) => {
        replace.value = value
      }
      return () => (
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
            params={{ id: id.value }}
            search={{ q: q.value }}
            replace={replace.value}
          />
          <Outlet />
        </>
      )
    },
  })
  const root = createRootRoute({ component })
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
