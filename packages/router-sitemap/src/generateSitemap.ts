import { XMLBuilder } from 'fast-xml-parser'
import type { RegisteredRouter, RoutePaths } from '@tanstack/router-core'

export type ChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

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

/**
 * Generate sitemap XML from configuration
 */
export async function generateSitemap<
  TRouter extends RegisteredRouter = RegisteredRouter,
>(config: SitemapConfig<TRouter>): Promise<string> {
  const urls: Array<SitemapEntry> = []
  const { siteUrl, routes, priority, changefreq } = config

  if (!siteUrl || typeof siteUrl !== 'string') {
    throw new Error('siteUrl is required and must be a string')
  }

  try {
    new URL(siteUrl)
  } catch {
    throw new Error(`Invalid siteUrl: ${siteUrl}.`)
  }

  const createEntry = (
    route: string,
    entry: DynamicEntryOptions | StaticEntryOptions,
  ): SitemapEntry => ({
    ...entry,
    loc: 'path' in entry ? `${siteUrl}${entry.path}` : `${siteUrl}${route}`,
    lastmod:
      entry.lastmod instanceof Date
        ? entry.lastmod.toISOString()
        : entry.lastmod,
    priority: entry.priority ?? priority,
    changefreq: entry.changefreq ?? changefreq,
  })

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
  })

  return builder.build(xmlObject)
}
