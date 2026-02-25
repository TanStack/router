import { render } from '@solidjs/testing-library'
import { bench } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/solid-router'

import {
  HOOK_COUNT,
  LINK_COUNT,
  TARGET_ID,
  TIMEOUT,
  heavySelect,
  parseIntOrZero,
} from '../shared'

function BenchmarkComponent() {
  const selectedParams = Array.from({ length: HOOK_COUNT }, (_, index) =>
    useParams({
      from: '/$id',
      strict: false,
      shouldThrow: false,
      select: (params) => heavySelect(params.id, index),
    }),
  )

  const selectedSearch = Array.from({ length: HOOK_COUNT }, (_, index) =>
    useSearch({
      from: '/$id',
      strict: false,
      shouldThrow: false,
      select: (search) => heavySelect(search.n, index + HOOK_COUNT),
    }),
  )

  const selectedId = useParams({
    from: '/$id',
    strict: false,
    shouldThrow: false,
    select: (params) => parseIntOrZero(params.id),
  })

  const selectedN = useSearch({
    from: '/$id',
    strict: false,
    shouldThrow: false,
    select: (search) => parseIntOrZero(search.n),
  })

  const rootScore = () => {
    const paramsScore = selectedParams.reduce(
      (sum, accessor) => sum + accessor(),
      0,
    )
    const searchScore = selectedSearch.reduce(
      (sum, accessor) => sum + accessor(),
      0,
    )
    return paramsScore + searchScore + selectedId() + selectedN()
  }

  return (
    <div>
      <div style={{ display: 'none' }}>{rootScore()}</div>
      <div style={{ display: 'none' }}>
        {Array.from({ length: LINK_COUNT }, (_, index) => (
          <Link to="/$id" params={{ id: String(index) }} search={{ n: index }}>
            Link {index}
          </Link>
        ))}
      </div>
    </div>
  )
}

function setupBenchmark() {
  const rootRoute = createRootRoute()
  const idRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      n: parseIntOrZero(search.n),
    }),
  })

  const routeTree = rootRoute.addChildren([idRoute])

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/0?n=0'],
    }),
  })

  const mounted = render(() => (
    <RouterContextProvider router={router}>
      {() => <BenchmarkComponent />}
    </RouterContextProvider>
  ))

  const done = new Promise<void>((resolve, reject) => {
    const expectedHref = `/${TARGET_ID}?n=${TARGET_ID}`

    const timeoutId = window.setTimeout(() => {
      reject(
        new Error(
          `Solid benchmark timed out at ${router.state.location.href}; expected ${expectedHref}`,
        ),
      )
    }, TIMEOUT)

    void (async () => {
      try {
        await router.load()

        for (let next = 1; next <= TARGET_ID; next++) {
          await router.navigate({
            to: '/$id',
            params: { id: String(next) },
            search: { n: next },
          })
        }

        if (router.state.location.href !== expectedHref) {
          reject(
            new Error(
              `Solid benchmark stopped at ${router.state.location.href}; expected ${expectedHref}`,
            ),
          )
          return
        }

        resolve()
      } catch (error) {
        reject(error)
      } finally {
        window.clearTimeout(timeoutId)
      }
    })()
  })

  return {
    done,
    cleanup: () => {
      mounted.unmount()
    },
  }
}

bench(
  'client-nav.solid.10-nav',
  async () => {
    const { done, cleanup } = setupBenchmark()

    try {
      await done
    } finally {
      cleanup()
    }
  },
  {
    throws: true,
  },
)
