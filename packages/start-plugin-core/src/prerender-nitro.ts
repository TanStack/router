import { existsSync, promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'pathe'
import { joinURL, withBase, withoutBase } from 'ufo'
import { createLogger } from './utils'
import { Queue } from './queue'
import type { Page, TanStackStartOutputConfig } from './schema'
import type { PreviewServer } from 'vite'

/**
 * Prerender pages using vite.preview() after Nitro's build completes.
 */
export async function prerenderWithNitro({
  startConfig,
  nitroOutputDir,
  nitroOptions,
}: {
  startConfig: TanStackStartOutputConfig
  nitroOutputDir: string
  nitroOptions: {
    preset: string
    output: { dir: string }
  }
}) {
  const logger = createLogger('prerender')
  logger.info('Prerendering pages (post-Nitro build)...')

  if (startConfig.prerender?.enabled !== false) {
    startConfig.prerender = {
      ...startConfig.prerender,
      enabled:
        startConfig.prerender?.enabled ??
        startConfig.pages.some((d) =>
          typeof d === 'string' ? false : !!d.prerender?.enabled,
        ),
    }
  }

  if (startConfig.spa?.enabled) {
    startConfig.prerender = {
      ...startConfig.prerender,
      enabled: true,
    }

    const { HEADERS } = await import('@tanstack/start-server-core')
    const maskUrl = new URL(startConfig.spa.maskPath, 'http://localhost')

    startConfig.pages.push({
      path: maskUrl.toString().replace('http://localhost', ''),
      prerender: {
        ...startConfig.spa.prerender,
        headers: {
          ...startConfig.spa.prerender.headers,
          [HEADERS.TSS_SHELL]: 'true',
        },
      },
      sitemap: {
        exclude: true,
      },
    })
  }

  if (!startConfig.prerender.enabled) {
    return
  }

  let pages = startConfig.pages.length ? startConfig.pages : [{ path: '/' }]

  if (startConfig.prerender.autoStaticPathsDiscovery ?? true) {
    const pagesMap = new Map(pages.map((item) => [item.path, item]))
    const discoveredPages = (globalThis as any).TSS_PRERENDABLE_PATHS || []

    for (const page of discoveredPages) {
      if (!pagesMap.has(page.path)) {
        pagesMap.set(page.path, page)
      }
    }

    pages = Array.from(pagesMap.values())
  }

  startConfig.pages = pages

  process.env.TSS_PRERENDERING = 'true'

  const outputDir = nitroOptions.output.dir
  const nitroJsonPath = path.join(outputDir, 'nitro.json')
  if (!existsSync(nitroJsonPath)) {
    logger.info('Writing nitro.json for vite.preview()...')
    const nitroJson = {
      date: new Date().toJSON(),
      preset: nitroOptions.preset,
      framework: { name: 'nitro', version: '' },
      versions: { nitro: '3.0.0' },
      commands: {
        preview: 'node ./server/index.mjs',
      },
      config: {},
    }
    await fsp.writeFile(nitroJsonPath, JSON.stringify(nitroJson, null, 2))
  }

  const previewServer = await startPreviewServer()
  const baseUrl = getResolvedUrl(previewServer)

  logger.info(`Using vite.preview() for prerendering: ${baseUrl}`)
  await waitForServer(baseUrl.toString(), logger)

  const isRedirectResponse = (res: Response) => {
    return res.status >= 300 && res.status < 400 && res.headers.get('location')
  }

  async function localFetch(
    urlPath: string,
    options?: RequestInit,
    maxRedirects: number = 5,
  ): Promise<Response> {
    const url = new URL(urlPath, baseUrl)
    const request = new Request(url, options)
    const response = await fetch(request)

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
    const prerenderedPages = await prerenderPages({
      outputDir: nitroOutputDir,
      localFetch,
      startConfig,
      logger,
      isRedirectResponse,
    })

    logger.info(`Prerendered ${prerenderedPages.length} pages:`)
    prerenderedPages.forEach((page) => {
      logger.info(`- ${page}`)
    })
  } catch (error) {
    logger.error(error)
    throw error
  } finally {
    // Emit SIGINT to trigger Nitro's cleanup handlers
    logger.info('Stopping Nitro child process...')
    process.emit('SIGINT', 'SIGINT')

    // Wait for Nitro's graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 3500))

    logger.info('Closing preview server...')
    await previewServer.close()
    logger.info('Prerendering complete')
  }
}

async function waitForServer(
  url: string,
  logger: ReturnType<typeof createLogger>,
  maxAttempts = 60,
  delay = 500,
): Promise<void> {
  logger.info('Waiting for server to be ready...')
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url, { method: 'GET' })
      if (response.status < 500) {
        logger.info('Server is ready')
        return
      }
      logger.info(`Server returned ${response.status}, waiting...`)
    } catch {
      if (i === 0 || i % 10 === 0) {
        logger.info(`Server not ready yet (attempt ${i + 1}/${maxAttempts})...`)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  logger.warn(
    `Server may not be fully ready after ${maxAttempts * delay}ms, proceeding anyway...`,
  )
}

async function startPreviewServer(): Promise<PreviewServer> {
  const vite = await import('vite')

  try {
    return await vite.preview({
      preview: {
        port: 0,
        open: false,
      },
    })
  } catch (error) {
    throw new Error(
      'Failed to start the Vite preview server for prerendering',
      {
        cause: error,
      },
    )
  }
}

function getResolvedUrl(previewServer: PreviewServer): URL {
  const baseUrl = previewServer.resolvedUrls?.local[0]

  if (!baseUrl) {
    throw new Error('No resolved URL is available from the Vite preview server')
  }

  return new URL(baseUrl)
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

async function prerenderPages({
  outputDir,
  localFetch,
  startConfig,
  logger,
  isRedirectResponse,
}: {
  outputDir: string
  localFetch: (
    path: string,
    options?: RequestInit,
    maxRedirects?: number,
  ) => Promise<Response>
  startConfig: TanStackStartOutputConfig
  logger: ReturnType<typeof createLogger>
  isRedirectResponse: (res: Response) => string | false | null
}) {
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
    if (seen.has(page.path)) return
    seen.add(page.path)

    if (page.fromCrawl) {
      startConfig.pages.push(page)
    }

    if (!(page.prerender?.enabled ?? true)) return

    if (startConfig.prerender?.filter && !startConfig.prerender.filter(page))
      return

    const prerenderOptions = {
      ...startConfig.prerender,
      ...page.prerender,
    }

    queue.add(async () => {
      logger.info(`Crawling: ${page.path}`)
      const retries = retriesByPath.get(page.path) || 0
      try {
        const res = await localFetch(
          withBase(page.path, routerBasePath),
          {
            headers: prerenderOptions.headers ?? {},
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
