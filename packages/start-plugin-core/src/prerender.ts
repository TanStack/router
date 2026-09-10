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
  getOrigin?: () => string
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
    const concurrency = startConfig.prerender.concurrency ?? os.cpus().length
    const maxPending = Math.max(concurrency * 4, concurrency + 1)
    const queue = new Queue({ concurrency, started: true, tasks: [] })
    const discovery = new AbortController()
    const seen = new Set<string>()
    const prerendered = new Set<string>()
    const retriesByPath = new Map<string, number>()
    const routerBasePath = joinURL('/', startConfig.router.basepath ?? '')
    const routerBaseUrl = new URL(
      routerBasePath,
      handler.getOrigin?.() ?? 'http://localhost',
    )
    const filter = startConfig.prerender.filter
    // Explicit pages are emitted after discovery so generated options can fill
    // their defaults. Crawling must not claim their paths in the meantime.
    const initialPagePaths = new Set(
      initialPages.map(
        (page) => validateAndNormalizePrerenderPage(page, routerBaseUrl).path,
      ),
    )

    logger.info(`Concurrency: ${concurrency}`)

    const seedPage = async (page: Page) => {
      const normalized = validateAndNormalizePrerenderPage(page, routerBaseUrl)
      addCrawlPageTask(normalized)

      if (queue.getPending().length < maxPending) {
        return
      }
      await new Promise<void>((resolve) => {
        const off = queue.onSettled(() => {
          if (queue.getPending().length < maxPending) {
            off()
            resolve()
          }
        })
      })
    }

    try {
      if (globalThis.TSS_PRERENDER_ROUTE_TREE) {
        const routeTree = await globalThis.TSS_PRERENDER_ROUTE_TREE()

        await runPrerenderParams({
          routeTree,
          pages: initialPages,
          logger,
          prerenderParamsTimeout: startConfig.prerender.prerenderParamsTimeout,
          signal: discovery.signal,
          onPage: seedPage,
        })
      } else if (!startConfig.spa?.enabled) {
        throw new Error('Prerender route options were not loaded')
      } else {
        for (const page of initialPages) {
          await seedPage(page)
        }
      }
    } catch (error) {
      discovery.abort(error)
      throw error
    } finally {
      if (discovery.signal.aborted) {
        queue.clear()
      }
      if (!queue.isSettled()) {
        await new Promise<void>((resolve) => {
          const off = queue.onSettled(() => {
            if (queue.isSettled()) {
              off()
              resolve()
            }
          })
        })
      }
    }
    discovery.signal.throwIfAborted()

    logger.info(`Prerendered ${prerendered.size} pages:`)
    for (const pagePath of prerendered) {
      logger.info(`- ${pagePath}`)
    }

    function addCrawlPageTask(page: Page) {
      if (discovery.signal.aborted || seen.has(page.path)) {
        return
      }
      seen.add(page.path)

      if (filter && !filter(page)) {
        return
      }

      const prerenderOptions = {
        ...startConfig.prerender,
        ...page.prerender,
      }

      queue
        .add(async () => {
          if (!(page.prerender?.enabled ?? true)) {
            await pageSink?.(page)
            return
          }
          logger.info(`Crawling: ${page.path}`)
          const retries = retriesByPath.get(page.path) || 0

          try {
            const res = await requestWithRedirects(
              withTrailingSlash(withBase(page.path, routerBasePath), true),
              {
                signal: discovery.signal,
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

              throw new Error(
                `Failed to fetch ${page.path}: ${res.statusText}`,
                {
                  cause: res,
                },
              )
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
            const resolvedOutputDir = path.resolve(outputDir)
            const filepath = path.resolve(
              outputDir,
              filename.replace(/^\/+/, ''),
            )
            const outputPrefix = resolvedOutputDir.endsWith(path.sep)
              ? resolvedOutputDir
              : resolvedOutputDir + path.sep
            if (
              filepath !== resolvedOutputDir &&
              !filepath.startsWith(outputPrefix)
            ) {
              throw new Error(
                `Prerender output path must stay within the client output directory: ${filename}`,
              )
            }

            await fsp.mkdir(path.dirname(filepath), {
              recursive: true,
            })

            await fsp.writeFile(filepath, html)

            prerendered.add(page.path)

            const newPage = await prerenderOptions.onSuccess?.({ page, html })

            if (newPage) {
              Object.assign(page, newPage)
            }

            if (pageSink) {
              await pageSink(page)
            }

            if (prerenderOptions.crawlLinks ?? true) {
              const links = extractLinks(html)
              for (const link of links) {
                const crawledPage = validateAndNormalizePrerenderPage(
                  { path: link, fromCrawl: true },
                  routerBaseUrl,
                )
                if (!initialPagePaths.has(crawledPage.path)) {
                  addCrawlPageTask(crawledPage)
                }
              }
            }
          } catch (error) {
            if (retries < (prerenderOptions.retryCount ?? 0)) {
              const retryDelay = normalizeRetryDelay(prerenderOptions.retryDelay)
              logger.warn(
                `Encountered error, retrying: ${page.path} in ${retryDelay}ms`,
              )
              await new Promise((resolve) => setTimeout(resolve, retryDelay))
              retriesByPath.set(page.path, retries + 1)
              seen.delete(page.path)
              addCrawlPageTask(page)
            } else if (prerenderOptions.failOnError ?? true) {
              throw error
            }
          }
        })
        .catch((error) => {
          discovery.abort(error)
          queue.clear()
        })
    }

    function extractLinks(html: string): Array<string> {
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g
      const links: Array<string> = []
      let match: RegExpExecArray | null

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1]
        if (href && (href.startsWith('/') || href.startsWith('./'))) {
          links.push(href)
        }
      }

      return links
    }

    function normalizeRetryDelay(value: number | undefined): number {
      const retryDelay = Number(value)

      if (!Number.isFinite(retryDelay) || retryDelay < 0) {
        return DEFAULT_RETRY_DELAY
      }

      return Math.trunc(retryDelay)
    }

    async function requestWithRedirects(
      requestPath: string,
      options?: RequestInit,
      maxRedirects: number = 5,
      currentUrl = resolveInternalUrl(requestPath, routerBaseUrl, routerBaseUrl),
    ): Promise<Response> {
      const requestPathInPreview =
        currentUrl && toPreviewPath(currentUrl, routerBaseUrl)
      if (!requestPathInPreview) {
        throw new Error(`Prerender request path must be relative: ${requestPath}`)
      }

      const response = await handler.request(requestPathInPreview, {
        ...options,
        redirect: 'manual',
      })

      if (isRedirectResponse(response) && maxRedirects > 0) {
        const location = response.headers.get('location')!.trim()
        const url = resolveInternalUrl(location, currentUrl, routerBaseUrl)
        const redirectPath = url && toPreviewPath(url, routerBaseUrl)

        if (url && redirectPath) {
          return requestWithRedirects(
            redirectPath,
            options,
            maxRedirects - 1,
            url,
          )
        }

        logger.warn(`Skipping redirect outside the preview basepath: ${location}`)
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
  return (
    [301, 302, 303, 307, 308].includes(res.status) &&
    !!res.headers.get('location')?.trim()
  )
}

function resolveInternalUrl(
  href: string,
  baseUrl: URL,
  allowedOrigin: URL,
): URL | undefined {
  try {
    const url = new URL(href, baseUrl)
    if (
      url.protocol !== allowedOrigin.protocol ||
      url.origin !== allowedOrigin.origin ||
      url.username ||
      url.password
    ) {
      return undefined
    }
    return url
  } catch {
    return undefined
  }
}

function toPreviewPath(url: URL, routerBaseUrl: URL): string | undefined {
  const basepath = routerBaseUrl.pathname.replace(/\/$/, '')
  if (
    basepath &&
    url.pathname !== basepath &&
    !url.pathname.startsWith(basepath + '/')
  ) {
    return undefined
  }
  if (url.pathname.startsWith('//')) {
    return url.href
  }
  return decodeURI(url.pathname).replaceAll('\\', '%5C') + url.search
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

  if (
    url.protocol !== routerBaseUrl.protocol ||
    url.origin !== routerBaseUrl.origin ||
    url.username ||
    url.password
  ) {
    throw new Error(`prerender page path must be relative: ${page.path}`)
  }

  const decodedPathname = decodeURI(url.pathname)
  const normalizedPath = decodedPathname + url.search + url.hash
  const normalizedUrl = resolveInternalUrl(
    normalizedPath,
    routerBaseUrl,
    routerBaseUrl,
  )
  if (!normalizedUrl || /^\/%2f/i.test(decodedPathname)) {
    throw new Error(`prerender page path must be relative: ${page.path}`)
  }

  return {
    ...page,
    path: decodedPathname.replaceAll('\\', '%5C') + url.search + url.hash,
  }
}
