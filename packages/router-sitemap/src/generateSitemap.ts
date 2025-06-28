import { XMLBuilder } from 'fast-xml-parser'
import type { RegisteredRouter, RoutePaths } from '@tanstack/router-core'

export type ChangeFreq = (typeof CHANGEFREQ)[number]

export interface StaticEntryOptions {
  lastmod?: string | Date
  changefreq?: ChangeFreq
  priority?: number
}

export interface DynamicEntryOptions extends StaticEntryOptions {
  path?: string
}

export interface SitemapEntry extends StaticEntryOptions {
  loc: string
}

// Utility types for route param detection
type SplitPath<TSegment extends string> =
  TSegment extends `${infer Segment}/${infer Rest}`
    ? Segment | SplitPath<Rest>
    : TSegment

type ExtractParams<TSegment extends string> = {
  [K in SplitPath<TSegment> as K extends `$${infer Param}`
    ? Param
    : never]: string
}

type RouteIsDynamic<TRoute extends string> =
  keyof ExtractParams<TRoute> extends never ? false : true

export type StaticRouteValue =
  | StaticEntryOptions
  | (() => StaticEntryOptions | Promise<StaticEntryOptions>)

export type DynamicRouteValue =
  | Array<DynamicEntryOptions>
  | (() => Array<DynamicEntryOptions> | Promise<Array<DynamicEntryOptions>>)

/**
 * Pick which shape to use based on whether `TRoute` is dynamic or static.
 */
type RouteValue<TRoute extends string> =
  RouteIsDynamic<TRoute> extends true ? DynamicRouteValue : StaticRouteValue

/** Sitemap configuration */
export interface SitemapConfig<
  TRouter extends RegisteredRouter = RegisteredRouter,
> {
  siteUrl: string
  priority?: number
  changefreq?: ChangeFreq
  routes: Array<
    | RoutePaths<TRouter['routeTree']>
    | [
        RoutePaths<TRouter['routeTree']>,
        RouteValue<RoutePaths<TRouter['routeTree']>>,
      ]
  >
}

const CHANGEFREQ = [
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
] as const

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function isValidPriority(priority: unknown): priority is number {
  return (
    typeof priority === 'number' &&
    !Number.isNaN(priority) &&
    priority >= 0 &&
    priority <= 1
  )
}

function isValidChangeFreq(changefreq: unknown): changefreq is ChangeFreq {
  return (
    typeof changefreq === 'string' &&
    CHANGEFREQ.includes(changefreq as ChangeFreq)
  )
}

function isValidLastMod(lastmod: unknown): lastmod is string | Date {
  if (lastmod instanceof Date) {
    return !isNaN(lastmod.getTime())
  }

  if (typeof lastmod === 'string') {
    const date = new Date(lastmod)
    return !isNaN(date.getTime())
  }

  return false
}

function validateEntry(
  route: string,
  entry: StaticEntryOptions | DynamicEntryOptions,
): asserts entry is StaticEntryOptions | DynamicEntryOptions {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid entry for route "${route}": must be an object.`)
  }

  if (isDefined(entry.lastmod) && !isValidLastMod(entry.lastmod)) {
    throw new Error(`Invalid entry ${route}: lastmod must be a string or Date`)
  }

  if (isDefined(entry.priority) && !isValidPriority(entry.priority)) {
    throw new Error(
      `Invalid entry ${route}: priority must be a number between 0 and 1`,
    )
  }

  if (isDefined(entry.changefreq) && !isValidChangeFreq(entry.changefreq)) {
    throw new Error(
      `Invalid entry ${route}: changefreq must be one of ${CHANGEFREQ.join(', ')}`,
    )
  }
}

/**
 * Generate sitemap XML from configuration
 */
export async function generateSitemap<
  TRouter extends RegisteredRouter = RegisteredRouter,
>(config: SitemapConfig<TRouter>): Promise<string> {
  const urls: Array<SitemapEntry> = []
  const { routes, priority, changefreq } = config

  let siteUrl: string
  try {
    siteUrl = new URL(config.siteUrl).toString()
  } catch {
    throw new Error(`Invalid siteUrl: ${config.siteUrl}.`)
  }

  if (isDefined(priority) && !isValidPriority(priority)) {
    throw new Error(`Invalid priority: ${priority}. Must be between 0 and 1.`)
  }

  if (isDefined(changefreq) && !isValidChangeFreq(changefreq)) {
    throw new Error(
      `Invalid changefreq: ${changefreq}. Must be one of ${CHANGEFREQ.join(', ')}.`,
    )
  }

  const createEntry = (
    route: string,
    entry: DynamicEntryOptions | StaticEntryOptions,
  ): SitemapEntry => {
    validateEntry(route, entry)

    return {
      ...entry,
      loc: 'path' in entry ? `${siteUrl}${entry.path}` : `${siteUrl}${route}`,
      lastmod:
        entry.lastmod instanceof Date
          ? entry.lastmod.toISOString()
          : entry.lastmod,
      priority: entry.priority ?? priority,
      changefreq: entry.changefreq ?? changefreq,
    }
  }

  for (const routeItem of routes) {
    if (Array.isArray(routeItem)) {
      // Tuple with route and configuration
      const [route, routeValue] = routeItem

      if (typeof routeValue === 'function') {
        const resolvedValue = await routeValue()
        if (Array.isArray(resolvedValue)) {
          urls.push(...resolvedValue.map((entry) => createEntry(route, entry)))
        } else {
          urls.push(createEntry(route, resolvedValue))
        }
      } else if (Array.isArray(routeValue)) {
        urls.push(...routeValue.map((entry) => createEntry(route, entry)))
      } else {
        urls.push(createEntry(route, routeValue))
      }
    } else {
      // Simple route string without configuration
      urls.push(createEntry(routeItem, {}))
    }
  }

  const xmlObject = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8',
    },
    urlset: {
      '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
      url: urls,
    },
  }

  const builder = new XMLBuilder({
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
    suppressEmptyNode: false,
    processEntities: true,
  })

  return builder.build(xmlObject)
}
