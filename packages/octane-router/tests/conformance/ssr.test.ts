// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script'
import {
  RouterServer,
  renderRouterToStream,
  renderRouterToString,
} from '../../src/ssr/server'
import { relocateLeadingOctaneStylesToHead } from '../../src/ssr/renderRouterToStream'
import { makeSsrRouter } from '../_fixtures/ssr.tsrx'

describe('@tanstack/octane-router SSR', () => {
  it('renders the route-owned document and app mount boundary', async () => {
    const router = makeSsrRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    await router.serverSsr.dehydrate()

    const response = await renderRouterToString({
      router,
      responseHeaders: new Headers({ 'content-type': 'text/html' }),
      App: RouterServer,
    })
    const html = await response.text()
    const normalizedHtml = html.replace(/<!--[\s\S]*?-->/g, '')

    expect(response.status).toBe(200)
    expect(normalizedHtml).toContain('<!DOCTYPE html>')
    expect(normalizedHtml).toContain('<html lang="en">')
    expect(normalizedHtml).toContain('<title data-tsr-managed-key="head:')
    expect(normalizedHtml).toContain('>Octane Router SSR</title>')
    expect(normalizedHtml).toContain(
      '<meta name="description" content="Rendered by Octane"',
    )
    expect(normalizedHtml).toContain(
      '<body class="document-body"><div id="__app">',
    )
    expect(normalizedHtml).toMatch(
      /<main id="content" class="tsrx-[^"]+">Rendered on the server<\/main>/,
    )
    expect(normalizedHtml).toMatch(
      /<head>[\s\S]*<style data-octane="[^"]+" nonce="octane-csp">[\s\S]*rgb\(12, 34, 56\)[\s\S]*<\/style>[\s\S]*<\/head>/,
    )
    expect(normalizedHtml).toContain('<script src="/entry.js"')
    expect(normalizedHtml).toContain('globalThis.__octaneRouterSsr=true')
    expect(normalizedHtml).not.toContain('document.currentScript.remove()')
    expect(normalizedHtml).toContain('</script></div></body></html>')
  })

  it('emits the pre-hydration scroll restoration script when enabled', async () => {
    const router = makeSsrRouter({ scrollRestoration: true })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    await router.serverSsr.dehydrate()
    const script = getScrollRestorationScriptForRouter(router)

    const response = await renderRouterToString({
      router,
      responseHeaders: new Headers({ 'content-type': 'text/html' }),
      App: RouterServer,
    })

    expect(script).toBeTruthy()
    expect(await response.text()).toContain(script)
  })

  it.each([false, 'data-only'] as const)(
    'does not render route UI when ssr is %s',
    async (routeSsr) => {
      const router = makeSsrRouter({ routeSsr })
      attachRouterServerSsrUtils({ router, manifest: undefined })
      await router.load()
      await router.serverSsr.dehydrate()

      const response = await renderRouterToString({
        router,
        responseHeaders: new Headers({ 'content-type': 'text/html' }),
        App: RouterServer,
      })

      expect(await response.text()).not.toContain('Rendered on the server')
    },
  )

  it('places shell styles inside the route-owned head when streaming', async () => {
    const router = makeSsrRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    await router.serverSsr.dehydrate()

    const response = await renderRouterToStream({
      request: new Request('http://localhost/', {
        headers: { 'user-agent': 'Mozilla/5.0' },
      }),
      router,
      responseHeaders: new Headers({ 'content-type': 'text/html' }),
      App: RouterServer,
    })
    const html = await response.text()
    const doctype = html.indexOf('<!DOCTYPE html>')
    const document = html.indexOf('<html')
    const head = html.indexOf('<head')
    const style = html.indexOf('<style data-octane=')
    const headClose = html.indexOf('</head>')

    expect(doctype).toBe(0)
    expect(document).toBeGreaterThan(doctype)
    expect(head).toBeGreaterThan(document)
    expect(style).toBeGreaterThan(head)
    expect(headClose).toBeGreaterThan(style)
    expect(html.slice(0, document)).not.toContain('<style data-octane=')
    expect(html.slice(style, headClose)).toContain('nonce="octane-csp"')
    expect(html.slice(style, headClose)).toContain('rgb(12, 34, 56)')
  })

  it('releases the normalized shell before later stream chunks', async () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let releaseTail!: () => void
    const tailReady = new Promise<void>((resolve) => {
      releaseTail = resolve
    })
    const chunks = [
      '<sty',
      'le data-octane="tsrx-shell" nonce="test-nonce">.shell{color:red}</sty',
      'le><!--[--><html lang="en"><he',
      'ad data-label=">"><title>Stream</title></head><body>shell',
    ]
    let index = 0
    const source = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index++]))
          return
        }
        await tailReady
        controller.enqueue(
          encoder.encode(
            '<style data-octane="tsrx-late" nonce="test-nonce">.late{color:blue}</style><aside>late</aside></body></html>',
          ),
        )
        controller.close()
      },
    })

    const reader = relocateLeadingOctaneStylesToHead(source).getReader()
    const shellResult = await reader.read()
    const shell = decoder.decode(shellResult.value)

    expect(shell).toContain(
      '<head data-label=">"><style data-octane="tsrx-shell" nonce="test-nonce">',
    )
    expect(shell.indexOf('<html')).toBeLessThan(shell.indexOf('<head'))
    expect(shell.indexOf('<head')).toBeLessThan(
      shell.indexOf('<style data-octane='),
    )

    let tailReleased = false
    const tailResult = reader.read().then((result) => {
      tailReleased = true
      return result
    })
    await Promise.resolve()
    expect(tailReleased).toBe(false)

    releaseTail()
    expect(decoder.decode((await tailResult).value)).toBe(
      '<style data-octane="tsrx-late" nonce="test-nonce">.late{color:blue}</style><aside>late</aside></body></html>',
    )
  })

  it('propagates cancellation through document normalization', async () => {
    const encoder = new TextEncoder()
    const reason = new Error('client disconnected')
    let markCancelled!: (reason: unknown) => void
    const cancelled = new Promise<unknown>((resolve) => {
      markCancelled = resolve
    })
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '<style data-octane="tsrx-shell">.shell{}</style><html><head></head><body>',
          ),
        )
      },
      cancel(cancelReason) {
        markCancelled(cancelReason)
      },
    })
    const reader = relocateLeadingOctaneStylesToHead(source).getReader()

    await reader.read()
    await reader.cancel(reason)

    expect(await cancelled).toBe(reason)
  })
})
