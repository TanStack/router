import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

// Mock fs to prevent actual file system operations
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

function okResponse() {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

function failResponse() {
  return new Response('boom', { status: 500 })
}

function makeStartConfig(
  pagePath: string,
  prerenderOverrides: Record<string, unknown>,
) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      crawlLinks: false,
      retryDelay: 0,
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

describe('prerender retry and failOnError', () => {
  it('retries a failing page up to retryCount times until it succeeds', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(failResponse())
      .mockResolvedValueOnce(failResponse())
      .mockResolvedValue(okResponse())
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/flaky', {
      retryCount: 2,
      failOnError: true,
    })

    await expect(prerender({ startConfig, handler })).resolves.not.toThrow()
    // 1 initial attempt + 2 retries, succeeding on the third
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('fails the build when a page fails and failOnError is set', async () => {
    const request = vi.fn().mockResolvedValue(failResponse())
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/broken', {
      retryCount: 0,
      failOnError: true,
    })

    await expect(prerender({ startConfig, handler })).rejects.toThrow(
      /Failed to fetch/,
    )
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retries then fails the build when the page never recovers', async () => {
    const request = vi.fn().mockResolvedValue(failResponse())
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/broken', {
      retryCount: 2,
      failOnError: true,
    })

    await expect(prerender({ startConfig, handler })).rejects.toThrow(
      /Failed to fetch/,
    )
    // 1 initial attempt + 2 retries before giving up
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('does not fail the build when failOnError is disabled', async () => {
    const request = vi.fn().mockResolvedValue(failResponse())
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/broken', {
      retryCount: 0,
      failOnError: false,
    })

    await expect(prerender({ startConfig, handler })).resolves.not.toThrow()
  })

  it('records a retried crawled page only once', async () => {
    let childAttempts = 0
    const request = vi.fn((path: string) => {
      if (path.includes('child')) {
        childAttempts++
        return Promise.resolve(
          childAttempts === 1 ? failResponse() : okResponse(),
        )
      }
      return Promise.resolve(
        new Response('<html><a href="/child">child</a></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      )
    })
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/', {
      crawlLinks: true,
      retryCount: 1,
      failOnError: false,
    })

    await prerender({ startConfig, handler })

    // The crawled page fails once and is retried, but must be recorded once.
    const childEntries = startConfig.pages.filter(
      (page: { path: string }) => page.path === '/child',
    )
    expect(childEntries).toHaveLength(1)
  })

  it('aggregates multiple page failures into an AggregateError', async () => {
    const request = vi.fn().mockResolvedValue(failResponse())
    const handler = { getClientOutputDirectory: () => '/client', request }
    const startConfig = makeStartConfig('/a', {
      retryCount: 0,
      failOnError: true,
    })
    startConfig.pages = [{ path: '/a' }, { path: '/b' }]

    let error: unknown
    try {
      await prerender({ startConfig, handler })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(AggregateError)
    if (error instanceof AggregateError) {
      expect(error.errors).toHaveLength(2)
    }
  })
})
