import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
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
  vi.useRealTimers()
})

const navigationDelay = 100

function setup() {
  const navigationBeforeLoadStarted = createControlledPromise<void>()
  let beforeLoadCalls = 0

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app',
    beforeLoad: async () => {
      if (++beforeLoadCalls > 1) {
        navigationBeforeLoadStarted.resolve()
        await new Promise<void>((resolve) =>
          setTimeout(resolve, navigationDelay),
        )
      }
      return { user: 'test' }
    },
    component: () => <Outlet />,
  })
  const projectRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/projects/$projectId',
    validateSearch: (search: Record<string, unknown>): { tab?: string } =>
      typeof search.tab === 'string' ? { tab: search.tab } : {},
    component: Project,
  })

  function Project() {
    const params = projectRoute.useParams()
    const search = projectRoute.useSearch()
    return (
      <div data-testid="content">
        project={params().projectId} tab={search().tab ?? 'default'}
      </div>
    )
  }

  const router = createRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([projectRoute])]),
    history: createMemoryHistory({ initialEntries: ['/projects/p1'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 1,
  })

  return { router, navigationBeforeLoadStarted }
}

test('a search-only navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const navigation = router.navigate({
    to: '/projects/$projectId',
    params: { projectId: 'p1' },
    search: { tab: 'files' },
  })
  await navigationBeforeLoadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=files',
  )
})

test('a path-param navigation retains successful UI while beforeLoad reruns', async () => {
  const { router, navigationBeforeLoadStarted } = setup()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const navigation = router.navigate({
    to: '/projects/$projectId',
    params: { projectId: 'p2' },
  })
  await navigationBeforeLoadStarted

  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('content')).toBeVisible()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p1 tab=default',
  )
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(navigationDelay)
  await navigation

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent(
    'project=p2 tab=default',
  )
})
