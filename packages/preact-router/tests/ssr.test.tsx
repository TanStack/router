import { describe, expect, test, vi } from 'vitest'
import { renderRouterToStream } from '../src/ssr/renderRouterToStream'
import { renderRouterToString } from '../src/ssr/renderRouterToString'

function createMockRouter() {
  return {
    state: {
      statusCode: 200,
    },
    options: {},
    serverSsr: {
      cleanup: vi.fn(),
      isSerializationFinished: vi.fn(() => true),
      isDehydrated: vi.fn(() => true),
      onRenderFinished: vi.fn(),
      onSerializationFinished: vi.fn(),
      setRenderFinished: vi.fn(),
      takeBufferedHtml: vi.fn(() => '<script>window.__SSR__=1</script>'),
    },
  } as any
}

describe('preact-router ssr', () => {
  test('renderRouterToString returns html with doctype and buffered injections', async () => {
    const router = createMockRouter()

    const response = await renderRouterToString({
      router,
      responseHeaders: new Headers(),
      children: (
        <html>
          <body>
            <div id="app">Hello SSR</div>
          </body>
        </html>
      ),
    })

    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Hello SSR')
    expect(html).toContain('<script>window.__SSR__=1</script>')
    expect(router.serverSsr.setRenderFinished).toHaveBeenCalledTimes(1)
    expect(router.serverSsr.cleanup).toHaveBeenCalledTimes(1)
  })

  test('renderRouterToStream returns stream response with rendered html', async () => {
    const router = createMockRouter()

    const response = await renderRouterToStream({
      request: new Request('http://localhost', {
        headers: {
          'User-Agent': 'tanstack-test-agent',
        },
      }),
      router,
      responseHeaders: new Headers(),
      children: (
        <html>
          <body>
            <div id="app">Hello Stream SSR</div>
          </body>
        </html>
      ),
    })

    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<html>')
    expect(html).toContain('Hello Stream SSR')
    expect(html).toContain('<script>window.__SSR__=1</script>')
    expect(router.serverSsr.cleanup).toHaveBeenCalledTimes(1)
  })
})
