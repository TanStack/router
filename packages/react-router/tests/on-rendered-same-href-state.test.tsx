import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('onRendered fires for a same-href navigation with a new history key', async () => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()

  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)
  await act(() =>
    router.navigate({
      to: '/',
      state: { sameHrefState: true } as any,
    }),
  )
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))

  const event = onRendered.mock.calls[0]![0]
  expect(event.fromLocation?.state.sameHrefState).toBeUndefined()
  expect(event.toLocation.state.sameHrefState).toBe(true)
  expect(event.fromLocation?.href).toBe('/')
  expect(event.toLocation.href).toBe('/')
  expect(event.hrefChanged).toBe(false)

  unsubscribe()
})
