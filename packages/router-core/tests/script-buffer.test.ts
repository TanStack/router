import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import { describe, expect, test } from 'vitest'

function buildRouter(loaderData?: Record<string, unknown>) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
    loader: loaderData ? () => loaderData : undefined,
  })

  const routeTree = rootRoute.addChildren([indexRoute])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
}

describe('ScriptBuffer: streaming scripts are not dropped', () => {
  test('scripts injected synchronously when barrier lifts after serialization completes', async () => {
    // When serialization finishes before the stream,
    // setRenderFinished() must inject scripts synchronously (not via queueMicrotask).

    const deferredPromise = new Promise<string>((r) =>
      setTimeout(() => r('resolved-value'), 10),
    )
    const router = buildRouter({ deferred: deferredPromise })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()

    const injectedChunks: Array<string> = []
    router.subscribe('onInjectedHtml', () => {
      const html = router.serverSsr?.takeBufferedHtml()
      if (html) injectedChunks.push(html)
    })

    await router.serverSsr!.dehydrate()
    router.serverSsr!.takeBufferedScripts()

    // Wait for deferred promise + crossSerializeStream.onDone
    await new Promise((r) => setTimeout(r, 50))
    expect(router.serverSsr!.isSerializationFinished()).toBe(true)

    // Lift barrier — scripts injected synchronously (no microtask)
    router.serverSsr!.setRenderFinished()

    // Check immediately — no awaiting
    const allInjected = injectedChunks.join('')
    expect(
      allInjected,
      'Scripts lost: $_TSR.e() not found. ' +
        'ScriptBuffer must inject synchronously when barrier is lifted.',
    ).toContain('$_TSR.e()')
  })

  test('scripts not dropped when cleanup runs immediately after setRenderFinished', async () => {
    // Simulates fast-exit path: setRenderFinished → takeBufferedHtml → cleanup

    const deferredPromise = new Promise<string>((r) =>
      setTimeout(() => r('resolved-value'), 10),
    )
    const router = buildRouter({ deferred: deferredPromise })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()

    const injectedChunks: Array<string> = []
    router.subscribe('onInjectedHtml', () => {
      const html = router.serverSsr?.takeBufferedHtml()
      if (html) injectedChunks.push(html)
    })

    await router.serverSsr!.dehydrate()
    router.serverSsr!.takeBufferedScripts()

    // Wait for serialization to complete
    await new Promise((r) => setTimeout(r, 50))

    // Fast-exit path: setRenderFinished → grab HTML → cleanup (NO drain)
    router.serverSsr!.setRenderFinished()
    const finalHtml = router.serverSsr!.takeBufferedHtml()
    router.serverSsr!.cleanup()

    const allHtml = injectedChunks.join('') + (finalHtml ?? '')
    expect(
      allHtml,
      'Scripts dropped by cleanup: $_TSR.e() missing.',
    ).toContain('$_TSR.e()')
  })
})
