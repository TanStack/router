import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createLogger } from 'vite'
import { generateSitemap } from './generateSitemap'
import type { SitemapConfig } from './generateSitemap'
import type { RegisteredRouter } from '@tanstack/router-core'
import type { Plugin } from 'vite'

export interface SitemapPluginOptions<
  TRouter extends RegisteredRouter = RegisteredRouter,
> {
  sitemap: SitemapConfig<TRouter>
  path?: string
}

export function sitemapPlugin<
  TRouter extends RegisteredRouter = RegisteredRouter,
>(options: SitemapPluginOptions<TRouter>): Plugin {
  const { sitemap, path = 'sitemap.xml' } = options
  const logger = createLogger('info', { prefix: '[sitemap]' })
  let publicDir = 'public'

  const generateAndWrite = async () => {
    try {
      const sitemapXml = await generateSitemap(sitemap)
      const outputPath = join(publicDir, path)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, sitemapXml, 'utf8')
      logger.info(`Sitemap generated: ${outputPath}`)
    } catch (error) {
      logger.error(`Failed to generate sitemap: ${error}`)
      throw error
    }
  }

  return {
    name: 'sitemap',

    configResolved(cfg) {
      publicDir = cfg.publicDir
    },

    async buildStart() {
      await generateAndWrite()
    },

    async configureServer() {
      await generateAndWrite()
    },
  }
}
