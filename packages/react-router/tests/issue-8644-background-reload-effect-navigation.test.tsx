import { useEffect, useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
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
      const { value } = detailRoute.useLoaderData()
      const { saved } = detailRoute.useSearch()
      const navigate = detailRoute.useNavigate()
      const [toast, setToast] = useState(false)

      useEffect(() => {
        if (!saved) {
          return
        }
        setToast(true)
        navigate({ search: {}, replace: true })
      }, [saved, navigate])

      return (
        <div>
          <p data-testid="value">value: {value}</p>
          {toast && <p>Saved!</p>}
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

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('value: 0')).toBeInTheDocument()

  act(() => screen.getByRole('button', { name: 'Edit' }).click())
  const save = await screen.findByRole('button', { name: 'Save' })
  act(() => save.click())

  expect(await screen.findByText('Saved!')).toBeInTheDocument()
  expect(await screen.findByText('value: 1')).toBeInTheDocument()
  expect(router.state.location.search).toEqual({})
  expect(loads).toBe(2)
})
