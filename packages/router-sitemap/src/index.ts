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

/** Image sitemap extension */
export interface ImageEntry {
  loc: string
}

/** News sitemap extension */
export interface NewsEntry {
  publication: {
    name: string
    language: string
  }
  publication_date: string
  title: string
}

/** Video sitemap extension */
export interface VideoEntry {
  thumbnail_loc: string
  title: string
  description: string
  /** Either content_loc or player_loc is required */
  content_loc?: string
  player_loc?: string
  duration?: number
  expiration_date?: string
  rating?: number
  view_count?: number
  publication_date?: string
  family_friendly?: 'yes' | 'no'
  restriction?: {
    country: string
    relationship: 'allow' | 'deny'
  }
  platform?: {
    relationship: 'allow' | 'deny'
    content: string
  }
  requires_subscription?: 'yes' | 'no'
  uploader?: {
    info?: string
    content: string
  }
  live?: 'yes' | 'no'
  tag?: Array<string>
}

/** Sitemap entry with optional extensions */
export interface SitemapEntry {
  lastmod?: string | Date
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  images?: Array<ImageEntry>
  news?: NewsEntry
  videos?: Array<VideoEntry>
}

export type StaticRouteValue =
  | SitemapEntry
  | (() => SitemapEntry | Promise<SitemapEntry>)

export type DynamicRouteEntry = SitemapEntry & { path: string }
export type DynamicRouteValue =
  | Array<DynamicRouteEntry>
  | (() => Array<DynamicRouteEntry> | Promise<Array<DynamicRouteEntry>>)

/**
 * Pick which shape to use based on whether `TRoute` is dynamic or static.
 */
type RouteValue<TRoute extends string> =
  RouteIsDynamic<TRoute> extends true ? DynamicRouteValue : StaticRouteValue

/** Sitemap configuration */
export interface SitemapConfig<TRouter extends RegisteredRouter = RegisteredRouter> {
  siteUrl: string
  routes: {
    [TRoute in RoutePaths<TRouter['routeTree']>]?: RouteValue<TRoute>
  }
}

type FinalSitemapEntry = {
  url: string
  lastmod?: string
  changefreq?: SitemapEntry['changefreq']
  priority?: number
  images?: Array<ImageEntry>
  news?: NewsEntry
  videos?: Array<VideoEntry>
}

/**
 * Generate sitemap XML from configuration
 */
export async function generateSitemap<
  TRouter extends RegisteredRouter = RegisteredRouter,
