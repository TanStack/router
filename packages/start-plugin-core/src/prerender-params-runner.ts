import { defaultStringifySearch, interpolatePath } from '@tanstack/router-core'
import { collectPrerenderRouteOptions } from './prerender-route-options'
import type { Page } from './schema'
import type {
  RoutePrerenderOptions,
  RouteSitemapOptions,
} from '@tanstack/start-client-core'
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
  pages: Iterable<Page>
  logger: PrerenderParamsLogger
  filter?: (page: Page) => unknown
  prerenderParamsTimeout?: number
  onPage: (page: Page) => void | Promise<void>
}

export async function runPrerenderParams({
  routeTree,
  pages,
  logger,
  filter,
  prerenderParamsTimeout,
  onPage,
}: RunPrerenderParamsOptions): Promise<void> {
  const { routeOptions, dynamicRoutes, sitemapRoutes } =
    collectPrerenderRouteOptions(routeTree)

  // Explicit pages may receive route-level sitemap merges and gap-fills from
  // colliding generated entries. They are emitted after the dynamic-route pass
  // so any patches are applied first.
  const explicitByPath = new Map<string, Page>()
  for (const page of pages) {
    explicitByPath.set(page.path, page)
  }

  for (const route of sitemapRoutes) {
    const options = routeOptions.get(route.routePath)
    if (!options?.sitemap) continue
    if (isDynamicPath(route.path)) continue

    const page = explicitByPath.get(route.path)
    if (!page) continue

    explicitByPath.set(route.path, merge(page, { sitemap: options.sitemap }))
  }

  const seen = new Set<string>(explicitByPath.keys())
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)

  try {
    if (
      prerenderParamsTimeout !== undefined &&
      (!Number.isFinite(prerenderParamsTimeout) || prerenderParamsTimeout < 0)
    ) {
      throw new Error(
        'prerenderParamsTimeout must be a non-negative finite number',
      )
    }

    for (const route of dynamicRoutes) {
      const options = routeOptions.get(route.routePath)
      if (!options?.prerenderParams) continue

      if (!isDynamicPath(route.path)) {
        logger.warn(
          `Skipping prerenderParams for static route ${route.routePath}; static routes are already discovered automatically.`,
        )
        continue
      }

      const timeoutId =
        prerenderParamsTimeout === undefined
          ? undefined
          : setTimeout(() => {
              controller.abort(
                new Error(
                  `prerenderParams for route ${route.routePath} timed out`,
                ),
              )
            }, prerenderParamsTimeout)

      try {
        throwIfAborted(controller.signal)

        const entries = await new Promise<unknown>((resolve, reject) => {
          const onAbort = () =>
            reject(
              controller.signal.reason ?? new Error('prerenderParams aborted'),
            )
          controller.signal.addEventListener('abort', onAbort, { once: true })

          Promise.resolve()
            .then(() => {
              throwIfAborted(controller.signal)
              return options.prerenderParams!({
                routePath: route.routePath,
                signal: controller.signal,
              })
            })
            .then(resolve, reject)
            .finally(() => {
              controller.signal.removeEventListener('abort', onAbort)
            })
        })

        if (!entries || typeof entries !== 'object') {
          throw new Error(
            `prerenderParams for route ${route.routePath} must return an array or iterable`,
          )
        }

        const asyncIter = (entries as AsyncIterable<unknown>)[
          Symbol.asyncIterator
        ]
        const syncIter = (entries as Iterable<unknown>)[Symbol.iterator]

        if (typeof asyncIter !== 'function' && typeof syncIter !== 'function') {
          throw new Error(
            `prerenderParams for route ${route.routePath} must return an array or iterable`,
          )
        }

        const visit = async (entry: unknown) => {
          throwIfAborted(controller.signal)

          if (
            !entry ||
            typeof entry !== 'object' ||
            !('params' in entry) ||
            !entry.params ||
            typeof entry.params !== 'object'
          ) {
            throw new Error(
              `prerenderParams entry for route ${route.routePath} must include params`,
            )
          }

          const { params, search, sitemap, prerender } =
            entry as PrerenderParamsEntry

          const { interpolatedPath, isMissingParams, usedParams } =
            interpolatePath({ path: route.path, params })

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

          const page: Page = {
            path:
              interpolatedPath + (search ? defaultStringifySearch(search) : ''),
            sitemap: mergeOptions(options.sitemap, sitemap),
            prerender: mergeOptions(options.prerender, prerender),
          }

          if (filter && !filter(page)) return

          const explicit = explicitByPath.get(page.path)
          if (explicit) {
            explicitByPath.set(page.path, merge(page, explicit))
            return
          }

          if (seen.has(page.path)) return

          seen.add(page.path)
          await onPage(page)
        }

        if (typeof asyncIter === 'function') {
          for await (const entry of entries as AsyncIterable<unknown>) {
            await visit(entry)
          }
        } else {
          for (const entry of entries as Iterable<unknown>) {
            await visit(entry)
          }
        }

        throwIfAborted(controller.signal)
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
    }
  } finally {
    process.off('SIGINT', abort)
    process.off('SIGTERM', abort)
  }

  for (const page of explicitByPath.values()) {
    await onPage(page)
  }
}

export async function collectPrerenderParams(
  opts: Omit<RunPrerenderParamsOptions, 'onPage'>,
): Promise<Array<Page>> {
  const out: Array<Page> = []
  await runPrerenderParams({
    ...opts,
    onPage: (page) => {
      out.push(page)
    },
  })
  return out
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

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason ?? new Error('prerenderParams aborted')
  }
}
