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
  signal?: AbortSignal
  onPage: (page: Page) => void | Promise<void>
}

export async function runPrerenderParams({
  routeTree,
  pages,
  logger,
  filter,
  prerenderParamsTimeout,
  signal,
  onPage,
}: RunPrerenderParamsOptions): Promise<void> {
  const { routeOptions, dynamicRoutes, sitemapRoutes } =
    collectPrerenderRouteOptions(routeTree)

  // Explicit pages may receive route-level defaults and gap-fills from
  // colliding generated entries. They are emitted after the dynamic-route pass
  // so any patches are applied first.
  const explicitByPath = new Map<string, Page>()
  for (const page of pages) {
    explicitByPath.set(page.path, page)
  }

  for (const route of sitemapRoutes) {
    if (isDynamicPath(route.path)) {
      continue
    }
    const page = explicitByPath.get(route.path)
    if (page) {
      explicitByPath.set(route.path, {
        ...page,
        sitemap: mergeOptions(
          routeOptions.get(route.routePath)?.sitemap,
          page.sitemap,
        ),
      })
    }
  }

  const seen = new Set<string>(explicitByPath.keys())
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', forwardAbort, { once: true })
  if (signal?.aborted) {
    forwardAbort()
  }
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
      if (!options?.prerenderParams) {
        continue
      }

      if (!isDynamicPath(route.path)) {
        logger.warn(
          `Skipping prerenderParams for static route ${route.routePath}; static routes are already discovered automatically.`,
        )
        continue
      }

      const deadline =
        prerenderParamsTimeout === undefined
          ? undefined
          : performance.now() + prerenderParamsTimeout
      const abortTimeout = () => {
        controller.abort(
          new Error(`prerenderParams for route ${route.routePath} timed out`),
        )
      }
      const timeoutId =
        prerenderParamsTimeout === undefined
          ? undefined
          : setTimeout(abortTimeout, prerenderParamsTimeout)

      try {
        throwIfAborted(controller.signal)

        const entries = await abortable<unknown>(controller.signal, () =>
          options.prerenderParams!({
            routePath: route.routePath,
            signal: controller.signal,
          }),
        )

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

          const { params, search, prerender, sitemap } =
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
            prerender: mergeOptions(options.prerender, prerender),
            sitemap: mergeOptions(options.sitemap, sitemap),
          }

          if (filter && !filter(page)) {
            return
          }

          const explicit = explicitByPath.get(page.path)
          if (explicit) {
            explicitByPath.set(page.path, merge(page, explicit))
            return
          }

          if (seen.has(page.path)) {
            return
          }

          seen.add(page.path)
          await onPage(page)
        }

        const iterator =
          typeof asyncIter === 'function'
            ? asyncIter.call(entries)
            : syncIter.call(entries)
        let completed = false
        try {
          for (;;) {
            // Immediately resolved iterations can prevent the timer from running.
            if (deadline !== undefined && performance.now() >= deadline) {
              abortTimeout()
            }
            const entry = await abortable(controller.signal, () =>
              iterator.next(),
            )
            if (entry.done) {
              completed = true
              break
            }
            await abortable(controller.signal, () => visit(entry.value))
          }
        } finally {
          if (!completed && iterator.return) {
            // A suspended generator may never finish return(); cancellation must
            // still release this build's listeners and handler.
            const cleanup = Promise.resolve().then(() => iterator.return!())
            if (controller.signal.aborted) {
              void cleanup.catch(() => {})
            } else {
              await cleanup
            }
          }
        }

        throwIfAborted(controller.signal)
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
      }
    }
    for (const page of explicitByPath.values()) {
      await abortable(controller.signal, () => onPage(page))
    }
  } finally {
    process.off('SIGINT', abort)
    process.off('SIGTERM', abort)
    signal?.removeEventListener('abort', forwardAbort)
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
    prerender: mergeOptions(base.prerender, override.prerender),
    sitemap: mergeOptions(base.sitemap, override.sitemap),
  }
}

function mergeOptions<T extends RoutePrerenderOptions | RouteSitemapOptions>(
  base: T | undefined,
  override: T | undefined,
) {
  if (!base) {
    return override
  }
  if (!override) {
    return base
  }
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

async function abortable<T>(
  signal: AbortSignal,
  run: () => T | PromiseLike<T>,
): Promise<T> {
  throwIfAborted(signal)
  let onAbort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () =>
      reject(signal.reason ?? new Error('prerenderParams aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        throwIfAborted(signal)
        return run()
      }),
    ])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
