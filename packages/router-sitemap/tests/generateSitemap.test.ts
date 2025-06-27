import { describe, expect, it } from 'vitest'
import { generateSitemap, type SitemapConfig } from '../src/index'

describe('generateSitemap', () => {
  describe('basic functionality', () => {
    it('should generate basic sitemap XML', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': {},
          '/about': {
            lastmod: '2023-12-01',
            changefreq: 'monthly',
            priority: 0.8,
          },
        },
      }

      const result = await generateSitemap(config)

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
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
        routes: {
          '/home': {
            lastmod: date,
          },
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<lastmod>2023-12-01T10:00:00.000Z</lastmod>')
    })

    it('should handle empty routes', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {},
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(result).toContain('</urlset>')
    })

    it('should validate siteUrl is required', async () => {
      const config = {
        siteUrl: '',
        routes: {},
      } as SitemapConfig<any>

      await expect(generateSitemap(config)).rejects.toThrow(
        'siteUrl is required and must be a string'
      )
    })

    it('should validate siteUrl is a string', async () => {
      const config = {
        siteUrl: null,
        routes: {},
      } as any

      await expect(generateSitemap(config)).rejects.toThrow(
        'siteUrl is required and must be a string'
      )
    })

    it('should validate siteUrl is a valid URL', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'not-a-valid-url',
        routes: {},
      }

      await expect(generateSitemap(config)).rejects.toThrow(
        'Invalid siteUrl: not-a-valid-url.'
      )
    })
  })

  describe('function-based routes', () => {
    it('should handle sync function for static routes', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': () => ({
            lastmod: '2023-12-01',
            priority: 0.9,
          }),
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/home</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<priority>0.9</priority>')
    })

    it('should handle async function for static routes', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': async () => ({
            lastmod: '2023-12-01',
            changefreq: 'daily' as const,
          }),
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/home</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<changefreq>daily</changefreq>')
    })

    it('should handle function returning array for dynamic routes', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': () => [
            { path: '/posts/1', lastmod: '2023-12-01' },
            { path: '/posts/2', lastmod: '2023-12-02' },
          ],
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/posts/1</loc>')
      expect(result).toContain('<loc>https://example.com/posts/2</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<lastmod>2023-12-02</lastmod>')
    })

    it('should handle async function returning array for dynamic routes', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': async () => [
            { path: '/posts/async-1', priority: 0.8 },
            { path: '/posts/async-2', priority: 0.7 },
          ],
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/posts/async-1</loc>')
      expect(result).toContain('<loc>https://example.com/posts/async-2</loc>')
      expect(result).toContain('<priority>0.8</priority>')
      expect(result).toContain('<priority>0.7</priority>')
    })
  })

  describe('array-based dynamic routes', () => {
    it('should handle array of dynamic entries', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': [
            { path: '/posts/array-1', lastmod: '2023-12-01' },
            { path: '/posts/array-2', changefreq: 'weekly' as const },
          ],
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/posts/array-1</loc>')
      expect(result).toContain('<loc>https://example.com/posts/array-2</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<changefreq>weekly</changefreq>')
    })
  })

  describe('mixed configurations', () => {
    it('should handle mix of static and dynamic routes', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': { priority: 1.0 },
          '/about': () => ({ lastmod: '2023-12-01' }),
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': [
            { path: '/posts/1', changefreq: 'daily' as const },
          ],
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/home</loc>')
      expect(result).toContain('<priority>1</priority>')
      expect(result).toContain('<loc>https://example.com/about</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<loc>https://example.com/posts/1</loc>')
      expect(result).toContain('<changefreq>daily</changefreq>')
    })
  })

  describe('XML structure validation', () => {
    it('should generate proper XML declaration', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': {},
        },
      }

      const result = await generateSitemap(config)

      expect(result).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    })

    it('should have proper XML structure with closing tags', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': {},
        },
      }

      const result = await generateSitemap(config)

      expect(result).toContain('<urlset')
      expect(result).toContain('</urlset>')
      expect(result).toContain('<url>')
      expect(result).toContain('</url>')
    })

    it('should format XML with proper indentation', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/home': {},
        },
      }

      const result = await generateSitemap(config)

      // Should have proper indentation
      expect(result).toContain('  <url>')
      expect(result).toContain('    <loc>')
    })
  })

  describe('URL handling edge cases', () => {
    it('should handle siteUrl with trailing slash', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com/',
        routes: {
          '/home': {},
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com//home</loc>')
    })

    it('should handle special characters in URLs', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/special-chars?param=value&other=123': {},
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/special-chars?param=value&amp;other=123</loc>')
    })

    it('should handle unicode characters in URLs', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': [
            { path: '/posts/héllo-wörld', lastmod: '2023-12-01' },
          ],
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/posts/héllo-wörld</loc>')
    })
  })

  describe('priority and numeric values', () => {
    it('should handle priority value 0', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/low-priority': {
            priority: 0,
          },
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<priority>0</priority>')
    })

    it('should handle priority value 1', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/high-priority': {
            priority: 1,
          },
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<priority>1</priority>')
    })

    it('should handle decimal priority values', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/decimal-priority': {
            priority: 0.85,
          },
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<priority>0.85</priority>')
    })
  })

  describe('empty and undefined values', () => {
    it('should skip undefined optional fields', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/minimal': {
            lastmod: undefined,
            changefreq: undefined,
            priority: undefined,
          },
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/minimal</loc>')
      expect(result).not.toContain('<lastmod>')
      expect(result).not.toContain('<changefreq>')
      expect(result).not.toContain('<priority>')
    })
  })

  describe('large datasets', () => {
    it('should handle many static routes', async () => {
      const routes: Record<string, any> = {}
      for (let i = 0; i < 100; i++) {
        routes[`/page-${i}`] = { priority: i / 100 }
      }

      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes,
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/page-0</loc>')
      expect(result).toContain('<loc>https://example.com/page-99</loc>')
      expect(result).toContain('<priority>0</priority>')
      expect(result).toContain('<priority>0.99</priority>')
    })

    it('should handle many dynamic routes', async () => {
      const dynamicEntries = []
      for (let i = 0; i < 50; i++) {
        dynamicEntries.push({
          path: `/post-${i}`,
          lastmod: `2023-12-${String(i + 1).padStart(2, '0')}`,
        })
      }

      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': dynamicEntries,
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/post-0</loc>')
      expect(result).toContain('<loc>https://example.com/post-49</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<lastmod>2023-12-50</lastmod>')
    })
  })

  describe('async function handling', () => {
    it('should handle async static route function', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        routes: {
          '/async-static': async () => {
            // Simulate async operation
            await new Promise(resolve => setTimeout(resolve, 10))
            return {
              lastmod: '2023-12-01',
              changefreq: 'weekly' as const,
              priority: 0.8,
            }
          },
        },
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
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': async () => {
            // Simulate async operation (e.g., database query)
            await new Promise(resolve => setTimeout(resolve, 10))
            return [
              { path: '/posts/async-1', lastmod: '2023-12-01' },
              { path: '/posts/async-2', lastmod: '2023-12-02' },
            ]
          },
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/posts/async-1</loc>')
      expect(result).toContain('<loc>https://example.com/posts/async-2</loc>')
      expect(result).toContain('<lastmod>2023-12-01</lastmod>')
      expect(result).toContain('<lastmod>2023-12-02</lastmod>')
    })
  })

  describe('default values', () => {
    it('should apply defaultPriority to routes without explicit priority', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        defaultPriority: 0.5,
        routes: {
          '/home': {}, // No priority specified, should get default
          '/about': { priority: 0.9 }, // Explicit priority, should override default
        },
      }

      const result = await generateSitemap(config)
      expect(result).toContain('<loc>https://example.com/home</loc>')
      expect(result).toContain('<priority>0.5</priority>') // Default priority
      expect(result).toContain('<loc>https://example.com/about</loc>')
      expect(result).toContain('<priority>0.9</priority>') // Explicit priority
    })

    it('should apply defaultChangeFreq to routes without explicit changefreq', async () => {
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        defaultChangeFreq: 'weekly',
        routes: {
          '/home': {}, // No changefreq specified, should get default
          '/about': { changefreq: 'daily' as const }, // Explicit changefreq, should override default
        },
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
        defaultPriority: 0.7,
        defaultChangeFreq: 'monthly',
        routes: {
          '/home': {}, // Should get both defaults
          '/about': { priority: 0.9 }, // Should get default changefreq but explicit priority
          '/contact': { changefreq: 'yearly' as const }, // Should get default priority but explicit changefreq
        },
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
      const config: SitemapConfig<any> = {
        siteUrl: 'https://example.com',
        defaultPriority: 0.6,
        defaultChangeFreq: 'weekly',
        routes: {
          // @ts-expect-error - Testing dynamic routes
          '/posts/$postId': [
            { path: '/posts/1' }, // Should get defaults
            { path: '/posts/2', priority: 0.9 }, // Should get default changefreq, explicit priority
            { path: '/posts/3', changefreq: 'daily' as const }, // Should get default priority, explicit changefreq
          ],
        },
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
        defaultPriority: 0.4,
        defaultChangeFreq: 'monthly',
        routes: {
          '/static-func': () => ({}), // Function returning empty object, should get defaults
          '/static-func-partial': () => ({ priority: 0.8 }), // Should get default changefreq
          // @ts-expect-error - Testing dynamic routes
          '/dynamic-func': () => [
            { path: '/dynamic/1' }, // Should get defaults
            { path: '/dynamic/2', changefreq: 'hourly' as const }, // Should get default priority
          ],
        },
      }

      const result = await generateSitemap(config)
      
      // Static function with defaults
      expect(result).toContain('<loc>https://example.com/static-func</loc>')
      expect(result).toContain('<priority>0.4</priority>')
      expect(result).toContain('<changefreq>monthly</changefreq>')
      
      // Static function with partial defaults
      expect(result).toContain('<loc>https://example.com/static-func-partial</loc>')
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
  })
})