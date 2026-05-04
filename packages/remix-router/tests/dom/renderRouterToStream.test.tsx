/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `renderRouterToStream` — pins the cleanup contract for
 * `router.serverSsr`.
 *
 * The streaming SSR machinery accumulates per-request state
 * (dehydration payloads, deferred-promise tracking, stream-script
 * emitters). Failing to call `router.serverSsr.cleanup()` once the
 * response is fully drained leaks that state in long-running server
 * processes. These tests guard against regressing the three exit
 * paths:
 *
 *  1. Happy streaming path — cleanup runs once the response body is
 *     fully consumed.
 *  2. Bot user-agent path — cleanup runs after the buffered drain.
 *  3. Early render-time error — cleanup runs before the 500 fallback
 *     is returned.
 */
import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'
import { renderRouterToStream } from '../../src/ssr/renderRouterToStream'
import type { Handle } from '@remix-run/ui'

function makeRouter(initialPath = '/', boom = false) {
  function Root(_h: Handle) {
    return () => (
      <html>
        <head>
          <title>cleanup-pin</title>
        </head>
        <body>
          <h1 id="title">{boom ? null : 'ok'}</h1>
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
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: boom ? Boom : undefined,
  })
  root.addChildren([home])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  let total = 0
  for (const c of chunks) total += c.byteLength
  const flat = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    flat.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(flat)
}

describe('renderRouterToStream — cleanup contract', () => {
  test('happy streaming path: cleanup() runs after response body is fully consumed', async () => {
    const router = await prepareRouter('/')
    const cleanupSpy = installCleanupSpy(router)

    const res = await renderRouterToStream({
      request: new Request('http://localhost/'),
      router,
      responseHeaders: new Headers(),
      children: () => <RouterProvider router={router} />,
    })

    // Until the body is drained, cleanup should not have run.
    // (Stream finally fires only once the consumer pulls the last
    // chunk.)
    expect(cleanupSpy).toHaveBeenCalledTimes(0)

    const body = await readAll(res.body as ReadableStream<Uint8Array>)
    expect(body).toContain('<h1 id="title">ok</h1>')
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })

  test('bot user-agent path: cleanup() runs once the buffered drain completes', async () => {
    const router = await prepareRouter('/')
    const cleanupSpy = installCleanupSpy(router)

    const res = await renderRouterToStream({
      request: new Request('http://localhost/', {
        headers: { 'user-agent': 'Googlebot/2.1' },
      }),
      router,
      responseHeaders: new Headers(),
      children: () => <RouterProvider router={router} />,
    })

    // Bot path drains BEFORE returning, so cleanup must already have
    // run by the time we get the response.
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
    const body = await res.text()
    expect(body).toContain('<h1 id="title">ok</h1>')
    // Still exactly one call (the response.text() is just decoding a
    // pre-built buffer here — no second drain).
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })

  test('early render-time error: cleanup() runs before the 500 fallback returns', async () => {
    // Render a tree that throws DURING the render pass (not during
    // the synchronous `children()` factory call). Use a vnode tree
    // outside the router's `<Matches>` so the global
    // `<CatchBoundary>` doesn't intercept — that would convert the
    // error into a graceful 200 with fallback UI, masking the early
    // error path. Throwing in a leaf component during the first
    // render frame triggers `onError` before any byte is emitted,
    // which is exactly the early-error path we want to pin.
    const router = await prepareRouter('/')
    const cleanupSpy = installCleanupSpy(router)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Boom(_h: Handle) {
      return () => {
        throw new Error('component-level boom')
      }
    }

    const res = await renderRouterToStream({
      request: new Request('http://localhost/'),
      router,
      responseHeaders: new Headers(),
      children: () => <Boom />,
    })

    expect(res.status).toBe(500)
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  test('response sets a defensive content-type when responseHeaders omits one', async () => {
    const router = await prepareRouter('/')
    installCleanupSpy(router)

    const res = await renderRouterToStream({
      request: new Request('http://localhost/'),
      router,
      responseHeaders: new Headers(),
      children: () => <RouterProvider router={router} />,
    })

    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    await readAll(res.body as ReadableStream<Uint8Array>)
  })
})

async function prepareRouter(path: string, boom = false) {
  const router = makeRouter(path, boom)
  // Attach the real server-SSR utilities so all required hooks
  // (isSerializationFinished, injectHtml, dehydrate, …) exist. We're
  // testing the cleanup contract layered on top of a real serverSsr
  // — using a partial shim would mask whether the underlying
  // teardown behavior actually fires in production.
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  // Kick off dehydration so `router.serverSsr.cleanup()` has actual
  // state to clean up — the `transformReadableStreamWithRouter`
  // pipeline waits on the serialization promise during the
  // post-`</body>` flush.
  void router.serverSsr!.dehydrate()
  return router
}

/**
 * Spy on `router.serverSsr.cleanup` while preserving the original
 * teardown so the test exercises the real path.
 */
function installCleanupSpy(router: any): ReturnType<typeof vi.fn> {
  const spy = vi.fn()
  const originalCleanup = router.serverSsr.cleanup.bind(router.serverSsr)
  router.serverSsr.cleanup = () => {
    spy()
    originalCleanup()
  }
  return spy
}
