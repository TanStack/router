import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
} from '../src'

afterEach(() => {
  cleanup()
})

test('an outgoing component never observes its own active match disappear', async () => {
  const observedRouteIds: Array<string | undefined> = []
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => {
      const match = useMatch({ from: '/first', shouldThrow: false })
      // Sync watchers are commonly used to coordinate non-render state. They
      // run as soon as the granular route store changes, before Vue's parent
      // render has had a chance to unmount this outgoing component.
      Vue.watchEffect(
        () => {
          observedRouteIds.push(match.value?.routeId)
        },
        { flush: 'sync' },
      )
      return <div>First</div>
    },
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('First')).toBeInTheDocument()

  await router.navigate({ to: '/next' })
  expect(await screen.findByText('Next')).toBeInTheDocument()

  expect(observedRouteIds).toEqual(['/first'])
})

test('a persistent observer releases an explicit match only after the destination renders', async () => {
  const nextLoader = createControlledPromise<void>()
  const observedRouteIds: Array<string | undefined> = []
  const destinationRenderedWhenMissing: Array<boolean> = []

  const rootRoute = createRootRoute({
    component: () => {
      const routeId = useMatch({
        from: '/first',
        shouldThrow: false,
        select: (match) => match.routeId,
      })
      Vue.watchEffect(
        () => {
          const value = routeId.value
          observedRouteIds.push(value)
          if (value === undefined) {
            destinationRenderedWhenMissing.push(
              screen.queryByText('Next') !== null,
            )
          }
        },
        { flush: 'sync' },
      )
      return <Outlet />
    },
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => <div>First</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    loader: () => nextLoader,
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('First')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(observedRouteIds).toEqual(['/first'])

  const navigation = router.navigate({ to: '/next' })
  await waitFor(() => {
    expect(router.state.isLoading).toBe(true)
    expect(router.state.status).toBe('pending')
  })

  // The persistent observer must not see the old route disappear while the
  // destination has not committed yet.
  expect(screen.queryByText('Next')).toBeNull()
  expect(observedRouteIds).toEqual(['/first'])

  nextLoader.resolve()
  await navigation
  expect(await screen.findByText('Next')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))
  await waitFor(() => expect(observedRouteIds).toContain(undefined))

  expect(observedRouteIds[0]).toBe('/first')
  expect(observedRouteIds.slice(1).every((value) => value === undefined)).toBe(
    true,
  )
  expect(destinationRenderedWhenMissing.length).toBeGreaterThan(0)
  expect(destinationRenderedWhenMissing.every(Boolean)).toBe(true)
})

test('a child does not observe itself disappear before a background parent error unmounts it', async () => {
  let rejectReload!: (error: Error) => void
  let loaderCalls = 0
  const parentLoader = vi.fn(() => {
    loaderCalls++
    if (loaderCalls === 1) {
      return 'initial'
    }
    return new Promise<string>((_resolve, reject) => {
      rejectReload = reject
    })
  })
  const observedRouteIds: Array<string | undefined> = []
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: parentLoader,
    staleTime: 0,
    component: () => <Outlet />,
    errorComponent: () => <div>Parent error</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    component: () => {
      const match = useMatch({
        strict: false,
        shouldThrow: false,
      })
      Vue.watchEffect(
        () => {
          observedRouteIds.push(match.value?.routeId)
        },
        { flush: 'sync' },
      )
      return <div>Child</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Child')).toBeInTheDocument()

  await new Promise((resolve) => setTimeout(resolve, 1))
  await router.load()
  await waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
  rejectReload(new Error('background failed'))

  expect(await screen.findByText('Parent error')).toBeInTheDocument()
  expect(observedRouteIds).toEqual(['/parent/child'])
})
