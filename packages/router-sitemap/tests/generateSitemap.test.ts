import { describe, expect, test } from 'vitest'
import { generateSitemap } from '../src/index'
import type { SitemapConfig, DynamicEntryOptions } from '../src/index'

describe('generateSitemap', () => {
  test('generates basic sitemap XML', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/home</loc>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2023-12-01</lastmod>
    <priority>0.8</priority>
    <changefreq>monthly</changefreq>
  </url>`)
    expect(result).toContain('</urlset>')
  })

  test('handles Date objects for lastmod', async () => {
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

  test('returns empty urlset when no routes are provided', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(result).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    )
  })

  test('throws if siteUrl is invalid', async () => {
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
    await expect(
      // @ts-ignore - Invalid type for siteUrl
      generateSitemap({
        routes: [],
      }),
    ).rejects.toThrow()
    await expect(
      generateSitemap({
        // @ts-ignore - Invalid type for siteUrl
        siteUrl: 123,
        routes: [],
      }),
    ).rejects.toThrow()
    await expect(
      generateSitemap({
        // @ts-ignore - Invalid type for siteUrl
        siteUrl: null,
        routes: [],
      }),
    ).rejects.toThrow()
  })

  test('handles sync function for static routes', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/home</loc>
    <lastmod>2023-12-01</lastmod>
    <priority>0.9</priority>
  </url>`)
  })

  test('handles function returning array for dynamic routes', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/1</loc>
    <lastmod>2023-12-01</lastmod>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/2</loc>
    <lastmod>2023-12-02</lastmod>
  </url>`)
  })

  test('handles array of dynamic entries', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/array-1</loc>
    <lastmod>2023-12-01</lastmod>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/array-2</loc>
    <changefreq>weekly</changefreq>
  </url>`)
  })

  test('handles mix of static and dynamic routes', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/home</loc>
    <priority>1</priority>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2023-12-01</lastmod>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/1</loc>
    <changefreq>daily</changefreq>
  </url>`)
  })

  test('handles siteUrl with trailing slash', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com/',
      routes: ['/home'],
    }

    const result = await generateSitemap(config)
    expect(result).toContain('<loc>https://example.com/home</loc>')
  })

  test('handles special characters in URLs', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: ['/special-chars?param=value&other=123'],
    }

    const result = await generateSitemap(config)
    expect(result).toContain(
      '<loc>https://example.com/special-chars?param=value&amp;other=123</loc>',
    )
  })

  test('handles unicode characters in URLs', async () => {
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

  test('handles priority value 0', async () => {
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

  test('handles decimal priority values', async () => {
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

  test('ignores undefined optional fields', async () => {
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

  test('handles async static route function', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/async-static</loc>
    <lastmod>2023-12-01</lastmod>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>`)
  })

  test('handles async dynamic route function', async () => {
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
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/async-1</loc>
    <lastmod>2023-12-01</lastmod>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/posts/async-2</loc>
    <lastmod>2023-12-02</lastmod>
  </url>`)
  })

  test('applies priority to routes without explicit priority', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      priority: 0.5,
      routes: [
        '/home', // No priority specified, should get default
        ['/about', { priority: 0.9 }], // Explicit priority, should override default
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain(`  <url>
    <loc>https://example.com/home</loc>
    <priority>0.5</priority>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/about</loc>
    <priority>0.9</priority>
  </url>`)
  })

  test('applies changefreq to routes without explicit changefreq', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      changefreq: 'weekly',
      routes: [
        '/home', // No changefreq specified, should get default
        ['/about', { changefreq: 'daily' as const }], // Explicit changefreq, should override default
      ],
    }

    const result = await generateSitemap(config)
    expect(result).toContain(`  <url>
    <loc>https://example.com/home</loc>
    <changefreq>weekly</changefreq>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/about</loc>
    <changefreq>daily</changefreq>
  </url>`)
  })

  test('applies both default values together', async () => {
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

    expect(result).toContain(`  <url>
    <loc>https://example.com/home</loc>
    <priority>0.7</priority>
    <changefreq>monthly</changefreq>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/about</loc>
    <priority>0.9</priority>
    <changefreq>monthly</changefreq>
  </url>`)
    expect(result).toContain(`  <url>
    <loc>https://example.com/contact</loc>
    <priority>0.7</priority>
    <changefreq>yearly</changefreq>
  </url>`)
  })

  test('handles function errors gracefully', async () => {
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

  test('validates invalid priority values', async () => {
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

  test('validates invalid changefreq values', async () => {
    const config: SitemapConfig<any> = {
      siteUrl: 'https://example.com',
      routes: [['/invalid-changefreq', { changefreq: 'invalid' as any }]],
    }

    await expect(generateSitemap(config)).rejects.toThrow(
      'Invalid entry /invalid-changefreq: changefreq must be one of always, hourly, daily, weekly, monthly, yearly, never',
    )
  })

  test('escapes XML special characters in URLs', async () => {
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

  test('handles invalid route paths', async () => {
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

  test('handles functions returning invalid data', async () => {
    await expect(
      generateSitemap({
        siteUrl: 'https://example.com',
        routes: [['/string-return', () => 'not-an-object' as any]],
      }),
    ).rejects.toThrow('Invalid entry /string-return: entry must be an object')
    await expect(
      generateSitemap({
        siteUrl: 'https://example.com',
        routes: [['/number-return', () => 123 as any]],
      }),
    ).rejects.toThrow('Invalid entry /number-return: entry must be an object')
    await expect(
      generateSitemap({
        siteUrl: 'https://example.com',
        routes: [['/array-return', () => [1, 2, 3] as any]],
      }),
    ).rejects.toThrow('Invalid entry /array-return: entry must be an object')
  })

  test('path property should not appear in XML output', async () => {
    const result = await generateSitemap({
      siteUrl: 'https://example.com',
      routes: [
        [
          '/posts/$postId',
          () => [
            { path: '/posts/1', priority: 0.8 },
            { path: '/posts/2', priority: 0.8 },
          ],
        ] as any,
      ],
    })

    // Should contain the correct loc elements
    expect(result).toContain('<loc>https://example.com/posts/1</loc>')
    expect(result).toContain('<loc>https://example.com/posts/2</loc>')

    // Should NOT contain path elements in XML
    expect(result).not.toContain('<path>/posts/1</path>')
    expect(result).not.toContain('<path>/posts/2</path>')
    expect(result).not.toContain('<path>')
  })
})
