import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

test('P12 control: an unrelated fresh redirect chain gets the full budget', async () => {
  const boundedCycleSentinel = new Error('bounded fresh cycle sentinel')
  let cycleLoaderCalls = 0
  const rootRoute = new BaseRootRoute({})
  const cycleARoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/cycle-a',
    loader: () => {
      cycleLoaderCalls++
      if (cycleLoaderCalls > 25) {
        throw boundedCycleSentinel
      }
      throw redirect({ to: '/cycle-b' })
    },
    errorComponent: () => null,
  })
  const cycleBRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/cycle-b',
    loader: () => {
      cycleLoaderCalls++
      if (cycleLoaderCalls > 25) {
        throw boundedCycleSentinel
      }
      throw redirect({ to: '/cycle-a' })
    },
    errorComponent: () => null,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([cycleARoute, cycleBRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/cycle-a' })

  const cycleError = router.state.matches.find(
    (match) => match.status === 'error',
  )
  expect(cycleError?.error).toMatchObject({
    message: 'Redirect cycle detected',
  })
  expect(cycleLoaderCalls).toBe(21)
})

test('P12: a failed redirect target build cannot donate redirect depth to an unrelated navigation', async () => {
  const targetBuildError = new Error('redirect target search failed')
  const boundedCycleSentinel = new Error('bounded redirect cycle sentinel')
  let cycleLoaderCalls = 0

  const within = async <T>(label: string, promise: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`timed out while ${label}`))
          }, 1_000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const brokenRedirectRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/broken-redirect',
    loader: () => {
      throw redirect({
        to: '/never-built',
        search: (() => {
          throw targetBuildError
        }) as any,
      })
    },
  })
  const neverBuiltRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/never-built',
  })
  const cycleARoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/cycle-a',
    loader: () => {
      cycleLoaderCalls++
      if (cycleLoaderCalls > 25) {
        throw boundedCycleSentinel
      }
      throw redirect({ to: '/cycle-b' })
    },
    errorComponent: () => null,
  })
  const cycleBRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/cycle-b',
    loader: () => {
      cycleLoaderCalls++
      if (cycleLoaderCalls > 25) {
        throw boundedCycleSentinel
      }
      throw redirect({ to: '/cycle-a' })
    },
    errorComponent: () => null,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      brokenRedirectRoute,
      neverBuiltRoute,
      cycleARoute,
      cycleBRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await within(
    'settling the redirect whose target build fails',
    router.navigate({ to: '/broken-redirect' }),
  )
  expect(router.state.status).toBe('idle')

  await within(
    'settling the unrelated bounded redirect chain',
    router.navigate({ to: '/cycle-a' }),
  )

  const cycleError = router.state.matches.find(
    (match) =>
      (match.routeId === cycleARoute.id || match.routeId === cycleBRoute.id) &&
      match.status === 'error',
  )
  expect(cycleError).toMatchObject({
    status: 'error',
    error: expect.objectContaining({ message: 'Redirect cycle detected' }),
  })
  // A fresh chain runs its origin plus 20 redirect successors before the 21st
  // redirect becomes the terminal cycle error.
  expect(cycleLoaderCalls).toBe(21)
})
