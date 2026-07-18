import { runInNewContext } from 'node:vm'
import * as React from 'react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '../src'
import { hydrate } from '../src/ssr/client'
import {
  RouterServer,
  attachRouterServerSsrUtils,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'
import type { AnyRouter } from '../src'
import type { TsrSsrGlobal } from '../src/ssr/client'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  vi.restoreAllMocks()
  window.$_TSR = undefined
  document.body.innerHTML = ''
})

test.each(['sync', 'async'] as const)(
  'N07: a %s functional SSR failure preserves route context for its boundary',
  async (failureMode) => {
    const selectionError = new Error(`${failureMode} SSR selection failed`)
    const failingBeforeLoad = vi.fn(() => ({
      failingBeforeLoadToken: 'must-not-exist',
    }))
    const rootRoute = createRootRouteWithContext<{
      routerToken: string
    }>()({
      component: Outlet,
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      context: () => ({ layoutToken: 'layout-context' }),
      beforeLoad: () => ({
        layoutBeforeLoadToken: 'layout-beforeLoad-context',
      }),
      component: Outlet,
    })
    const reportsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/reports',
      context: () => ({ reportsToken: 'reports-context' }),
      ssr: () => {
        if (failureMode === 'sync') {
          throw selectionError
        }
        return Promise.reject(selectionError)
      },
      beforeLoad: failingBeforeLoad,
      component: () => <div>Reports</div>,
      errorComponent: ({ error }) => {
        const context = reportsRoute.useRouteContext() as Record<
          string,
          unknown
        >
        return (
          <div data-testid="reports-error">
            {[
              error.message,
              context.routerToken,
              context.layoutToken,
              context.layoutBeforeLoadToken,
              context.reportsToken,
              context.failingBeforeLoadToken ?? 'no-failing-beforeLoad',
            ].join('|')}
          </div>
        )
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([reportsRoute]),
    ])
    const handler = createRequestHandler({
      request: new Request('http://localhost/reports'),
      createRouter: () =>
        createRouter({
          routeTree,
          context: { routerToken: 'router-context' },
          isServer: true,
        }),
    })

    const response = await handler(({ router, responseHeaders }) =>
      renderRouterToString({
        router,
        responseHeaders,
        children: <RouterServer router={router} />,
      }),
    )

    expect(response.status).toBe(500)
    const html = await response.text()
    expect
      .soft(html)
      .toContain(
        [
          `${failureMode} SSR selection failed`,
          'router-context',
          'layout-context',
          'layout-beforeLoad-context',
          'reports-context',
          'no-failing-beforeLoad',
        ].join('|'),
      )
    expect(failingBeforeLoad).not.toHaveBeenCalled()
  },
)

async function dehydrateLoadedRouter(router: AnyRouter): Promise<TsrSsrGlobal> {
  await router.serverSsr!.dehydrate()
  const script = router.serverSsr!.takeBufferedScripts()
  expect(script?.children).toBeTruthy()

  const context: Record<string, any> = {
    document: { currentScript: { remove() {} } },
  }
  context.self = context
  runInNewContext(script!.children!, context)
  expect(context.$_TSR).toBeDefined()
  return context.$_TSR
}

test('N08: hydration rebuilds the visible client-only frontier from serialized parent context', async () => {
  const makeRouteTree = ({
    rootAuth,
    childLoader,
  }: {
    rootAuth: string
    childLoader: () => unknown
  }) => {
    const rootRoute = createRootRoute({
      beforeLoad: () => ({ auth: rootAuth }),
      component: Outlet,
    })
    const childRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      context: () => ({ childToken: 'child-route-context' }),
      loader: childLoader,
      pendingComponent: () => {
        const context = childRoute.useRouteContext()
        return (
          <div data-testid="client-only-pending">
            {String(context.auth)}|{context.childToken}
          </div>
        )
      },
      component: () => <div>Client-only content</div>,
    })
    return {
      rootRoute,
      childRoute,
      routeTree: rootRoute.addChildren([childRoute]),
    }
  }

  const serverChildLoader = vi.fn(() => 'server must skip this loader')
  const serverRoutes = makeRouteTree({
    rootAuth: 'server-authenticated',
    childLoader: serverChildLoader,
  })
  const serverRouter = createRouter({
    routeTree: serverRoutes.routeTree,
    history: createMemoryHistory({ initialEntries: ['/client-only'] }),
    isServer: true,
  })
  attachRouterServerSsrUtils({
    router: serverRouter,
    manifest: { routes: {} },
  })

  let serverHtml: string
  let bootstrap: TsrSsrGlobal
  try {
    await serverRouter.load()
    expect(serverChildLoader).not.toHaveBeenCalled()
    expect(serverRouter.state.matches.at(-1)).toMatchObject({
      routeId: serverRoutes.childRoute.id,
      status: 'pending',
      ssr: false,
      context: {
        auth: 'server-authenticated',
        childToken: 'child-route-context',
      },
    })
    serverHtml = renderToString(<RouterProvider router={serverRouter} />)
    expect(serverHtml).toContain('server-authenticated')
    expect(serverHtml).toContain('child-route-context')
    bootstrap = await dehydrateLoadedRouter(serverRouter)
  } finally {
    serverRouter.serverSsr?.cleanup()
  }

  const clientLoaderGate = createControlledPromise<void>()
  const clientChildLoader = vi.fn(() => clientLoaderGate)
  const clientRoutes = makeRouteTree({
    rootAuth: 'client-auth-must-not-replace-server-context-during-hydration',
    childLoader: clientChildLoader,
  })
  const clientRouter = createRouter({
    routeTree: clientRoutes.routeTree,
    history: createMemoryHistory({ initialEntries: ['/client-only'] }),
  })
  window.$_TSR = bootstrap

  await hydrate(clientRouter)

  const hydratedFrontier = clientRouter.state.matches.find(
    (match) => match.routeId === clientRoutes.childRoute.id,
  )
  expect.soft(hydratedFrontier).toMatchObject({
    status: 'pending',
    ssr: false,
    context: {
      auth: 'server-authenticated',
      childToken: 'child-route-context',
    },
  })
  expect(clientChildLoader).not.toHaveBeenCalled()

  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.appendChild(container)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const recoverableError = vi.fn()
  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, <RouterProvider router={clientRouter} />, {
      onRecoverableError: recoverableError,
    })
    testCleanups.push(async () => {
      try {
        await act(async () => {
          clientLoaderGate.resolve()
          await vi.waitFor(() => {
            expect(clientRouter.state.status).toBe('idle')
          })
        })
      } finally {
        await act(() => root.unmount())
      }
    })
    await Promise.resolve()
  })

  expect
    .soft(container)
    .toHaveTextContent('server-authenticated|child-route-context')
  expect
    .soft(consoleError.mock.calls.flat().join(' '))
    .not.toMatch(/hydration|did not match/i)
  expect(recoverableError).not.toHaveBeenCalled()
})
