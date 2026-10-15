import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'
import type {
  Page,
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
} from '../src/schema'
import type * as fsModule from 'node:fs'
import type * as utilsModule from '../src/utils'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<typeof utilsModule>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fsModule>('node:fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  }
})

function okResponse(body = '<html></html>') {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

function failingResponse() {
  return new Response('', {
    status: 500,
    statusText: 'Internal Server Error',
  })
}

function makeStartConfig(
  pagePath: string,
  prerenderOverrides: Record<string, unknown> = {},
): TanStackStartOutputConfig {
  const config: TanStackStartInputConfig = {
    importProtection: {},
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      crawlLinks: false,
      retryCount: 0,
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
  }

  return config as unknown as TanStackStartOutputConfig
}

describe('sitemap exclusion for failed pages', () => {
  it('marks a page that never succeeds as excluded from the sitemap', async () => {
    const requestMock = vi.fn().mockResolvedValue(failingResponse())

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/broken', {
      failOnError: false,
    })

    await prerender({ startConfig, handler })

    const page = startConfig.pages.find((p: Page) => p.path === '/broken')
    expect(page?.sitemap?.exclude).toBe(true)
  })

  it('leaves a successfully rendered page eligible for the sitemap', async () => {
    const requestMock = vi.fn().mockResolvedValue(okResponse())

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/about')

    await prerender({ startConfig, handler })

    const page = startConfig.pages.find((p: Page) => p.path === '/about')
    expect(page?.sitemap?.exclude).not.toBe(true)
  })

  it('excludes a crawled page from the sitemap when its render ultimately fails', async () => {
    let aboutCalls = 0
    const requestMock = vi.fn((path: string): Promise<Response> => {
      if (path === '/about/' || path === '/about') {
        aboutCalls++
        return Promise.resolve(
          okResponse(
            '<html><body><a href="/broken">broken link</a></body></html>',
          ),
        )
      }

      return Promise.resolve(failingResponse())
    })

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/about', {
      failOnError: false,
      crawlLinks: true,
    })

    await prerender({ startConfig, handler })

    expect(aboutCalls).toBe(1)

    const brokenPage = startConfig.pages.find(
      (p: Page) => p.path === '/broken',
    )
    expect(brokenPage).toBeDefined()
    expect(brokenPage?.sitemap?.exclude).toBe(true)
  })

  it('only excludes pages from the sitemap after all retries have failed', async () => {
    const requestMock = vi.fn().mockResolvedValue(failingResponse())

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/broken', {
      retryCount: 1,
      retryDelay: 0,
      failOnError: false,
    })

    await prerender({ startConfig, handler })

    // One initial attempt plus one retry
    expect(requestMock).toHaveBeenCalledTimes(2)

    const page = startConfig.pages.find((p: Page) => p.path === '/broken')
    expect(page?.sitemap?.exclude).toBe(true)
  })
})
