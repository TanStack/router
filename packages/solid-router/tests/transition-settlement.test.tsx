import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import * as Solid from 'solid-js'
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
  vi.restoreAllMocks()
})

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

function setup() {
  const data = createControlledPromise<string>()

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const aRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="route-a">A</div>,
  })
  const bRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
    component: () => {
      const value = Solid.createMemo(() => data)
      return <div data-testid="route-b">{value()}</div>
    },
  })
  const cRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c',
    component: () => <div data-testid="route-c">C</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([aRoute, bRoute, cRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return { router, data }
}

test('status and onRendered wait for the held swap to commit', async () => {
  const { router, data } = setup()
  const { container } = render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()
  await tick()

  // Record navigation-bearing renders (Rendered re-emits for the unchanged
  // location on unrelated settlements) and whether route B's DOM had
  // committed by the time each fired.
  const rendersTo: Array<[pathname: string, routeBCommitted: boolean]> = []
  const unsubscribe = router.subscribe('onRendered', (event) => {
    if (event.pathChanged) {
      rendersTo.push([
        event.toLocation.pathname,
        container.querySelector('[data-testid="route-b"]') !== null,
      ])
    }
  })

  const navigation = router.navigate({ to: '/b' })
  await tick()
  await tick()

  expect(screen.getByTestId('route-a')).toBeInTheDocument()
  expect(rendersTo).toEqual([])
  expect(router.stores.status.get()).not.toBe('idle')

  data.resolve('route b data')
  await navigation
  await waitFor(() => {
    expect(screen.getByTestId('route-b')).toHaveTextContent('route b data')
  })

  expect(rendersTo).toEqual([['/b', true]])
  expect(router.stores.status.get()).toBe('idle')
  unsubscribe()
})

test('a superseding navigation resolves the held ack without late side effects', async () => {
  const { router, data } = setup()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()
  await tick()

  const rendersTo: Array<string> = []
  const unsubscribe = router.subscribe('onRendered', (event) => {
    if (event.pathChanged) {
      rendersTo.push(event.toLocation.pathname)
    }
  })

  const navigationB = router.navigate({ to: '/b' })
  await tick()
  expect(screen.getByTestId('route-a')).toBeInTheDocument()
  expect(rendersTo).toEqual([])

  const navigationC = router.navigate({ to: '/c' })
  await navigationC
  await waitFor(() => {
    expect(screen.getByTestId('route-c')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('route-a')).not.toBeInTheDocument()
  expect(screen.queryByTestId('route-b')).not.toBeInTheDocument()

  // The superseded ack resolves (no hang) but must not emit against C's DOM.
  await navigationB
  expect(rendersTo).toEqual(['/c'])
  expect(router.stores.status.get()).toBe('idle')

  data.resolve('late')
  await tick()
  expect(screen.getByTestId('route-c')).toBeInTheDocument()
  expect(screen.queryByTestId('route-b')).not.toBeInTheDocument()
  expect(rendersTo).toEqual(['/c'])
  unsubscribe()
})

test('a synchronous navigation acks within the same flush and microtask budget', async () => {
  const { router } = setup()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByTestId('route-a')).toBeInTheDocument()
  await tick()

  const rendersTo: Array<string> = []
  const unsubscribe = router.subscribe('onRendered', (event) => {
    if (event.pathChanged) {
      rendersTo.push(event.toLocation.pathname)
    }
  })

  // A macrotask loses to a microtask-only pipeline: the navigation must
  // settle before a 0ms timer if the ack added no latency.
  const winner = await Promise.race([
    router.navigate({ to: '/c' }).then(() => 'navigation'),
    new Promise<string>((resolve) => setTimeout(() => resolve('timer'), 0)),
  ])
  expect(winner).toBe('navigation')
  expect(screen.getByTestId('route-c')).toBeInTheDocument()
  expect(rendersTo).toEqual(['/c'])
  expect(router.stores.status.get()).toBe('idle')
  unsubscribe()
})
