import { act, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { hydrate } from '../src/ssr/client'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'
import {
  Outlet,
  RouterProvider,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  vi.restoreAllMocks()
  delete window.$_TSR
  delete (window as any).$R
  document.body.innerHTML = ''
})

test('#8115: hydration does not render a successful route with missing context when context reconstruction fails', async () => {
  const contextError = new Error('client context reconstruction failed')
  const clientSuccessRenderValues: Array<string | undefined> = []
  let clientContextAttempts = 0
  let serverPhase = true

  const createRouteTree = () => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Outlet />
          <Scripts />
        </>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      context: (): { locale: string } => {
        if (serverPhase) {
          return { locale: 'en' }
        }
        clientContextAttempts++
        throw contextError
      },
      component: () => {
        const context: { locale?: string } = indexRoute.useRouteContext()
        if (!serverPhase) {
          clientSuccessRenderValues.push(context.locale)
        }
        return (
          <div data-testid="route-success">
            Locale: {context.locale ?? 'missing'}
          </div>
        )
      },
      errorComponent: ({ error }) => (
        <div data-testid="route-error">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ),
    })

    return rootRoute.addChildren([indexRoute])
  }

  const response = await createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () =>
      createRouter({ routeTree: createRouteTree(), isServer: true }),
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
  )
  const html = await response.text()
  const serverDocument = new DOMParser().parseFromString(html, 'text/html')

  expect(serverDocument.body.textContent).toContain('Locale: en')
  const currentScriptSpy = vi.spyOn(document, 'currentScript', 'get')
  try {
    for (const script of serverDocument.querySelectorAll('script')) {
      currentScriptSpy.mockReturnValue(script)
      new Function(script.textContent ?? '')()
      script.remove()
    }
  } finally {
    currentScriptSpy.mockRestore()
  }
  expect(window.$_TSR?.router?.matches.at(-1)?.s).toBe('success')

  serverPhase = false
  const clientRouter = createRouter({
    routeTree: createRouteTree(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const container = document.createElement('div')
  container.innerHTML = serverDocument.body.innerHTML
  document.body.appendChild(container)
  const recoverableHydrationErrors: Array<Error> = []
  let root: ReturnType<typeof hydrateRoot> | undefined

  try {
    await hydrate(clientRouter)
    await act(async () => {
      root = hydrateRoot(container, <RouterProvider router={clientRouter} />, {
        onRecoverableError: (error) => {
          if (
            error instanceof Error &&
            error.message.startsWith(
              "Hydration failed because the server rendered HTML didn't match the client.",
            )
          ) {
            recoverableHydrationErrors.push(error)
            return
          }
          throw error
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="route-error"]'),
      ).toHaveTextContent(contextError.message)
    })
    expect(clientContextAttempts).toBeGreaterThan(0)
    expect(container.querySelector('[data-testid="route-success"]')).toBeNull()
    expect(clientSuccessRenderValues).not.toContain(undefined)
    expect(recoverableHydrationErrors).toHaveLength(1)
  } finally {
    if (root) {
      await act(() => root.unmount())
    }
    container.remove()
  }
})
