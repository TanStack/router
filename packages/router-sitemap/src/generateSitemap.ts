import { XMLBuilder } from 'fast-xml-parser'
import type { RegisteredRouter, RoutePaths } from '@tanstack/router-core'

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

export type ChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

export interface SitemapEntryOptions {
  lastmod?: string | Date
  changefreq?: ChangeFreq
  priority?: number
}

export interface SitemapEntry {
  url: string
  lastmod?: string
  changefreq?: ChangeFreq
  priority?: number
}

export type StaticRouteValue =
  | SitemapEntryOptions
  | (() => SitemapEntryOptions | Promise<SitemapEntryOptions>)

export type DynamicRouteEntry = SitemapEntryOptions & { path: string }
export type DynamicRouteValue =
  | Array<DynamicRouteEntry>
  | (() => Array<DynamicRouteEntry> | Promise<Array<DynamicRouteEntry>>)

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
  defaultPriority?: number
  defaultChangeFreq?: ChangeFreq
  routes: {
    [TRoute in RoutePaths<TRouter['routeTree']>]?: RouteValue<TRoute>
  }
}

function createSitemapEntry(
  entry: SitemapEntryOptions & { path?: string },
  siteUrl: string,
  route?: string,
): SitemapEntry {
  return {
    url: entry.path ? `${siteUrl}${entry.path}` : `${siteUrl}${route}`,
    lastmod:
      entry.lastmod instanceof Date
        ? entry.lastmod.toISOString()
        : entry.lastmod,
    changefreq: entry.changefreq,
    priority: entry.priority,
  }
}

/**
 * Generate sitemap XML from configuration
 */
export async function generateSitemap<
  TRouter extends RegisteredRouter = RegisteredRouter,
>(config: SitemapConfig<TRouter>): Promise<string> {
  const finalEntries: Array<SitemapEntry> = []
  const { siteUrl, routes, defaultPriority, defaultChangeFreq } = config

  if (!siteUrl || typeof siteUrl !== 'string') {
    throw new Error('siteUrl is required and must be a string')
  }

  try {
    new URL(siteUrl)
  } catch {
    throw new Error(`Invalid siteUrl: ${siteUrl}.`)
  }

  for (const route in routes) {
    const routeValue = routes[route as keyof typeof routes]

    if (typeof routeValue === 'function') {
      const resolvedValue = await routeValue()
      if (Array.isArray(resolvedValue)) {
        finalEntries.push(
          ...resolvedValue.map((entry) => createSitemapEntry({
            ...entry,
            priority: entry.priority ?? defaultPriority,
            changefreq: entry.changefreq ?? defaultChangeFreq,
          }, siteUrl)),
        )
      } else {
        finalEntries.push(createSitemapEntry({
          ...resolvedValue,
          priority: resolvedValue.priority ?? defaultPriority,
          changefreq: resolvedValue.changefreq ?? defaultChangeFreq,
        }, siteUrl, route))
      }
    } else if (Array.isArray(routeValue)) {
      finalEntries.push(
        ...routeValue.map((entry) => createSitemapEntry({
          ...entry,
          priority: entry.priority ?? defaultPriority,
          changefreq: entry.changefreq ?? defaultChangeFreq,
        }, siteUrl)),
      )
    } else if (routeValue) {
      finalEntries.push(createSitemapEntry({
        ...routeValue,
        priority: routeValue.priority ?? defaultPriority,
        changefreq: routeValue.changefreq ?? defaultChangeFreq,
      }, siteUrl, route))
    }
  }

  const urls = finalEntries.map((entry) => {
    const xml: any = {
      loc: entry.url,
    }

    if (entry.lastmod) {
      xml.lastmod = entry.lastmod
    }
    if (entry.changefreq) {
      xml.changefreq = entry.changefreq
    }
    if (entry.priority !== undefined) {
      xml.priority = entry.priority
    }

    return xml
  })

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
