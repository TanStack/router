import { describe, expect, it, vi } from 'vitest'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'

function createMinimalRouter() {
  return {
    options: {
      ssr: {},
      dehydrate: async () => undefined,
    },
    state: {
      matches: [],
    },
    isShell: () => false,
    emit: () => {},
  }
}

describe('ssr-server', () => {
  it('flushes initial script buffer synchronously on render finish', () => {
    const router = createMinimalRouter() as any
    attachRouterServerSsrUtils({ router, manifest: undefined })

    router.serverSsr.setRenderFinished()
    const html = router.serverSsr.takeBufferedHtml()

    expect(html).toContain('<script')
    expect(html).toContain('$_TSR')
  })

  it('continues calling render-finished listeners after one throws', () => {
    const router = createMinimalRouter() as any
    attachRouterServerSsrUtils({ router, manifest: undefined })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    let called = false
    router.serverSsr.onRenderFinished(() => {
      throw new Error('listener failed')
    })
    router.serverSsr.onRenderFinished(() => {
      called = true
    })

    router.serverSsr.setRenderFinished()

    expect(called).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('flushes scripts enqueued during render-finished listeners', () => {
    const router = createMinimalRouter() as any
    attachRouterServerSsrUtils({ router, manifest: undefined })

    router.serverSsr.onRenderFinished(() => {
      router.serverSsr.injectScript('window.__render_listener_script__=1')
    })

    router.serverSsr.setRenderFinished()
    const html = router.serverSsr.takeBufferedHtml()

    expect(html).toContain('window.__render_listener_script__=1')
    expect(html).toContain('<script')
  })
})
