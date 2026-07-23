import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import { waitForMacrotask } from './pr-7805-review-client-transaction-utils'

test('N04: a superseded load does not wait forever for an obsolete component preload', async () => {
  const componentPreloadStarted = createControlledPromise<void>()
  const componentPreload = createControlledPromise<void>()
  const FirstComponent = Object.assign(() => null, {
    preload: () => {
      componentPreloadStarted.resolve()
      return componentPreload
    },
  })

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: FirstComponent,
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
    history,
  })

  await router.load()
  history.push('/first')
  let supersededLoadSettled = false
  const supersededLoad = router.load().then(() => {
    supersededLoadSettled = true
  })
  let successorNavigation: Promise<void> | undefined
  try {
    await componentPreloadStarted

    successorNavigation = router.navigate({ to: '/second' })
    await successorNavigation
    await waitForMacrotask()
    const settledAfterSuccessor = supersededLoadSettled

    componentPreload.resolve()
    await supersededLoad

    expect(router.state.location.pathname).toBe('/second')
    expect(settledAfterSuccessor).toBe(true)
  } finally {
    componentPreload.resolve()
    await Promise.allSettled([
      supersededLoad,
      successorNavigation ?? Promise.resolve(),
    ])
  }
})
