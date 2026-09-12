import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'
import type { TanStackStartOutputConfig } from '../src/schema'
import type * as Utils from '../src/utils'
import type * as Fs from 'node:fs'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<typeof Utils>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

// Mock fs to prevent actual file system operations
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof Fs>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  }
})

function makeStartConfig(
  pagePath: string,
  prerenderOverrides: Record<string, unknown> = {},
) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      // keep retries fast in tests
      retryDelay: 1,
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
    // Only a subset of TanStackStartOutputConfig is needed to exercise
    // prerender(); building the full parsed schema shape isn't worth it here.
  } as unknown as TanStackStartOutputConfig
}

const handler = {
  getClientOutputDirectory: () => '/client',
}

describe('prerender retries', () => {
  it('retries a page that fails and succeeds before exhausting retryCount', async () => {
    let calls = 0
    const request = vi.fn(() => {
      calls++
      if (calls <= 2) {
        return new Response('nope', { status: 500 })
      }
      return new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    })

    const startConfig = makeStartConfig('/about', { retryCount: 2 })

    await expect(
      prerender({ startConfig, handler: { ...handler, request } }),
    ).resolves.not.toThrow()

    // 1 initial attempt + 2 retries, third attempt succeeds
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('rethrows once retries are exhausted and failOnError is true', async () => {
    const request = vi.fn(() => new Response('nope', { status: 500 }))

    const startConfig = makeStartConfig('/about', {
      retryCount: 1,
      failOnError: true,
    })

    await expect(
      prerender({ startConfig, handler: { ...handler, request } }),
    ).rejects.toThrow()

    // 1 initial attempt + 1 retry, both fail
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not throw when retries are exhausted and failOnError is false', async () => {
    const request = vi.fn(() => new Response('nope', { status: 500 }))

    const startConfig = makeStartConfig('/about', {
      retryCount: 1,
      failOnError: false,
    })

    await expect(
      prerender({ startConfig, handler: { ...handler, request } }),
    ).resolves.not.toThrow()

    expect(request).toHaveBeenCalledTimes(2)
  })
})
