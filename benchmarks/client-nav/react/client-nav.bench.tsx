import { createRoot } from 'react-dom/client'
import { bench } from 'vitest'
import { useEffect } from 'react'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

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

      const links = Array.from({ length: LINK_COUNT }, (_, index) => (
        <Link
          key={index}
          to="/$id"
          params={{ id: String(index) }}
          search={{ n: index }}
        >
          Link {index}
        </Link>
      ))

      const rootScore =
        selectedParams.reduce((sum, value) => sum + value, 0) +
        selectedSearch.reduce((sum, value) => sum + value, 0)

      return (
        <div>
          <div style={{ display: 'none' }}>{rootScore}</div>
          <div style={{ display: 'none' }}>{links}</div>
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

      useEffect(() => {
        if (id < TARGET_ID) {
          const next = id + 1
          void navigate({
            to: '/$id',
            params: { id: String(next) },
            search: { n: next },
          })
        }
      }, [id, n, navigate])

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
  const reactRoot = createRoot(container)

  reactRoot.render(<RouterProvider router={router} />)

  const done = new Promise<void>((resolve, reject) => {
    const expectedHref = `/${TARGET_ID}?n=${TARGET_ID}`

    const timeoutId = window.setTimeout(() => {
      reject(
        new Error(
          `React benchmark timed out at ${router.state.location.href}; expected ${expectedHref}`,
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
      reactRoot.unmount()
      container.remove()
    },
  }
}

bench('client-nav.react.100-nav', async () => {
  const { done, cleanup } = setupBenchmark()

  try {
    await done
  } finally {
    cleanup()
  }
})
