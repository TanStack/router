import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  Scripts,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '../src'
import { hydrate } from '../src/ssr/client'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'

test.each(['onEnter', 'dehydrate'] as const)(
  'waits for a load started by %s before rendering and hydrating',
  async (phase) => {
    const started = createControlledPromise<void>()
    const gate = createControlledPromise<string>()
    let nested: Promise<void> | undefined

    function LoadingState() {
      const { status, isLoading } = useRouterState({
        select: (state) => ({
          status: state.status,
          isLoading: state.isLoading,
        }),
      })
      return <span data-testid="loading-state">{`${status}:${isLoading}`}</span>
    }

    function buildRouter(isServer: boolean) {
      let calls = 0
      let reentered = false
      const rootRoute = createRootRoute({
        component: () => (
          <>
            <Outlet />
            <Scripts />
          </>
        ),
      })
      const route = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader: () => {
          if (isServer && ++calls > 1) {
            started.resolve()
            return gate
          }
          return 'initial data'
        },
        onEnter: () => {
          if (isServer && phase === 'onEnter' && !reentered) {
            reentered = true
            nested = router.load()
          }
        },
        component: () => (
          <>
            <LoadingState />
            <span data-testid="loader-data">{route.useLoaderData()}</span>
          </>
        ),
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([route]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer,
        dehydrate: () => {
          if (isServer && phase === 'dehydrate' && !reentered) {
            reentered = true
            nested = router.load()
          }
          return {}
        },
      })
      return router
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      const responseReady = vi.fn()
      const responsePromise = createRequestHandler({
        request: new Request('http://localhost/'),
        createRouter: () => buildRouter(true),
      })(({ router, responseHeaders }) =>
        renderRouterToString({
          router,
          responseHeaders,
          children: (
            <html>
              <head />
              <body>
                <RouterServer router={router} />
              </body>
            </html>
          ),
        }),
      ).then((response) => {
        responseReady()
        return response
      })
      await started
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(responseReady).not.toHaveBeenCalled()
      gate.resolve('reloaded data')
      const response = await responsePromise
      const serverDocument = new DOMParser().parseFromString(
        await response.text(),
        'text/html',
      )
      expect(
        serverDocument.querySelector('[data-testid="loading-state"]')
          ?.textContent,
      ).toBe('idle:false')
      expect(
        serverDocument.querySelector('[data-testid="loader-data"]')
          ?.textContent,
      ).toBe('reloaded data')

      const currentScriptSpy = vi.spyOn(document, 'currentScript', 'get')
      try {
        // Execute only the hydration scripts emitted by this request.
        for (const script of serverDocument.querySelectorAll('script')) {
          currentScriptSpy.mockReturnValue(script)
          new Function(script.textContent ?? '')()
          script.remove()
        }
      } finally {
        currentScriptSpy.mockRestore()
      }

      container.innerHTML = serverDocument.body.innerHTML
      const clientRouter = buildRouter(false)
      const onRecoverableError = vi.fn()
      await hydrate(clientRouter)
      await act(async () => {
        root = hydrateRoot(
          container,
          <RouterProvider router={clientRouter} />,
          {
            onRecoverableError,
          },
        )
      })

      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(
        container.querySelector('[data-testid="loading-state"]'),
      ).toHaveTextContent('idle:false')
      expect(
        container.querySelector('[data-testid="loader-data"]'),
      ).toHaveTextContent('reloaded data')
    } finally {
      if (root) {
        await act(() => root!.unmount())
      }
      gate.resolve('reloaded data')
      await nested
      container.remove()
      delete window.$_TSR
      delete (window as Window & { $R?: unknown }).$R
    }
  },
)
