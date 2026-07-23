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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('N06: the global catch boundary resets when a background child generation recovers', async () => {
  const unexpectedConsole: Array<string> = []
  const formatConsole = (values: Array<unknown>) =>
    values
      .map((value) => (value instanceof Error ? value.message : String(value)))
      .join(' ')
  vi.spyOn(console, 'warn').mockImplementation((...values) => {
    const message = formatConsole(values)
    if (
      !message.includes("wasn't caught by any route") &&
      !message.includes('stale child render failed')
    ) {
      unexpectedConsole.push(`warn: ${message}`)
    }
  })
  vi.spyOn(console, 'error').mockImplementation((...values) => {
    const message = formatConsole(values)
    if (!message.includes('stale child render failed')) {
      unexpectedConsole.push(`error: ${message}`)
    }
  })
  const refreshStarted = createControlledPromise<void>()
  const refreshGate = createControlledPromise<void>()
  let loaderCalls = 0

  const rootRoute = createRootRoute({
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    loader: {
      staleReloadMode: 'background',
      handler: async () => {
        loaderCalls++
        if (loaderCalls > 1) {
          refreshStarted.resolve()
          await refreshGate
          return 2
        }
        return 1
      },
    },
    component: () => {
      const revision = childRoute.useLoaderData()
      if (revision === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
  })

  render(<RouterProvider router={router} />)
  expect(
    await screen.findByText('stale child render failed'),
  ).toBeInTheDocument()

  let invalidation!: Promise<void>
  act(() => {
    invalidation = router.invalidate()
  })
  await refreshStarted
  await act(() => invalidation)

  // The foreground invalidation republishes revision 1 and resets the global
  // boundary once. It immediately throws again while revision 2 is loading.
  expect(screen.getByText('stale child render failed')).toBeInTheDocument()
  expect(loaderCalls).toBe(2)
  const rootBeforeBackground = router.state.matches.find(
    (match) => match.routeId === rootRoute.id,
  )
  const childBeforeBackground = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )
  expect(rootBeforeBackground).toBeDefined()
  expect(childBeforeBackground).toMatchObject({
    loaderData: 1,
    status: 'success',
  })

  await act(async () => {
    refreshGate.resolve()
    await waitFor(() => {
      expect(
        router.state.matches.find((match) => match.routeId === childRoute.id)
          ?.loaderData,
      ).toBe(2)
    })
  })

  const rootAfterBackground = router.state.matches.find(
    (match) => match.routeId === rootRoute.id,
  )
  const childAfterBackground = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )
  expect(rootAfterBackground).toBe(rootBeforeBackground)
  expect(rootAfterBackground?.fetchCount).toBe(rootBeforeBackground?.fetchCount)
  expect(childAfterBackground).not.toBe(childBeforeBackground)
  expect(childAfterBackground).toMatchObject({
    loaderData: 2,
    status: 'success',
    fetchCount: childBeforeBackground!.fetchCount + 1,
  })
  expect(loaderCalls).toBe(2)
  expect(router.state.location.pathname).toBe('/child')
  expect(router.state.status).toBe('idle')

  expect(
    await screen.findByText('Recovered child revision 2'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('stale child render failed'),
  ).not.toBeInTheDocument()
  expect(unexpectedConsole).toEqual([])
})
