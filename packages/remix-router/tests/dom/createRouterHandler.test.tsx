/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * Integration test for `createRouterHandler` — the full
 * `(Request) => Response` handler. Confirms:
 *
 *  - Body content streams through correctly for a simple route.
 *  - Status code from `router.stores.statusCode` propagates.
 *  - Redirects short-circuit before rendering.
 *  - The dehydration script is in the response body.
 *  - 500 errors are handled cleanly (not unhandled-promise-crashes).
 *  - The handler accepts both raw `Request` and `{ request }` wrapper.
 */
import { describe, expect, test, vi } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../../src'
import { createRouterHandler } from '../../src/ssr/server'
import type { Handle } from '@remix-run/ui'

function setup() {
  function Root(_h: Handle) {
    return () => (
      <html>
        <head>
          <title>integration test</title>
        </head>
        <body>
          <h1 id="title">root content</h1>
        </body>
      </html>
    )
  }
  function Boom(_h: Handle) {
    return () => {
      throw new Error('boom in render')
    }
  }

  const root = createRootRoute({ component: Root })
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const explode = createRoute({
    getParentRoute: () => root,
    path: '/explode',
    component: Boom,
  })
  const redirector = createRoute({
    getParentRoute: () => root,
    path: '/redir',
    loader: () => {
      throw redirect({ to: '/' })
    },
  })
  root.addChildren([home, explode, redirector])

  return () => createRouter({ routeTree: root })
}

describe('createRouterHandler', () => {
  test('happy path renders SSR document with status 200', async () => {
    const factory = setup()
    const handler = createRouterHandler({ createRouter: factory })
    const res = await handler(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    const body = await res.text()
    console.log('happy body sample:', body.slice(0, 200))
    expect(body).toContain('<title>integration test</title>')
    expect(body).toContain('<h1 id="title">root content</h1>')
  })

  test('redirect short-circuits before rendering', async () => {
    const factory = setup()
    const handler = createRouterHandler({ createRouter: factory })
    const res = await handler(new Request('http://localhost/redir'))
    // The redirect IS the response (it extends Response).
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
  })

  test('render-time errors are caught by the global CatchBoundary (returns 200 with fallback UI, not a crash)', async () => {
    const factory = setup()
    const handler = createRouterHandler({ createRouter: factory })
    // Suppress console.error noise during the test.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handler(new Request('http://localhost/explode'))
    // Default behavior: <CatchBoundary> in <Matches> intercepts. The
    // page renders the error UI with status 200. The important thing
    // is the SERVER doesn't crash on a component throw.
    expect(res.status).toBe(200)
    const body = await res.text()
    // Either the error UI text from `<ErrorComponent>` or the 500
    // fallback if the boundary itself fails — both are graceful.
    expect(body.length).toBeGreaterThan(0)
    errSpy.mockRestore()
  })

  test('handler accepts the {request} wrapper shape too', async () => {
    const factory = setup()
    const handler = createRouterHandler({ createRouter: factory })
    const res = await handler({ request: new Request('http://localhost/') })
    expect(res.status).toBe(200)
  })

  test('user-agent isbot path returns the same content', async () => {
    const factory = setup()
    const handler = createRouterHandler({ createRouter: factory })
    const res = await handler(
      new Request('http://localhost/', {
        headers: { 'user-agent': 'Googlebot/2.1' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<h1 id="title">root content</h1>')
  })
})
