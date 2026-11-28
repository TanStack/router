import { describe, expect, it } from 'vitest'
import { parseStartConfig } from '../src/schema'

type PageSitemap = NonNullable<
  NonNullable<
    NonNullable<Parameters<typeof parseStartConfig>[0]>['pages']
  >[number]['sitemap']
>

function parsePageSitemap(sitemap: unknown) {
  return () =>
    parseStartConfig(
      { pages: [{ path: '/', sitemap: sitemap as PageSitemap }] },
      { framework: 'react' },
      process.cwd(),
    )
}

const news = {
  publication: { name: 'The Example Times', language: 'en' },
  publicationDate: '2008-12-23',
  title: 'Companies A, B in Merger Talks',
}

// https://www.sitemaps.org/protocol.html#prioritydef and #changefreqdef
describe('sitemaps.org protocol', () => {
  it.each([0, 0.5, 1])('accepts priority %s within 0.0-1.0', (priority) => {
    expect(parsePageSitemap({ priority })).not.toThrow()
  })

  it.each([-0.01, 1.01])('rejects priority %s outside 0.0-1.0', (priority) => {
    expect(parsePageSitemap({ priority })).toThrow()
  })

  it.each([
    'always',
    'hourly',
    'daily',
    'weekly',
    'monthly',
    'yearly',
    'never',
  ])('accepts changefreq %s', (changefreq) => {
    expect(parsePageSitemap({ changefreq })).not.toThrow()
  })

  it('rejects a changefreq outside the seven valid values', () => {
    expect(parsePageSitemap({ changefreq: 'fortnightly' })).toThrow()
  })
})

// https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap#news-sitemap-reference
describe('Google news sitemap reference: required tags', () => {
  it('accepts a complete news entry', () => {
    expect(parsePageSitemap({ news })).not.toThrow()
  })

  it.each([
    ['news:name', { ...news, publication: { language: 'en' } }],
    ['news:language', { ...news, publication: { name: 'The Example Times' } }],
    ['news:publication_date', { ...news, publicationDate: undefined }],
    ['news:title', { ...news, title: undefined }],
  ])('rejects a news entry without %s', (_tag, entry) => {
    expect(parsePageSitemap({ news: entry })).toThrow()
  })
})

// https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps#image-sitemap-reference
describe('Google image sitemap reference: required tags', () => {
  it('accepts an image with image:loc', () => {
    expect(
      parsePageSitemap({ images: [{ loc: 'https://example.com/image.jpg' }] }),
    ).not.toThrow()
  })

  it('rejects an image without image:loc', () => {
    expect(parsePageSitemap({ images: [{ title: 'Image' }] })).toThrow()
  })
})

// https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap
describe('Google localized versions in sitemaps', () => {
  it('accepts an alternate with href and hreflang', () => {
    expect(
      parsePageSitemap({
        alternateRefs: [
          { href: 'https://www.example.de/deutsch/page.html', hreflang: 'de' },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects an alternate without href', () => {
    expect(parsePageSitemap({ alternateRefs: [{ hreflang: 'de' }] })).toThrow()
  })

  it("requires hreflang, which Google's hreflang sitemap syntax always includes", () => {
    expect(
      parsePageSitemap({
        alternateRefs: [{ href: 'https://www.example.de/deutsch/page.html' }],
      }),
    ).toThrow()
  })
})
