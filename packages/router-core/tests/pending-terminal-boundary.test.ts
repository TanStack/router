import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
} from '../src'
import { createTestRouter } from './routerTestUtils'

test('a known parent error does not offer a descendant pending boundary while its error component loads', async () => {
  const failure = new Error('parent failed')
  const errorComponentStarted = createControlledPromise<void>()
  const errorComponentGate = createControlledPromise<void>()
  const childPendingStarted = createControlledPromise<void>()
  const childPendingGate = createControlledPromise<void>()
  const childComponentGate = createControlledPromise<void>()

  const errorComponent = Object.assign(() => null, {
    preload: () => {
      errorComponentStarted.resolve()
      return errorComponentGate
    },
  })
  const childPendingComponent = Object.assign(() => null, {
    preload: () => {
      childPendingStarted.resolve()
      return childPendingGate
    },
  })
  const childComponent = Object.assign(() => null, {
    preload: () => childComponentGate,
  })

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: () => {
      throw failure
    },
    errorComponent,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: () => 'child data',
    component: childComponent,
    pendingComponent: childPendingComponent,
    pendingMs: 0,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()

  const transitions: Array<
    Array<{ routeId: string; status: string; error: unknown }>
  > = []
  const startTransition = router.startTransition
  router.startTransition = (commit) => {
    return startTransition(() => {
      commit()
      transitions.push(
        router.stores.matches.get().map((match) => ({
          routeId: match.routeId,
          status: match.status,
          error: match.error,
        })),
      )
    })
  }

  const navigation = router.navigate({ to: '/parent/child' })
  await Promise.all([errorComponentStarted, childPendingStarted])

  childPendingGate.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))

  expect(
    transitions.some((matches) => {
      const parent = matches.find(
        (match) => match.routeId === parentRoute.id,
      )
      const child = matches.find((match) => match.routeId === childRoute.id)
      return parent?.status === 'success' && child?.status === 'pending'
    }),
  ).toBe(false)

  errorComponentGate.resolve()
  childComponentGate.resolve()
  await navigation

  expect(
    router.state.matches.find((match) => match.routeId === parentRoute.id),
  ).toMatchObject({ status: 'error', error: failure })
})
