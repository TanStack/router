import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { HEADERS } from '@tanstack/start-server-core/constants'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postBuild } from '../src/post-build'
import { prerender } from '../src/prerender'
import { parseStartConfig } from '../src/schema'
import type { TanStackStartInputConfig } from '../src/schema'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  }
})

const shellDocument = '<html><body>shell</body></html>'
const routeDocuments: Record<string, string> = {
  '/': '<html><body>home <a href="/about">About</a></body></html>',
  '/about/': '<html><body>about <a href="/">Home</a></body></html>',
}

const publicDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(
    publicDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function build(config: TanStackStartInputConfig) {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-spa-prerender-'))
  publicDirs.push(publicDir)
  const routeRequests: Array<string> = []
  const startConfig = parseStartConfig(
    { sitemap: { host: 'https://example.com' }, ...config },
    { framework: 'react' },
    process.cwd(),
  )

  await postBuild({
    startConfig,
    adapter: {
      getClientOutputDirectory: () => publicDir,
      prerender: (outputConfig) =>
        prerender({
          startConfig: outputConfig,
          handler: {
            getClientOutputDirectory: () => publicDir,
            async request(requestPath, options) {
              const isShell =
                new Headers(options?.headers).get(HEADERS.TSS_SHELL) === 'true'
              if (!isShell) {
                routeRequests.push(requestPath)
              }
              const html = isShell ? shellDocument : routeDocuments[requestPath]
              if (!html) {
                return new Response('Not Found', { status: 404 })
              }
              return new Response(html, {
                headers: { 'content-type': 'text/html' },
              })
            },
          },
        }),
    },
  })

  return {
    routeRequests,
    read: (file: string) => readFile(path.join(publicDir, file), 'utf8'),
  }
}

describe('prerendering with SPA mode', () => {
  it.each([
    {
      name: 'listed with static path discovery',
      config: { pages: [{ path: '/' }, { path: '/about' }] },
      rootPage: { path: '/' },
    },
    {
      name: 'listed without static path discovery',
      config: {
        prerender: { enabled: true, autoStaticPathsDiscovery: false },
        pages: [{ path: '/' }, { path: '/about' }],
      },
      rootPage: { path: '/' },
    },
    {
      name: 'reached by crawling',
      config: { pages: [{ path: '/about' }] },
      rootPage: { path: '/', fromCrawl: true },
    },
  ])(
    'writes the shell and the "/" route when "/" is $name',
    async ({ config, rootPage }) => {
      const { read } = await build({
        spa: { enabled: true },
        prerender: { enabled: true },
        ...config,
      })

      await expect(read('_shell.html')).resolves.toBe(shellDocument)
      await expect(read('index.html')).resolves.toBe(routeDocuments['/'])
      await expect(read('about/index.html')).resolves.toBe(
        routeDocuments['/about/'],
      )

      const sitemap = await read('sitemap.xml')
      expect(sitemap).toContain('<loc>https://example.com/</loc>')
      expect(sitemap).toContain('<loc>https://example.com/about</loc>')
      expect(sitemap).not.toContain('_shell')

      const { pages } = JSON.parse(await read('pages.json'))
      expect(pages).toEqual(
        expect.arrayContaining([
          rootPage,
          { path: '/about' },
          { path: '/', sitemap: { exclude: true } },
        ]),
      )
      expect(pages).toHaveLength(3)
    },
  )

  it.each([
    {
      outputPath: 'index.html',
      name: 'reached by crawling',
      config: { pages: [{ path: '/about' }] },
    },
    {
      outputPath: './index.html',
      name: 'reached by crawling',
      config: { pages: [{ path: '/about' }] },
    },
    {
      outputPath: 'index.html',
      name: 'listed with static path discovery',
      config: { pages: [{ path: '/' }, { path: '/about' }] },
    },
    {
      outputPath: 'index.html',
      name: 'listed without static path discovery',
      config: {
        prerender: { enabled: true, autoStaticPathsDiscovery: false },
        pages: [{ path: '/' }, { path: '/about' }],
      },
    },
  ])(
    'keeps a shell written to $outputPath as the document when "/" is $name',
    async ({ outputPath, config }) => {
      const { read, routeRequests } = await build({
        spa: { enabled: true, prerender: { outputPath } },
        prerender: { enabled: true },
        ...config,
      })

      await expect(read('index.html')).resolves.toBe(shellDocument)
      await expect(read('about/index.html')).resolves.toBe(
        routeDocuments['/about/'],
      )
      expect(routeRequests).toEqual(['/about/'])
    },
  )

  it.each([
    { name: 'with static path discovery', prerender: { enabled: true } },
    {
      name: 'without static path discovery',
      prerender: { enabled: true, autoStaticPathsDiscovery: false },
    },
  ])(
    'keeps a listed "/" in the sitemap when the shell owns index.html $name',
    async ({ prerender }) => {
      const { read } = await build({
        spa: { enabled: true, prerender: { outputPath: 'index.html' } },
        prerender,
        pages: [{ path: '/', sitemap: { priority: 1 } }, { path: '/about' }],
      })

      await expect(read('index.html')).resolves.toBe(shellDocument)
      await expect(read('sitemap.xml')).resolves.toContain(
        '<loc>https://example.com/</loc>',
      )
      expect(JSON.parse(await read('pages.json')).pages).toContainEqual({
        path: '/',
        sitemap: { priority: 1 },
      })
    },
  )

  it('keeps the shell file when "/" is configured to write it', async () => {
    const { read, routeRequests } = await build({
      spa: { enabled: true },
      prerender: { enabled: true },
      pages: [
        { path: '/', prerender: { outputPath: '/_shell' } },
        { path: '/about' },
      ],
    })

    await expect(read('_shell.html')).resolves.toBe(shellDocument)
    expect(routeRequests).toEqual(['/about/'])
  })
})

describe('prerendering without SPA mode', () => {
  it('writes "/" and crawled routes without a shell', async () => {
    const { read } = await build({
      prerender: { enabled: true },
      pages: [{ path: '/about' }],
    })

    await expect(read('index.html')).resolves.toBe(routeDocuments['/'])
    await expect(read('about/index.html')).resolves.toBe(
      routeDocuments['/about/'],
    )
    await expect(read('_shell.html')).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const sitemap = await read('sitemap.xml')
    expect(sitemap).toContain('<loc>https://example.com/</loc>')
    expect(sitemap).toContain('<loc>https://example.com/about</loc>')
  })
})
