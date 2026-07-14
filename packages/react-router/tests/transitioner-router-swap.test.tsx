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

const testCleanups: Array<() => void> = []

afterEach(() => {
  while (testCleanups.length) {
    testCleanups.pop()!()
  }
  cleanup()
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

test('a load finishing on an old router does not resolve the replacement router', async () => {
  const slowLoader = deferred()
  const rootA = createRootRoute({ component: () => <Outlet /> })
  const indexA = createRoute({
    getParentRoute: () => rootA,
    path: '/',
    component: () => <div>Router A</div>,
  })
  const slowA = createRoute({
    getParentRoute: () => rootA,
    path: '/slow',
    loader: () => slowLoader.promise,
    component: () => <div>Slow A</div>,
  })
  const routerA = createRouter({
    routeTree: rootA.addChildren([indexA, slowA]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const rootB = createRootRoute({ component: () => <Outlet /> })
  const indexB = createRoute({
    getParentRoute: () => rootB,
    path: '/b',
    component: () => <div>Router B</div>,
  })
  const routerB = createRouter({
    routeTree: rootB.addChildren([indexB]),
    history: createMemoryHistory({ initialEntries: ['/b'] }),
  })

  const view = render(<RouterProvider router={routerA} />)
  expect(await screen.findByText('Router A')).toBeInTheDocument()
  await waitFor(() => {
    expect(routerA.state.status).toBe('idle')
    expect(routerA.state.resolvedLocation?.pathname).toBe('/')
  })

  let oldNavigation!: Promise<void>
  act(() => {
    oldNavigation = routerA.navigate({ to: '/slow' })
  })
  await waitFor(() => expect(routerA.state.isLoading).toBe(true))

  const onRendered = vi.fn()
  const unsubscribeRendered = routerB.subscribe('onRendered', onRendered)
  testCleanups.push(unsubscribeRendered)
  view.rerender(<RouterProvider router={routerB} />)
  expect(await screen.findByText('Router B')).toBeInTheDocument()
  await waitFor(() => {
    expect(routerB.state.status).toBe('idle')
    expect(routerB.state.resolvedLocation?.pathname).toBe('/b')
  })
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))
  expect(onRendered.mock.calls[0]![0].fromLocation).toBeUndefined()
  expect(onRendered.mock.calls[0]![0].toLocation.pathname).toBe('/b')

  const onLoad = vi.fn()
  const onBeforeRouteMount = vi.fn()
  const onResolved = vi.fn()
  const unsubscribers = [
    routerB.subscribe('onLoad', onLoad),
    routerB.subscribe('onBeforeRouteMount', onBeforeRouteMount),
    routerB.subscribe('onResolved', onResolved),
  ]
  testCleanups.push(...unsubscribers)

  await act(async () => {
    slowLoader.resolve()
    await oldNavigation
  })

  expect(onLoad).not.toHaveBeenCalled()
  expect(onBeforeRouteMount).not.toHaveBeenCalled()
  expect(onResolved).not.toHaveBeenCalled()
  expect(routerA.state.isLoading).toBe(false)
  expect(routerA.state.status).toBe('idle')
  expect(routerA.state.resolvedLocation?.pathname).toBe('/slow')
  expect(routerA.state.matches.at(-1)?.pathname).toBe('/slow')
  expect(screen.getByText('Router B')).toBeInTheDocument()
  expect(routerB.state.status).toBe('idle')
  expect(routerB.state.resolvedLocation?.pathname).toBe('/b')
  expect(onRendered).toHaveBeenCalledTimes(1)
})
