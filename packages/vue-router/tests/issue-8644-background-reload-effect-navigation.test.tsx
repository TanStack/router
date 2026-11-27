import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import { defineComponent, ref, watch } from 'vue'
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

  const Detail = defineComponent({
    setup() {
      const data = detailRoute.useLoaderData()
      const search = detailRoute.useSearch()
      const navigate = detailRoute.useNavigate()
      const toast = ref(false)

      watch(
        () => search.value.saved,
        (saved) => {
          if (!saved) {
            return
          }
          toast.value = true
          navigate({ search: {}, replace: true })
        },
        { immediate: true, flush: 'post' },
      )

      return () => (
        <div>
          <p data-testid="value">value: {data.value.value}</p>
          {toast.value && <p>Saved!</p>}
          <button onClick={() => navigate({ to: '/edit' })}>Edit</button>
        </div>
      )
    },
  })
  const Edit = defineComponent({
    setup() {
      const navigate = editRoute.useNavigate()
      return () => (
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

  const rootRoute = createRootRoute({ component: Outlet })
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => ({
      saved: search.saved === true ? true : undefined,
    }),
    loader: async () => ({ value: await fetchValue() }),
    component: Detail,
  })
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/edit',
    component: Edit,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute, editRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('value: 0')).toBeInTheDocument()

  await fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Saved!')).toBeInTheDocument()
  expect(await screen.findByText('value: 1')).toBeInTheDocument()
  expect(router.state.location.search).toEqual({})
  expect(loads).toBe(2)
})
