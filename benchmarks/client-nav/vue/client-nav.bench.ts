import { createApp, defineComponent, h, watchEffect } from 'vue'
import { bench } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'

import {
  HOOK_COUNT,
  LINK_COUNT,
  TARGET_ID,
  TIMEOUT,
  heavySelect,
  parseIntOrZero,
} from '../shared'

function setupBenchmark() {
  const RootComponent = defineComponent(() => {
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

    return () => {
      const rootScore =
        selectedParams.reduce((sum, current) => sum + current.value, 0) +
        selectedSearch.reduce((sum, current) => sum + current.value, 0)

      return h('div', [
        h('div', { style: 'display: none' }, String(rootScore)),
        h(
          'div',
          { style: 'display: none' },
          Array.from({ length: LINK_COUNT }, (_, index) =>
            h(
              Link,
              {
                to: '/$id',
                params: { id: String(index) },
                search: { n: index },
              },
              {
                default: () => `Link ${index}`,
              },
            ),
          ),
        ),
        h(Outlet),
      ])
    }
  })

  const IdComponent = defineComponent(() => {
    const id = idRoute.useParams({
      select: (params) => parseIntOrZero(params.id),
    })
    const n = idRoute.useSearch({
      select: (search) => parseIntOrZero(search.n),
    })
    const navigate = idRoute.useNavigate()

    watchEffect(() => {
      const currentId = id.value
      void n.value

      if (currentId < TARGET_ID) {
        const next = currentId + 1
        void navigate({
          to: '/$id',
          params: { id: String(next) },
          search: { n: next },
        })
      }
    })

    return () => null
  })

  const rootRoute = createRootRoute({ component: RootComponent })
  const idRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      n: parseIntOrZero(search.n),
    }),
    component: IdComponent,
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

  const app = createApp({
    render: () => h(RouterProvider, { router }),
  })

  app.mount(container)

  const done = new Promise<void>((resolve, reject) => {
    const expectedHref = `/${TARGET_ID}?n=${TARGET_ID}`

    let settled = false
    let unsubscribe = () => {}

    const settle = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      unsubscribe()

      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }

    const timeoutId = window.setTimeout(() => {
      settle(
        new Error(
          `Vue benchmark timed out at ${router.state.location.href}; expected ${expectedHref}`,
        ),
      )
    }, TIMEOUT)

    unsubscribe = router.subscribe('onResolved', (event) => {
      if (event.toLocation.href === expectedHref) {
        settle()
      }
    })

    if (router.state.location.href === expectedHref) {
      settle()
    }
  })

  return {
    done,
    cleanup: () => {
      app.unmount()
      container.remove()
    },
  }
}

bench(
  'client-nav.vue.10-nav',
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
