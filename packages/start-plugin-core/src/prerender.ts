import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'pathe'
import { joinURL, withBase, withTrailingSlash, withoutBase } from 'ufo'
import { createLogger } from './utils'
import { Queue } from './queue'
import { runPrerenderParams } from './prerender-params-runner'
import type { Page, TanStackStartOutputConfig } from './schema'

const DEFAULT_RETRY_DELAY = 500

export interface PrerenderHandler {
  getClientOutputDirectory: () => string
  request: (path: string, options?: RequestInit) => Promise<Response>
  close?: () => Promise<void>
}

export type PrerenderPageSink = (page: Page) => void | Promise<void>

export async function prerender({
  startConfig,
  handler,
  pageSink,
}: {
  startConfig: TanStackStartOutputConfig
  handler: PrerenderHandler
  pageSink?: PrerenderPageSink
}) {
  const logger = createLogger('prerender')
  logger.info('Prerendering pages...')

  try {
    if (!startConfig.prerender?.enabled) {
      return
    }

    let initialPages = startConfig.pages.length
      ? startConfig.pages
      : [{ path: '/' }]

    if (startConfig.prerender.autoStaticPathsDiscovery ?? true) {
      const pagesMap = new Map(initialPages.map((item) => [item.path, item]))
      const discoveredPages = globalThis.TSS_PRERENDABLE_PATHS || []

      for (const page of discoveredPages) {
        if (!pagesMap.has(page.path)) {
          pagesMap.set(page.path, page)
        }
      }

      initialPages = Array.from(pagesMap.values())
    }

    const outputDir = handler.getClientOutputDirectory()
    const concurrency =
      startConfig.prerender.concurrency ?? os.cpus().length
    const maxPending = Math.max(concurrency * 4, concurrency + 1)
    // +1 reserves a slot for the streaming sentinel below.
    const queue = new Queue({ concurrency: concurrency + 1 })
    const seen = new Set<string>()
    const prerendered = new Set<string>()
    const retriesByPath = new Map<string, number>()
    const routerBasePath = joinURL('/', startConfig.router.basepath ?? '')
    const routerBaseUrl = new URL(routerBasePath, 'http://localhost')
    const filter = startConfig.prerender.filter

    logger.info(`Concurrency: ${concurrency}`)

    let streamingResolve!: () => void
    const streamingDone = new Promise<void>((resolve) => {
      streamingResolve = resolve
    })
    queue.add(() => streamingDone)
    const queueComplete = queue.start()

    const seedPage = async (page: Page) => {
      const normalized = validateAndNormalizePrerenderPage(page, routerBaseUrl)
      addCrawlPageTask(normalized)

      if (queue.getPending().length < maxPending) return
      await new Promise<void>((resolve) => {
        const off = queue.onSettled(() => {
          if (queue.getPending().length < maxPending) {
            off()
            resolve()
          }
        })
      })
    }

    if (!startConfig.spa?.enabled) {
      if (!globalThis.TSS_PRERENDER_ROUTE_TREE) {
        throw new Error('Prerender route options were not loaded')
      }

      const routeTree = await globalThis.TSS_PRERENDER_ROUTE_TREE()

      await runPrerenderParams({
        routeTree,
        pages: initialPages,
        logger,
        filter,
        prerenderParamsTimeout:
          startConfig.prerender.prerenderParamsTimeout,
        onPage: seedPage,
      })
    } else {
      for (const page of initialPages) {
        await seedPage(page)
      }
    }

    streamingResolve()

    await queueComplete

    logger.info(`Prerendered ${prerendered.size} pages:`)
    for (const pagePath of prerendered) {
      logger.info(`- ${pagePath}`)
    }

    function addCrawlPageTask(page: Page) {
      if (seen.has(page.path)) return
      seen.add(page.path)

      if (filter && !filter(page)) return

      if (!(page.prerender?.enabled ?? true)) {
        if (pageSink) pageSink(page)
        return
      }

      const prerenderOptions = {
        ...startConfig.prerender,
        ...page.prerender,
      }

      queue.add(async () => {
        logger.info(`Crawling: ${page.path}`)
        const retries = retriesByPath.get(page.path) || 0

        try {
          const res = await requestWithRedirects(
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
          } else if (
            cleanPagePath.endsWith('/') ||
            (prerenderOptions.autoSubfolderIndex ?? true)
          ) {
            htmlPath = joinURL(cleanPagePath, 'index.html')
          } else {
            htmlPath = cleanPagePath + '.html'
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

          if (pageSink) await pageSink(page)

          if (prerenderOptions.crawlLinks ?? true) {
            const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g
            let match: RegExpExecArray | null
            while ((match = linkRegex.exec(html)) !== null) {
              const href = match[1]
              if (href && (href.startsWith('/') || href.startsWith('./'))) {
                addCrawlPageTask({ path: href, fromCrawl: true })
              }
            }
          }
        } catch (error) {
          if (retries < (prerenderOptions.retryCount ?? 0)) {
            const rawDelay = Number(prerenderOptions.retryDelay)
            const retryDelay =
              !Number.isFinite(rawDelay) || rawDelay < 0
                ? DEFAULT_RETRY_DELAY
                : Math.trunc(rawDelay)
            logger.warn(
              `Encountered error, retrying: ${page.path} in ${retryDelay}ms`,
            )
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
            retriesByPath.set(page.path, retries + 1)
            addCrawlPageTask(page)
          } else if (prerenderOptions.failOnError ?? true) {
            throw error
          }
        }
      })
    }

    async function requestWithRedirects(
      pagePath: string,
      options?: RequestInit,
      maxRedirects: number = 5,
    ): Promise<Response> {
      const response = await handler.request(pagePath, options)

      if (isRedirectResponse(response) && maxRedirects > 0) {
        const location = response.headers.get('location')!

        if (
          location.startsWith('http://localhost') ||
          location.startsWith('/')
        ) {
          const nextPath = location.replace('http://localhost', '')
          return requestWithRedirects(nextPath, options, maxRedirects - 1)
        }

        logger.warn(`Skipping redirect to external location: ${location}`)
      }

      return response
    }
  } catch (error) {
    logger.error(error)
    throw error
  } finally {
    delete globalThis.TSS_PRERENDER_ROUTE_TREE
    await handler.close?.()
  }
}

function isRedirectResponse(res: Response) {
  return res.status >= 300 && res.status < 400 && res.headers.get('location')
}

export function validateAndNormalizePrerenderPage(
  page: Page,
  routerBaseUrl: URL,
): Page {
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

  const decodedPathname = decodeURI(url.pathname)

  return {
    ...page,
    path: decodedPathname + url.search + url.hash,
  }
}
