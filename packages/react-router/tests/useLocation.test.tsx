import { useEffect, useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useRouterState,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('useLocation', () => {
  test('updates allocating selectors when their captured props change without navigation', async () => {
    function Selection({ prefix }: { prefix: string }) {
      const location = useLocation({
        select: (value) => ({ label: `${prefix}${value.pathname}` }),
        structuralSharing: false,
      })
      const state = useRouterState({
        select: (value) => ({ label: `${prefix}${value.location.pathname}` }),
        structuralSharing: false,
      })

      return (
        <>
          <p data-testid="location-selection">{location.label}</p>
          <p data-testid="state-selection">{state.label}</p>
        </>
      )
    }

    const rootRoute = createRootRoute({
      component: function RootComponent() {
        const [prefix, setPrefix] = useState('first:')

        return (
          <>
            <button onClick={() => setPrefix('second:')}>
              Change selector
            </button>
            <Selection prefix={prefix} />
            <Outlet />
          </>
        )
      },
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts'] }),
    })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(screen.getByTestId('location-selection')).toHaveTextContent(
      'first:/posts',
    )
    expect(screen.getByTestId('state-selection')).toHaveTextContent(
      'first:/posts',
    )
    const initialState = router.state

    fireEvent.click(screen.getByRole('button', { name: 'Change selector' }))

    expect(screen.getByTestId('location-selection')).toHaveTextContent(
      'second:/posts',
    )
    expect(screen.getByTestId('state-selection')).toHaveTextContent(
      'second:/posts',
    )
    expect(router.state).toBe(initialState)
  })

  test('keeps a selected pathname reference stable across search and hash updates when structural sharing is enabled', async () => {
    const effectSpy = vi.fn()
    const pathnameSelections: Array<{ pathname: string }> = []

    const rootRoute = createRootRoute({
      component: function RootComponent() {
        const pathnameSelection = useLocation({
          select: (location) => ({ pathname: location.pathname }),
        })

        useEffect(() => {
          effectSpy(pathnameSelection)
          pathnameSelections.push(pathnameSelection)
        }, [pathnameSelection])

        return <Outlet />
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts</h1>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([postsRoute]),
      history: createMemoryHistory({
        initialEntries: ['/posts?foo=one#first'],
      }),
      defaultStructuralSharing: true,
    })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    await waitFor(() => expect(effectSpy).toHaveBeenCalledTimes(1))

    const initialPathnameSelection = pathnameSelections[0]

    await act(() =>
      router.navigate({
        to: '/posts',
        search: { foo: 'two' },
        hash: 'first',
      }),
    )

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ foo: 'two' })
      expect(effectSpy).toHaveBeenCalledTimes(1)
    })

    await act(() =>
      router.navigate({
        to: '/posts',
        search: { foo: 'two' },
        hash: 'second',
      }),
    )

    await waitFor(() => {
      expect(router.state.location.hash).toBe('second')
      expect(effectSpy).toHaveBeenCalledTimes(1)
    })

    expect(pathnameSelections).toHaveLength(1)
    expect(pathnameSelections[0]).toBe(initialPathnameSelection)
  })
})
