import { describe, expect, it, vi } from 'vitest'
import { createRootRoute, createRoute, createRouter } from '../../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../../src/ssr/server'

describe('errorComponent (server)', () => {
  it.each([
    ['Error', new Error('loader boom')],
    ['Error with cause', new Error('loader boom', { cause: false })],
    ['string', 'loader boom'],
    ['empty string', ''],
    ['false', false],
    ['zero', 0],
    ['negative zero', -0],
    ['bigint zero', 0n],
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
    ['object', { message: 'loader boom' }],
  ])(
    'normalizes a thrown %s for the SSR error component',
    async (_, thrown) => {
      const onError = vi.fn()
      let renderedError: Error | undefined
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader: () => {
          throw thrown
        },
        component: () => <div>Index route</div>,
        onError,
        errorComponent: ({ error }) => {
          renderedError = error
          return (
            <div data-testid="error-component">
              Route error: {error.message}
            </div>
          )
        },
      })

      const routeTree = rootRoute.addChildren([indexRoute])
      const handler = createRequestHandler({
        request: new Request('http://localhost/'),
        createRouter: () => createRouter({ routeTree, isServer: true }),
      })

      const response = await handler(async ({ router, responseHeaders }) => {
        const result = await renderRouterToString({
          router,
          responseHeaders,
          children: () => <RouterServer router={router} />,
        })
        const match = router.stores.matches
          .get()
          .find((match) => match.routeId === indexRoute.id)
        expect(match?.status).toBe('error')
        expect(match?.error).toBe(thrown)
        return result
      })

      expect(response.status).toBe(500)
      const html = await response.text()
      expect(html).toContain('data-testid="error-component"')
      expect(renderedError).toBeInstanceOf(Error)
      if (thrown instanceof Error) {
        expect(renderedError).toBe(thrown)
      } else {
        expect(renderedError?.message).toBe(
          typeof thrown === 'string' ? thrown : 'Unknown error',
        )
        expect(renderedError?.cause).toBe(thrown)
      }
      expect(onError).toHaveBeenCalledWith(thrown)
      expect(html).not.toContain('Index route')
    },
  )
})
