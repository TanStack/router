import { describe, expect, it, vi } from 'vitest'
import { previewServerPlugin } from '../src/vite/preview-server-plugin/plugin'

describe('previewServerPlugin', () => {
  it('loads the server build from the Vite root', async () => {
    const use = vi.fn()
    const server = {
      config: {
        root: '/app',
        base: '/',
        build: { outDir: 'dist' },
        environments: { ssr: { build: {} } },
      },
      middlewares: { use },
    }
    const configurePreviewServer = previewServerPlugin()
      .configurePreviewServer as any
    configurePreviewServer.handler(server)()

    const middleware = use.mock.calls[0]![0]
    const next = vi.fn()
    await middleware({ url: '/' }, {}, next)

    // `/app` doesn't exist, so the import fails with the path it tried
    const error = next.mock.calls[0]![0] as Error
    expect(error.message.replaceAll('\\', '/')).toContain(
      '/app/dist/server/server.js',
    )
  })
})
