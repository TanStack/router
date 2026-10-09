import * as React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
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

function createRouteTree(fw: Framework, ssr: NoSsr) {
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
    ssr,
    loader: () => 'dashboard data',
    pendingMinMs: 200,
    pendingComponent: () => <div data-testid="skeleton">Loading</div>,
    component: function Dashboard() {
      return <main data-testid="content">{dashboardRoute.useLoaderData()}</main>
    },
  })
  return rootRoute.addChildren([dashboardRoute])
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

async function loadServerDocument(fw: Framework, path: string, ssr: NoSsr) {
  const response = await fw.createRequestHandler({
    request: new Request(`http://localhost${path}`),
    createRouter: () =>
      fw.createRouter({ routeTree: createRouteTree(fw, ssr), isServer: true }),
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
  window.history.replaceState(null, '', path)
  document.documentElement.innerHTML = serverDocument.documentElement.innerHTML
}

test.each([['data-only'], [false]] as const)(
  'ssr: %s keeps the server-rendered pending component through pendingMinMs (#8640)',
  async (ssr) => {
    const fw = await loadFramework()
    await loadServerDocument(fw, '/dashboard', ssr)

    const serverSkeleton = document.querySelector('[data-testid="skeleton"]')
    expect(serverSkeleton).not.toBeNull()
    expect(document.querySelector('[data-testid="content"]')).toBeNull()

    // Every skeleton node that ever enters the document.
    const skeletons = new Set<Element>([serverSkeleton!])
    const observer = new MutationObserver(() => {
      document
        .querySelectorAll('[data-testid="skeleton"]')
        .forEach((node) => skeletons.add(node))
    })
    observer.observe(document, { childList: true, subtree: true })
    cleanups.push(() => observer.disconnect())

    const router = fw.createRouter({ routeTree: createRouteTree(fw, ssr) })
    const recoverableErrors: Array<unknown> = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
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

    await waitFor(
      () =>
        expect(
          document.querySelector('[data-testid="content"]'),
        ).toHaveTextContent('dashboard data'),
      { timeout: 2000 },
    )

    expect(recoverableErrors).toEqual([])
    // The hydrated server skeleton is the only one: React must not hide it and
    // mount a second copy from the Suspense fallback.
    expect([...skeletons]).toEqual([serverSkeleton])
    expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
  },
)

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
