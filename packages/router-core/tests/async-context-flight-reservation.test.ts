import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

describe.each(['context', 'beforeLoad'] as const)(
  'loader reservation during async %s',
  (lifecycle) => {
    test.each([false, true])(
      'reuses a redirecting preload parent when its loader respects abort: %s',
      async (respectsAbort) => {
        const loaderStarted = createControlledPromise<void>()
        const loaderRelease = createControlledPromise<void>()
        const serialStarted = createControlledPromise<void>()
        const serialRelease = createControlledPromise<void>()
        const redirectRelease = createControlledPromise<void>()
        const operations: Array<{
          generation: number
          signal: AbortSignal
          aborts: number
        }> = []
        const rootRoute = new BaseRootRoute({})
        const homeRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/',
        })
        const elsewhereRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/elsewhere',
        })
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          loader: ({ abortController }) => {
            const operation = {
              generation: operations.length + 1,
              signal: abortController.signal,
              aborts: 0,
            }
            operations.push(operation)
            loaderStarted.resolve()
            return new Promise<{ generation: number }>((resolve, reject) => {
              abortController.signal.addEventListener(
                'abort',
                () => {
                  operation.aborts++
                  if (respectsAbort) {
                    reject(new Error('application work canceled'))
                  }
                },
                { once: true },
              )
              void loaderRelease.then(() => {
                resolve({ generation: operation.generation })
              })
            })
          },
        })
        const preloadRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/preloaded',
          loader: async () => {
            await redirectRelease
            throw redirect({ to: '/elsewhere' })
          },
        })
        const serial = async () => {
          serialStarted.resolve()
          await serialRelease
          return { initialized: true }
        }
        const destinationRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/destination',
          ...(lifecycle === 'context'
            ? { context: serial }
            : { beforeLoad: serial }),
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([
            homeRoute,
            elsewhereRoute,
            parentRoute.addChildren([preloadRoute, destinationRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })
        let preload: ReturnType<typeof router.preloadRoute> | undefined
        let navigation: ReturnType<typeof router.navigate> | undefined
        try {
          await router.load()
          preload = router.preloadRoute({ to: '/parent/preloaded' })
          await loaderStarted
          navigation = router.navigate({ to: '/parent/destination' })
          await serialStarted

          // The preload finishes while the navigation still needs its parent
          // loader and has not yet finished preparing the child's context.
          redirectRelease.resolve()
          await preload
          expect(operations).toHaveLength(1)
          expect(operations[0]!.signal.aborted).toBe(false)
          expect(operations[0]!.aborts).toBe(0)

          serialRelease.resolve()
          loaderRelease.resolve()
          await navigation

          expect(operations).toHaveLength(1)
          expect(operations[0]!.signal.aborted).toBe(false)
          expect(
            router.state.matches.find(
              (match) => match.routeId === parentRoute.id,
            ),
          ).toMatchObject({
            status: 'success',
            loaderData: { generation: 1 },
          })
          expect(router.state.location.pathname).toBe('/parent/destination')
          expect(router.state.matches.at(-1)?.context).toMatchObject({
            initialized: true,
          })
        } finally {
          redirectRelease.resolve()
          serialRelease.resolve()
          loaderRelease.resolve()
          await Promise.allSettled([preload, navigation])
          router.clearCache()
          router.history.destroy()
        }
      },
    )
  },
)
