import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRobotsHandler,
  createSitemapHandler,
  createSitemapIndexHandler,
  renderRobots,
  renderSitemap,
  renderSitemapIndex,
} from '../src/metadata-routes'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderSitemap', () => {
  it('renders the core sitemap elements in schema order', () => {
    const xml = renderSitemap([
      {
        url: 'https://example.com/',
        lastModified: new Date('2026-10-01T00:00:00.000Z'),
        changeFrequency: 'daily',
        priority: 1,
      },
      { url: 'https://example.com/about' },
    ])

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '<url>',
        '<loc>https://example.com/</loc>',
        '<lastmod>2026-10-01T00:00:00.000Z</lastmod>',
        '<changefreq>daily</changefreq>',
        '<priority>1</priority>',
        '</url>',
        '<url>',
        '<loc>https://example.com/about</loc>',
        '</url>',
        '</urlset>',
        '',
      ].join('\n'),
    )
  })

  it('escapes XML special characters in URLs and text', () => {
    const xml = renderSitemap([
      {
        url: 'https://example.com/search?q=a&b=<c>',
        videos: [
          {
            title: 'Tom & "Jerry"',
            description: "It's <great>",
            thumbnail_loc: 'https://example.com/t.jpg',
          },
        ],
      },
    ])

    expect(xml).toContain(
      '<loc>https://example.com/search?q=a&amp;b=&lt;c&gt;</loc>',
    )
    expect(xml).toContain(
      '<video:title>Tom &amp; &quot;Jerry&quot;</video:title>',
    )
    expect(xml).toContain(
      '<video:description>It&apos;s &lt;great&gt;</video:description>',
    )
  })

  it('only declares the extension namespaces that are used', () => {
    const plain = renderSitemap([{ url: 'https://example.com/' }])
    expect(plain).not.toContain('xmlns:xhtml')
    expect(plain).not.toContain('xmlns:image')
    expect(plain).not.toContain('xmlns:video')

    const rich = renderSitemap([
      {
        url: 'https://example.com/',
        alternates: { languages: { fa: 'https://example.com/fa' } },
        images: ['https://example.com/a.png'],
        videos: [
          {
            title: 't',
            description: 'd',
            thumbnail_loc: 'https://example.com/t.jpg',
          },
        ],
      },
    ])
    expect(rich).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(rich).toContain(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
    )
    expect(rich).toContain(
      'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"',
    )
  })

  it('renders alternates, images and videos after the core elements', () => {
    const xml = renderSitemap([
      {
        url: 'https://example.com/about',
        priority: 0.8,
        alternates: {
          languages: {
            en: 'https://example.com/en/about',
            fa: 'https://example.com/fa/about',
            de: undefined,
          },
        },
        images: ['https://example.com/hero.png'],
        videos: [
          {
            title: 'Intro',
            description: 'An intro',
            thumbnail_loc: 'https://example.com/thumb.jpg',
            content_loc: 'https://example.com/intro.mp4',
            duration: 120,
            publication_date: new Date('2026-01-02T00:00:00.000Z'),
            family_friendly: 'yes',
            live: 'no',
          },
        ],
      },
    ])

    expect(xml).toContain(
      [
        '<loc>https://example.com/about</loc>',
        '<priority>0.8</priority>',
        '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/about" />',
        '<xhtml:link rel="alternate" hreflang="fa" href="https://example.com/fa/about" />',
        '<image:image>',
        '<image:loc>https://example.com/hero.png</image:loc>',
        '</image:image>',
        '<video:video>',
        '<video:thumbnail_loc>https://example.com/thumb.jpg</video:thumbnail_loc>',
        '<video:title>Intro</video:title>',
        '<video:description>An intro</video:description>',
        '<video:content_loc>https://example.com/intro.mp4</video:content_loc>',
        '<video:duration>120</video:duration>',
        '<video:publication_date>2026-01-02T00:00:00.000Z</video:publication_date>',
        '<video:family_friendly>yes</video:family_friendly>',
        '<video:live>no</video:live>',
        '</video:video>',
        '</url>',
      ].join('\n'),
    )
    expect(xml).not.toContain('hreflang="de"')
  })

  it('resolves relative URLs against baseUrl and keeps absolute ones', () => {
    const xml = renderSitemap(
      [
        {
          url: '/posts/hello',
          alternates: { languages: { fa: '/fa/posts/hello' } },
          images: ['/cover.png', 'https://cdn.example.net/x.png'],
        },
      ],
      { baseUrl: 'https://example.com' },
    )

    expect(xml).toContain('<loc>https://example.com/posts/hello</loc>')
    expect(xml).toContain('href="https://example.com/fa/posts/hello"')
    expect(xml).toContain(
      '<image:loc>https://example.com/cover.png</image:loc>',
    )
    expect(xml).toContain(
      '<image:loc>https://cdn.example.net/x.png</image:loc>',
    )
  })

  it('warns in development about relative URLs and oversized sitemaps', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderSitemap([{ url: '/no-origin' }])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"/no-origin" is not absolute'),
    )

    warn.mockClear()
    renderSitemap(
      Array.from({ length: 50_001 }, (_, i) => ({
        url: `https://example.com/${i}`,
      })),
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('50001 URLs'))
  })
})

