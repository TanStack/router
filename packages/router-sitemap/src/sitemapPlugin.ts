import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateSitemap } from './generateSitemap'
import type { SitemapConfig } from './generateSitemap'
import type { RegisteredRouter } from '@tanstack/router-core'
import type { Plugin } from 'vite'

export interface SitemapPluginOptions<
  TRouter extends RegisteredRouter = RegisteredRouter,
> {
  sitemap: SitemapConfig<TRouter>
  outputDir?: string
  filename?: string
}

export function sitemapPlugin<
  TRouter extends RegisteredRouter = RegisteredRouter,
>(options: SitemapPluginOptions<TRouter>): Plugin {
  const { sitemap, outputDir = 'public', filename = 'sitemap.xml' } = options

  return {
    name: 'sitemap',
    async buildEnd() {
      try {
        const sitemapXml = await generateSitemap(sitemap)

        const outputPath = join(outputDir, filename)
        const dirPath = dirname(outputPath)

        try {
          mkdirSync(dirPath, { recursive: true })
        } catch {
          // Directory might already exist
        }

        writeFileSync(outputPath, sitemapXml, 'utf8')

        console.log(`Sitemap generated: ${outputPath}`)
      } catch (error) {
        console.error('Failed to generate sitemap:', error)
        throw error
      }
    },
  }
}
