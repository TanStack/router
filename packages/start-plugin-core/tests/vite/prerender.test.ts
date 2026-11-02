import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { VITE_ENVIRONMENT_NAMES } from '../../src/constants'
import { prerenderWithVite } from '../../src/vite/prerender'
import type { Server } from 'node:http'

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
}))

vi.mock('vite', () => ({
  preview: mocks.preview,
}))

describe('prerenderWithVite', () => {
  it('does not follow redirects away from the preview origin', async () => {
    let targetRequestCount = 0
    const targetServer = createServer((_request, response) => {
      targetRequestCount++
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<html>external response</html>')
    })
    const targetUrl = await listen(targetServer)

    const previewHttpServer = createServer((_request, response) => {
      response.writeHead(302, {
        location: new URL('/target', targetUrl).href,
      })
      response.end()
    })
    const previewUrl = await listen(previewHttpServer)
    const outputDir = await mkdtemp(join(tmpdir(), 'tss-vite-prerender-'))

    mocks.preview.mockResolvedValue({
      resolvedUrls: { local: [previewUrl.href] },
      close: vi.fn(async () => {}),
    })

    try {
      await prerenderWithVite({
        startConfig: {
          prerender: {
            enabled: true,
            autoStaticPathsDiscovery: false,
            concurrency: 1,
            failOnError: false,
          },
          pages: [{ path: '/' }],
          router: { basepath: '' },
          spa: {
            enabled: false,
            prerender: { outputPath: '/_shell' },
          },
        } as any,
        builder: {
          environments: {
            [VITE_ENVIRONMENT_NAMES.client]: {
              config: { build: { outDir: outputDir } },
            },
            [VITE_ENVIRONMENT_NAMES.server]: {
              config: { configFile: false },
            },
          },
        } as any,
      })

      expect(targetRequestCount).toBe(0)
    } finally {
      await Promise.all([
        closeServer(previewHttpServer),
        closeServer(targetServer),
        rm(outputDir, { recursive: true, force: true }),
      ])
    }
  })
})

function listen(server: Server): Promise<URL> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Expected an IP socket address'))
        return
      }
      resolve(new URL(`http://127.0.0.1:${address.port}`))
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}
