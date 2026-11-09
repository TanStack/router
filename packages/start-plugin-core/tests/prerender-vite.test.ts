import { promises as fs } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prerenderWithVite } from '../src/vite/prerender'

const startPrerenderPreview = vi.hoisted(() => vi.fn())
const closePreview = vi.hoisted(() => vi.fn())

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})
vi.mock('../src/vite/prerender-preview', () => ({ startPrerenderPreview }))

function makeStartConfig() {
  return {
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      concurrency: 1,
      failOnError: false,
    },
    pages: [{ path: '/about' }],
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

function makeBuilder() {
  return {
    environments: {
      ssr: { config: { configFile: '/vite.config.ts' } },
      client: { config: { build: { outDir: '/client' } } },
    },
  } as any
}

describe('Vite prerender network sink', () => {
  beforeEach(() => {
    closePreview.mockReset()
    startPrerenderPreview.mockReset().mockResolvedValue({
      baseUrl: new URL('http://127.0.0.1:4173/'),
      close: closePreview,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not fetch a raw redirect outside the preview origin', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, {
          status: 307,
          headers: { location: 'https://attacker.test/leak' },
        }),
    )
    vi.stubGlobal('fetch', fetch)
    await prerenderWithVite({
      startConfig: makeStartConfig(),
      builder: makeBuilder(),
    })

    expect(fetch).toHaveBeenCalledOnce()
    const request = fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) {
      throw new Error('Expected the Vite prerender sink to fetch a Request')
    }
    expect(request.url).toBe('http://127.0.0.1:4173/about/')
    expect(request.redirect).toBe('manual')
  })

  it('follows an absolute redirect on the actual Vite preview origin', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request) =>
        new Response(null, { status: 404 }),
    )
    fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 307,
        headers: { location: 'http://127.0.0.1:4173/next/?from=about' },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    await prerenderWithVite({
      startConfig: makeStartConfig(),
      builder: makeBuilder(),
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    const requests = fetch.mock.calls.map(([request]) => {
      expect(request).toBeInstanceOf(Request)
      if (!(request instanceof Request)) {
        throw new Error('Expected the Vite prerender sink to fetch a Request')
      }
      expect(request.redirect).toBe('manual')
      return request.url
    })
    expect(requests).toEqual([
      'http://127.0.0.1:4173/about/',
      'http://127.0.0.1:4173/next/?from=about',
    ])
  })

  it('closes the preview after the output and onSuccess finish', async () => {
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined)
    const writeFile = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>page</html>')),
    )
    let finishSuccess!: () => void
    const success = new Promise<void>((resolve) => {
      finishSuccess = resolve
    })
    const onSuccess = vi.fn(() => success)
    const startConfig = makeStartConfig()
    startConfig.prerender.onSuccess = onSuccess

    const rendering = prerenderWithVite({ startConfig, builder: makeBuilder() })
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())

    expect(writeFile).toHaveBeenCalledOnce()
    expect(closePreview).not.toHaveBeenCalled()
    finishSuccess()
    await rendering
    expect(closePreview).toHaveBeenCalledOnce()
  })

  it('closes the preview if initial page validation fails', async () => {
    const startConfig = makeStartConfig()
    startConfig.pages = [{ path: 'https://outside.test/' }]

    await expect(
      prerenderWithVite({ startConfig, builder: makeBuilder() }),
    ).rejects.toThrow(/prerender page path must be relative/i)
    expect(closePreview).toHaveBeenCalledOnce()
  })

  it('closes the preview when a failed page is skipped', async () => {
    const error = new Error('Failed to request page')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    const startConfig = makeStartConfig()
    await prerenderWithVite({ startConfig, builder: makeBuilder() })
    expect(closePreview).toHaveBeenCalledOnce()
  })
})
