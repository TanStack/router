import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void> = []

afterEach(() => {
  while (testCleanups.length) {
    testCleanups.pop()!()
  }
  cleanup()
})

test('a suspended same-membership publication cannot acknowledge its successor', async () => {
  const firstRenderStarted = createControlledPromise<void>()
  const firstRenderGate = createControlledPromise<void>()
  let signaledFirstRender = false

  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      revision: Number(search.revision),
    }),
    component: () => {
      const revision = rootRoute.useSearch().revision
      if (revision === 1 && firstRenderGate.status === 'pending') {
        if (!signaledFirstRender) {
          signaledFirstRender = true
          firstRenderStarted.resolve()
        }
        throw firstRenderGate
      }
      return <div>Root revision {revision}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/?revision=0'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Root revision 0')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))
  const initialIds = router.state.matches.map((match) => match.routeId)

  const renderedRevisions: Array<number> = []
  testCleanups.push(
    router.subscribe('onRendered', (event) => {
      renderedRevisions.push(
        Number((event.toLocation.search as Record<string, unknown>).revision),
      )
    }),
  )

  let firstNavigation!: Promise<void>
  await act(async () => {
    firstNavigation = router.navigate({
      to: '/',
      search: { revision: 1 },
    })
    await firstRenderStarted
  })

  const firstSettled = vi.fn()
  void firstNavigation.then(firstSettled)
  expect(router.state.matches.map((match) => match.routeId)).toEqual(initialIds)
  expect(router.state.matches[0]?.search.revision).toBe(1)
  expect(screen.getByText('Root revision 0')).toBeInTheDocument()
  expect(firstSettled).not.toHaveBeenCalled()
  expect(renderedRevisions).toEqual([])

  try {
    await act(() =>
      router.navigate({
        to: '/',
        search: { revision: 2 },
      }),
    )
    await firstNavigation

    expect(screen.getByText('Root revision 2')).toBeInTheDocument()
    expect(router.state.matches.map((match) => match.routeId)).toEqual(
      initialIds,
    )
    expect(renderedRevisions).toEqual([2])
    expect(firstSettled).toHaveBeenCalledOnce()
  } finally {
    await act(async () => {
      firstRenderGate.resolve()
      await Promise.resolve()
    })
  }

  expect(screen.getByText('Root revision 2')).toBeInTheDocument()
  expect(renderedRevisions).toEqual([2])
})

test('a development HMR lifecycle failure rolls back before recovery', async () => {
  let generation = 1
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    loader: () => generation,
    component: () => <div>Page generation {pageRoute.useLoaderData()}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Page generation 1')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  generation = 2
  pageRoute.options.onStay = () => {
    throw new Error('hot route failed')
  }
  await act(() => router._refreshRoute!())

  expect(screen.getByText('Page generation 1')).toBeInTheDocument()
  expect(router.state.matches.at(-1)?.loaderData).toBe(1)
  expect(router.state.status).toBe('idle')

  pageRoute.options.onStay = undefined
  generation = 3
  await act(() => router._refreshRoute!())

  expect(screen.getByText('Page generation 3')).toBeInTheDocument()
  expect(router.state.matches.at(-1)?.loaderData).toBe(3)
})
