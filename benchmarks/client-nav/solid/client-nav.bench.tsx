import { createEffect } from 'solid-js'
import { render } from 'solid-js/web'
import { bench } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'

import {
  HOOK_COUNT,
  LINK_COUNT,
  TARGET_ID,
  heavySelect,
  parseIntOrZero,
} from '../shared'

function setupBenchmark() {
  const rootRoute = createRootRoute({
    component: () => {
      const selectedParams = Array.from({ length: HOOK_COUNT }, (_, index) =>
        rootRoute.useParams({
          strict: false,
          select: (params) => heavySelect(params.id, index),
        }),
      )

      const selectedSearch = Array.from({ length: HOOK_COUNT }, (_, index) =>
        rootRoute.useSearch({
          strict: false,
          select: (search) => heavySelect(search.n, index + HOOK_COUNT),
        }),
      )

      const rootScore = () => {
        const paramsScore = selectedParams.reduce(
          (sum, accessor) => sum + accessor(),
          0,
        )
        const searchScore = selectedSearch.reduce(
          (sum, accessor) => sum + accessor(),
          0,
        )
        return paramsScore + searchScore
      }

      return (
        <div>
          <div style={{ display: 'none' }}>{rootScore()}</div>
          <div style={{ display: 'none' }}>
            {Array.from({ length: LINK_COUNT }, (_, index) => (
              <Link
                to="/$id"
                params={{ id: String(index) }}
                search={{ n: index }}
              >
                Link {index}
              </Link>
            ))}
          </div>
          <Outlet />
        </div>
      )
    },
  })

  const idRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      n: parseIntOrZero(search.n),
    }),
    component: () => {
      const id = idRoute.useParams({
        select: (params) => parseIntOrZero(params.id),
      })
      const n = idRoute.useSearch({
        select: (search) => parseIntOrZero(search.n),
      })
      const navigate = idRoute.useNavigate()

      createEffect(() => {
        const currentId = id()
        void n()

        if (currentId < TARGET_ID) {
          const next = currentId + 1
          void navigate({
            to: '/$id',
            params: { id: String(next) },
            search: { n: next },
          })
        }
      })

      return null
    },
  })

  const routeTree = rootRoute.addChildren([idRoute])

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/0?n=0'],
    }),
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = render(() => <RouterProvider router={router} />, container)

  const done = new Promise<void>((resolve, reject) => {
    const expectedHref = `/${TARGET_ID}?n=${TARGET_ID}`

    const timeoutId = window.setTimeout(() => {
      reject(
        new Error(
          `Solid benchmark timed out at ${router.state.location.href}; expected ${expectedHref}`,
        ),
      )
    }, 30_000)

    const intervalId = window.setInterval(() => {
      if (router.state.location.href === expectedHref) {
        window.clearTimeout(timeoutId)
        window.clearInterval(intervalId)
        resolve()
      }
    }, 0)
  })

  return {
    done,
    cleanup: () => {
      dispose()
      container.remove()
    },
  }
}

bench('client-nav.solid.100-nav', async () => {
  const { done, cleanup } = setupBenchmark()

  try {
    await done
  } finally {
    cleanup()
  }
})
