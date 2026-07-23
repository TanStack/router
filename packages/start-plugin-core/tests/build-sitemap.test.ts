import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSitemapWriter } from '../src/build-sitemap'
import type { Page } from '../src/schema'

const tempDirs: Array<string> = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function writeSitemap(opts: {
  host: string
  outputPath?: string
  pages: Array<Page>
}) {
  const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
  tempDirs.push(publicDir)

  const outputPath = opts.outputPath ?? 'sitemap.xml'
  const writer = createSitemapWriter({
    host: opts.host,
    outputPath,
    publicDir,
  })

  for (const page of opts.pages) {
    writer.write(page)
  }
  await writer.close()

  return readFileSync(join(publicDir, outputPath), 'utf-8')
}

describe('createSitemapWriter', () => {
  it('includes generated page search params unless excluded', async () => {
    const sitemap = await writeSitemap({
      host: 'https://example.com',
      pages: [
        { path: '/products/router?page=2&tag=start' },
        {
          path: '/products/draft?preview=true',
          sitemap: { exclude: true },
        },
      ],
    })

    expect(sitemap).toContain(
      '<loc>https://example.com/products/router?page=2&amp;tag=start</loc>',
    )
    expect(sitemap).not.toContain('preview=true')
  })

  it('preserves sitemap metadata for query URLs without duplicating host slashes', async () => {
    const sitemap = await writeSitemap({
      host: 'https://example.com/',
      pages: [
        {
          path: '/blog/router?tag=router+start',
          sitemap: {
            lastmod: new Date('2026-05-05T12:30:00.000Z'),
            priority: 0.8,
            changefreq: 'weekly',
            alternateRefs: [
              {
                href: 'https://example.com/ko/blog/router',
                hreflang: 'ko',
              },
            ],
          },
        },
      ],
    })

    expect(sitemap).toContain(
      '<loc>https://example.com/blog/router?tag=router+start</loc>',
    )
    expect(sitemap).toContain('<lastmod>2026-05-05</lastmod>')
    expect(sitemap).toContain('<priority>0.8</priority>')
    expect(sitemap).toContain('<changefreq>weekly</changefreq>')
    expect(sitemap).toContain('href="https://example.com/ko/blog/router"')
    expect(sitemap).toContain('hreflang="ko"')
    expect(sitemap).not.toContain('https://example.com//blog/router')
  })

  it('preserves a deployment base path from the sitemap host', async () => {
    const sitemap = await writeSitemap({
      host: 'https://example.com/docs/',
      pages: [{ path: '/guide/start' }],
    })

    expect(sitemap).toContain('<loc>https://example.com/docs/guide/start</loc>')
    expect(sitemap).not.toContain('https://example.com/docs//guide/start')
  })

  it('writes advanced sitemap metadata', async () => {
    const sitemap = await writeSitemap({
      host: 'https://example.com',
      pages: [
        {
          path: '/news/router-launch',
          sitemap: {
            alternateRefs: [
              {
                href: 'https://example.com/ko/news/router-launch',
                hreflang: 'ko',
              },
            ],
            images: [
              {
                loc: 'https://example.com/router.png',
                title: 'Router',
                caption: 'TanStack Router',
              },
            ],
            news: {
              publication: {
                name: 'TanStack',
                language: 'en',
              },
              publicationDate: '2026-05-05',
              title: 'Router Launch',
            },
          },
        },
      ],
    })

    expect(sitemap).toContain(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
    )
    expect(sitemap).toContain(
      'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"',
    )
    expect(sitemap).toContain(
      'href="https://example.com/ko/news/router-launch"',
    )
    expect(sitemap).toContain(
      '<image:loc>https://example.com/router.png</image:loc>',
    )
    expect(sitemap).toContain('<image:title>Router</image:title>')
    expect(sitemap).toContain('<image:caption>TanStack Router</image:caption>')
    expect(sitemap).toContain('<news:name>TanStack</news:name>')
    expect(sitemap).toContain('<news:language>en</news:language>')
    expect(sitemap).toContain(
      '<news:publication_date>2026-05-05</news:publication_date>',
    )
    expect(sitemap).toContain('<news:title>Router Launch</news:title>')
  })
})
