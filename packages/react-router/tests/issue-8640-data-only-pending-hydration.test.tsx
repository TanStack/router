import * as React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type * as RouterModule from '../src'
import type * as ClientModule from '../src/ssr/client'
import type * as ServerModule from '../src/ssr/server'

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

type Framework = typeof RouterModule & typeof ClientModule & typeof ServerModule

/**
 * `RouterClient` starts hydration once per module instance, i.e. once per page
 * load. Boot a fresh copy of the framework for every simulated page load.
 */
async function loadFramework(): Promise<Framework> {
  vi.resetModules()
  const [router, client, server] = await Promise.all([
    import('../src'),
    import('../src/ssr/client'),
    import('../src/ssr/server'),
  ])
  return { ...router, ...client, ...server }
}

/** The same application module, evaluated on the server or in the browser. */
function createRouteTree(fw: Framework, entry: HydrationCase) {
  const rootRoute = fw.createRootRoute({
    component: () => (
      <html>
        <head>
          <fw.HeadContent />
        </head>
        <body>
          <fw.Outlet />
          <fw.Scripts />
        </body>
      </html>
    ),
  })
  const dashboardRoute = fw.createRoute({
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
        throw fw.notFound()
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
    component: function Dashboard() {
      return (
        <main>
          {dashboardRoute.useLoaderData()}
          <fw.Outlet />
        </main>
      )
    },
  })
  const childRoute = fw.createRoute({
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

const cleanups: Array<() => unknown> = []

beforeEach(() => {
  // Hydration runs as in a browser, outside `act`.
  // @ts-expect-error
  global.IS_REACT_ACT_ENVIRONMENT = false
})

afterEach(async () => {
  // @ts-expect-error
  global.IS_REACT_ACT_ENVIRONMENT = true
  while (cleanups.length) {
    await cleanups.pop()!()
  }
  vi.restoreAllMocks()
  delete window.$_TSR
  document.documentElement.innerHTML = '<head></head><body></body>'
  window.history.replaceState(null, '', '/')
})

async function loadServerDocument(fw: Framework, entry: HydrationCase) {
  const response = await fw.createRequestHandler({
    request: new Request(`http://localhost${entry.path}`),
    createRouter: () =>
      fw.createRouter({
        routeTree: createRouteTree(fw, entry),
        isServer: true,
      }),
  })(({ router, responseHeaders }) =>
    fw.renderRouterToString({
      router,
      responseHeaders,
      children: <fw.RouterServer router={router} />,
    }),
  )
  const serverDocument = new DOMParser().parseFromString(
    await response.text(),
    'text/html',
  )
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
    const fw = await loadFramework()
    await loadServerDocument(fw, entry)

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

    const router = fw.createRouter({ routeTree: createRouteTree(fw, entry) })
    const recoverableErrors: Array<unknown> = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hydrationStart = performance.now()
    const root = hydrateRoot(document, <fw.RouterClient router={router} />, {
      onRecoverableError: (error) => {
        recoverableErrors.push(error)
      },
    })
    cleanups.push(async () => {
      root.unmount()
      await new Promise((resolve) => setTimeout(resolve, 20))
      router.history.destroy()
    })

    await waitFor(() => expect(document.body).toHaveTextContent(entry.result), {
      timeout: 2000,
    })

    // Hydration adopts the server's pending UI and holds it for
    // `pendingMinMs`. Frameworks may not report a mismatch (an error boundary
    // can silently replace the server HTML), so check when it was replaced.
    expect(skeletonRemovedAt! - hydrationStart).toBeGreaterThanOrEqual(150)
    expect(recoverableErrors).toEqual([])
    // The hydrated server skeleton is the only one: it must not be hidden or
    // replaced by a second copy.
    expect([...skeletons]).toEqual([serverSkeleton])
    expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
  })
})

// Without a pending component nothing holds the boundary pending, so the client
// load can commit before React hydrates the boundary. Hydration must still
// match the server HTML.
describe('a no-SSR boundary without a pending component hydrates without a mismatch', () => {
  test.each(hydrationCases)('$name', async (caseWithPending) => {
    const entry = { ...caseWithPending, pending: false }
    const fw = await loadFramework()
    await loadServerDocument(fw, entry)

    expect(
      window.$_TSR!.router!.matches.map(
        (match) => `${match.s}${match.g ? '+g' : ''}`,
      ),
    ).toEqual(entry.payload)
    expect(document.body).not.toHaveTextContent(entry.result)

    const router = fw.createRouter({ routeTree: createRouteTree(fw, entry) })
    const recoverableErrors: Array<string> = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = hydrateRoot(document, <fw.RouterClient router={router} />, {
      onRecoverableError: (error) => {
        recoverableErrors.push(
          error instanceof Error ? error.message : String(error),
        )
      },
    })
    cleanups.push(async () => {
      root.unmount()
      await new Promise((resolve) => setTimeout(resolve, 20))
      router.history.destroy()
    })

    await waitFor(() => expect(document.body).toHaveTextContent(entry.result), {
      timeout: 2000,
    })
    // Let late boundaries finish hydrating.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(recoverableErrors).toEqual([])
  })
})

test('client navigation within a data-only route keeps the route component mounted', async () => {
  let mounts = 0
  const rootRoute = createRootRoute({ component: Outlet })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    ssr: 'data-only',
    loader: ({ params }) =>
      new Promise<string>((resolve) =>
        setTimeout(() => resolve(`item ${params.id}`), 50),
      ),
    pendingMs: 0,
    pendingComponent: () => <div data-testid="pending">Loading</div>,
    component: function Item() {
      const [count, setCount] = React.useState(0)
      React.useEffect(() => {
        mounts++
      }, [])
      return (
        <button onClick={() => setCount((value) => value + 1)}>
          {itemRoute.useLoaderData()} count={count}
        </button>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/1'] }),
  })
  const { findByTestId, findByText, unmount } = render(
    <RouterProvider router={router} />,
  )
  cleanups.push(unmount)

  fireEvent.click(await findByText('item 1 count=0'))
  await findByText('item 1 count=1')
  const navigation = router.navigate({ to: '/items/$id', params: { id: '2' } })
  await findByTestId('pending')
  await navigation

  // Only the hydrated fallback is held; later pending states still suspend,
  // which keeps the route component's state.
  await findByText('item 2 count=1')
  expect(mounts).toBe(1)
})
