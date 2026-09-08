import { promises as fsp } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prerender } from '../src/prerender'

beforeEach(() => {
  globalThis.TSS_PRERENDER_ROUTE_TREE = async () => undefined
})

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

function makeStartConfig(pagePath: string) {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
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

function htmlResponse() {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

describe('prerender public sinks', () => {
  it('respects concurrency after streaming discovery finishes', async () => {
    const startConfig = makeStartConfig('/first')
    startConfig.pages = Array.from({ length: 8 }, (_, i) => ({
      path: `/page-${i}`,
    }))
    startConfig.prerender.concurrency = 2
    let active = 0
    let maximum = 0
    const request = vi.fn(async () => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return htmlResponse()
    })
    const close = vi.fn(() => {
      expect(active).toBe(0)
      return Promise.resolve()
    })
    await prerender({
      startConfig,
      handler: { getClientOutputDirectory: () => '/client', request, close },
    })
    expect(request).toHaveBeenCalledTimes(8)
    expect(maximum).toBe(2)
    expect(close).toHaveBeenCalledOnce()
  })

  it('retries a failed page and emits it only after success', async () => {
    const startConfig = makeStartConfig('/retry')
    startConfig.prerender.retryCount = 1
    startConfig.prerender.retryDelay = 0
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(htmlResponse())
    const pageSink = vi.fn()
    await prerender({
      startConfig,
      pageSink,
      handler: { getClientOutputDirectory: () => '/client', request },
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(pageSink).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ path: '/retry' }),
    )
  })

  it('rejects failed requests, cancels discovery and closes the handler', async () => {
    globalThis.TSS_PRERENDER_ROUTE_TREE = async () =>
      ({
        options: {},
        children: [
          {
            id: '/posts/$slug',
            fullPath: '/posts/$slug',
            options: {
              async *prerenderParams() {
                yield { params: { slug: 'first' } }
                await new Promise(() => {})
              },
            },
          },
        ],
      }) as any
    const request = vi.fn(async () => {
      throw new Error('request failed')
    })
    const close = vi.fn(async () => {})
    await expect(
      prerender({
        startConfig: makeStartConfig('/about'),
        handler: { getClientOutputDirectory: () => '/client', request, close },
      }),
    ).rejects.toThrow('request failed')
    expect(close).toHaveBeenCalledOnce()
    expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
  })

  it('does not queue links from active pages after a fatal request failure', async () => {
    const startConfig = makeStartConfig('/failure')
    startConfig.pages.push({ path: '/active' })
    startConfig.prerender.concurrency = 2
    let startFailure!: () => void
    const activeStarted = new Promise<void>((resolve) => {
      startFailure = resolve
    })
    const request = vi.fn(async (requestPath: string) => {
      if (requestPath === '/failure/') {
        await activeStarted
        throw new Error('request failed')
      }
      startFailure()
      await new Promise((resolve) => setTimeout(resolve, 0))
      return new Response('<a href="/unexpected">Unexpected</a>', {
        headers: { 'content-type': 'text/html' },
      })
    })
    const close = vi.fn(async () => {})

    await expect(
      prerender({
        startConfig,
        handler: { getClientOutputDirectory: () => '/client', request, close },
      }),
    ).rejects.toThrow('request failed')

    expect(request.mock.calls.map(([requestPath]) => requestPath)).toEqual([
      '/failure/',
      '/active/',
    ])
    expect(close).toHaveBeenCalledOnce()
  })

  it('aborts active requests and closes the handler when discovery times out', async () => {
    const startConfig = makeStartConfig('/about')
    startConfig.prerender.prerenderParamsTimeout = 10
    globalThis.TSS_PRERENDER_ROUTE_TREE = async () =>
      ({
        options: {},
        children: [
          {
            id: '/posts/$slug',
            fullPath: '/posts/$slug',
            options: {
              async *prerenderParams() {
                yield { params: { slug: 'first' } }
                await new Promise(() => {})
              },
            },
          },
        ],
      }) as any
    const aborted = vi.fn()
    const request = vi.fn((_path: string, options?: RequestInit) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      const signal = options!.signal!
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted()
            reject(signal.reason)
          },
          { once: true },
        )
      })
    })
    const close = vi.fn(async () => {})

    await expect(
      prerender({
        startConfig,
        handler: { getClientOutputDirectory: () => '/client', request, close },
      }),
    ).rejects.toThrow('prerenderParams for route /posts/$slug timed out')

    expect(request).toHaveBeenCalledOnce()
    expect(aborted).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
  })

  it('awaits disabled-page sinks before closing the handler', async () => {
    const startConfig = makeStartConfig('/sitemap-only')
    startConfig.pages[0].prerender = { enabled: false }
    const order: Array<string> = []
    const request = vi.fn()
    await prerender({
      startConfig,
      pageSink: async () => {
        await Promise.resolve()
        order.push('sink')
      },
      handler: {
        getClientOutputDirectory: () => '/client',
        request,
        close: async () => {
          order.push('close')
        },
      },
    })
    expect(request).not.toHaveBeenCalled()
    expect(order).toEqual(['sink', 'close'])
  })

  it.each([
    { explicitPath: '/about', linkPath: '/about', normalizedPath: '/about' },
    { explicitPath: '/caf%C3%A9', linkPath: '/café', normalizedPath: '/café' },
  ])(
    'preserves explicit page options when a streamed page crawls them first ($explicitPath)',
    async ({ explicitPath, linkPath, normalizedPath }) => {
      const startConfig = makeStartConfig(explicitPath)
      startConfig.pages[0].prerender = { enabled: false }
      let releaseDiscovery!: () => void
      const crawled = new Promise<void>((resolve) => {
        releaseDiscovery = resolve
      })
      globalThis.TSS_PRERENDER_ROUTE_TREE = async () =>
        ({
          options: {},
          children: [
            {
              id: '/posts/$slug',
              fullPath: '/posts/$slug',
              options: {
                async *prerenderParams() {
                  yield { params: { slug: 'first' } }
                  await crawled
                },
              },
            },
          ],
        }) as any
      const request = vi.fn(
        async () =>
          new Response(`<a href="${linkPath}">About</a>`, {
            headers: { 'content-type': 'text/html' },
          }),
      )
      const pageSink = vi.fn(async () => {
        // The generator resumes after the first page has queued its links.
        setTimeout(releaseDiscovery, 0)
      })

      await prerender({
        startConfig,
        pageSink,
        handler: { getClientOutputDirectory: () => '/client', request },
      })

      expect(request).toHaveBeenCalledExactlyOnceWith(
        '/posts/first/',
        expect.anything(),
      )
      expect(pageSink).toHaveBeenCalledWith(
        expect.objectContaining({
          path: normalizedPath,
          prerender: { enabled: false },
        }),
      )
    },
  )

  it.each([
    {
      pagePath: '/posts/reserved%3Fhash%23plus%2B?tag=router+start',
      requestPath: '/posts/reserved%3Fhash%23plus%2B/?tag=router+start',
      outputPath: '/client/posts/reserved%3Fhash%23plus%2B/index.html',
    },
    {
      pagePath: '/posts/nested%5Cslug',
      requestPath: '/posts/nested%5Cslug/',
      outputPath: '/client/posts/nested%5Cslug/index.html',
    },
    {
      pagePath: '/posts/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD',
      requestPath: '/posts/대한민국/',
      outputPath: '/client/posts/대한민국/index.html',
    },
  ])(
    'preserves the request and output path for $pagePath',
    async ({ pagePath, requestPath, outputPath }) => {
      vi.mocked(fsp.writeFile).mockClear()
      const request = vi.fn(async () => htmlResponse())
      await prerender({
        startConfig: makeStartConfig(pagePath),
        handler: { getClientOutputDirectory: () => '/client', request },
      })
      expect(request).toHaveBeenCalledExactlyOnceWith(
        requestPath,
        expect.anything(),
      )
      expect(fsp.writeFile).toHaveBeenCalledExactlyOnceWith(
        outputPath,
        '<html></html>',
      )
    },
  )

  it('allows relative paths', async () => {
    const request = vi.fn(async () => htmlResponse())
    await expect(
      prerender({
        startConfig: makeStartConfig('/about'),
        handler: { getClientOutputDirectory: () => '/client', request },
      }),
    ).resolves.not.toThrow()
  })

  it.each([
    'https://attacker.test/leak',
    '//attacker.test/leak',
    '/%2fattacker.test/leak',
    '/%5cattacker.test/leak',
  ])('rejects page target %j before requesting it', async (pagePath) => {
    const request = vi.fn(async () => htmlResponse())

    await expect(
      prerender({
        startConfig: makeStartConfig(pagePath),
        handler: { getClientOutputDirectory: () => '/client', request },
      }),
    ).rejects.toThrow(/prerender page path must be relative/i)
    expect(request).not.toHaveBeenCalled()
  })

  it.each([{ outputPath: 'nested', expected: '/client/nested/index.html' }])(
    'keeps output $outputPath inside the client directory',
    async ({ outputPath, expected }) => {
      vi.mocked(fsp.writeFile).mockClear()
      vi.mocked(fsp.mkdir).mockClear()
      const startConfig = makeStartConfig('/about')
      startConfig.prerender.failOnError = false
      startConfig.pages[0].prerender = { outputPath }
      const request = vi.fn(async () => htmlResponse())

      await prerender({
        startConfig,
        handler: {
          getClientOutputDirectory: () => '/client',
          request,
        },
      })

      expect(request).toHaveBeenCalledOnce()
      if (expected) {
        expect(fsp.writeFile).toHaveBeenCalledExactlyOnceWith(
          expected,
          '<html></html>',
        )
      } else {
        expect(fsp.writeFile).not.toHaveBeenCalled()
        expect(fsp.mkdir).not.toHaveBeenCalled()
      }
    },
  )

  it.each(['https://attacker.test/leak'])(
    'does not request raw redirect target %j',
    async (location) => {
      const request = vi.fn(
        async () =>
          new Response(null, {
            status: 307,
            headers: { location },
          }),
      )
      const startConfig = makeStartConfig('/about')
      startConfig.prerender.failOnError = false

      await prerender({
        startConfig,
        handler: { getClientOutputDirectory: () => '/client', request },
      })

      expect(request).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps a canonical double-slash redirect on the preview origin', async () => {
    const requestedUrls: Array<string> = []
    const request = vi.fn(async (requestPath: string) => {
      requestedUrls.push(new URL(requestPath, 'http://localhost').href)
      if (requestedUrls.length === 1) {
        return new Response(null, {
          status: 307,
          headers: {
            location: 'http://localhost/a/..//attacker.test/leak',
          },
        })
      }
      return htmlResponse()
    })

    await prerender({
      startConfig: makeStartConfig('/about'),
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(requestedUrls).toEqual([
      'http://localhost/about/',
      'http://localhost//attacker.test/leak',
    ])
  })

  it('skips requests when the public prerender filter excludes every page', async () => {
    const request = vi.fn(async () => htmlResponse())
    const startConfig = makeStartConfig('/about')
    startConfig.prerender.filter = () => false

    await prerender({
      startConfig,
      handler: { getClientOutputDirectory: () => '/client', request },
    })

    expect(request).not.toHaveBeenCalled()
  })
})
