import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { bench, describe } from 'vitest'
import { rootRouteId } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import type { NavigateOptions } from '@tanstack/router-core'

function createTestRouter() {
  function runPerfSelectorComputation(seed: number) {
    let value = Math.trunc(seed) | 0

    for (let index = 0; index < 100; index++) {
      value = (value * 1664525 + 1013904223 + index) >>> 0
    }

    return value
  }

  const selectors = Array.from({ length: 20 }, (_, index) => index)

  function Params() {
    const params = useParams({
      from: rootRouteId,
      select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
    })
    void params
    return null
  }

  function Search() {
    const search = useSearch({
      from: rootRouteId,
      select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
    })
    void search
    return null
  }

  function Root() {
    return (
      <>
        {selectors.map((selector) => (
          <Params key={selector} />
        ))}
        {selectors.map((selector) => (
          <Search key={selector} />
        ))}
        <Outlet />
      </>
    )
  }

  const root = createRootRoute({
    component: Root,
  })

  const route = createRoute({
    getParentRoute: () => root,
    path: '/$id',
    component: () => <div />,
  })

  return createRouter({
    history: createMemoryHistory({
      initialEntries: ['/0'],
    }),
    scrollRestoration: true,
    routeTree: root.addChildren([route]),
  })
}

describe('speed', () => {
  let id = 0
  const router = createTestRouter()
  let unsub = () => {}
  let next: () => Promise<void> = () => Promise.reject()

  bench('navigate', () => act(next), {
    warmupIterations: 1000,
    time: 10_000,
    setup: async () => {
      id = 0
      let resolve: () => void = () => {}
      unsub = router.subscribe('onRendered', () => resolve())

      const navigate = (opts: NavigateOptions) =>
        new Promise<void>((resolveNext) => {
          resolve = resolveNext
          router.navigate(opts)
        })

      next = () => {
        const nextId = id++

        return navigate({
          to: '/$id',
          params: { id: nextId },
          search: { id: nextId },
          replace: true,
        })
      }

      render(<RouterProvider router={router} />)
      await act(() => router.load())
    },
    teardown: () => {
      cleanup()
      unsub()
    },
  })
})
