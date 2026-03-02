import { cleanup, render } from '@testing-library/vue'
import { bench, describe } from 'vitest'
import * as Vue from 'vue'
import { rootRouteId } from '@tanstack/router-core'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/vue-router'
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

  const Params = Vue.defineComponent({
    setup() {
      const params = useParams({
        strict: false,
        select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
      })

      return () => {
        void params.value
        return null
      }
    },
  })

  const Search = Vue.defineComponent({
    setup() {
      const search = useSearch({
        strict: false,
        select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
      })

      return () => {
        void search.value
        return null
      }
    },
  })

  const Links = Vue.defineComponent({
    setup() {
      return () => (
        <Link
          to="/$id"
          params={{ id: '0' }}
          search={{ id: '0' }}
        >
          Link
        </Link>
      )
    },
  })

  const Root = Vue.defineComponent({
    setup() {
      return () => (
        <>
          {selectors.map((selector) => (
            <Params key={`params-${selector}`} />
          ))}
          {selectors.map((selector) => (
            <Search key={`search-${selector}`} />
          ))}
          {selectors.map((selector) => (
            <Links key={`link-${selector}`} />
          ))}
          <Outlet />
        </>
      )
    },
  })

  const root = createRootRoute({
    component: Root as any,
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

  bench('navigate', () => next(), {
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
      await router.load()
    },
    teardown: () => {
      cleanup()
      unsub()
    },
  })
})