>(config: SitemapConfig<TRouter>): Promise<string> {
  const finalEntries: Array<FinalSitemapEntry> = []
  const { siteUrl, routes } = config

  // Validate siteUrl
  if (!siteUrl || typeof siteUrl !== 'string') {
    throw new Error('siteUrl is required and must be a string')
  }

  const createEntry = (path: string, entry: SitemapEntry): FinalSitemapEntry => {
    return {
      url: `${siteUrl}${path}`,
      lastmod:
        entry.lastmod instanceof Date
          ? entry.lastmod.toISOString()
          : entry.lastmod,
      changefreq: entry.changefreq,
      priority: entry.priority,
      images: entry.images,
      news: entry.news,
      videos: entry.videos,
    }
  }

  for (const route in routes) {
    const routeValue = routes[route as keyof typeof routes]

    if (typeof routeValue === 'function') {
      const resolvedValue = await routeValue()
      if (Array.isArray(resolvedValue)) {
        finalEntries.push(
          ...resolvedValue.map((entry) => createEntry(entry.path, entry)),
        )
      } else {
        finalEntries.push(createEntry(route, resolvedValue))
      }
    } else if (Array.isArray(routeValue)) {
      finalEntries.push(
        ...routeValue.map((entry) => createEntry(entry.path, entry)),
      )
    } else if (routeValue) {
      finalEntries.push(createEntry(route, routeValue))
    }
  }

  // Generate XML structure
  const hasImages = finalEntries.some(entry => entry.images?.length)
  const hasNews = finalEntries.some(entry => entry.news)
  const hasVideos = finalEntries.some(entry => entry.videos?.length)

  // Build namespace attributes
  const namespaces: Record<string, string> = {
    '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9'
  }
  
  if (hasImages) {
    namespaces['@_xmlns:image'] = 'http://www.google.com/schemas/sitemap-image/1.1'
  }
  if (hasNews) {
    namespaces['@_xmlns:news'] = 'http://www.google.com/schemas/sitemap-news/0.9'
  }
  if (hasVideos) {
    namespaces['@_xmlns:video'] = 'http://www.google.com/schemas/sitemap-video/1.1'
  }

  // Convert entries to XML structure
  const urls = finalEntries.map(entry => {
    const urlEntry: any = {
      loc: entry.url
    }

    // Add standard sitemap fields
    if (entry.lastmod) {
      urlEntry.lastmod = entry.lastmod
    }
    if (entry.changefreq) {
      urlEntry.changefreq = entry.changefreq
    }
    if (entry.priority !== undefined) {
      urlEntry.priority = entry.priority
    }

    // Add image extensions
    if (entry.images?.length) {
      urlEntry['image:image'] = entry.images.map(image => ({
        'image:loc': image.loc
      }))
    }

    // Add news extension
    if (entry.news) {
      // Validate required news fields
      if (!entry.news.publication.name) {
        throw new Error('News entries must have publication.name')
      }
      if (!entry.news.publication.language) {
        throw new Error('News entries must have publication.language')
      }
      if (!entry.news.publication_date) {
        throw new Error('News entries must have publication_date')
      }
      if (!entry.news.title) {
        throw new Error('News entries must have title')
      }

      urlEntry['news:news'] = {
        'news:publication': {
          'news:name': entry.news.publication.name,
          'news:language': entry.news.publication.language
        },
        'news:publication_date': entry.news.publication_date,
        'news:title': entry.news.title
      }
    }

    // Add video extensions
    if (entry.videos?.length) {
      urlEntry['video:video'] = entry.videos.map(video => {
        // Validate required video fields
        if (!video.thumbnail_loc) {
          throw new Error('Video entries must have thumbnail_loc')
        }
        if (!video.title) {
          throw new Error('Video entries must have title')
        }
        if (!video.description) {
          throw new Error('Video entries must have description')
        }
        if (!video.content_loc && !video.player_loc) {
          throw new Error('Video entries must have either content_loc or player_loc')
        }

        const videoEntry: any = {
          'video:thumbnail_loc': video.thumbnail_loc,
          'video:title': video.title,
          'video:description': video.description
        }

        // Add required content_loc or player_loc
        if (video.content_loc) {
          videoEntry['video:content_loc'] = video.content_loc
        }
        if (video.player_loc) {
          videoEntry['video:player_loc'] = video.player_loc
        }

        // Add optional video fields
        if (video.duration !== undefined) {
          videoEntry['video:duration'] = video.duration
        }
        if (video.expiration_date) {
          videoEntry['video:expiration_date'] = video.expiration_date
        }
        if (video.rating !== undefined) {
          videoEntry['video:rating'] = video.rating
        }
        if (video.view_count !== undefined) {
          videoEntry['video:view_count'] = video.view_count
        }
        if (video.publication_date) {
          videoEntry['video:publication_date'] = video.publication_date
        }
        if (video.family_friendly) {
          videoEntry['video:family_friendly'] = video.family_friendly
        }
        if (video.restriction) {
          videoEntry['video:restriction'] = {
            '@_relationship': video.restriction.relationship,
            '#text': video.restriction.country
          }
        }
        if (video.platform) {
          videoEntry['video:platform'] = {
            '@_relationship': video.platform.relationship,
            '#text': video.platform.content
          }
        }
        if (video.requires_subscription) {
          videoEntry['video:requires_subscription'] = video.requires_subscription
        }
        if (video.uploader) {
          videoEntry['video:uploader'] = {
            ...(video.uploader.info && { '@_info': video.uploader.info }),
            '#text': video.uploader.content
          }
        }
        if (video.live) {
          videoEntry['video:live'] = video.live
        }
        if (video.tag?.length) {
          videoEntry['video:tag'] = video.tag
        }

        return videoEntry
      })
    }

    return urlEntry
  })

  // Build final XML structure
  const xmlObject = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8'
    },
    urlset: {
      ...namespaces,
      url: urls
    }
  }

  // Generate XML
  const builder = new XMLBuilder({
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
    suppressEmptyNode: false
  })

  return builder.build(xmlObject)
}
