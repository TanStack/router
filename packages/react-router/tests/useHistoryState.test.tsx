import { afterEach, describe, expect, test } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { z } from 'zod'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useHistoryState,
  useNavigate,
} from '../src'
import type { RouteComponent, RouterHistory } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('useHistoryState', () => {
  function setup({
    RootComponent,
    history,
  }: {
    RootComponent: RouteComponent
    history?: RouterHistory
  }) {
    const rootRoute = createRootRoute({
      component: RootComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1 data-testid="index-title">IndexTitle</h1>
          <Link to="/posts" state={{ testKey: 'test-value' }}>
            Posts
          </Link>
        </>
      ),
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      validateState: (input: { testKey?: string; color?: string }) =>
        z
          .object({
            testKey: z.string().optional(),
            color: z.enum(['red', 'green', 'blue']).optional(),
          })
          .parse(input),
      component: () => <h1>PostsTitle</h1>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    return render(<RouterProvider router={router} />)
  }

  test('basic state access', async () => {
    function RootComponent() {
      const match = useHistoryState({
        from: '/posts',
        shouldThrow: false,
      })

      return (
        <div>
          <div data-testid="state-value">{match?.testKey}</div>
          <Outlet />
        </div>
      )
    }

    setup({ RootComponent })

    const postsLink = await screen.findByText('Posts')
    fireEvent.click(postsLink)

    await waitFor(() => {
      const stateValue = screen.getByTestId('state-value')
      expect(stateValue).toHaveTextContent('test-value')
    })
  })

  test('state access with select function', async () => {
    function RootComponent() {
      const testKey = useHistoryState({
        from: '/posts',
        shouldThrow: false,
        select: (state) => state.testKey,
      })

      return (
        <div>
          <div data-testid="state-value">{testKey}</div>
          <Outlet />
        </div>
      )
    }

    setup({ RootComponent })

    const postsLink = await screen.findByText('Posts')
    fireEvent.click(postsLink)

    const stateValue = await screen.findByTestId('state-value')
    expect(stateValue).toHaveTextContent('test-value')
  })

  test('state validation', async () => {
    function RootComponent() {
      const navigate = useNavigate()

      return (
        <div>
          <button
            data-testid="valid-state-btn"
            onClick={() =>
              navigate({
                to: '/posts',
                state: { testKey: 'valid-key', color: 'red' },
              })
            }
          >
            Valid State
          </button>
          <button
            data-testid="invalid-state-btn"
            onClick={() =>
              navigate({
                to: '/posts',
                state: { testKey: 'valid-key', color: 'yellow' },
              })
            }
          >
            Invalid State
          </button>
          <Outlet />
        </div>
      )
    }

    function ValidChecker() {
      const state = useHistoryState({ from: '/posts', shouldThrow: false })
      return <div data-testid="valid-state">{JSON.stringify(state)}</div>
    }

    const rootRoute = createRootRoute({
      component: RootComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <h1 data-testid="index-title">IndexTitle</h1>,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      validateState: (input: { testKey?: string; color?: string }) =>
        z
          .object({
            testKey: z.string(),
            color: z.enum(['red', 'green', 'blue']),
          })
          .parse(input),
      component: ValidChecker,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    // Valid state transition
    const validButton = await screen.findByTestId('valid-state-btn')
    fireEvent.click(validButton)

    const validState = await screen.findByTestId('valid-state')
    expect(validState).toHaveTextContent(
      '{"testKey":"valid-key","color":"red"}',
    )

    // Invalid state transition
    const invalidButton = await screen.findByTestId('invalid-state-btn')
    fireEvent.click(invalidButton)

    await waitFor(async () => {
      const stateElement = await screen.findByTestId('valid-state')
      expect(stateElement).toHaveTextContent('yellow')
    })
  })

  test('throws when match not found and shouldThrow=true', async () => {
    function RootComponent() {
      try {
        useHistoryState({ from: '/non-existent', shouldThrow: true })
        return <div>No error</div>
      } catch (e) {
        return <div>Error occurred: {(e as Error).message}</div>
      }
    }

    setup({ RootComponent })

    const errorMessage = await screen.findByText(/Error occurred:/)
    expect(errorMessage).toBeInTheDocument()
    expect(errorMessage).toHaveTextContent(/Could not find an active match/)
  })

  test('returns undefined when match not found and shouldThrow=false', async () => {
    function RootComponent() {
      const state = useHistoryState({
        from: '/non-existent',
        shouldThrow: false,
      })
      return (
        <div>
          <div data-testid="state-result">
            {state === undefined ? 'undefined' : 'defined'}
          </div>
          <Outlet />
        </div>
      )
    }

    setup({ RootComponent })

    const stateResult = await screen.findByTestId('state-result')
    expect(stateResult).toHaveTextContent('undefined')
  })

  test('updates when state changes', async () => {
    function RootComponent() {
      const navigate = useNavigate()
      const state = useHistoryState({ from: '/posts', shouldThrow: false })

      return (
        <div>
          <div data-testid="state-value">{state?.count}</div>
          <button
            data-testid="navigate-btn"
            onClick={() => navigate({ to: '/posts', state: { count: 1 } })}
          >
            Set Count 1
          </button>
          <button
            data-testid="update-btn"
            onClick={() =>
              navigate({
                to: '/posts',
                state: (prev: { count?: number }) => ({
                  count: (prev.count || 0) + 1,
                }),
                replace: true,
              })
            }
          >
            Increment Count
          </button>
          <Outlet />
        </div>
      )
    }

    setup({ RootComponent })

    // Initial navigation
    const navigateBtn = await screen.findByTestId('navigate-btn')
    fireEvent.click(navigateBtn)

    // Check initial state
    const stateValue = await screen.findByTestId('state-value')
    expect(stateValue).toHaveTextContent('1')

    // Update state
    const updateBtn = await screen.findByTestId('update-btn')
    fireEvent.click(updateBtn)

    // Check updated state
    await waitFor(() => {
      expect(screen.getByTestId('state-value')).toHaveTextContent('2')
    })
  })

  test('route.useHistoryState hook works properly', async () => {
    function PostsComponent() {
      const state = postsRoute.useHistoryState()
      return <div data-testid="route-state">{state.testValue}</div>
    }

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = useNavigate()
        return (
          <button
            onClick={() =>
              navigate({
                to: '/posts',
                state: { testValue: 'route-state-value' },
              })
            }
          >
            Go to Posts
          </button>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const goToPostsBtn = await screen.findByText('Go to Posts')
    fireEvent.click(goToPostsBtn)

    const routeState = await screen.findByTestId('route-state')
    expect(routeState).toHaveTextContent('route-state-value')
  })
})
