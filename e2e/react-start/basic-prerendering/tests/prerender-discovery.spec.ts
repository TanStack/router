import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.describe('Prerender Static Path Discovery', () => {
  test.describe('Build Output Verification', () => {
    test('should automatically discover and prerender static routes', () => {
      // Check that static routes were automatically discovered and prerendered
      const distDir = join(process.cwd(), 'dist', 'client')
      
      // These static routes should be automatically discovered and prerendered
      expect(existsSync(join(distDir, 'index.html'))).toBe(true) // / (index)
      expect(existsSync(join(distDir, 'posts.html',))).toBe(true) // /posts
      expect(existsSync(join(distDir, 'users.html'))).toBe(true) // /users
      expect(existsSync(join(distDir, 'deferred.html'))).toBe(true) // /deferred
      expect(existsSync(join(distDir, 'scripts.html'))).toBe(true) // /scripts
      expect(existsSync(join(distDir, 'inline-scripts.html'))).toBe(true) // /inline-scripts
      expect(existsSync(join(distDir, '대한민국.html'))).toBe(true) // /대한민국

      // Pathless layouts should NOT be prerendered (they start with _)
      expect(existsSync(join(distDir, '_layout', 'index.html'))).toBe(false) // /_layout
      
      // API routes should NOT be prerendered
      expect(existsSync(join(distDir, 'api', 'users', 'index.html'))).toBe(false) // /api/users
    })
  })

  test.describe('Static Route Prerendering Verification', () => {
    test('should serve prerendered home page with server-side content', async ({ page }) => {
      await page.goto('/')
      
      // Verify the page loads and contains expected content
      await expect(page.locator('h3')).toContainText('Welcome Home!!!')
      
      // Check that it was server-side rendered (no hydration flicker)
      const html = await page.content()
      expect(html).toContain('Welcome Home!!!') // Content should be in initial HTML
      expect(html).toContain('Hello from a custom component!') // Component content should be in initial HTML
    })

    test('should serve prerendered posts index page', async ({ page }) => {
      await page.goto('/posts')
      // domContentLoaded event
      await page.waitForLoadState('domcontentloaded')
      // Check for server-side rendered content
      const html = await page.content()
      await page.pause();
      expect(html).toContain('Select a post.') // Content should be in initial HTML
    })

    test('should serve prerendered users index page', async ({ page }) => {
      await page.goto('/users')
      
      // Check for server-side rendered content
      const html = await page.content()
      await page.pause();
      expect(html).toContain('Select a user.') // Content should be in initial HTML
    })
  })
})