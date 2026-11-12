import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { Show, createEffect, createSignal, on } from 'solid-js'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

// https://github.com/TanStack/router/issues/8644
test('a stale background reload survives a navigation started by an effect of the revealed route', async () => {
  let serverValue = 0
  let loads = 0
  const fetchValue = async () => {
    loads++
    await new Promise((resolve) => setTimeout(resolve, 20))
    return serverValue
  }

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => ({
      saved: search.saved === true ? true : undefined,
    }),
    loader: async () => ({ value: await fetchValue() }),
    component: function Detail() {
      const data = detailRoute.useLoaderData()
      const search = detailRoute.useSearch()
      const navigate = detailRoute.useNavigate()
      const [toast, setToast] = createSignal(false)

      createEffect(
        on(
          () => search().saved,
          (saved) => {
            if (!saved) {
              return
            }
            setToast(true)
            navigate({ search: {}, replace: true })
          },
        ),
      )

      return (
        <div>
          <p data-testid="value">value: {data().value}</p>
          <Show when={toast()}>
            <p>Saved!</p>
          </Show>
          <button onClick={() => navigate({ to: '/edit' })}>Edit</button>
        </div>
      )
    },
  })
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/edit',
    component: function Edit() {
      const navigate = editRoute.useNavigate()
      return (
        <button
          onClick={async () => {
            serverValue++
            await navigate({ to: '/', search: { saved: true } })
          }}
        >
          Save
        </button>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute, editRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('value: 0')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Saved!')).toBeInTheDocument()
  expect(await screen.findByText('value: 1')).toBeInTheDocument()
  expect(router.state.location.search).toEqual({})
  expect(loads).toBe(2)
})
