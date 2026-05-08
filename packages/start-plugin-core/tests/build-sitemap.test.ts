import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSitemap } from '../src/build-sitemap'

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual<any>('../src/utils')
  return {
    ...actual,
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }
})

const writtenFiles: Record<string, string> = {}

vi.mock('node:fs', () => {
  return {
    writeFileSync: (filePath: string, content: string) => {
      writtenFiles[filePath] = content
    },
  }
})

function makeStartConfig(
  overrides: Partial<{
    pages: Array<{ path: string; sitemap?: Record<string, any> }>
    sitemap: Record<string, any> | null
  }> = {},
): any {
  const pages = overrides.pages ?? [{ path: '/about' }, { path: '/contact' }]
  const sitemap =
    overrides.sitemap !== undefined
      ? overrides.sitemap
      : { enabled: true, host: 'https://example.com', outputPath: 'sitemap.xml' }

  const config: any = {
    pages,
  }
  if (sitemap !== null) {
    config.sitemap = sitemap
  }
  return config
}

beforeEach(() => {
  for (const key of Object.keys(writtenFiles)) {
    delete writtenFiles[key]
  }
})

describe('buildSitemap', () => {
  describe('error cases', () => {
    it('throws when sitemap is not enabled', () => {
      const startConfig = makeStartConfig({
        sitemap: { enabled: false, host: 'https://example.com', outputPath: 'sitemap.xml' },
      })
      expect(() => buildSitemap({ startConfig, publicDir: '/dist' })).toThrow(
        'Sitemap is not enabled',
      )
    })

    it('throws when host is missing and sitemap is configured explicitly', () => {
      const startConfig = makeStartConfig({
        sitemap: { enabled: true, outputPath: 'sitemap.xml' },
      })
      expect(() => buildSitemap({ startConfig, publicDir: '/dist' })).toThrow(
        'Sitemap host is not set and required to build the sitemap.',
      )
    })

    it('throws when outputPath is missing', () => {
      const startConfig = makeStartConfig({
        sitemap: { enabled: true, host: 'https://example.com' },
      })
      expect(() => buildSitemap({ startConfig, publicDir: '/dist' })).toThrow(
        'Sitemap output path is not set',
      )
    })
  })

  describe('URL construction', () => {
    it('constructs URLs by joining host and page path', () => {
      const startConfig = makeStartConfig()
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('https://example.com/about')
      expect(xml).toContain('https://example.com/contact')
    })

    it('handles host with trailing slash without doubling', () => {
      const startConfig = makeStartConfig({
        sitemap: {
          enabled: true,
          host: 'https://example.com/',
          outputPath: 'sitemap.xml',
        },
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('https://example.com/about')
      expect(xml).not.toContain('https://example.com//about')
    })

    it('strips leading slashes from page.path to avoid double slashes', () => {
      const startConfig = makeStartConfig({
        pages: [{ path: '/blog/post' }],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('https://example.com/blog/post')
      expect(xml).not.toContain('https://example.com//blog/post')
    })
  })

  describe('sitemap filtering', () => {
    it('excludes pages with sitemap.exclude = true', () => {
      const startConfig = makeStartConfig({
        pages: [
          { path: '/public' },
          { path: '/private', sitemap: { exclude: true } },
        ],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('https://example.com/public')
      expect(xml).not.toContain('https://example.com/private')
    })

    it('applies custom filter function', () => {
      const startConfig = makeStartConfig({
        sitemap: {
          enabled: true,
          host: 'https://example.com',
          outputPath: 'sitemap.xml',
          filter: (page: any) => page.path !== '/hidden',
        },
      })
      startConfig.pages = [{ path: '/visible' }, { path: '/hidden' }]
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('https://example.com/visible')
      expect(xml).not.toContain('https://example.com/hidden')
    })
  })

  describe('page metadata', () => {
    it('includes priority and changefreq when provided', () => {
      const startConfig = makeStartConfig({
        pages: [
          {
            path: '/home',
            sitemap: { priority: 0.8, changefreq: 'weekly' as const },
          },
        ],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('<priority>0.8</priority>')
      expect(xml).toContain('<changefreq>weekly</changefreq>')
    })

    it('uses provided lastmod date', () => {
      const startConfig = makeStartConfig({
        pages: [
          {
            path: '/page',
            sitemap: { lastmod: '2024-06-15' },
          },
        ],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('<lastmod>2024-06-15</lastmod>')
    })

    it('includes alternate refs with hreflang', () => {
      const startConfig = makeStartConfig({
        pages: [
          {
            path: '/page',
            sitemap: {
              alternateRefs: [
                { href: 'https://example.fr/page', hreflang: 'fr' },
              ],
            },
          },
        ],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('hreflang="fr"')
      expect(xml).toContain('https://example.fr/page')
    })

    it('includes image metadata', () => {
      const startConfig = makeStartConfig({
        pages: [
          {
            path: '/gallery',
            sitemap: {
              images: [
                { loc: 'https://example.com/img.jpg', title: 'My Image', caption: 'A caption' },
              ],
            },
          },
        ],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('https://example.com/img.jpg')
      expect(xml).toContain('<image:title>My Image</image:title>')
      expect(xml).toContain('<image:caption>A caption</image:caption>')
    })

    it('includes news metadata', () => {
      const startConfig = makeStartConfig({
        pages: [
          {
            path: '/news/article',
            sitemap: {
              news: {
                publication: { name: 'My Blog', language: 'en' },
                publicationDate: '2024-06-01',
                title: 'Breaking News',
              },
            },
          },
        ],
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('<news:name>My Blog</news:name>')
      expect(xml).toContain('<news:language>en</news:language>')
      expect(xml).toContain('<news:title>Breaking News</news:title>')
      expect(xml).toContain('<news:publication_date>2024-06-01</news:publication_date>')
    })
  })

  describe('output files', () => {
    it('writes XML sitemap and pages.json to publicDir', () => {
      const startConfig = makeStartConfig()
      buildSitemap({ startConfig, publicDir: '/output' })
      expect(writtenFiles['/output/sitemap.xml']).toBeDefined()
      expect(writtenFiles['/output/pages.json']).toBeDefined()
    })

    it('writes well-formed XML with urlset root element', () => {
      const startConfig = makeStartConfig()
      buildSitemap({ startConfig, publicDir: '/dist' })
      const xml = writtenFiles['/dist/sitemap.xml']
      expect(xml).toContain('<urlset')
      expect(xml).toContain('</urlset>')
    })

    it('pages.json contains host, pages, and lastBuilt', () => {
      const startConfig = makeStartConfig()
      buildSitemap({ startConfig, publicDir: '/dist' })
      const pagesData = JSON.parse(writtenFiles['/dist/pages.json']!)
      expect(pagesData).toHaveProperty('host', 'https://example.com')
      expect(pagesData).toHaveProperty('pages')
      expect(pagesData).toHaveProperty('lastBuilt')
    })

    it('respects custom outputPath for sitemap XML', () => {
      const startConfig = makeStartConfig({
        sitemap: {
          enabled: true,
          host: 'https://example.com',
          outputPath: 'custom-sitemap.xml',
        },
      })
      buildSitemap({ startConfig, publicDir: '/dist' })
      expect(writtenFiles['/dist/custom-sitemap.xml']).toBeDefined()
      expect(writtenFiles['/dist/sitemap.xml']).toBeUndefined()
    })
  })

  describe('no pages', () => {
    it('skips generation when pages array is empty', () => {
      const startConfig = makeStartConfig({ pages: [] })
      buildSitemap({ startConfig, publicDir: '/dist' })
      expect(writtenFiles['/dist/sitemap.xml']).toBeUndefined()
    })
  })

  describe('auto-defaults', () => {
    it('defaults to sitemap enabled when pages present and sitemap config is absent', () => {
      // When sitemap is not configured and pages exist, buildSitemap sets defaults
      // but still requires a host - so it logs info and returns without writing
      const startConfig = makeStartConfig({ sitemap: null })
      // Should not throw, just exits early due to missing host
      expect(() => buildSitemap({ startConfig, publicDir: '/dist' })).not.toThrow()
      expect(writtenFiles['/dist/sitemap.xml']).toBeUndefined()
    })
  })
})
