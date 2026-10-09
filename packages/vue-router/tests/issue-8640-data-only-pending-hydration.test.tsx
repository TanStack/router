import * as Vue from 'vue'
import { waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
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

function createRouteTree() {
  // No `<head>` children: once mounted, `<Html>` teleports them and wraps its
  // body in a new Fragment, which remounts the whole hydrated subtree
  // independently of this issue.
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
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    ssr: 'data-only',
    loader: () => 'dashboard data',
    pendingMinMs: 200,
    pendingComponent: () => <div data-testid="skeleton">Loading</div>,
    component: Vue.defineComponent({
      setup() {
        const data = dashboardRoute.useLoaderData()
        return () => <main data-testid="content">{data.value}</main>
      },
    }),
  })
  return rootRoute.addChildren([dashboardRoute])
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

async function loadServerDocument(path: string) {
  // `<Html>` / `<Body>` render the server document shell when there is no
  // `window`.
  vi.stubGlobal('window', undefined)
  let html: string
  try {
    const response = await createRequestHandler({
      request: new Request(`http://localhost${path}`),
      createRouter: () =>
        createRouter({ routeTree: createRouteTree(), isServer: true }),
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

test('a data-only route keeps its server-rendered pending component through pendingMinMs (#8640)', async () => {
  await loadServerDocument('/dashboard')

  const serverSkeleton = document.querySelector('[data-testid="skeleton"]')
  expect(serverSkeleton).not.toBeNull()
  expect(document.querySelector('[data-testid="content"]')).toBeNull()

  // Every skeleton node that ever enters the document, the most that are in
  // it at once, and whether the server one left before the content arrived.
  const skeletons = new Set<Element>([serverSkeleton!])
  let maxSimultaneousSkeletons = 1
  let serverSkeletonDetachedBeforeContent = false
  const observer = new MutationObserver(() => {
    const current = document.querySelectorAll('[data-testid="skeleton"]')
    maxSimultaneousSkeletons = Math.max(
      maxSimultaneousSkeletons,
      current.length,
    )
    current.forEach((node) => skeletons.add(node))
    if (
      !serverSkeleton!.isConnected &&
      !document.querySelector('[data-testid="content"]')
    ) {
      serverSkeletonDetachedBeforeContent = true
    }
  })
  observer.observe(document, { childList: true, subtree: true })
  cleanups.push(() => observer.disconnect())

  // Mirrors Vue Start's client entry: hydrate the router, then hydrate the app
  // into `#__app`, then signal hydration completion after mount.
  const router = createRouter({ routeTree: createRouteTree() })
  await hydrate(router)
  const app = Vue.createSSRApp(App, { router })
  const hydrationWarnings: Array<string> = []
  app.config.warnHandler = (msg, _instance, trace) => {
    if (msg.includes('Hydration')) {
      hydrationWarnings.push(`${msg}${trace}`)
    }
  }
  // `<Scripts>` renders placeholder scripts where the self-removed bootstrap
  // scripts were; that mismatch is expected and allowed (`data-allow-mismatch`),
  // but Vue still logs "Hydration completed but contains mismatches.".
  vi.spyOn(console, 'error').mockImplementation(() => {})
  app.mount('#__app')
  // Hydration adopted the server skeleton.
  expect(serverSkeleton!.isConnected).toBe(true)
  await Vue.nextTick()
  window.$_TSR?.h()
  cleanups.push(async () => {
    app.unmount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    router.history.destroy()
  })

  await waitFor(
    () =>
      expect(
        document.querySelector('[data-testid="content"]'),
      ).toHaveTextContent('dashboard data'),
    { timeout: 2000 },
  )

  expect(hydrationWarnings).toEqual([])
  expect(maxSimultaneousSkeletons).toBe(1)
  // The hydrated server skeleton is the only one, and it stays mounted until
  // the route content replaces it.
  expect([...skeletons]).toEqual([serverSkeleton])
  expect(serverSkeletonDetachedBeforeContent).toBe(false)
  expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
})
