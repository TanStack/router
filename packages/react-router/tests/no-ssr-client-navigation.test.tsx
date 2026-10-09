import * as React from 'react'
import { fireEvent, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type * as RouterModule from '../src'
import type * as ClientModule from '../src/ssr/client'
import type * as ServerModule from '../src/ssr/server'

type Framework = typeof RouterModule & typeof ClientModule & typeof ServerModule

type NavigationCase = {
  ssr: 'data-only' | false
  pending: boolean
}

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

let mounts = 0

/**
 * The same application module, evaluated on the server or in the browser.
 * Start's client build removes the `ssr` option, so only the server has it.
 */
function createRouteTree(
  fw: Framework,
  entry: NavigationCase,
  env: 'server' | 'client',
) {
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
  const itemRoute = fw.createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    ...(env === 'server' ? { ssr: entry.ssr } : {}),
    loader: ({ params }) => `item ${params.id}`,
    ...(entry.pending
      ? { pendingComponent: () => <p data-testid="pending">Loading</p> }
      : {}),
    component: function Item() {
      const [count, setCount] = React.useState(0)
      React.useEffect(() => {
        mounts++
      }, [])
      return (
        <button
          data-testid="item"
          onClick={() => setCount((value) => value + 1)}
        >
          {itemRoute.useLoaderData()} count={count}
        </button>
      )
    },
  })
  return rootRoute.addChildren([itemRoute])
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

async function loadServerDocument(
  fw: Framework,
  entry: NavigationCase,
  path: string,
) {
  const response = await fw.createRequestHandler({
    request: new Request(`http://localhost${path}`),
    createRouter: () =>
      fw.createRouter({
        routeTree: createRouteTree(fw, entry, 'server'),
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
      const fw = await loadFramework()
      await loadServerDocument(fw, entry, '/items/1')
      expect(item()).toBeNull()

      const router = fw.createRouter({
        routeTree: createRouteTree(fw, entry, 'client'),
      })
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

      await waitFor(() => expect(item()).toHaveTextContent('item 1 count=0'))
      fireEvent.click(item()!)
      await waitFor(() => expect(item()).toHaveTextContent('item 1 count=1'))

      await router.navigate({ to: '/items/$id', params: { id: '2' } })

      // A param navigation creates a new match on the client. The route
      // component keeps its state, as it does for an SSR route.
      await waitFor(() => expect(item()).toHaveTextContent('item 2 count=1'))
      expect(mounts).toBe(1)
      expect(
        recoverableErrors.map((error) =>
          error instanceof Error ? error.message : String(error),
        ),
      ).toEqual([])
    },
  )
})
