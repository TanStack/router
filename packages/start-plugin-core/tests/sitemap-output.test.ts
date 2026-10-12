import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { postBuild } from '../src/post-build'
import { prerender } from '../src/prerender'
import { parseStartConfig } from '../src/schema'
import type { TanStackStartOutputConfig } from '../src/schema'

describe('post-build sitemap', () => {
  it('writes sitemap files before resolving, using pages discovered during prerendering', async () => {
    const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-sitemap-'))
    const startConfig = parseStartConfig(
      {
        sitemap: { host: 'https://example.com', outputPath: 'custom.xml' },
        prerender: { enabled: true },
        pages: [
          { path: '/hidden', sitemap: { exclude: true } },
          {
            path: '/posts?sort=a&tag=b',
            sitemap: {
              lastmod: '2026-01-02',
              priority: 0,
              changefreq: 'daily',
            },
          },
        ],
      },
      { framework: 'react' },
      process.cwd(),
    )

    try {
      await postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => publicDir,
          async prerender(config) {
            await Promise.resolve()
            config.pages.push({ path: '/discovered' })
          },
        },
      })

      const xml = await readFile(path.join(publicDir, 'custom.xml'), 'utf8')
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(xml).toContain('https://example.com/posts?sort=a&amp;tag=b')
      expect(xml).toContain('<lastmod>2026-01-02</lastmod>')
      expect(xml).toContain('<priority>0</priority>')
      expect(xml).toContain('<changefreq>daily</changefreq>')
      expect(xml).toContain('<loc>https://example.com/discovered</loc>')
      expect(xml).not.toContain('/hidden')
      const pages = JSON.parse(
        await readFile(path.join(publicDir, 'pages.json'), 'utf8'),
      )
      expect(pages).toEqual({
        pages: startConfig.pages,
        host: 'https://example.com',
        lastBuilt: expect.any(String),
      })
    } finally {
      await rm(publicDir, { recursive: true, force: true })
    }
  })

  it('publishes only sitemap metadata, keeping page and SPA prerender headers private', async () => {
    const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-sitemap-private-'))
    const startConfig = parseStartConfig(
      {
        sitemap: { host: 'https://example.com' },
        prerender: { enabled: true },
        spa: {
          enabled: true,
          maskPath: '/_shell',
          prerender: {
            headers: {
              Authorization: 'Bearer SPA_SECRET',
              Cookie: 'spa_session=PRIVATE_COOKIE',
            },
          },
        },
        pages: [
          {
            path: '/preview',
            fromCrawl: true,
            prerender: {
              headers: {
                Authorization: 'Bearer PAGE_SECRET',
                Cookie: 'preview_session=PRIVATE_COOKIE',
              },
            },
            sitemap: {
              lastmod: new Date('2026-01-02'),
              priority: 0,
              changefreq: 'daily',
              alternateRefs: [
                { href: 'https://example.com/fr/preview', hreflang: 'fr' },
              ],
              images: [
                {
                  loc: 'https://example.com/preview.png',
                  title: 'Preview',
                  caption: 'Public image',
                },
              ],
              news: {
                publication: { name: 'Example', language: 'en' },
                publicationDate: new Date('2026-01-02'),
                title: 'Public title',
              },
            },
          },
        ],
      },
      { framework: 'react' },
      process.cwd(),
    )
    const adapterPrerender = vi.fn(
      async (config: TanStackStartOutputConfig) => {
        expect(config.pages[0]?.prerender?.headers?.Authorization).toBe(
          'Bearer PAGE_SECRET',
        )
        expect(config.pages[1]?.prerender?.headers?.Authorization).toBe(
          'Bearer SPA_SECRET',
        )
      },
    )

    try {
      await postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => publicDir,
          prerender: adapterPrerender,
        },
      })
      expect(adapterPrerender).toHaveBeenCalledOnce()

      const pagesJson = await readFile(
        path.join(publicDir, 'pages.json'),
        'utf8',
      )
      expect(pagesJson).not.toContain('SECRET')
      expect(pagesJson).not.toContain('PRIVATE_COOKIE')
      expect(JSON.parse(pagesJson)).toEqual({
        host: 'https://example.com',
        lastBuilt: expect.any(String),
        pages: [
          {
            path: '/preview',
            fromCrawl: true,
            sitemap: {
              lastmod: '2026-01-02T00:00:00.000Z',
              priority: 0,
              changefreq: 'daily',
              alternateRefs: [
                { href: 'https://example.com/fr/preview', hreflang: 'fr' },
              ],
              images: [
                {
                  loc: 'https://example.com/preview.png',
                  title: 'Preview',
                  caption: 'Public image',
                },
              ],
              news: {
                publication: { name: 'Example', language: 'en' },
                publicationDate: '2026-01-02T00:00:00.000Z',
                title: 'Public title',
              },
            },
          },
          { path: '/_shell', sitemap: { exclude: true } },
        ],
      })
      const xml = await readFile(path.join(publicDir, 'sitemap.xml'), 'utf8')
      expect(xml).toContain('https://example.com/preview')
      expect(xml).not.toContain('/_shell')
      expect(xml).not.toContain('SECRET')
      expect(xml).not.toContain('PRIVATE_COOKIE')
    } finally {
      await rm(publicDir, { recursive: true, force: true })
    }
  })

  it('keeps nested private metadata returned by the prerender hook out of public files', async () => {
    const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-sitemap-hook-'))
    const onSuccess = vi.fn(() => ({
      sitemap: {
        alternateRefs: [
          {
            href: 'https://example.com/fr/preview',
            hreflang: 'fr',
            authorization: 'ALTERNATE_SECRET',
          },
        ],
        images: [
          {
            loc: 'https://example.com/preview.png',
            title: 'Preview',
            caption: 'Public image',
            cookie: 'IMAGE_SECRET',
          },
        ],
        news: {
          publication: {
            name: 'Example',
            language: 'en',
            token: 'PUBLICATION_SECRET',
          },
          publicationDate: '2026-01-02',
          title: 'Public title',
          authorization: 'NEWS_SECRET',
        },
      },
    }))
    const startConfig = parseStartConfig(
      {
        sitemap: { host: 'https://example.com' },
        prerender: {
          enabled: true,
          crawlLinks: false,
          autoStaticPathsDiscovery: false,
          onSuccess,
        },
        spa: { enabled: false },
        pages: [{ path: '/preview' }],
      },
      { framework: 'react' },
      process.cwd(),
    )

    try {
      await postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => publicDir,
          async prerender(config) {
            await prerender({
              startConfig: config,
              handler: {
                getClientOutputDirectory: () => publicDir,
                async request() {
                  return new Response('<html><body>Preview</body></html>', {
                    headers: { 'content-type': 'text/html' },
                  })
                },
              },
            })
          },
        },
      })

      expect(onSuccess).toHaveBeenCalledOnce()
      const pagesJson = await readFile(
        path.join(publicDir, 'pages.json'),
        'utf8',
      )
      expect(pagesJson).not.toContain('SECRET')
      expect(JSON.parse(pagesJson).pages).toEqual([
        {
          path: '/preview',
          sitemap: {
            alternateRefs: [
              { href: 'https://example.com/fr/preview', hreflang: 'fr' },
            ],
            images: [
              {
                loc: 'https://example.com/preview.png',
                title: 'Preview',
                caption: 'Public image',
              },
            ],
            news: {
              publication: { name: 'Example', language: 'en' },
              publicationDate: '2026-01-02',
              title: 'Public title',
            },
          },
        },
      ])
      const xml = await readFile(path.join(publicDir, 'sitemap.xml'), 'utf8')
      expect(xml).toContain('Public title')
      expect(xml).not.toContain('SECRET')
    } finally {
      await rm(publicDir, { recursive: true, force: true })
    }
  })

  it('rejects invalid prerender hook sitemap data without writing sitemap files', async () => {
    const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-sitemap-invalid-'))
    const startConfig = parseStartConfig(
      {
        sitemap: { host: 'https://example.com' },
        prerender: {
          enabled: true,
          crawlLinks: false,
          autoStaticPathsDiscovery: false,
          onSuccess: () => ({
            sitemap: {
              alternateRefs: [{ href: 'https://example.com/fr/preview' }],
            },
          }),
        },
        spa: { enabled: false },
        pages: [{ path: '/preview' }],
      },
      { framework: 'react' },
      process.cwd(),
    )

    try {
      const error = await postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => publicDir,
          async prerender(config) {
            await prerender({
              startConfig: config,
              handler: {
                getClientOutputDirectory: () => publicDir,
                async request() {
                  return new Response('<html><body>Preview</body></html>', {
                    headers: { 'content-type': 'text/html' },
                  })
                },
              },
            })
          },
        },
      }).then(
        () => undefined,
        (caught: unknown) => caught,
      )

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(
        'Invalid sitemap data for page "/preview"',
      )
      expect((error as Error).message).toContain(
        'sitemap.alternateRefs[0].hreflang',
      )
      expect((error as Error).cause).toBeInstanceOf(z.ZodError)

      await expect(
        readFile(path.join(publicDir, 'pages.json'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(
        readFile(path.join(publicDir, 'sitemap.xml'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(publicDir, { recursive: true, force: true })
    }
  })

  it('propagates sitemap validation errors through the post-build promise', async () => {
    await expect(
      postBuild({
        startConfig: parseStartConfig(
          { sitemap: { enabled: true } },
          { framework: 'react' },
          process.cwd(),
        ),
        adapter: {
          getClientOutputDirectory: () => '/unused',
          prerender: vi.fn(),
        },
      }),
    ).rejects.toThrow(
      'Sitemap host is not set and required to build the sitemap.',
    )
  })
})
