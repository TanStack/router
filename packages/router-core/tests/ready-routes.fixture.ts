import { batch, createAtom } from '@tanstack/store'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'
import { waitFor } from '../src/load-client'
import type { AnyRoute } from '../src'

export type ReadyRouteMode =
  | 'none'
  | 'cached'
  | 'sync'
  | 'async'
  | 'deferred'
  | 'chunks'
  | 'async-chunks'
  | 'mixed'

export async function createBenchmark(mode: ReadyRouteMode, depth: number) {
  const root = new BaseRootRoute({})
  let parent: AnyRoute = root
  let pathA = ''
  let pathB = ''
  let loaderCalls = 0
  let preloadCalls = 0
  let navigations = 0
  const cached = ['cached', 'chunks', 'mixed'].includes(mode)
  const chunked = ['chunks', 'async-chunks', 'mixed'].includes(mode)
  for (let index = 0; index < depth - 1; index++) {
    const ancestor = parent
    const component = Object.assign(() => null, {
      preload: chunked
        ? () => {
            preloadCalls++
            if (mode !== 'mixed' || navigations % 5 === 0) {
              return new Promise<void>((resolve) => queueMicrotask(resolve))
            }
            return undefined
          }
        : undefined,
    })
    const route = new BaseRoute({
      getParentRoute: () => ancestor,
      path: `level${index}/$param${index}`,
      component,
      loader:
        mode === 'none'
          ? undefined
          : mode === 'deferred'
            ? () =>
                new Promise<number>((resolve) => {
                  const value = ++loaderCalls
                  setTimeout(() => resolve(value), 0)
                })
            : mode === 'async' || mode === 'async-chunks'
              ? async () => ++loaderCalls
              : () => ++loaderCalls,
      staleTime: cached ? Infinity : 0,
      gcTime: Infinity,
    })
    ancestor.addChildren([route])
    parent = route
    pathA += `/level${index}/a`
    pathB += `/level${index}/b`
  }
  const history = createMemoryHistory({ initialEntries: [pathA] })
  const router = new RouterCore(
    {
      routeTree: root as AnyRoute,
      history,
      isServer: false,
      origin: 'http://localhost',
      defaultStaleReloadMode: 'blocking',
    },
    () => ({
      batch,
      createMutableStore: createAtom,
      createReadonlyStore: createAtom,
    }),
  )
  await router.load()
  const run = async (count: number) => {
    for (let index = 0; index < count; index++) {
      const target = navigations++ % 2 ? pathA : pathB
      await router.navigate({ to: target, replace: true })
    }
  }
  const verify = () => {
    const matches = router.state.matches
    const expectedCalls =
      mode === 'none' ? 0 : (cached ? 2 : navigations + 1) * (depth - 1)
    if (
      router.state.location.pathname !== (navigations % 2 ? pathB : pathA) ||
      matches.length !== depth ||
      matches.some((match) => match.status !== 'success') ||
      loaderCalls !== expectedCalls ||
      (chunked && preloadCalls !== (navigations + 1) * (depth - 1))
    ) {
      throw new Error(
        `Invalid ${mode}/${depth} workload: ${JSON.stringify({ navigations, loaderCalls, expectedCalls, preloadCalls })}`,
      )
    }
  }
  await run(2)
  verify()
  return { run, verify, dispose: () => history.destroy() }
}

export function createWaitBenchmark() {
  const controller = new AbortController()
  let completed = 0
  return {
    async run(count: number) {
      for (let index = 0; index < count; index++) {
        await waitFor(undefined, controller.signal)
        completed++
      }
    },
    verify() {
      if (!completed || controller.signal.aborted) {
        throw new Error('Wait workload did not complete')
      }
    },
    dispose() {},
  }
}
