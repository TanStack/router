import { describe, expect, it } from 'vitest'
import { generateSitemap } from '../src/index'
import type { SitemapConfig } from '../src/index'

describe('generateSitemap', () => {
  it('should generate basic sitemap XML', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        '/home',
        [
          '/about',
          {
            lastmod: '2023-12-01',
            changefreq: 'monthly',
            priority: 0.8,
          },
        ],
      ],
    }

    const result = await generateSitemap(config)

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(result).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(result).toContain('<loc>https://example.com/home</loc>')
    expect(result).toContain('<loc>https://example.com/about</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<changefreq>monthly</changefreq>')
    expect(result).toContain('<priority>0.8</priority>')
    expect(result).toContain('</urlset>')
  })

  it('should handle Date objects for lastmod', async () => {
    const date = new Date('2023-12-01T10:00:00Z')
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/home',
          {
            lastmod: date,
          },
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<lastmod>2023-12-01T10:00:00.000Z</lastmod>')
  })

  it('returns empty urlset when no routes are provided', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(result).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(result).toContain('</urlset>')
    expect(result).not.toContain('<url>')
  })

  it('throws if siteUrl is invalid', async () => {
    await expect(
      generateSitemap({
        siteUrl: '',
        routes: [],
      }),
    ).rejects.toThrow()
    await expect(
      generateSitemap({
        siteUrl: 'not-a-valid-url',
        routes: [],
      }),
    ).rejects.toThrow()
  })

  it('should handle sync function for static routes', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/home',
          () => ({
            lastmod: '2023-12-01',
            priority: 0.9,
          }),
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/home</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<priority>0.9</priority>')
  })

  it('should handle function returning array for dynamic routes', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/posts/$postId',
          // @ts-ignore - Dynamic route for testing
          () => [
            { path: '/posts/1', lastmod: '2023-12-01' },
            { path: '/posts/2', lastmod: '2023-12-02' },
          ],
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/posts/1</loc>')
    expect(result).toContain('<loc>https://example.com/posts/2</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<lastmod>2023-12-02</lastmod>')
  })

  it('should handle array of dynamic entries', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/posts/$postId',
          // @ts-ignore - Dynamic route for testing
          [
            { path: '/posts/array-1', lastmod: '2023-12-01' },
            { path: '/posts/array-2', changefreq: 'weekly' as const },
          ],
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/posts/array-1</loc>')
    expect(result).toContain('<loc>https://example.com/posts/array-2</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<changefreq>weekly</changefreq>')
  })

  it('should handle mix of static and dynamic routes', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        ['/home', { priority: 1.0 }],
        ['/about', () => ({ lastmod: '2023-12-01' })],
        [
          '/posts/$postId',
          // @ts-ignore - Dynamic route for testing
          [{ path: '/posts/1', changefreq: 'daily' as const }],
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/home</loc>')
    expect(result).toContain('<priority>1</priority>')
    expect(result).toContain('<loc>https://example.com/about</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<loc>https://example.com/posts/1</loc>')
    expect(result).toContain('<changefreq>daily</changefreq>')
  })

  it('should generate proper XML declaration', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: ['/home'],
    }

    const result = await generateSitemap(config)

    expect(result).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  })

  it('should handle siteUrl with trailing slash', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com/',
      routes: ['/home'],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/home</loc>')
  })

  it('should handle special characters in URLs', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: ['/special-chars?param=value&other=123'],
    }

    const result = await generateSitemap(config)
    expect(result).toContain(
      '<loc>https://example.com/special-chars?param=value&amp;other=123</loc>',
    )
  })

  it('should handle unicode characters in URLs', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/posts/$postId',
          // @ts-ignore - Dynamic route for testing
          [{ path: '/posts/héllo-wörld', lastmod: '2023-12-01' }],
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/posts/héllo-wörld</loc>')
  })

  it('should handle priority value 0', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/low-priority',
          {
            priority: 0,
          },
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<priority>0</priority>')
  })

  it('should handle decimal priority values', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/decimal-priority',
          {
            priority: 0.85,
          },
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<priority>0.85</priority>')
  })

  it('should ignore undefined optional fields', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/minimal',
          {
            lastmod: undefined,
            changefreq: undefined,
            priority: undefined,
          },
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/minimal</loc>')
    expect(result).not.toContain('<lastmod>')
    expect(result).not.toContain('<changefreq>')
    expect(result).not.toContain('<priority>')
  })

  it('should handle async static route function', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/async-static',
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return {
              lastmod: '2023-12-01',
              changefreq: 'weekly' as const,
              priority: 0.8,
            }
          },
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/async-static</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<changefreq>weekly</changefreq>')
    expect(result).toContain('<priority>0.8</priority>')
  })

  it('should handle async dynamic route function', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/posts/$postId',
          // @ts-ignore - Dynamic route for testing
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return [
              { path: '/posts/async-1', lastmod: '2023-12-01' },
              { path: '/posts/async-2', lastmod: '2023-12-02' },
            ]
          },
        ],
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/posts/async-1</loc>')
    expect(result).toContain('<loc>https://example.com/posts/async-2</loc>')
    expect(result).toContain('<lastmod>2023-12-01</lastmod>')
    expect(result).toContain('<lastmod>2023-12-02</lastmod>')
  })

  it('should apply priority to routes without explicit priority', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      priority: 0.5,
      routes: [
        '/home', // No priority specified, should get default
        ['/about', { priority: 0.9 }], // Explicit priority, should override default
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/home</loc>')
    expect(result).toContain('<priority>0.5</priority>') // Default priority
    expect(result).toContain('<loc>https://example.com/about</loc>')
    expect(result).toContain('<priority>0.9</priority>') // Explicit priority
  })

  it('should apply changefreq to routes without explicit changefreq', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      changefreq: 'weekly',
      routes: [
        '/home', // No changefreq specified, should get default
        ['/about', { changefreq: 'daily' as const }], // Explicit changefreq, should override default
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/home</loc>')
    expect(result).toContain('<changefreq>weekly</changefreq>') // Default changefreq
    expect(result).toContain('<loc>https://example.com/about</loc>')
    expect(result).toContain('<changefreq>daily</changefreq>') // Explicit changefreq
  })

  it('should apply both default values together', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      priority: 0.7,
      changefreq: 'monthly',
      routes: [
        '/home', // Should get both defaults
        ['/about', { priority: 0.9 }], // Should get default changefreq but explicit priority
        ['/contact', { changefreq: 'yearly' as const }], // Should get default priority but explicit changefreq
      ],
    }

    const result = await generateSitemap(config)

    // /home should have both defaults
    expect(result).toContain('<loc>https://example.com/home</loc>')
    expect(result).toContain('<priority>0.7</priority>')
    expect(result).toContain('<changefreq>monthly</changefreq>')

    // /about should have explicit priority, default changefreq
    expect(result).toContain('<loc>https://example.com/about</loc>')
    expect(result).toContain('<priority>0.9</priority>')
    expect(result).toContain('<changefreq>monthly</changefreq>')

    // /contact should have default priority, explicit changefreq
    expect(result).toContain('<loc>https://example.com/contact</loc>')
    expect(result).toContain('<priority>0.7</priority>')
    expect(result).toContain('<changefreq>yearly</changefreq>')
  })

  it('should apply defaults to dynamic routes', async () => {
    // @ts-ignore - Test configuration
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      priority: 0.6,
      changefreq: 'weekly',
      routes: [
        [
          '/posts/$postId',
          // @ts-ignore - Dynamic route for testing
          [
            { path: '/posts/1' }, // Should get defaults
            { path: '/posts/2', priority: 0.9 }, // Should get default changefreq, explicit priority
            { path: '/posts/3', changefreq: 'daily' as const }, // Should get default priority, explicit changefreq
          ],
        ],
      ],
    }

    const result = await generateSitemap(config)

    expect(result).toContain('<loc>https://example.com/posts/1</loc>')
    expect(result).toContain('<priority>0.6</priority>')
    expect(result).toContain('<changefreq>weekly</changefreq>')

    expect(result).toContain('<loc>https://example.com/posts/2</loc>')
    expect(result).toContain('<priority>0.9</priority>')
    expect(result).toContain('<changefreq>weekly</changefreq>')

    expect(result).toContain('<loc>https://example.com/posts/3</loc>')
    expect(result).toContain('<priority>0.6</priority>')
    expect(result).toContain('<changefreq>daily</changefreq>')
  })

  it('should apply defaults to function-based routes', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      priority: 0.4,
      changefreq: 'monthly',
      routes: [
        ['/static-func', () => ({})], // Function returning empty object, should get defaults
        ['/static-func-partial', () => ({ priority: 0.8 })], // Should get default changefreq
        // @ts-ignore - Dynamic route for testing
        [
          '/dynamic-func',
          () =>
            [
              { path: '/dynamic/1' }, // Should get defaults
              { path: '/dynamic/2', changefreq: 'hourly' as const }, // Should get default priority
            ] as any,
        ],
      ],
    }

    const result = await generateSitemap(config)

    // Static function with defaults
    expect(result).toContain('<loc>https://example.com/static-func</loc>')
    expect(result).toContain('<priority>0.4</priority>')
    expect(result).toContain('<changefreq>monthly</changefreq>')

    // Static function with partial defaults
    expect(result).toContain(
      '<loc>https://example.com/static-func-partial</loc>',
    )
    expect(result).toContain('<priority>0.8</priority>')
    expect(result).toContain('<changefreq>monthly</changefreq>')

    // Dynamic function with defaults
    expect(result).toContain('<loc>https://example.com/dynamic/1</loc>')
    expect(result).toContain('<priority>0.4</priority>')
    expect(result).toContain('<changefreq>monthly</changefreq>')

    expect(result).toContain('<loc>https://example.com/dynamic/2</loc>')
    expect(result).toContain('<priority>0.4</priority>')
    expect(result).toContain('<changefreq>hourly</changefreq>')
  })

  it('should handle function errors gracefully', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        [
          '/error-route',
          () => {
            throw new Error('Test function error')
          },
        ],
      ],
    }

    await expect(generateSitemap(config)).rejects.toThrow('Test function error')
  })

  it('should validate invalid priority values', async () => {
    const negativeConfig: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [['/negative-priority', { priority: -0.5 }]],
    }
    await expect(generateSitemap(negativeConfig)).rejects.toThrow(
      'Invalid entry /negative-priority: priority must be a number between 0 and 1',
    )

    const highConfig: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [['/high-priority', { priority: 1.5 }]],
    }
    await expect(generateSitemap(highConfig)).rejects.toThrow(
      'Invalid entry /high-priority: priority must be a number between 0 and 1',
    )

    const nanConfig: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [['/nan-priority', { priority: NaN }]],
    }
    await expect(generateSitemap(nanConfig)).rejects.toThrow(
      'Invalid entry /nan-priority: priority must be a number between 0 and 1',
    )
  })

  it('should validate invalid changefreq values', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [['/invalid-changefreq', { changefreq: 'invalid' as any }]],
    }

    await expect(generateSitemap(config)).rejects.toThrow(
      'Invalid entry /invalid-changefreq: changefreq must be one of always, hourly, daily, weekly, monthly, yearly, never',
    )
  })

  it('should escape XML special characters in URLs', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [
        '/path-with-<brackets>',
        '/path-with-"quotes"',
        "/path-with-'apostrophes'",
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain(
      '<loc>https://example.com/path-with-&lt;brackets&gt;</loc>',
    )
    expect(result).toContain(
      '<loc>https://example.com/path-with-&quot;quotes&quot;</loc>',
    )
    expect(result).toContain(
      '<loc>https://example.com/path-with-&apos;apostrophes&apos;</loc>',
    )
  })

  it('should handle invalid route paths', async () => {
    const emptyConfig: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [''], // Empty string
    }
    await expect(generateSitemap(emptyConfig)).rejects.toThrow()

    const nullConfig: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [null as any],
    }
    await expect(generateSitemap(nullConfig)).rejects.toThrow()

    const undefinedConfig: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [undefined as any],
    }
    await expect(generateSitemap(undefinedConfig)).rejects.toThrow()
  })
})
