import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<any>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  }
})

function htmlResponse() {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

function makeStartConfig(pagePath: string, prerenderOverrides: object = {}) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      ...prerenderOverrides,
    },
    pages: [{ path: pagePath }],
    router: { basepath: '' },
    spa: {
      enabled: false,
      prerender: {
        outputPath: '/_shell',
        crawlLinks: false,
        retryCount: 0,
        enabled: true,
      },
    },
  } as any
}

describe('prerender retries', () => {
  it('re-fetches the page on retry', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue(htmlResponse())
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/about', {
      retryCount: 1,
      retryDelay: 0,
    })

    await expect(prerender({ startConfig, handler })).resolves.not.toThrow()
    expect(request).toHaveBeenCalledTimes(2)
  })
})
