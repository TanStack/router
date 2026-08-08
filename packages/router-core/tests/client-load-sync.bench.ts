import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { waitFor } from '../src/load-client'
import { createTestRouter } from './routerTestUtils'

type RouteWork =
  | 'loaderless'
  | 'sync-before-load'
  | 'mixed-before-load'
  | 'async-before-load'
  | 'sync-loader'

const routePath = '/$a/$b/$c/$d/$e/$f/$g/$h'
const paramNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const benchOptions = { time: 3_000, warmupIterations: 50 }

function createRouteOptions(
  work: RouteWork,
  depth: number,
  calls: { beforeLoad: number; loader: number },
) {
  const beforeLoad =
    work === 'sync-before-load' ||
    work === 'mixed-before-load' ||
    work === 'async-before-load'
      ? ({ params }: { params: Record<string, string> }) => {
          calls.beforeLoad++
          const value = `${depth}:${params[paramNames[depth]!]}`
          return work === 'async-before-load' ||
            (work === 'mixed-before-load' && depth % 2 === 1)
            ? Promise.resolve({ value })
            : { value }
        }
      : undefined

  return {
    beforeLoad,
    loader:
      work === 'sync-loader'
        ? ({ params }: { params: Record<string, string> }) => {
            calls.loader++
            return `${depth}:${params[paramNames[depth]!]}`
          }
        : undefined,
  }
}

function createBenchRouter(
  work: RouteWork,
  calls: { beforeLoad: number; loader: number },
) {
  const rootRoute = new BaseRootRoute({})
  const a = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '$a',
    ...createRouteOptions(work, 0, calls),
  })
  const b = new BaseRoute({
    getParentRoute: () => a,
    path: '$b',
    ...createRouteOptions(work, 1, calls),
  })
  const c = new BaseRoute({
    getParentRoute: () => b,
    path: '$c',
    ...createRouteOptions(work, 2, calls),
  })
  const d = new BaseRoute({
    getParentRoute: () => c,
    path: '$d',
    ...createRouteOptions(work, 3, calls),
  })
  const e = new BaseRoute({
    getParentRoute: () => d,
    path: '$e',
    ...createRouteOptions(work, 4, calls),
  })
  const f = new BaseRoute({
    getParentRoute: () => e,
    path: '$f',
    ...createRouteOptions(work, 5, calls),
  })
  const g = new BaseRoute({
    getParentRoute: () => f,
    path: '$g',
    ...createRouteOptions(work, 6, calls),
  })
  const h = new BaseRoute({
    getParentRoute: () => g,
    path: '$h',
    ...createRouteOptions(work, 7, calls),
  })
  const routeTree = rootRoute.addChildren([
    a.addChildren([
      b.addChildren([
        c.addChildren([
          d.addChildren([e.addChildren([f.addChildren([g.addChildren([h])])])]),
        ]),
      ]),
    ]),
  ])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/0/0/0/0/0/0/0/0'],
    }),
  })
}

async function createNavigationBatch(work: RouteWork) {
  const calls = { beforeLoad: 0, loader: 0 }
  const router = createBenchRouter(work, calls)
  await router.load()
  calls.beforeLoad = 0
  calls.loader = 0
  let generation = 0

  const navigate = async () => {
    generation++
    const value = String(generation & 1)
    await router.navigate({
      to: routePath,
      params: Object.fromEntries(paramNames.map((name) => [name, value])),
      replace: true,
    } as any)
  }

  await navigate()
  expect(router.state.matches).toHaveLength(9)
  expect(router.state.matches.at(-1)?.status).toBe('success')
  expect(calls.beforeLoad).toBe(
    work === 'sync-before-load' ||
      work === 'mixed-before-load' ||
      work === 'async-before-load'
      ? 8
      : 0,
  )
  expect(calls.loader).toBe(work === 'sync-loader' ? 8 : 0)

  return async () => {
    for (let iteration = 0; iteration < 10; iteration++) {
      await navigate()
    }
  }
}

async function createRetainedNavigationBatch() {
  const router = createBenchRouter('loaderless', {
    beforeLoad: 0,
    loader: 0,
  })
  await router.load()
  let generation = 0

  const navigate = async () => {
    generation++
    await router.navigate({
      to: routePath,
      params: Object.fromEntries(paramNames.map((name) => [name, '0'])),
      search: { generation },
      replace: true,
    } as any)
  }

  await navigate()
  expect(router.state.matches).toHaveLength(9)
  expect(router.state.matches.at(-1)?.status).toBe('success')

  return async () => {
    for (let iteration = 0; iteration < 10; iteration++) {
      await navigate()
    }
  }
}

describe('client lane synchronous work', async () => {
  const signal = new AbortController().signal
  const synchronousValue = { synchronous: true }
  const synchronousWaits = async () => {
    for (let iteration = 0; iteration < 80; iteration++) {
      await waitFor(synchronousValue, signal)
    }
  }
  const loaderless = await createNavigationBatch('loaderless')
  const retainedLoaderless = await createRetainedNavigationBatch()
  const syncBeforeLoad = await createNavigationBatch('sync-before-load')
  const mixedBeforeLoad = await createNavigationBatch('mixed-before-load')
  const asyncBeforeLoad = await createNavigationBatch('async-before-load')
  const syncLoader = await createNavigationBatch('sync-loader')

  await synchronousWaits()

  bench('80 waits for synchronous values', synchronousWaits, benchOptions)

  bench(
    '10 navigations through 8 eager loaderless routes',
    loaderless,
    benchOptions,
  )

  bench(
    '10 retained loaderless navigations with search changes',
    retainedLoaderless,
    benchOptions,
  )

  bench(
    '10 navigations through 8 synchronous beforeLoad routes',
    syncBeforeLoad,
    benchOptions,
  )

  bench(
    '10 navigations through alternating sync/async beforeLoad routes',
    mixedBeforeLoad,
    benchOptions,
  )

  bench(
    '10 navigations through 8 resolved async beforeLoad routes',
    asyncBeforeLoad,
    benchOptions,
  )

  bench(
    '10 navigations through 8 synchronous loader routes',
    syncLoader,
    benchOptions,
  )
})
