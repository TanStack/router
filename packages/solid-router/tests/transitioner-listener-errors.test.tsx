import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
})

test('a throwing load-event listener cannot interrupt route hooks or later navigations', async () => {
  const firstOnEnter = vi.fn()
  const secondOnEnter = vi.fn()
  const listenerError = new Error('onLoad listener failed')
  const unhandledRejection = vi.fn()
  process.on('unhandledRejection', unhandledRejection)
  testCleanups.push(() => {
    process.off('unhandledRejection', unhandledRejection)
  })

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index route</div>,
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    onEnter: firstOnEnter,
    component: () => <div>First route</div>,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    onEnter: secondOnEnter,
    component: () => <div>Second route</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index route')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const unsubscribe = router.subscribe('onLoad', (event) => {
    if (event.toLocation.pathname === '/first') {
      throw listenerError
    }
  })

  await router.navigate({ to: '/first' })
  expect(await screen.findByText('First route')).toBeInTheDocument()
  expect(firstOnEnter).toHaveBeenCalledTimes(1)

  unsubscribe()
  await router.navigate({ to: '/second' })
  expect(await screen.findByText('Second route')).toBeInTheDocument()
  expect(secondOnEnter).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(router.state.status).toBe('idle'))

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(unhandledRejection).toHaveBeenCalledWith(
    listenerError,
    expect.anything(),
  )
})
