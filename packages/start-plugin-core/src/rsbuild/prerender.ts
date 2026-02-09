import { pathToFileURL } from 'node:url'
import { promises as fsp } from 'node:fs'
import os from 'node:os'

import path from 'pathe'
import { joinURL, withBase, withTrailingSlash, withoutBase } from 'ufo'
import { Queue } from '../queue'
import { createLogger } from '../utils'
import type { Page, TanStackStartOutputConfig } from '../schema'

export async function prerender({
  startConfig,
  clientOutputDir,
  serverEntryPath,
}: {
  startConfig: TanStackStartOutputConfig
  clientOutputDir: string
  serverEntryPath: string
}) {
  const logger = createLogger('prerender')
  logger.info('Prerendering pages...')

  if (startConfig.prerender?.enabled) {
    let pages = startConfig.pages.length ? startConfig.pages : [{ path: '/' }]

    if (startConfig.prerender.autoStaticPathsDiscovery ?? true) {
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

  const routerBasePath = joinURL('/', startConfig.router.basepath ?? '')
  const routerBaseUrl = new URL(routerBasePath, 'http://localhost')

  startConfig.pages = validateAndNormalizePrerenderPages(
    startConfig.pages,
    routerBaseUrl,
  )

  process.env.TSS_PRERENDERING = 'true'

  const serverBuild = await import(pathToFileURL(serverEntryPath).toString())
  const fetchHandler = serverBuild.default?.fetch ?? serverBuild.fetch
  if (!fetchHandler) {
    throw new Error('Server build does not export a fetch handler')
  }

  const baseUrl = new URL('http://localhost')

  const isRedirectResponse = (res: Response) => {
    return res.status >= 300 && res.status < 400 && res.headers.get('location')
  }

  async function localFetch(
    path: string,
    options?: RequestInit,
    maxRedirects: number = 5,
  ): Promise<Response> {
    const url = new URL(path, baseUrl)
    const request = new Request(url, options)
    const response = await fetchHandler(request)

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
    const pages = await prerenderPages({ outputDir: clientOutputDir })

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

    const routerBaseUrl = new URL(routerBasePath, 'http://localhost')
    startConfig.pages = validateAndNormalizePrerenderPages(
      startConfig.pages,
      routerBaseUrl,
    )

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
            withTrailingSlash(withBase(page.path, routerBasePath)),
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
            const resolvedDelay = prerenderOptions.retryDelay ?? 500
            logger.warn(
              `Encountered error, retrying: ${page.path} in ${resolvedDelay}ms`,
            )
            await new Promise((resolve) =>
              setTimeout(resolve, resolvedDelay),
            )
            retriesByPath.set(page.path, retries + 1)
            seen.delete(page.path)
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

function validateAndNormalizePrerenderPages(
  pages: Array<Page>,
  routerBaseUrl: URL,
): Array<Page> {
  return pages.map((page) => {
    let url: URL
    try {
      url = new URL(page.path, routerBaseUrl)
    } catch (err) {
      throw new Error(`prerender page path must be relative: ${page.path}`, {
        cause: err,
      })
    }

    if (url.origin !== 'http://localhost') {
      throw new Error(`prerender page path must be relative: ${page.path}`)
    }

    const decodedPathname = decodeURIComponent(url.pathname)

    return {
      ...page,
      path: decodedPathname + url.search + url.hash,
    }
  })
}
