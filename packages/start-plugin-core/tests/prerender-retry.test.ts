import { describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'
import type {
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

describe('prerender retry behaviour', () => {
  it('re-fetches the page on retry', async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValueOnce(failingResponse())
      .mockResolvedValueOnce(failingResponse())
      .mockResolvedValueOnce(okResponse())

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/about', {
      retryCount: 2,
      retryDelay: 0,
    })

    await expect(prerender({ startConfig, handler })).resolves.not.toThrow()

    // One initial attempt plus two retries
    expect(requestMock).toHaveBeenCalledTimes(3)
  })

  it('stops after retryCount attempts', async () => {
    const requestMock = vi.fn().mockResolvedValue(failingResponse())

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/broken', {
      retryCount: 2,
      retryDelay: 0,
      failOnError: false,
    })

    await expect(prerender({ startConfig, handler })).resolves.not.toThrow()

    // One initial attempt plus two retries
    expect(requestMock).toHaveBeenCalledTimes(3)
  })

  it('rejects once retries are exhausted with the default failOnError behaviour', async () => {
    const requestMock = vi.fn().mockResolvedValue(failingResponse())

    const handler = {
      getClientOutputDirectory: () => '/client',
      request: requestMock,
    }

    const startConfig = makeStartConfig('/broken', {
      retryCount: 2,
      retryDelay: 0,
    })

    await expect(prerender({ startConfig, handler })).rejects.toThrow(
      /Failed to fetch/i,
    )

    // One initial attempt plus two retries
    expect(requestMock).toHaveBeenCalledTimes(3)
  })
})
