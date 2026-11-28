import * as Vue from 'vue'
import { waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  Body,
  Html,
  Outlet,
  RouterProvider,
  Scripts,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { createRequestHandler, renderRouterToString } from '../src/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

type NavigationCase = {
  ssr: 'data-only' | false
  pending: boolean
}

let mounts = 0

/**
 * The same application module, evaluated on the server or in the browser.
 * Start's client build removes the `ssr` option, so only the server has it.
 */
function createRouteTree(entry: NavigationCase, env: 'server' | 'client') {
  // No `<head>` children: once mounted, `<Html>` teleports them and wraps its
  // body in a new Fragment, which remounts the whole hydrated subtree.
  const rootRoute = createRootRoute({
    component: () => (
      <Html>
        <Body>
          <Outlet />
          <Scripts />
        </Body>
      </Html>
    ),
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    ...(env === 'server' ? { ssr: entry.ssr } : {}),
    loader: ({ params }) => `item ${params.id}`,
    ...(entry.pending
      ? { pendingComponent: () => <p data-testid="pending">Loading</p> }
      : {}),
    component: Vue.defineComponent({
      setup() {
        const data = itemRoute.useLoaderData()
        const count = Vue.ref(0)
        Vue.onMounted(() => {
          mounts++
        })
        return () => (
          <button data-testid="item" onClick={() => count.value++}>
            {data.value} count={count.value}
          </button>
        )
      },
    }),
  })
  return rootRoute.addChildren([itemRoute])
}

// The same app component on both sides, as in Vue Start's default entries
// (`StartServer` / `StartClient` both render `<RouterProvider>`).
const App = Vue.defineComponent({
  props: {
    router: { type: Object as () => AnyRouter, required: true },
  },
  setup(props) {
    return () => <RouterProvider router={props.router} />
  },
})

const cleanups: Array<() => unknown> = []

afterEach(async () => {
  while (cleanups.length) {
    await cleanups.pop()!()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.$_TSR
  document.documentElement.innerHTML = '<head></head><body></body>'
  window.history.replaceState(null, '', '/')
})

async function loadServerDocument(entry: NavigationCase, path: string) {
  // `<Html>` / `<Body>` render the server document shell when there is no
  // `window`.
  vi.stubGlobal('window', undefined)
  let html: string
  try {
    const response = await createRequestHandler({
      request: new Request(`http://localhost${path}`),
      createRouter: () =>
        createRouter({
          routeTree: createRouteTree(entry, 'server'),
          isServer: true,
        }),
    })(({ router, responseHeaders }) =>
      renderRouterToString({ router, responseHeaders, App }),
    )
    html = await response.text()
  } finally {
    vi.unstubAllGlobals()
  }
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')
  // The SSR bootstrap scripts run, then remove themselves, before the client
  // entry hydrates.
  const currentScript = vi.spyOn(document, 'currentScript', 'get')
  for (const script of serverDocument.querySelectorAll('script')) {
    currentScript.mockReturnValue(script)
    new Function(script.textContent ?? '')()
    script.remove()
  }
  currentScript.mockRestore()
  window.history.replaceState(null, '', path)
  document.documentElement.innerHTML = serverDocument.documentElement.innerHTML
}

const item = () => document.querySelector('[data-testid="item"]')

describe('a hydrated no-SSR route keeps its component across param navigations', () => {
  test.each([
    { ssr: 'data-only', pending: true },
    { ssr: 'data-only', pending: false },
    { ssr: false, pending: true },
    { ssr: false, pending: false },
  ] as Array<NavigationCase>)(
    'ssr: $ssr, pendingComponent: $pending',
    async (entry) => {
      mounts = 0
      await loadServerDocument(entry, '/items/1')
      expect(item()).toBeNull()

      // `<Body>` allows mismatches below it, which would also hide the route's
      // mismatch warnings. Report them all; only `<Scripts>` may mismatch,
      // where the self-removed bootstrap scripts were.
      document
        .querySelector('#__app > [data-allow-mismatch]')!
        .removeAttribute('data-allow-mismatch')

      // Mirrors Vue Start's client entry: hydrate the router, then hydrate the
      // app into `#__app`, then signal hydration completion after mount.
      const router = createRouter({
        routeTree: createRouteTree(entry, 'client'),
      })
      await hydrate(router)
      const app = Vue.createSSRApp(App, { router })
      const hydrationWarnings: Array<string> = []
      app.config.warnHandler = (msg, _instance, trace) => {
        if (msg.includes('Hydration') && !trace.includes('<Scripts>')) {
          hydrationWarnings.push(`${msg}${trace}`)
        }
      }
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      app.mount('#__app')
      await Vue.nextTick()
      window.$_TSR?.h()
      cleanups.push(async () => {
        app.unmount()
        await new Promise((resolve) => setTimeout(resolve, 20))
        router.history.destroy()
      })

      await waitFor(() => expect(item()).toHaveTextContent('item 1 count=0'))
      ;(item() as HTMLElement).click()
      await waitFor(() => expect(item()).toHaveTextContent('item 1 count=1'))

      await router.navigate({ to: '/items/$id', params: { id: '2' } })

      // A param navigation creates a new match on the client. The route
      // component keeps its state, as it does for an SSR route.
      await waitFor(() => expect(item()).toHaveTextContent('item 2 count=1'))
      expect(mounts).toBe(1)
      expect(hydrationWarnings).toEqual([])
    },
  )
})
