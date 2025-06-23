import { promises as fsp } from 'node:fs'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { getRollupConfig } from 'nitropack/rollup'
import { build as buildNitro, createNitro } from 'nitropack'
import { joinURL, withBase, withoutBase } from 'ufo'
import { VITE_ENVIRONMENT_NAMES } from '../constants'
import { createLogger } from '../utils'
import { Queue } from './queue'
import type { ViteBuilder } from 'vite'
import type { $Fetch, Nitro } from 'nitropack'
import type { TanStackStartOutputConfig } from '../plugin'
import type { Page } from '../schema'

export async function prerender({
  options,
  nitro,
  builder,
}: {
  options: TanStackStartOutputConfig
  nitro: Nitro
  builder: ViteBuilder
}) {
  const logger = createLogger('prerender')
  logger.info('Prerendering pages...')

  // If prerender is enabled but no pages are provided, default to prerendering the root page
  if (options.prerender?.enabled && !options.pages.length) {
    options.pages = [
      {
        path: '/',
      },
    ]
  }

  const serverEnv = builder.environments[VITE_ENVIRONMENT_NAMES.server]

  if (!serverEnv) {
    throw new Error(
      `Vite's "${VITE_ENVIRONMENT_NAMES.server}" environment not found`,
    )
  }

  const prerenderOutputDir = path.resolve(
    options.root,
    '.tanstack',
    'start',
    'build',
    'prerenderer',
  )

  const nodeNitro = await createNitro({
    ...nitro.options._config,
    preset: 'nitro-prerender',
    logLevel: 0,
    output: {
      dir: prerenderOutputDir,
      serverDir: path.resolve(prerenderOutputDir, 'server'),
      publicDir: path.resolve(prerenderOutputDir, 'public'),
    },
  })

  const nodeNitroRollupOptions = getRollupConfig(nodeNitro)

  const build = serverEnv.config.build

  build.outDir = prerenderOutputDir

  build.rollupOptions = {
    ...build.rollupOptions,
    ...nodeNitroRollupOptions,
    output: {
      ...build.rollupOptions.output,
      ...nodeNitroRollupOptions.output,
      sourcemap: undefined,
    },
  }

  await buildNitro(nodeNitro)

  // Import renderer entry
  const serverFilename =
    typeof nodeNitroRollupOptions.output.entryFileNames === 'string'
      ? nodeNitroRollupOptions.output.entryFileNames
      : 'index.mjs'

  const serverEntrypoint = pathToFileURL(
    path.resolve(path.join(nodeNitro.options.output.serverDir, serverFilename)),
  ).toString()

  const { closePrerenderer, localFetch } = (await import(serverEntrypoint)) as {
    closePrerenderer: () => void
    localFetch: $Fetch
  }

  try {
    // Crawl all pages
    const pages = await prerenderPages()

    logger.info(`Prerendered ${pages.length} pages:`)
    pages.forEach((page) => {
      logger.info(`- ${page}`)
    })

    // TODO: Write the prerendered pages to the output directory
  } catch (error) {
    logger.error(error)
  } finally {
    // Ensure server is always closed
    // server.process.kill()
    closePrerenderer()
  }

  function extractLinks(html: string): Array<string> {
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g
    const links: Array<string> = []
    let match

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1]
      if (href && (href.startsWith('/') || href.startsWith('./'))) {
        links.push(href)
      }
    }

    return links
  }

  async function prerenderPages() {
    const seen = new Set<string>()
    const retriesByPath = new Map<string, number>()
    const concurrency = options.prerender?.concurrency ?? os.cpus().length
    logger.info(`Concurrency: ${concurrency}`)
    const queue = new Queue({ concurrency })

    options.pages.forEach((page) => addCrawlPageTask(page))

    await queue.start()

    return Array.from(seen)

    function addCrawlPageTask(page: Page) {
      // Was the page already seen?
      if (seen.has(page.path)) return

      // Add the page to the seen set
      seen.add(page.path)

      if (page.fromCrawl) {
        options.pages.push(page)
      }

      // If not enabled, skip
      if (!(page.prerender?.enabled ?? true)) return

      // If there is a filter link, check if the page should be prerendered
      if (options.prerender?.filter && !options.prerender.filter(page)) return

      // Resolve the merged default and page-specific prerender options
      const prerenderOptions = {
        ...options.prerender,
        ...page.prerender,
      }

      // Add the task
      queue.add(async () => {
        logger.info(`Crawling: ${page.path}`)
        const retries = retriesByPath.get(page.path) || 0
        try {
          // Fetch the route
          const encodedRoute = encodeURI(page.path)

          const res = await localFetch<Response>(
            withBase(encodedRoute, nodeNitro.options.baseURL),
            {
              headers: { 'x-nitro-prerender': encodedRoute },
            },
          )

          if (!res.ok) {
            throw new Error(`Failed to fetch ${page.path}: ${res.statusText}`, {
              cause: res,
            })
          }

          const cleanPagePath = (
            prerenderOptions.outputPath || page.path
          ).split(/[?#]/)[0]!

          // Guess route type and populate fileName
          const contentType = res.headers.get('content-type') || ''
          const isImplicitHTML =
            !cleanPagePath.endsWith('.html') && contentType.includes('html')
          // &&
          // !JsonSigRx.test(dataBuff.subarray(0, 32).toString('utf8'))
          const routeWithIndex = cleanPagePath.endsWith('/')
            ? cleanPagePath + 'index'
            : cleanPagePath

          const htmlPath =
            cleanPagePath.endsWith('/') || prerenderOptions.autoSubfolderIndex
              ? joinURL(cleanPagePath, 'index.html')
              : cleanPagePath + '.html'

          const filename = withoutBase(
            isImplicitHTML ? htmlPath : routeWithIndex,
            nitro.options.baseURL,
          )

          const html = await res.text()

          const filepath = path.join(nitro.options.output.publicDir, filename)

          await fsp.mkdir(path.dirname(filepath), {
            recursive: true,
          })

          await fsp.writeFile(filepath, html)

          const newPage = await prerenderOptions.onSuccess?.({ page, html })

          if (newPage) {
            Object.assign(page, newPage)
          }

          // Find new links
          if (prerenderOptions.crawlLinks ?? true) {
            const links = extractLinks(html)
            for (const link of links) {
              addCrawlPageTask({ path: link, fromCrawl: true })
            }
          }
        } catch (error) {
          if (retries < (prerenderOptions.retryCount ?? 0)) {
            logger.warn(`Encountered error, retrying: ${page.path} in 500ms`)
            await new Promise((resolve) =>
              setTimeout(resolve, prerenderOptions.retryDelay),
            )
            retriesByPath.set(page.path, retries + 1)
            addCrawlPageTask(page)
          } else {
            throw error
          }
        }
      })
    }
  }
}
