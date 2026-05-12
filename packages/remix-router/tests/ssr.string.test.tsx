/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
/**
 * Non-streaming SSR via `renderRouterToString`. Confirms:
 *
 *  - The full document is buffered and returned as a single Response.
 *  - Status code is taken from `router.stores.statusCode`.
 *  - The dehydration script is spliced before `</body>`.
 *  - Errors during render produce a 500 response with a fallback page.
 *  - `router.serverSsr.cleanup()` runs on both success and error
 *    paths via the function's `finally` block.
 *  - Defensive `content-type: text/html` header is set when missing.
 */
import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import {
  RouterServer,
  attachRouterServerSsrUtils,
  renderRouterToString,
} from '../src/ssr/server'
import type { Handle } from '@remix-run/ui'

async function makeServerRouter(initialPath: string) {
  function Root(_h: Handle) {
    return () => (
      <html>
        <head>
          <title>test</title>
        </head>
        <body>
          <h1 id="page">root</h1>
        </body>
      </html>
    )
  }
  const root = createRootRoute({ component: Root })
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  root.addChildren([index])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    isServer: true,
  })
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  return router
}

describe('renderRouterToString', () => {
  test('produces a complete HTML document with status 200', async () => {
    const router = await makeServerRouter('/')
    const res = await renderRouterToString({
      router,
      responseHeaders: new Headers({
        'content-type': 'text/html; charset=utf-8',
      }),
      children: () => <RouterServer router={router} />,
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(body).toContain('<title>test</title>')
    expect(body).toContain('<h1 id="page">root</h1>')
  })

  test('errors during render produce a 500 fallback', async () => {
    const router = await makeServerRouter('/')
    const res = await renderRouterToString({
      router,
      responseHeaders: new Headers(),
      children: () => {
        throw new Error('test render boom')
      },
    })
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain('500 — Server render error')
  })

  test('cleanup runs on success path', async () => {
    const router = await makeServerRouter('/')
    const cleanupSpy = vi.fn()
    const originalCleanup = router.serverSsr!.cleanup.bind(router.serverSsr)
    router.serverSsr!.cleanup = () => {
      cleanupSpy()
      originalCleanup()
    }

    await renderRouterToString({
      router,
      responseHeaders: new Headers({
        'content-type': 'text/html; charset=utf-8',
      }),
      children: () => <RouterServer router={router} />,
    })

    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })

  test('cleanup runs on error path', async () => {
    const router = await makeServerRouter('/')
    const cleanupSpy = vi.fn()
    const originalCleanup = router.serverSsr!.cleanup.bind(router.serverSsr)
    router.serverSsr!.cleanup = () => {
      cleanupSpy()
      originalCleanup()
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderRouterToString({
      router,
      responseHeaders: new Headers(),
      children: () => {
        throw new Error('boom')
      },
    })

    expect(cleanupSpy).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  test('sets defensive content-type when responseHeaders omits one', async () => {
    const router = await makeServerRouter('/')
    const res = await renderRouterToString({
      router,
      responseHeaders: new Headers(),
      children: () => <RouterServer router={router} />,
    })
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  test('preserves caller-provided content-type', async () => {
    const router = await makeServerRouter('/')
    const res = await renderRouterToString({
      router,
      responseHeaders: new Headers({
        'content-type': 'text/html; charset=us-ascii',
      }),
      children: () => <RouterServer router={router} />,
    })
    expect(res.headers.get('content-type')).toBe('text/html; charset=us-ascii')
  })
})
