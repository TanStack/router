import * as React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
} from '../src'

const hotSelectorCount = 1200
const crossRouteSelectorCount = 150
const coldSelectorCount = 80
const navigationsPerIteration = 200

const coldRouteIds = Array.from(
  { length: coldSelectorCount },
  (_, index) => `/__missing-${index}`,
)

function resolveOnMicrotask<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve(value))
  })
}

function ByIdReader() {
  useMatch({
    from: '/$id',
    shouldThrow: false,
    select: (match) => match.params.id,
  })

  return null
}

function SearchReader() {
  useMatch({
    from: '/a',
    shouldThrow: false,
    select: (match) => match.search.foo,
  })

  return null
}

function ColdReader({ routeId }: { routeId: string }) {
  useMatch({
    from: routeId as any,
    shouldThrow: false,
  })

  return null
}

function createBenchRouter(
  readers: React.ReactNode,
  initialEntry: string,
): ReturnType<typeof createRouter> {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {readers}
        <Outlet />
      </>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })

  const byIdRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$id',
    beforeLoad: async () => {
      await resolveOnMicrotask(undefined)
    },
    loader: async ({ params }) => resolveOnMicrotask(params.id),
    component: () => null,
  })

  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'a',
    validateSearch: (search: Record<string, unknown>) => ({
      foo: Number(search.foo ?? 0),
    }),
    beforeLoad: async () => {
      await resolveOnMicrotask(undefined)
    },
    loader: async () => resolveOnMicrotask(undefined),
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([indexRoute, byIdRoute, searchRoute])

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })
}

function readers(options: { hotRoute: '/$id' | '/a' }) {
  const hot = options.hotRoute === '/$id'

  return (
    <>
      {Array.from({ length: hot ? hotSelectorCount : crossRouteSelectorCount }).map(
        (_, index) => (
          <ByIdReader key={`id-${index}`} />
        ),
      )}
      {Array.from({ length: hot ? crossRouteSelectorCount : hotSelectorCount }).map(
        (_, index) => (
          <SearchReader key={`search-${index}`} />
        ),
      )}
      {coldRouteIds.map((routeId) => (
        <ColdReader key={routeId} routeId={routeId} />
      ))}
    </>
  )
}

describe('match selector churn', () => {
  describe('new page churn', () => {
    const router = createBenchRouter(readers({ hotRoute: '/$id' }), '/1')
    let id = 2

    beforeAll(async () => {
      render(<RouterProvider router={router} />)
      await router.load()
    })

    afterAll(() => {
      cleanup()
    })

    bench(
      'navigate({ to: "/$id" })',
      async () => {
        for (let i = 0; i < navigationsPerIteration; i++) {
          await router.navigate({
            to: '/$id',
            params: { id: String(id++) },
          })
        }
      },
      { warmupIterations: 1 },
    )
  })

  describe('same page churn', () => {
    const router = createBenchRouter(readers({ hotRoute: '/a' }), '/a')
    let foo = 0

    beforeAll(async () => {
      render(<RouterProvider router={router} />)
      await router.load()
    })

    afterAll(() => {
      cleanup()
    })

    bench(
      'navigate({ to: "/a" })',
      async () => {
        for (let i = 0; i < navigationsPerIteration; i++) {
          await router.navigate({
            to: '/a',
            search: { foo: foo++ },
          })
        }
      },
      { warmupIterations: 1 },
    )
  })
})
