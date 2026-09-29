import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { HistoryState } from '../src'

afterEach(cleanup)

test.each(['inherited', 'updater'] as const)(
  'a masked Link uses current %s state for intent preload and navigation',
  async (mode) => {
    const observeLoader = vi.fn()
    const stateOption =
      mode === 'inherited'
        ? true
        : (previous: HistoryState) =>
            ({
              count: ((previous as { count?: number }).count ?? 0) + 1,
            }) as HistoryState
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Link
            to="/target"
            state={stateOption}
            mask={{ to: '/public', state: stateOption }}
            preload="intent"
            preloadDelay={0}
          >
            Masked target
          </Link>
          <Outlet />
        </>
      ),
    })
    const sourceRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      component: () => <p>Source page</p>,
    })
    const targetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: ({ preload, location }) => {
        observeLoader({
          preload,
          pathname: location.pathname,
          state: location.state,
        })
        return 'loaded'
      },
      component: () => <p>Target page</p>,
    })
    const publicRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/public',
    })
    const history = createMemoryHistory({ initialEntries: ['/source'] })
    history.replace('/source', { count: 1 } as HistoryState)
    const router = createRouter({
      routeTree: rootRoute.addChildren([sourceRoute, targetRoute, publicRoute]),
      history,
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByRole('link', { name: 'Masked target' })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(link).toHaveAttribute('href', '/public')

    // A state-only source navigation leaves the displayed masked URL unchanged.
    await act(() =>
      router.navigate({ to: '/source', state: { count: 5 } as HistoryState }),
    )
    expect(link).toHaveAttribute('href', '/public')
    expect(observeLoader).not.toHaveBeenCalled()

    const expectedCount = mode === 'inherited' ? 5 : 6
    fireEvent.mouseOver(link)
    await waitFor(() => {
      expect(observeLoader).toHaveBeenCalledWith({
        preload: true,
        pathname: '/target',
        state: expect.objectContaining({ count: expectedCount }),
      })
    })
    expect(router.state.location.pathname).toBe('/source')
    expect(history.location.pathname).toBe('/source')
    expect(screen.getByText('Source page')).toBeInTheDocument()

    fireEvent.click(link)
    await screen.findByText('Target page')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.location.state).toMatchObject({ count: expectedCount })
    expect(history.location.pathname).toBe('/public')
    expect(history.location.state).toMatchObject({ count: expectedCount })
    expect(link).toHaveAttribute('href', '/public')
    expect(link).toHaveAttribute('aria-current', 'page')
  },
)
