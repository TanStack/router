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
  notFound,
} from '../src'
import { createRequestHandler, renderRouterToString } from '../src/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

type NoSsr = 'data-only' | false

type HydrationCase = {
  name: string
  ssr: NoSsr
  path: string
  dashboardLoader?: 'error' | 'notFound'
  /** Server status of each match; `+g` marks the URL not-found flag. */
  payload: Array<string>
  /** Visible once the client load commits. */
  result: string
  /** Gives `/dashboard` a pending component (default `true`). */
  pending?: boolean
}

/** The same application module, evaluated on the server or in the browser. */
function createRouteTree(entry: HydrationCase) {
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
    ssr: entry.ssr,
    validateSearch: (search: Record<string, unknown>) => {
      if ('invalid' in search) {
        throw new Error('invalid search')
      }
      return {}
    },
    loader: () => {
      if (entry.dashboardLoader === 'error') {
        throw new Error('dashboard failed')
      }
      if (entry.dashboardLoader === 'notFound') {
        throw notFound()
      }
      return 'dashboard data'
    },
    ...(entry.pending === false
      ? {}
      : {
          pendingMinMs: 200,
          pendingComponent: () => <div data-testid="skeleton">Loading</div>,
        }),
    errorComponent: () => <p>dashboard error</p>,
    notFoundComponent: () => <p>dashboard not found</p>,
    component: Vue.defineComponent({
      setup() {
        const data = dashboardRoute.useLoaderData()
        return () => (
          <main>
            {data.value}
            <Outlet />
          </main>
        )
      },
    }),
  })
  const childRoute = createRoute({
    getParentRoute: () => dashboardRoute,
    path: '/child',
    loader: () => {
      throw new Error('child failed')
    },
    errorComponent: () => <p>child error</p>,
    component: () => <p>child</p>,
  })
  return rootRoute.addChildren([dashboardRoute.addChildren([childRoute])])
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

async function loadServerDocument(entry: HydrationCase) {
  // `<Html>` / `<Body>` render the server document shell when there is no
  // `window`.
  vi.stubGlobal('window', undefined)
  let html: string
  try {
    const response = await createRequestHandler({
      request: new Request(`http://localhost${entry.path}`),
      createRouter: () =>
        createRouter({ routeTree: createRouteTree(entry), isServer: true }),
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
  window.history.replaceState(null, '', entry.path)
  document.documentElement.innerHTML = serverDocument.documentElement.innerHTML
}

/**
 * Mirrors Vue Start's client entry: hydrate the router, then hydrate the app
 * into `#__app`, then signal hydration completion after mount.
 */
async function hydrateApp(entry: HydrationCase) {
  // `<Body>` allows mismatches below it, which would also hide the route's
  // mismatch warnings. Report them all; only `<Scripts>` may mismatch, where
  // the self-removed bootstrap scripts were.
  document
    .querySelector('#__app > [data-allow-mismatch]')!
    .removeAttribute('data-allow-mismatch')

  const router = createRouter({ routeTree: createRouteTree(entry) })
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
  const hydrationStart = performance.now()
  app.mount('#__app')
  await Vue.nextTick()
  window.$_TSR?.h()
  cleanups.push(async () => {
    app.unmount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    router.history.destroy()
  })
  return { hydrationStart, hydrationWarnings }
}

const hydrationCases: Array<HydrationCase> = [
  {
    name: 'data-only success',
    ssr: 'data-only',
    path: '/dashboard',
    payload: ['success', 'success'],
    result: 'dashboard data',
  },
  {
    name: 'ssr: false success',
    ssr: false,
    path: '/dashboard',
    payload: ['success', 'pending'],
    result: 'dashboard data',
  },
  {
    name: 'data-only loader error',
    ssr: 'data-only',
    path: '/dashboard',
    dashboardLoader: 'error',
    payload: ['success', 'error'],
    result: 'dashboard error',
  },
  {
    name: 'data-only loader notFound',
    ssr: 'data-only',
    path: '/dashboard',
    dashboardLoader: 'notFound',
    payload: ['success', 'notFound'],
    result: 'dashboard not found',
  },
  {
    name: 'data-only unmatched URL',
    ssr: 'data-only',
    path: '/dashboard/missing',
    payload: ['success', 'success+g'],
    result: 'dashboard not found',
  },
  {
    name: 'ssr: false invalid search',
    ssr: false,
    path: '/dashboard?invalid=1',
    payload: ['success', 'error'],
    result: 'dashboard error',
  },
  {
    name: 'ssr: false unmatched URL',
    ssr: false,
    path: '/dashboard/missing',
    payload: ['success', 'pending+g'],
    result: 'dashboard not found',
  },
  {
    name: 'data-only child loader error',
    ssr: 'data-only',
    path: '/dashboard/child',
    payload: ['success', 'success', 'error'],
    result: 'dashboard datachild error',
  },
]

describe('a no-SSR boundary keeps its server-rendered pending component through hydration (#8640)', () => {
  test.each(hydrationCases)('$name', async (entry) => {
    await loadServerDocument(entry)

    expect(
      window.$_TSR!.router!.matches.map(
        (match) => `${match.s}${match.g ? '+g' : ''}`,
      ),
    ).toEqual(entry.payload)
    const serverSkeleton = document.querySelector('[data-testid="skeleton"]')
    expect(serverSkeleton).not.toBeNull()
    expect(document.body).not.toHaveTextContent(entry.result)

    // Every skeleton node that ever enters the document.
    const skeletons = new Set<Element>([serverSkeleton!])
    let skeletonRemovedAt: number | undefined
    const observer = new MutationObserver(() => {
      document
        .querySelectorAll('[data-testid="skeleton"]')
        .forEach((node) => skeletons.add(node))
      if (!serverSkeleton!.isConnected) {
        skeletonRemovedAt ??= performance.now()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
    cleanups.push(() => observer.disconnect())

    const { hydrationStart, hydrationWarnings } = await hydrateApp(entry)

    await waitFor(() => expect(document.body).toHaveTextContent(entry.result), {
      timeout: 2000,
    })

    expect(hydrationWarnings).toEqual([])
    // Hydration adopts the server's pending UI and holds it for
    // `pendingMinMs`. Vue may not report a mismatch, so also check when the
    // server HTML was replaced.
    expect(skeletonRemovedAt! - hydrationStart).toBeGreaterThanOrEqual(150)
    // The hydrated server skeleton is the only one: it must not be hidden or
    // replaced by a second copy.
    expect([...skeletons]).toEqual([serverSkeleton])
    expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
  })
})

// Without a pending component nothing holds the boundary pending, so the client
// load can commit before the boundary hydrates. Hydration must still match the
// server HTML.
describe('a no-SSR boundary without a pending component hydrates without a mismatch', () => {
  test.each(hydrationCases)('$name', async (caseWithPending) => {
    const entry = { ...caseWithPending, pending: false }
    await loadServerDocument(entry)

    expect(
      window.$_TSR!.router!.matches.map(
        (match) => `${match.s}${match.g ? '+g' : ''}`,
      ),
    ).toEqual(entry.payload)
    expect(document.body).not.toHaveTextContent(entry.result)

    const { hydrationWarnings } = await hydrateApp(entry)

    await waitFor(() => expect(document.body).toHaveTextContent(entry.result), {
      timeout: 2000,
    })
    // Let late boundaries finish hydrating.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(hydrationWarnings).toEqual([])
  })
})
