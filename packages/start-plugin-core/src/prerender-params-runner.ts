import { defaultStringifySearch, interpolatePath } from '@tanstack/router-core'
import { collectPrerenderRouteOptions } from './prerender-route-options'
import type { Page } from './schema'
import type {
  RoutePrerenderOptions,
  RouteSitemapOptions,
} from '@tanstack/start-client-core'
import type {
  PrerenderRouteMetadata,
  PrerenderRouteOptions,
} from './prerender-route-options'
import type { AnyRoute } from '@tanstack/router-core'

interface PrerenderParamsLogger {
  warn: (...args: Array<unknown>) => void
}

export interface RunPrerenderParamsOptions {
  routeTree: AnyRoute | undefined
  pages: Array<Page>
  logger: PrerenderParamsLogger
  filter?: (page: Page) => unknown
  prerenderParamsTimeout?: number
}

export async function runPrerenderParams({
  routeTree,
  pages,
  logger,
  filter,
  prerenderParamsTimeout,
}: RunPrerenderParamsOptions): Promise<Array<Page>> {
  const { routeOptions, dynamicRoutes, sitemapRoutes } =
    collectPrerenderRouteOptions(routeTree)
  const pagesByPath = new Map(pages.map((page) => [page.path, page]))

  for (const route of sitemapRoutes) {
    const options = routeOptions.get(route.routePath)
    if (!options?.sitemap) continue

    const page = pagesByPath.get(route.path)
    if (!page || dynamic(route.path)) continue

    pagesByPath.set(route.path, merge(page, { sitemap: options.sitemap }))
  }

  const controller = new AbortController()
  const cleanupProcessAbort = signals(controller)

  try {
    for (const route of dynamicRoutes) {
      const options = routeOptions.get(route.routePath)
      if (!options?.prerenderParams) continue

      if (!dynamic(route.path)) {
        logger.warn(
          `Skipping prerenderParams for static route ${route.routePath}; static routes are already discovered automatically.`,
        )
        continue
      }

      const cleanupTimeout = timeout(
        controller,
        prerenderParamsTimeout,
        route.routePath,
      )

      const entries = await call(
        () =>
          options.prerenderParams!({
            routePath: route.routePath,
            signal: controller.signal,
          }),
        controller.signal,
      ).finally(cleanupTimeout)

      for (const entry of entries) {
        const page = create(route, options, entry)

        if (filter && !filter(page)) {
          continue
        }

        const existing = pagesByPath.get(page.path)
        // Explicit pages, or the first generated entry for a duplicate path,
        // keep precedence over later prerenderParams entries.
        pagesByPath.set(page.path, existing ? merge(page, existing) : page)
      }
    }
  } finally {
    cleanupProcessAbort()
  }

  return Array.from(pagesByPath.values())
}

function signals(controller: AbortController) {
  const abort = () => controller.abort()

  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)

  return () => {
    process.off('SIGINT', abort)
    process.off('SIGTERM', abort)
  }
}

function timeout(
  controller: AbortController,
  timeout: number | undefined,
  routePath: string,
) {
  if (timeout === undefined) {
    return () => {}
  }

  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(`prerenderParams for route ${routePath} timed out`),
    )
  }, timeout)

  return () => clearTimeout(timeoutId)
}

async function call<T>(
  callback: () => T | Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw signal.reason ?? new Error('prerenderParams aborted')
  }

  return await new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new Error('prerenderParams aborted'))
    signal.addEventListener('abort', abort, { once: true })

    Promise.resolve()
      .then(() => {
        if (signal.aborted) {
          throw signal.reason ?? new Error('prerenderParams aborted')
        }

        return callback()
      })
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', abort)
      })
  })
}

function create(
  route: PrerenderRouteMetadata,
  options: PrerenderRouteOptions,
  entry: {
    params: Record<string, unknown>
    search?: Record<string, unknown>
    sitemap?: RouteSitemapOptions
    prerender?: RoutePrerenderOptions
  },
): Page {
  const { interpolatedPath, isMissingParams, usedParams } = interpolatePath({
    path: route.path,
    params: entry.params,
  })

  if (
    isMissingParams ||
    Object.entries(usedParams).some(
      ([key, value]) => key !== '*' && value == null,
    )
  ) {
    throw new Error(
      `Missing prerenderParams values for route ${route.routePath}`,
    )
  }

  return {
    path: interpolatedPath + search(entry.search),
    sitemap: sitemap(options.sitemap, entry.sitemap),
    prerender: entry.prerender,
  }
}

function search(value: Record<string, unknown> | undefined) {
  return value ? defaultStringifySearch(value) : ''
}

function merge(base: Page, override: Partial<Page>): Page {
  return {
    ...base,
    ...override,
    sitemap: sitemap(base.sitemap, override.sitemap),
    prerender: prerender(base.prerender, override.prerender),
  }
}

function sitemap(
  base: RouteSitemapOptions | undefined,
  override: RouteSitemapOptions | undefined,
) {
  if (!base) return override
  if (!override) return base
  return { ...base, ...override }
}

function prerender(
  base: RoutePrerenderOptions | undefined,
  override: RoutePrerenderOptions | undefined,
) {
  if (!base) return override
  if (!override) return base
  return { ...base, ...override }
}

function dynamic(path: string) {
  return path.includes('$')
}
