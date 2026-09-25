import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'xmlbuilder2'
import { postBuild } from '../src/post-build'
import { prerender } from '../src/prerender'
import type { StartPostBuildAdapter } from '../src/post-build'
import type { TanStackStartOutputConfig } from '../src/schema'

describe('postBuild sitemap output', () => {
  let publicDir: string

  beforeEach(async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'tss-post-build-'))
    delete globalThis.TSS_PRERENDABLE_PATHS
    globalThis.TSS_PRERENDER_ROUTE_TREE = async () => undefined
  })

  afterEach(async () => {
    delete globalThis.TSS_PRERENDER_ROUTE_TREE
    delete globalThis.TSS_PRERENDABLE_PATHS
    await rm(publicDir, { recursive: true, force: true })
  })

  function config(): TanStackStartOutputConfig {
    return {
      router: { basepath: '' },
      spa: { enabled: false, prerender: { outputPath: '/_shell' } },
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        concurrency: 1,
        crawlLinks: false,
        retryCount: 0,
        failOnError: false,
      },
      sitemap: {
        enabled: true,
        host: 'https://example.com',
        outputPath: 'sitemap.xml',
      },
      pages: [],
    } as unknown as TanStackStartOutputConfig
  }

  it('streams successful and disabled pages, excluding filtered and failed pages', async () => {
    const startConfig = config()
    startConfig.pages = [
      {
        path: '/success',
        prerender: {
          onSuccess: () => ({
            sitemap: { priority: 0, lastmod: '2026-05-05' },
          }),
        },
      },
      {
        path: '/disabled',
        prerender: { enabled: false },
        sitemap: { changefreq: 'weekly' },
      },
      { path: '/filtered' },
      { path: '/excluded', sitemap: { exclude: true } },
      { path: '/failed' },
    ]
    startConfig.prerender!.filter = (page) => page.path !== '/filtered'
    const request = vi.fn(
      async (url: string) =>
        new Response('<html>rendered</html>', {
          status: url === '/failed/' ? 500 : 200,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const close = vi.fn(async () => {})
    const adapter: StartPostBuildAdapter = {
      getClientOutputDirectory: () => publicDir,
      prerender: (options, sinks) =>
        prerender({
          startConfig: options,
          pageSink: sinks?.pageSink,
          handler: {
            getClientOutputDirectory: () => publicDir,
            request,
            close,
          },
        }),
    }
    await postBuild({ startConfig, adapter })

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/success/',
      '/excluded/',
      '/failed/',
    ])
    expect(close).toHaveBeenCalledOnce()
    const xml = create(
      await readFile(join(publicDir, 'sitemap.xml'), 'utf8'),
    ).end({ format: 'object' }) as any
    expect(xml.urlset.url.map((url: any) => url.loc)).toEqual([
      'https://example.com/success',
      'https://example.com/disabled',
    ])
    expect(xml.urlset.url[0]).toMatchObject({
      priority: '0',
      lastmod: '2026-05-05',
    })
    expect(xml.urlset.url[1].changefreq).toBe('weekly')
    const json = JSON.parse(
      await readFile(join(publicDir, 'pages.json'), 'utf8'),
    )
    expect(json.pages.map((page: any) => page.path)).toEqual([
      '/success',
      '/disabled',
      '/excluded',
    ])
    expect(json.pages[0].sitemap).toEqual({
      priority: 0,
      lastmod: '2026-05-05',
    })
    expect(json.pages[1]).toMatchObject({
      prerender: { enabled: false },
      sitemap: { changefreq: 'weekly' },
    })
    expect(json.pages[2].sitemap).toEqual({ exclude: true })
    await expect(
      access(join(publicDir, 'success/index.html')),
    ).resolves.toBeUndefined()
    await expect(
      access(join(publicDir, 'excluded/index.html')),
    ).resolves.toBeUndefined()
    await expect(
      access(join(publicDir, 'disabled/index.html')),
    ).rejects.toThrow()
    await expect(access(join(publicDir, 'failed/index.html'))).rejects.toThrow()
  })

  it('awaits explicit page writes when prerendering is disabled', async () => {
    const startConfig = config()
    startConfig.prerender!.enabled = false
    startConfig.pages = [
      { path: '/second' },
      { path: '/first', sitemap: { priority: 0 } },
    ]
    const render = vi.fn()
    await postBuild({
      startConfig,
      adapter: { getClientOutputDirectory: () => publicDir, prerender: render },
    })
    expect(render).not.toHaveBeenCalled()
    const json = JSON.parse(
      await readFile(join(publicDir, 'pages.json'), 'utf8'),
    )
    expect(json.pages).toEqual(startConfig.pages)
  })

  it('creates no sitemap files when disabled while still prerendering', async () => {
    const startConfig = config()
    startConfig.sitemap!.enabled = false
    startConfig.pages = [{ path: '/success' }]
    const outputDirectory = vi.fn(() => publicDir)
    await postBuild({
      startConfig,
      adapter: {
        getClientOutputDirectory: outputDirectory,
        prerender: (options, sinks) =>
          prerender({
            startConfig: options,
            pageSink: sinks?.pageSink,
            handler: {
              getClientOutputDirectory: () => publicDir,
              request: async () =>
                new Response('<html>rendered</html>', {
                  headers: { 'content-type': 'text/html' },
                }),
            },
          }),
      },
    })
    expect(outputDirectory).not.toHaveBeenCalled()
    await expect(
      access(join(publicDir, 'success/index.html')),
    ).resolves.toBeUndefined()
    await expect(access(join(publicDir, 'sitemap.xml'))).rejects.toThrow()
    await expect(access(join(publicDir, 'pages.json'))).rejects.toThrow()
  })

  it('closes output after a fatal prerender error', async () => {
    const startConfig = config()
    startConfig.pages = [{ path: '/success' }, { path: '/failed' }]
    startConfig.prerender!.failOnError = true
    const close = vi.fn(async () => {})
    await expect(
      postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => publicDir,
          prerender: (options, sinks) =>
            prerender({
              startConfig: options,
              pageSink: sinks?.pageSink,
              handler: {
                getClientOutputDirectory: () => publicDir,
                request: async (url) =>
                  new Response('<html>rendered</html>', {
                    status: url === '/failed/' ? 500 : 200,
                    headers: { 'content-type': 'text/html' },
                  }),
                close,
              },
            }),
        },
      }),
    ).rejects.toThrow('Failed to fetch')
    expect(close).toHaveBeenCalledOnce()
    const xml = create(
      await readFile(join(publicDir, 'sitemap.xml'), 'utf8'),
    ).end({ format: 'object' }) as any
    expect(xml.urlset.url.loc).toBe('https://example.com/success')
    const json = JSON.parse(
      await readFile(join(publicDir, 'pages.json'), 'utf8'),
    )
    expect(json.pages.map((page: any) => page.path)).toEqual(['/success'])
  })
})
