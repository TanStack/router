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

interface PrerenderParamsEntry {
  params: Record<string, unknown>
  search?: Record<string, unknown>
  sitemap?: RouteSitemapOptions
  prerender?: RoutePrerenderOptions
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
    if (!page || isDynamicPath(route.path)) continue

    pagesByPath.set(route.path, merge(page, { sitemap: options.sitemap }))
  }

  const controller = new AbortController()
  const cleanupProcessAbort = attachProcessAbortHandlers(controller)

  try {
    for (const route of dynamicRoutes) {
      const options = routeOptions.get(route.routePath)
      if (!options?.prerenderParams) continue

      if (!isDynamicPath(route.path)) {
        logger.warn(
          `Skipping prerenderParams for static route ${route.routePath}; static routes are already discovered automatically.`,
        )
        continue
      }

      const cleanupTimeout = startPrerenderParamsTimeout(
        controller,
        prerenderParamsTimeout,
        route.routePath,
      )

      const entries = await runWithAbortSignal(
        () =>
          options.prerenderParams!({
            routePath: route.routePath,
            signal: controller.signal,
          }),
        controller.signal,
      ).finally(cleanupTimeout)

      if (!Array.isArray(entries)) {
        throw new Error(
          `prerenderParams for route ${route.routePath} must return an array`,
        )
      }

      for (const entry of entries) {
        const page = createPageFromParams(route, options, entry)

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

function attachProcessAbortHandlers(controller: AbortController) {
  const abort = () => controller.abort()

  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)

  return () => {
    process.off('SIGINT', abort)
    process.off('SIGTERM', abort)
  }
}

function startPrerenderParamsTimeout(
  controller: AbortController,
  timeout: number | undefined,
  routePath: string,
) {
  if (timeout === undefined) {
    return () => {}
  }

  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new Error(
      'prerenderParamsTimeout must be a non-negative finite number',
    )
  }

  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(`prerenderParams for route ${routePath} timed out`),
    )
  }, timeout)

  return () => clearTimeout(timeoutId)
}

async function runWithAbortSignal<T>(
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

function createPageFromParams(
  route: PrerenderRouteMetadata,
  options: PrerenderRouteOptions,
  entry: unknown,
): Page {
  if (!isPrerenderParamsEntry(entry)) {
    throw new Error(
      `prerenderParams entry for route ${route.routePath} must include params`,
    )
  }

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
    path: interpolatedPath + stringifySearch(entry.search),
    sitemap: mergeOptions(options.sitemap, entry.sitemap),
    prerender: entry.prerender,
  }
}

function stringifySearch(value: Record<string, unknown> | undefined) {
  return value ? defaultStringifySearch(value) : ''
}

function isPrerenderParamsEntry(value: unknown): value is PrerenderParamsEntry {
  return (
    !!value &&
    typeof value === 'object' &&
    'params' in value &&
    !!value.params &&
    typeof value.params === 'object'
  )
}

function merge(base: Page, override: Partial<Page>): Page {
  return {
    ...base,
    ...override,
    sitemap: mergeOptions(base.sitemap, override.sitemap),
    prerender: mergeOptions(base.prerender, override.prerender),
  }
}

function mergeOptions<T extends RouteSitemapOptions | RoutePrerenderOptions>(
  base: T | undefined,
  override: T | undefined,
) {
  if (!base) return override
  if (!override) return base
  return { ...base, ...override }
}

function isDynamicPath(path: string) {
  return path.includes('$')
}