describe('renderSitemapIndex', () => {
  it('renders child sitemaps', () => {
    expect(
      renderSitemapIndex(
        [
          { url: '/sitemap-0.xml', lastModified: '2026-10-01' },
          { url: 'https://example.com/sitemap-1.xml' },
        ],
        { baseUrl: 'https://example.com' },
      ),
    ).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '<sitemap>',
        '<loc>https://example.com/sitemap-0.xml</loc>',
        '<lastmod>2026-10-01</lastmod>',
        '</sitemap>',
        '<sitemap>',
        '<loc>https://example.com/sitemap-1.xml</loc>',
        '</sitemap>',
        '</sitemapindex>',
        '',
      ].join('\n'),
    )
  })
})

describe('renderRobots', () => {
  it('renders a single rule with a sitemap and host', () => {
    expect(
      renderRobots({
        rules: { userAgent: '*', allow: '/', disallow: '/admin' },
        sitemap: 'https://example.com/sitemap.xml',
        host: 'https://example.com',
      }),
    ).toBe(
      [
        'User-Agent: *',
        'Allow: /',
        'Disallow: /admin',
        '',
        'Host: https://example.com',
        'Sitemap: https://example.com/sitemap.xml',
        '',
      ].join('\n'),
    )
  })

  it('renders multiple rules, user agents and sitemaps', () => {
    expect(
      renderRobots(
        {
          rules: [
            { userAgent: ['Googlebot', 'Bingbot'], disallow: ['/a', '/b'] },
            { allow: '/', crawlDelay: 10 },
          ],
          sitemap: ['/sitemap.xml', '/news-sitemap.xml'],
        },
        { baseUrl: 'https://example.com' },
      ),
    ).toBe(
      [
        'User-Agent: Googlebot',
        'User-Agent: Bingbot',
        'Disallow: /a',
        'Disallow: /b',
        '',
        'User-Agent: *',
        'Allow: /',
        'Crawl-delay: 10',
        '',
        'Sitemap: https://example.com/sitemap.xml',
        'Sitemap: https://example.com/news-sitemap.xml',
        '',
      ].join('\n'),
    )
  })
})

describe('handlers', () => {
  it('createSitemapHandler resolves paths against the request origin', async () => {
    const handler = createSitemapHandler(({ request }) => [
      { url: '/', priority: 1 },
      { url: new URL(request.url).pathname },
    ])

    const response = await handler({
      request: new Request('https://shop.example.com/sitemap.xml'),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'application/xml; charset=utf-8',
    )
    const body = await response.text()
    expect(body).toContain('<loc>https://shop.example.com/</loc>')
    expect(body).toContain('<loc>https://shop.example.com/sitemap.xml</loc>')
  })

  it('passes the full handler context, e.g. params, to the generator', async () => {
    const handler = createSitemapHandler(
      async ({ params }: { request: Request; params: { id: string } }) => [
        { url: `/products/page-${params.id}` },
      ],
    )

    const response = await handler({
      request: new Request('http://localhost:3000/sitemap-2.xml'),
      params: { id: '2' },
    })

    expect(await response.text()).toContain(
      '<loc>http://localhost:3000/products/page-2</loc>',
    )
  })

  it('prefers an explicit baseUrl and merges custom headers', async () => {
    const handler = createSitemapHandler(() => [{ url: '/' }], {
      baseUrl: 'https://public.example.com',
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    })

    const response = await handler({
      request: new Request('http://internal:8080/sitemap.xml'),
    })

    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600')
    expect(await response.text()).toContain(
      '<loc>https://public.example.com/</loc>',
    )
  })

  it('lets a custom Content-Type override the default', async () => {
    const handler = createSitemapHandler(() => [], {
      headers: { 'Content-Type': 'text/xml' },
    })

    const response = await handler({
      request: new Request('https://example.com/sitemap.xml'),
    })

    expect(response.headers.get('Content-Type')).toBe('text/xml')
  })

  it('createSitemapIndexHandler serves a sitemap index', async () => {
    const handler = createSitemapIndexHandler(() =>
      [0, 1].map((id) => ({ url: `/sitemap-${id}.xml` })),
    )

    const response = await handler({
      request: new Request('https://example.com/sitemap.xml'),
    })

    expect(response.headers.get('Content-Type')).toBe(
      'application/xml; charset=utf-8',
    )
    const body = await response.text()
    expect(body).toContain('<sitemapindex')
    expect(body).toContain('<loc>https://example.com/sitemap-1.xml</loc>')
  })

  it('createRobotsHandler serves robots.txt', async () => {
    const handler = createRobotsHandler(() => ({
      rules: { userAgent: '*', allow: '/' },
      sitemap: '/sitemap.xml',
    }))

    const response = await handler({
      request: new Request('https://example.com/robots.txt'),
    })

    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    )
    expect(await response.text()).toContain(
      'Sitemap: https://example.com/sitemap.xml',
    )
  })
})
