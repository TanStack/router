import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPrerender } from './utils/isPrerender'

const distDir = join(
  process.cwd(),
  process.env.E2E_DIST_DIR ?? 'dist',
  'client',
)

test.describe('Prerender Static Path Discovery', () => {
  test.skip(!isPrerender, 'Skipping since not in prerender mode')
  test.describe('Build Output Verification', () => {
    test('should automatically discover and prerender static routes', () => {
      // Check that static routes were automatically discovered and prerendered
      // These static routes should be automatically discovered and prerendered
      expect(existsSync(join(distDir, 'index.html'))).toBe(true)
      expect(existsSync(join(distDir, 'posts/index.html'))).toBe(true)
      expect(existsSync(join(distDir, 'deferred/index.html'))).toBe(true)
      expect(existsSync(join(distDir, 'scripts/index.html'))).toBe(true)
      expect(existsSync(join(distDir, 'inline-scripts/index.html'))).toBe(true)
      expect(
        existsSync(join(distDir, 'specialChars/대한민국/index.html')),
      ).toBe(true)

      // Pathless layouts should NOT be prerendered (they start with _)
      expect(existsSync(join(distDir, '_layout', 'index.html'))).toBe(false) // /_layout

      // API routes should NOT be prerendered

      expect(existsSync(join(distDir, 'api', 'users', 'index.html'))).toBe(
        false,
      ) // /api/users
    })
  })

  test.describe('Static Files Verification', () => {
    test('should contain prerendered content in posts.html', () => {
      expect(existsSync(join(distDir, 'posts/index.html'))).toBe(true)

      // "Select a post." should be in the prerendered HTML
      const html = readFileSync(join(distDir, 'posts/index.html'), 'utf-8')
      expect(html).toContain('Select a post.')
    })

    test('should prerender static routes through outlets', () => {
      const htmlPath = join(distDir, 'layout-a/index.html')

      expect(existsSync(htmlPath)).toBe(true)

      const html = readFileSync(htmlPath, 'utf-8')
        .replaceAll('&#x27;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&apos;', "'")
      expect(html).toContain("I'm a layout")
      expect(html).toContain("I'm a nested layout")
      expect(html).toContain("I'm layout A!")
    })

    test('should prerender dynamic routes through nested pathless outlets', () => {
      const htmlPath = join(distDir, 'prerender-nested/under-layout/index.html')

      expect(existsSync(htmlPath)).toBe(true)

      const html = readFileSync(htmlPath, 'utf-8')
        .replaceAll('&#x27;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&apos;', "'")
      expect(html).toContain("I'm a layout")
      expect(html).toContain("I'm a nested layout")
      expect(html).toContain('Nested prerendered slug: <!-- -->under-layout')
    })

    test('should contain prerendered content from route prerenderParams', () => {
      const htmlPath = join(distDir, 'prerender-params/hello-world/index.html')

      expect(existsSync(htmlPath)).toBe(true)

      const html = readFileSync(htmlPath, 'utf-8')
      expect(html).toContain('Prerendered slug: <!-- -->hello-world')
    })

    test('should support special characters from route prerenderParams', () => {
      const htmlPath = join(distDir, 'prerender-params/대한민국/index.html')

      expect(existsSync(htmlPath)).toBe(true)

      const html = readFileSync(htmlPath, 'utf-8')
      expect(html).toContain('Prerendered slug: <!-- -->대한민국')
    })

    test('should preserve encoded delimiters in route prerenderParams output paths', () => {
      const htmlPath = join(
        distDir,
        'prerender-params/reserved%3Fhash%23plus%2B/index.html',
      )

      expect(existsSync(htmlPath)).toBe(true)

      const html = readFileSync(htmlPath, 'utf-8')
      expect(html).toContain('Prerendered slug:')
      expect(html).toContain('reserved?hash#plus+')
    })

    test('should preserve route prerenderParams search params', () => {
      const htmlPath = join(distDir, 'prerender-params/with-query/index.html')

      expect(existsSync(htmlPath)).toBe(true)

      const html = readFileSync(htmlPath, 'utf-8')
      expect(html).toContain('Prerendered slug:')
      expect(html).toContain('with-query')
      expect(html).toContain('Search page: <!-- -->2')
      expect(html).toContain('Search tag: <!-- -->router start')
    })

    test('should strip server-only imports used by prerenderParams from client output', () => {
      const htmlPath = join(
        distDir,
        'prerender-params/server-only-slug/index.html',
      )

      expect(existsSync(htmlPath)).toBe(true)
      expect(
        readdirSync(distDir, { recursive: true }).some((relativePath) => {
          const filePath = join(distDir, String(relativePath))
          return (
            statSync(filePath).isFile() &&
            readFileSync(filePath, 'utf-8').includes(
              'server-only-prerender-marker',
            )
          )
        }),
      ).toBe(false)
    })

    test('should include route sitemap options from prerenderParams', () => {
      const sitemapPath = join(distDir, 'sitemap.xml')

      expect(existsSync(sitemapPath)).toBe(true)

      const sitemap = readFileSync(sitemapPath, 'utf-8')
      expect(sitemap).toContain(
        '<loc>https://example.com/prerender-params/hello-world</loc>',
      )
      expect(sitemap).toContain('<lastmod>2026-05-05</lastmod>')
      expect(sitemap).toContain('<priority>0.8</priority>')
      expect(sitemap).toContain('<changefreq>weekly</changefreq>')
      expect(sitemap).toContain(
        '<loc>https://example.com/prerender-params/대한민국</loc>',
      )
      expect(sitemap).toContain('<priority>0.6</priority>')
      expect(sitemap).toContain(
        '<loc>https://example.com/prerender-params/with-query?page=2&amp;tag=router+start</loc>',
      )
      expect(sitemap).toContain('<priority>0.4</priority>')
      expect(sitemap).not.toContain(
        '<loc>https://example.com/prerender-params/server-only-slug</loc>',
      )
    })
  })
})
