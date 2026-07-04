import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import {
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
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

// https://github.com/TanStack/router/issues/7638
// router.invalidate() called inside React.startTransition while a nested
// route is showing its errorComponent must complete the reload and land back
// on the error UI without crashing React with
// "Rendered more hooks than during the previous render."
function setup({ failVia }: { failVia: 'render' | 'loader' }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/test',
    component: function TestComponent() {
      const router = useRouter()
      const [isPending, startTransition] = React.useTransition()
      return (
        <div>
          <button
            data-testid="invalidate"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                router.invalidate()
              })
            }
          >
            invalidate
          </button>
          <Outlet />
        </div>
      )
    },
  })

  const childLoader = vi.fn(() => {
    if (failVia === 'loader') {
      throw new Error('test error')
    }
    return 'data'
  })

  const testIndexRoute = createRoute({
    getParentRoute: () => testRoute,
    path: '/',
    loader: childLoader,
    component: function ChildComponent() {
      if (failVia === 'render') {
        throw new Error('test error')
      }
      return <div>child content</div>
    },
  })

  let errorRenders = 0
  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute.addChildren([testIndexRoute])]),
    history: createMemoryHistory({ initialEntries: ['/test'] }),
    defaultErrorComponent: (props: ErrorComponentProps) => {
      errorRenders++
      return <div data-testid="error-ui">error: {props.error.message}</div>
    },
  })

  return { router, childLoader, getErrorRenders: () => errorRenders }
}

test.each(['render', 'loader'] as const)(
  'invalidate() inside startTransition through a nested %s-error route does not crash',
  async (failVia) => {
    // Error boundaries log caught errors through console.error, and so does a
    // hooks-order crash. Capture instead of polluting the test output, then
    // inspect the captured calls for the crash signature.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { router, childLoader, getErrorRenders } = setup({ failVia })
    render(<RouterProvider router={router} />)

    expect(await screen.findByTestId('error-ui')).toBeInTheDocument()
    const initialErrorRenders = getErrorRenders()
    const initialLoaderCalls = childLoader.mock.calls.length

    fireEvent.click(screen.getByTestId('invalidate'))

    // The invalidated reload must actually complete: the loader re-ran ...
    await waitFor(() => {
      expect(childLoader.mock.calls.length).toBeGreaterThan(initialLoaderCalls)
    })

    // ... the error UI is rendered again after the reload ...
    await waitFor(() => {
      expect(screen.getByTestId('error-ui')).toBeInTheDocument()
      expect(getErrorRenders()).toBeGreaterThan(initialErrorRenders)
    })

    // ... and the router returns to idle instead of hanging mid-transition.
    await waitFor(() => {
      expect(router.state.status).toBe('idle')
    })

    // React must not have torn the tree down with a hooks-order violation.
    const hooksCrash = consoleError.mock.calls.find((call) =>
      call.some((arg) =>
        String(arg?.message ?? arg).includes('Rendered more hooks'),
      ),
    )
    expect(hooksCrash).toBeUndefined()
    // The surrounding route (the issue's "frozen" parent) is still mounted
    // and interactive.
    expect(screen.getByTestId('invalidate')).toBeInTheDocument()
  },
)
