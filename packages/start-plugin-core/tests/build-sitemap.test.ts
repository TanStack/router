import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'xmlbuilder2'
import { buildSitemap, createSitemapWriter } from '../src/build-sitemap'
import type { Page, TanStackStartOutputConfig } from '../src/schema'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof fs>()),
}))

describe('streaming sitemap output', () => {
  let publicDir: string

  beforeEach(async () => {
    publicDir = await fs.mkdtemp(join(tmpdir(), 'tss-sitemap-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  function config(pages: Array<Page> = []): TanStackStartOutputConfig {
    return {
      pages,
      sitemap: {
        enabled: true,
        host: 'https://example.com',
        outputPath: 'nested/maps/sitemap.xml',
      },
    } as TanStackStartOutputConfig
  }

  it('escapes and preserves metadata, priority zero, namespaces, and page order', async () => {
    const pages: Array<Page> = [
      {
        path: '/news?q=one&tag=two',
        sitemap: {
          priority: 0,
          changefreq: 'weekly',
          lastmod: new Date('2026-05-05T12:00:00Z'),
          alternateRefs: [
            { href: 'https://example.com/fr?q=1&x="2"', hreflang: 'fr' },
          ],
          images: [
            {
              loc: 'https://example.com/image?a=1&b=2',
              title: 'A < B',
              caption: '"Quoted" & more',
            },
          ],
          news: {
            publication: { name: 'News & Stories', language: 'en' },
            publicationDate: '2026-05-04',
            title: 'A < B & C',
          },
        },
      },
      { path: '/second', sitemap: { priority: 0.8 } },
      {
        path: '/excluded',
        sitemap: { exclude: true },
        prerender: { enabled: false },
      },
    ]
    const writer = createSitemapWriter({ startConfig: config(), publicDir })
    try {
      await Promise.all(pages.map(writer.write))
    } finally {
      await writer.close()
    }

    const xml = await fs.readFile(
      join(publicDir, 'nested/maps/sitemap.xml'),
      'utf8',
    )
    const root = create(xml).root().node as unknown as Element
    expect(root.namespaceURI).toBe(
      'http://www.sitemaps.org/schemas/sitemap/0.9',
    )
    expect(root.getAttribute('xmlns:image')).toBe(
      'http://www.google.com/schemas/sitemap-image/1.1',
    )
    expect(root.getAttribute('xmlns:news')).toBe(
      'http://www.google.com/schemas/sitemap-news/0.9',
    )
    expect(root.getAttribute('xmlns:xhtml')).toBe(
      'http://www.w3.org/1999/xhtml',
    )
    const urls = root.getElementsByTagName('url')
    expect(urls.length).toBe(2)
    const text = (name: string) =>
      urls[0]!.getElementsByTagName(name)[0]!.textContent
    expect({
      loc: text('loc'),
      lastmod: text('lastmod'),
      priority: text('priority'),
      changefreq: text('changefreq'),
      imageLoc: text('image:loc'),
      imageTitle: text('image:title'),
      imageCaption: text('image:caption'),
      publicationName: text('news:name'),
      publicationLanguage: text('news:language'),
      publicationDate: text('news:publication_date'),
      newsTitle: text('news:title'),
    }).toEqual({
      loc: 'https://example.com/news?q=one&tag=two',
      lastmod: '2026-05-05',
      priority: '0',
      changefreq: 'weekly',
      imageLoc: 'https://example.com/image?a=1&b=2',
      imageTitle: 'A < B',
      imageCaption: '"Quoted" & more',
      publicationName: 'News & Stories',
      publicationLanguage: 'en',
      publicationDate: '2026-05-04',
      newsTitle: 'A < B & C',
    })
    const alternate = urls[0]!.getElementsByTagName('xhtml:link')[0]!
    expect(alternate.getAttribute('href')).toBe(
      'https://example.com/fr?q=1&x="2"',
    )
    expect(alternate.getAttribute('hreflang')).toBe('fr')
    expect(alternate.getAttribute('rel')).toBe('alternate')
    expect(urls[1]!.getElementsByTagName('loc')[0]!.textContent).toBe(
      'https://example.com/second',
    )
    const json = JSON.parse(
      await fs.readFile(join(publicDir, 'pages.json'), 'utf8'),
    )
    expect(json.pages).toEqual(JSON.parse(JSON.stringify(pages)))
    expect(json.host).toBe('https://example.com')
    expect(Number.isNaN(Date.parse(json.lastBuilt))).toBe(false)
  })

  it('closes once after queued writes and rejects late writes', async () => {
    const writer = createSitemapWriter({ startConfig: config(), publicDir })
    const written = writer.write({ path: '/first' })
    const closed = writer.close()
    expect(writer.close()).toBe(closed)
    await expect(writer.write({ path: '/late' })).rejects.toThrow('closed')
    await written
    await closed
    await writer.close()
    const json = JSON.parse(
      await fs.readFile(join(publicDir, 'pages.json'), 'utf8'),
    )
    expect(json.pages).toEqual([{ path: '/first' }])
  })

  it('rejects initialization failure and closes a file opened before that failure', async () => {
    await fs.mkdir(join(publicDir, 'pages.json'))
    const open = fs.open
    const closes: Array<ReturnType<typeof vi.spyOn>> = []
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args)
      closes.push(vi.spyOn(handle, 'close'))
      return handle
    })
    const writer = createSitemapWriter({ startConfig: config(), publicDir })
    await expect(writer.write({ path: '/first' })).rejects.toThrow()
    await expect(writer.close()).rejects.toThrow()
    expect(closes).toHaveLength(1)
    expect(closes[0]).toHaveBeenCalledOnce()
    await expect(writer.close()).rejects.toThrow()
    expect(closes[0]).toHaveBeenCalledOnce()
  })

  it('propagates write failure through buildSitemap and closes both outputs', async () => {
    const open = fs.open
    const closes: Array<ReturnType<typeof vi.spyOn>> = []
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args)
      closes.push(vi.spyOn(handle, 'close'))
      vi.spyOn(handle, 'writeFile').mockRejectedValue(new Error('disk full'))
      return handle
    })
    await expect(
      buildSitemap({ startConfig: config([{ path: '/first' }]), publicDir }),
    ).rejects.toThrow('disk full')
    expect(closes).toHaveLength(2)
    for (const close of closes) {
      expect(close).toHaveBeenCalledOnce()
    }
  })

  it('observes serialization rejection even before close is awaited', async () => {
    const writer = createSitemapWriter({ startConfig: config(), publicDir })
    writer.write({ path: '/invalid', sitemap: { lastmod: 'invalid date' } })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await expect(writer.close()).rejects.toThrow('Invalid time value')
    await expect(fs.access(join(publicDir, 'pages.json'))).rejects.toThrow()
  })

  it('creates no output for an empty sitemap and retains disabled wrapper validation', async () => {
    await buildSitemap({ startConfig: config(), publicDir })
    await expect(fs.access(join(publicDir, 'pages.json'))).rejects.toThrow()
    await expect(
      buildSitemap({
        startConfig: {
          ...config(),
          sitemap: { ...config().sitemap!, enabled: false },
        },
        publicDir,
      }),
    ).rejects.toThrow('not enabled')
    await expect(
      fs.access(join(publicDir, 'nested/maps/sitemap.xml')),
    ).rejects.toThrow()
  })
})
