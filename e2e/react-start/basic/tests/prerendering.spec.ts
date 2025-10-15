import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPrerender } from './utils/isPrerender'

test.describe('Prerender Static Path Discovery', () => {
  test.skip(!isPrerender, 'Skipping since not in prerender mode')
  test.describe('Build Output Verification', () => {
    test('should automatically discover and prerender static routes', () => {
      // Check that static routes were automatically discovered and prerendered
      const distDir = join(process.cwd(), 'dist', 'client')

      // These static routes should be automatically discovered and prerendered
      expect(existsSync(join(distDir, 'index.html'))).toBe(true)
      expect(existsSync(join(distDir, 'posts.html'))).toBe(true)
      expect(existsSync(join(distDir, 'users.html'))).toBe(true)
      expect(existsSync(join(distDir, 'deferred.html'))).toBe(true)
      expect(existsSync(join(distDir, 'scripts.html'))).toBe(true)
      expect(existsSync(join(distDir, 'inline-scripts.html'))).toBe(true)
      expect(existsSync(join(distDir, '대한민국.html'))).toBe(true)

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
      const distDir = join(process.cwd(), 'dist', 'client')
      expect(existsSync(join(distDir, 'posts.html'))).toBe(true)

      // "Select a post." should be in the prerendered HTML
      const html = readFileSync(join(distDir, 'posts.html'), 'utf-8')
      expect(html).toContain('Select a post.')
    })

    test('should contain prerendered content in users.html', () => {
      const distDir = join(process.cwd(), 'dist', 'client')
      expect(existsSync(join(distDir, 'users.html'))).toBe(true)

      // "Select a user." should be in the prerendered HTML
      const html = readFileSync(join(distDir, 'users.html'), 'utf-8')
      expect(html).toContain('Select a user.')
    })
  })
})
