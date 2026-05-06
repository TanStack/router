import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSitemap } from '../src/build-sitemap'

const tempDirs: Array<string> = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('buildSitemap', () => {
  it('includes generated page search params unless excluded', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    buildSitemap({
      publicDir,
      startConfig: {
        sitemap: {
          enabled: true,
          host: 'https://example.com',
          outputPath: 'sitemap.xml',
        },
        pages: [
          { path: '/products/router?page=2&tag=start' },
          {
            path: '/products/draft?preview=true',
            sitemap: { exclude: true },
          },
        ],
      } as any,
    })

    const sitemap = readFileSync(join(publicDir, 'sitemap.xml'), 'utf-8')

    expect(sitemap).toContain(
      '<loc>https://example.com/products/router?page=2&amp;tag=start</loc>',
    )
    expect(sitemap).not.toContain('preview=true')
  })

  it('preserves sitemap metadata for query URLs without duplicating host slashes', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    buildSitemap({
      publicDir,
      startConfig: {
        sitemap: {
          enabled: true,
          host: 'https://example.com/',
          outputPath: 'sitemap.xml',
        },
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
      } as any,
    })

    const sitemap = readFileSync(join(publicDir, 'sitemap.xml'), 'utf-8')
    const pagesJson = readFileSync(join(publicDir, 'pages.json'), 'utf-8')

    expect(sitemap).toContain(
      '<loc>https://example.com/blog/router?tag=router+start</loc>',
    )
    expect(sitemap).toContain('<lastmod>2026-05-05</lastmod>')
    expect(sitemap).toContain('<priority>0.8</priority>')
    expect(sitemap).toContain('<changefreq>weekly</changefreq>')
    expect(sitemap).toContain('href="https://example.com/ko/blog/router"')
    expect(sitemap).toContain('hreflang="ko"')
    expect(sitemap).not.toContain('https://example.com//blog/router')
    expect(pagesJson).toContain('/blog/router?tag=router+start')
  })

  it('preserves a deployment base path from the sitemap host', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    buildSitemap({
      publicDir,
      startConfig: {
        sitemap: {
          enabled: true,
          host: 'https://example.com/docs/',
          outputPath: 'sitemap.xml',
        },
        pages: [{ path: '/guide/start' }],
      } as any,
    })

    const sitemap = readFileSync(join(publicDir, 'sitemap.xml'), 'utf-8')

    expect(sitemap).toContain('<loc>https://example.com/docs/guide/start</loc>')
    expect(sitemap).not.toContain('https://example.com/docs//guide/start')
  })

  it('uses a host supplied from the environment', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    const previousSiteUrl = process.env.SITE_URL
    process.env.SITE_URL = 'https://deploy.example.com'

    try {
      buildSitemap({
        publicDir,
        startConfig: {
          sitemap: {
            enabled: true,
            host: process.env.SITE_URL,
            outputPath: 'sitemap.xml',
          },
          pages: [{ path: '/guide/start' }],
        } as any,
      })
    } finally {
      if (previousSiteUrl === undefined) {
        delete process.env.SITE_URL
      } else {
        process.env.SITE_URL = previousSiteUrl
      }
    }

    const sitemap = readFileSync(join(publicDir, 'sitemap.xml'), 'utf-8')

    expect(sitemap).toContain(
      '<loc>https://deploy.example.com/guide/start</loc>',
    )
  })

  it('skips sitemap generation when pages exist but sitemap config is omitted', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    buildSitemap({
      publicDir,
      startConfig: {
        pages: [{ path: '/guide/start' }],
      } as any,
    })

    expect(existsSync(join(publicDir, 'sitemap.xml'))).toBe(false)
    expect(existsSync(join(publicDir, 'pages.json'))).toBe(false)
  })

  it('throws when sitemap is explicitly enabled without a host', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    expect(() =>
      buildSitemap({
        publicDir,
        startConfig: {
          sitemap: {
            enabled: true,
            outputPath: 'sitemap.xml',
          },
          pages: [{ path: '/guide/start' }],
        } as any,
      }),
    ).toThrow('Sitemap host is not set and required to build the sitemap.')
  })

  it('writes advanced sitemap metadata', () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'tanstack-start-sitemap-'))
    tempDirs.push(publicDir)

    buildSitemap({
      publicDir,
      startConfig: {
        sitemap: {
          enabled: true,
          host: 'https://example.com',
          outputPath: 'sitemap.xml',
        },
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
      } as any,
    })

    const sitemap = readFileSync(join(publicDir, 'sitemap.xml'), 'utf-8')

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
