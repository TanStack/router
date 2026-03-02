import { cleanup, render } from '@solidjs/testing-library'
import { createEffect } from 'solid-js'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/solid-router'
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
      strict: false,
      select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
    })

    createEffect(() => {
      void params()
    })

    return null
  }

  function Search() {
    const search = useSearch({
      strict: false,
      select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
    })

    createEffect(() => {
      void search()
    })

    return null
  }

  function Root() {
    return (
      <>
        {selectors.map(() => (
          <Params />
        ))}
        {selectors.map(() => (
          <Search />
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
    component: () => {
      console.time('render')
      return <div />
    },
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
  let router: ReturnType<typeof createTestRouter>
  let unsub = () => { }
  let next: () => Promise<void> = () => Promise.reject()

  beforeAll(async () => {
    id = 0
    router = createTestRouter()
    let resolveRendered: () => void = () => { }
    unsub = router.subscribe('onRendered', () => {
      resolveRendered()
    })

    const navigate = (opts: NavigateOptions) =>
      new Promise<void>((resolveNext) => {
        resolveRendered = resolveNext
        router.navigate(opts)
      })

    next = () => {
      const nextId = String(id++)

      return navigate({
        to: '/$id',
        params: { id: nextId },
        search: { id: nextId },
        replace: true,
      })
    }

    render(() => <RouterProvider router={router} />)
    await router.load()
  })

  afterAll(() => {
    cleanup()
    unsub()
  })

  bench('navigate', () => next(), {
    warmupIterations: 1,
    iterations: 100,
  })
})
