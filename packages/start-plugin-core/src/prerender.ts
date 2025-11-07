import { existsSync, promises as fsp, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'pathe'
import { joinURL, withBase, withoutBase } from 'ufo'
import { VITE_ENVIRONMENT_NAMES } from './constants'
import { createLogger } from './utils'
import { Queue } from './queue'
import type { Rollup, ViteBuilder } from 'vite'
import type { Page, TanStackStartOutputConfig } from './schema'

export async function prerender({
  startConfig,
  builder,
  serverBundle,
}: {
  startConfig: TanStackStartOutputConfig
  builder: ViteBuilder
  serverBundle: Rollup.OutputBundle
}) {
  const logger = createLogger('prerender')
  logger.info('Prerendering pages...')

  // If prerender is enabled
  if (startConfig.prerender?.enabled) {
    // default to root page if no pages are defined
    let pages = startConfig.pages.length ? startConfig.pages : [{ path: '/' }]

    if (startConfig.prerender.autoStaticPathsDiscovery ?? true) {
      // merge discovered static pages with user-defined pages
      const pagesMap = new Map(pages.map((item) => [item.path, item]))
      const discoveredPages = globalThis.TSS_PRERENDABLE_PATHS || []

      for (const page of discoveredPages) {
        if (!pagesMap.has(page.path)) {
          pagesMap.set(page.path, page)
        }
      }

      pages = Array.from(pagesMap.values())
    }

    startConfig.pages = pages
  }

  const serverEnv = builder.environments[VITE_ENVIRONMENT_NAMES.server]

  if (!serverEnv) {
    throw new Error(
      `Vite's "${VITE_ENVIRONMENT_NAMES.server}" environment not found`,
    )
  }

  const clientEnv = builder.environments[VITE_ENVIRONMENT_NAMES.client]
  if (!clientEnv) {
    throw new Error(
      `Vite's "${VITE_ENVIRONMENT_NAMES.client}" environment not found`,
    )
  }

  const outputDir = clientEnv.config.build.outDir

  const entryFile = findEntryFileInBundle(serverBundle)
  let fullEntryFilePath = path.join(serverEnv.config.build.outDir, entryFile)
  process.env.TSS_PRERENDERING = 'true'

  if (!existsSync(fullEntryFilePath)) {
    // if the file does not exist, we need to write the bundle to a temporary directory
    // this can happen e.g. with nitro that postprocesses the bundle and thus does not write SSR build to disk
    const bundleOutputDir = path.resolve(
      serverEnv.config.root,
      '.tanstack',
      'start',
      'prerender',
    )
    rmSync(bundleOutputDir, { recursive: true, force: true })
    await writeBundleToDisk({ bundle: serverBundle, outDir: bundleOutputDir })
    fullEntryFilePath = path.join(bundleOutputDir, entryFile)
  }

  const { default: serverEntrypoint } = await import(
    pathToFileURL(fullEntryFilePath).toString()
  )

  const isRedirectResponse = (res: Response) => {
    return res.status >= 300 && res.status < 400 && res.headers.get('location')
  }
  async function localFetch(
    path: string,
    options?: RequestInit,
    maxRedirects: number = 5,
  ): Promise<Response> {
    const url = new URL(`http://localhost${path}`)
    const response = await serverEntrypoint.fetch(new Request(url, options))

    if (isRedirectResponse(response) && maxRedirects > 0) {
      const location = response.headers.get('location')!
      if (location.startsWith('http://localhost') || location.startsWith('/')) {
        const newUrl = location.replace('http://localhost', '')
        return localFetch(newUrl, options, maxRedirects - 1)
      } else {
        logger.warn(`Skipping redirect to external location: ${location}`)
      }
    }

    return response
  }

  try {
    // Crawl all pages
    const pages = await prerenderPages({ outputDir })

    logger.info(`Prerendered ${pages.length} pages:`)
    pages.forEach((page) => {
      logger.info(`- ${page}`)
    })
  } catch (error) {
    logger.error(error)
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

  async function prerenderPages({ outputDir }: { outputDir: string }) {
    const seen = new Set<string>()
    const prerendered = new Set<string>()
    const retriesByPath = new Map<string, number>()
    const concurrency = startConfig.prerender?.concurrency ?? os.cpus().length
    logger.info(`Concurrency: ${concurrency}`)
    const queue = new Queue({ concurrency })
    const routerBasePath = joinURL('/', startConfig.router.basepath ?? '')

    startConfig.pages.forEach((page) => addCrawlPageTask(page))

    await queue.start()

    return Array.from(prerendered)

    function addCrawlPageTask(page: Page) {
      // Was the page already seen?
      if (seen.has(page.path)) return

      // Add the page to the seen set
      seen.add(page.path)

      if (page.fromCrawl) {
        startConfig.pages.push(page)
      }

      // If not enabled, skip
      if (!(page.prerender?.enabled ?? true)) return

      // If there is a filter link, check if the page should be prerendered
      if (startConfig.prerender?.filter && !startConfig.prerender.filter(page))
        return

      // Resolve the merged default and page-specific prerender options
      const prerenderOptions = {
        ...startConfig.prerender,
        ...page.prerender,
      }

      // Add the task
      queue.add(async () => {
        logger.info(`Crawling: ${page.path}`)
        const retries = retriesByPath.get(page.path) || 0
        try {
          // Fetch the route

          const res = await localFetch(
            withBase(page.path, routerBasePath),
            {
              headers: {
                ...(prerenderOptions.headers ?? {}),
              },
            },
            prerenderOptions.maxRedirects,
          )

          if (!res.ok) {
            if (isRedirectResponse(res)) {
              logger.warn(`Max redirects reached for ${page.path}`)
            }
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

          const routeWithIndex = cleanPagePath.endsWith('/')
            ? cleanPagePath + 'index'
            : cleanPagePath

          const isSpaShell =
            startConfig.spa?.prerender.outputPath === cleanPagePath

          let htmlPath: string
          if (isSpaShell) {
            // For SPA shell, ignore autoSubfolderIndex option
            htmlPath = cleanPagePath + '.html'
          } else {
            if (
              cleanPagePath.endsWith('/') ||
              (prerenderOptions.autoSubfolderIndex ?? true)
            ) {
              htmlPath = joinURL(cleanPagePath, 'index.html')
            } else {
              htmlPath = cleanPagePath + '.html'
            }
          }

          const filename = withoutBase(
            isImplicitHTML ? htmlPath : routeWithIndex,
            routerBasePath,
          )

          const html = await res.text()

          const filepath = path.join(outputDir, filename)

          await fsp.mkdir(path.dirname(filepath), {
            recursive: true,
          })

          await fsp.writeFile(filepath, html)

          prerendered.add(page.path)

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
            if (prerenderOptions.failOnError ?? true) {
              throw error
            }
          }
        }
      })
    }
  }
}

function findEntryFileInBundle(bundle: Rollup.OutputBundle): string {
  let entryFile: string | undefined

  for (const [_name, file] of Object.entries(bundle)) {
    if (file.type === 'chunk') {
      if (file.isEntry) {
        if (entryFile !== undefined) {
          throw new Error(
            `Multiple entry points found. Only one entry point is allowed.`,
          )
        }
        entryFile = file.fileName
      }
    }
  }
  if (entryFile === undefined) {
    throw new Error(`No entry point found in the bundle.`)
  }
  return entryFile
}

export async function writeBundleToDisk({
  bundle,
  outDir,
}: {
  bundle: Rollup.OutputBundle
  outDir: string
}) {
  const createdDirs = new Set<string>()

  for (const [fileName, asset] of Object.entries(bundle)) {
    const fullPath = path.join(outDir, fileName)
    const dir = path.dirname(fullPath)
    const content = asset.type === 'asset' ? asset.source : asset.code

    if (!createdDirs.has(dir)) {
      await fsp.mkdir(dir, { recursive: true })
      createdDirs.add(dir)
    }

    await fsp.writeFile(fullPath, content)
  }
}
