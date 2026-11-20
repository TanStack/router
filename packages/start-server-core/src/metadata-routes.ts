/**
 * Runtime helpers for serving `sitemap.xml`, sitemap indexes and `robots.txt`
 * from server routes.
 *
 * The build-time sitemap (`tanstackStart({ sitemap })`) only knows about the
 * pages that were prerendered. These helpers cover the other case: URLs that
 * come from a database, a CMS or anything else that is only known at request
 * time. The entry shape intentionally mirrors Next.js' `MetadataRoute.Sitemap`
 * and `MetadataRoute.Robots` so existing generators can be moved over as-is.
 */

export type SitemapChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

export interface SitemapVideo {
  title: string
  thumbnail_loc: string
  description: string
  content_loc?: string
  player_loc?: string
  duration?: number
  expiration_date?: string | Date
  rating?: number
  view_count?: number
  publication_date?: string | Date
  family_friendly?: 'yes' | 'no'
  requires_subscription?: 'yes' | 'no'
  live?: 'yes' | 'no'
  tag?: string
}

export interface SitemapEntry {
  /** Absolute URL, or a path that is resolved against `baseUrl`. */
  url: string
  lastModified?: string | Date
  changeFrequency?: SitemapChangeFrequency
  /** Between 0.0 and 1.0. */
  priority?: number
  alternates?: {
    /** Map of `hreflang` to URL, e.g. `{ en: '/en/about', 'x-default': '/about' }`. */
    languages?: Record<string, string | undefined>
  }
  /** Image URLs (absolute or paths). */
  images?: Array<string>
  videos?: Array<SitemapVideo>
}

export type Sitemap = Array<SitemapEntry>

export interface SitemapIndexEntry {
  /** URL of a child sitemap. Absolute, or a path resolved against `baseUrl`. */
  url: string
  lastModified?: string | Date
}

export type SitemapIndex = Array<SitemapIndexEntry>

export interface RobotsRule {
  userAgent?: string | Array<string>
  allow?: string | Array<string>
  disallow?: string | Array<string>
  crawlDelay?: number
}

export interface Robots {
  rules: RobotsRule | Array<RobotsRule>
  sitemap?: string | Array<string>
  host?: string
}

export interface RenderMetadataOptions {
  /**
   * Origin used to resolve relative URLs (`/blog/hello`), e.g.
   * `https://example.com`. Absolute URLs are left untouched.
   */
  baseUrl?: string
}

/** The protocol limit for URLs in a single sitemap file. */
export const SITEMAP_MAX_URLS = 50_000

const XMLNS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const XMLNS_XHTML = 'http://www.w3.org/1999/xhtml'
const XMLNS_IMAGE = 'http://www.google.com/schemas/sitemap-image/1.1'
const XMLNS_VIDEO = 'http://www.google.com/schemas/sitemap-video/1.1'

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]!)
}

function formatDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toArray<T>(value: T | Array<T> | undefined): Array<T> {
  if (value === undefined) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

function resolveUrl(url: string, baseUrl: string | undefined): string {
  if (!baseUrl || /^[a-z][a-z\d+\-.]*:/i.test(url)) {
    return url
  }
  return new URL(url, baseUrl).href
}

function warnIfRelative(url: string, kind: string) {
  if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(url)) {
    console.warn(
      `[TanStack Start] ${kind} URL "${url}" is not absolute. Search engines require absolute URLs; pass \`baseUrl\` or use an absolute URL.`,
    )
  }
}

function tag(name: string, value: string | number): string {
  return `<${name}>${escapeXml(String(value))}</${name}>`
}

/**
 * Serialize sitemap entries to a `<urlset>` XML document.
 */
export function renderSitemap(
  entries: Sitemap,
  options: RenderMetadataOptions = {},
): string {
  const { baseUrl } = options
  const usesAlternates = entries.some(
    (entry) => Object.keys(entry.alternates?.languages ?? {}).length > 0,
  )
  const usesImages = entries.some((entry) => entry.images?.length)
  const usesVideos = entries.some((entry) => entry.videos?.length)

  if (process.env.NODE_ENV !== 'production') {
    if (entries.length > SITEMAP_MAX_URLS) {
      console.warn(
        `[TanStack Start] Sitemap has ${entries.length} URLs, more than the ${SITEMAP_MAX_URLS} allowed per file. Split it into several sitemaps and serve them from a sitemap index (\`renderSitemapIndex\`).`,
      )
    }
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${XMLNS}"`
  if (usesAlternates) {
    xml += ` xmlns:xhtml="${XMLNS_XHTML}"`
  }
  if (usesImages) {
    xml += ` xmlns:image="${XMLNS_IMAGE}"`
  }
  if (usesVideos) {
    xml += ` xmlns:video="${XMLNS_VIDEO}"`
  }
  xml += '>\n'

  for (const entry of entries) {
    const loc = resolveUrl(entry.url, baseUrl)
    if (process.env.NODE_ENV !== 'production') {
      warnIfRelative(loc, 'Sitemap')
    }

    // The sitemap schema requires the core elements first, in this order,
    // followed by any extension elements.
    xml += '<url>\n'
    xml += `${tag('loc', loc)}\n`
    if (entry.lastModified !== undefined) {
      xml += `${tag('lastmod', formatDate(entry.lastModified))}\n`
    }
    if (entry.changeFrequency) {
      xml += `${tag('changefreq', entry.changeFrequency)}\n`
    }
    if (entry.priority !== undefined) {
      xml += `${tag('priority', entry.priority)}\n`
    }

    for (const [hreflang, href] of Object.entries(
      entry.alternates?.languages ?? {},
    )) {
      if (href === undefined) {
        continue
      }
      xml += `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(resolveUrl(href, baseUrl))}" />\n`
    }

    for (const image of entry.images ?? []) {
      xml += `<image:image>\n${tag('image:loc', resolveUrl(image, baseUrl))}\n</image:image>\n`
    }

    for (const video of entry.videos ?? []) {
      // Element order follows Google's video sitemap schema.
      xml += '<video:video>\n'
      xml += `${tag('video:thumbnail_loc', resolveUrl(video.thumbnail_loc, baseUrl))}\n`
      xml += `${tag('video:title', video.title)}\n`
      xml += `${tag('video:description', video.description)}\n`
      if (video.content_loc) {
        xml += `${tag('video:content_loc', resolveUrl(video.content_loc, baseUrl))}\n`
      }
      if (video.player_loc) {
        xml += `${tag('video:player_loc', resolveUrl(video.player_loc, baseUrl))}\n`
      }
      if (video.duration !== undefined) {
        xml += `${tag('video:duration', video.duration)}\n`
      }
      if (video.expiration_date !== undefined) {
        xml += `${tag('video:expiration_date', formatDate(video.expiration_date))}\n`
      }
      if (video.rating !== undefined) {
        xml += `${tag('video:rating', video.rating)}\n`
      }
      if (video.view_count !== undefined) {
        xml += `${tag('video:view_count', video.view_count)}\n`
      }
      if (video.publication_date !== undefined) {
        xml += `${tag('video:publication_date', formatDate(video.publication_date))}\n`
      }
      if (video.family_friendly) {
        xml += `${tag('video:family_friendly', video.family_friendly)}\n`
      }
      if (video.requires_subscription) {
        xml += `${tag('video:requires_subscription', video.requires_subscription)}\n`
      }
      if (video.live) {
        xml += `${tag('video:live', video.live)}\n`
      }
      if (video.tag) {
        xml += `${tag('video:tag', video.tag)}\n`
      }
      xml += '</video:video>\n'
    }
    xml += '</url>\n'
  }

  xml += '</urlset>\n'
  return xml
}

/**
 * Serialize child sitemap references to a `<sitemapindex>` XML document.
 */
export function renderSitemapIndex(
  entries: SitemapIndex,
  options: RenderMetadataOptions = {},
): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${XMLNS}">\n`
  for (const entry of entries) {
    const loc = resolveUrl(entry.url, options.baseUrl)
    if (process.env.NODE_ENV !== 'production') {
      warnIfRelative(loc, 'Sitemap index')
    }
    xml += '<sitemap>\n'
    xml += `${tag('loc', loc)}\n`
    if (entry.lastModified !== undefined) {
      xml += `${tag('lastmod', formatDate(entry.lastModified))}\n`
    }
    xml += '</sitemap>\n'
  }
  xml += '</sitemapindex>\n'
  return xml
}

/**
 * Serialize robots rules to a `robots.txt` document.
 */
export function renderRobots(
  robots: Robots,
  options: RenderMetadataOptions = {},
): string {
  let content = ''

  for (const rule of toArray(robots.rules)) {
    const userAgents = toArray(rule.userAgent)
    for (const userAgent of userAgents.length ? userAgents : ['*']) {
      content += `User-Agent: ${userAgent}\n`
    }
    for (const allow of toArray(rule.allow)) {
      content += `Allow: ${allow}\n`
    }
    for (const disallow of toArray(rule.disallow)) {
      content += `Disallow: ${disallow}\n`
    }
    if (rule.crawlDelay !== undefined) {
      content += `Crawl-delay: ${rule.crawlDelay}\n`
    }
    content += '\n'
  }

  if (robots.host) {
    content += `Host: ${robots.host}\n`
  }
  for (const sitemap of toArray(robots.sitemap)) {
    content += `Sitemap: ${resolveUrl(sitemap, options.baseUrl)}\n`
  }

  return content
}

export interface MetadataHandlerOptions extends RenderMetadataOptions {
  /**
   * Extra response headers, e.g.
   * `{ 'Cache-Control': 'public, max-age=3600, s-maxage=86400' }`.
   */
  headers?: HeadersInit
}

type MetadataHandlerCtx = { request: Request }

function createMetadataResponse(
  body: string,
  contentType: string,
  headers: HeadersInit | undefined,
): Response {
  const responseHeaders = new Headers(headers)
  if (!responseHeaders.has('Content-Type')) {
    responseHeaders.set('Content-Type', contentType)
  }
  return new Response(body, { headers: responseHeaders })
}

function resolveBaseUrl(
  options: MetadataHandlerOptions,
  ctx: MetadataHandlerCtx,
): string {
  return options.baseUrl ?? new URL(ctx.request.url).origin
}

/**
 * Create a server route handler that responds with a sitemap.
 *
 * Relative URLs are resolved against `options.baseUrl`, falling back to the
 * origin of the incoming request.
 *
 * @example
 * ```ts
 * // src/routes/sitemap[.]xml.ts
 * export const Route = createFileRoute('/sitemap.xml')({
 *   server: {
 *     handlers: {
 *       GET: createSitemapHandler(async () => {
 *         const posts = await getPosts()
 *         return [
 *           { url: '/', changeFrequency: 'daily', priority: 1 },
 *           ...posts.map((post) => ({
 *             url: `/posts/${post.slug}`,
 *             lastModified: post.updatedAt,
 *           })),
 *         ]
 *       }),
 *     },
 *   },
 * })
 * ```
 */
export function createSitemapHandler<TCtx extends MetadataHandlerCtx>(
  generate: (ctx: TCtx) => Sitemap | Promise<Sitemap>,
  options: MetadataHandlerOptions = {},
): (ctx: TCtx) => Promise<Response> {
  return async (ctx) => {
    const entries = await generate(ctx)
    return createMetadataResponse(
      renderSitemap(entries, { baseUrl: resolveBaseUrl(options, ctx) }),
      'application/xml; charset=utf-8',
      options.headers,
    )
  }
}

/**
 * Create a server route handler that responds with a sitemap index, for sites
 * that need more than {@link SITEMAP_MAX_URLS} URLs or want to split their
 * sitemap by content type.
 */
export function createSitemapIndexHandler<TCtx extends MetadataHandlerCtx>(
  generate: (ctx: TCtx) => SitemapIndex | Promise<SitemapIndex>,
  options: MetadataHandlerOptions = {},
): (ctx: TCtx) => Promise<Response> {
  return async (ctx) => {
    const entries = await generate(ctx)
    return createMetadataResponse(
      renderSitemapIndex(entries, { baseUrl: resolveBaseUrl(options, ctx) }),
      'application/xml; charset=utf-8',
      options.headers,
    )
  }
}

/**
 * Create a server route handler that responds with `robots.txt`.
 */
export function createRobotsHandler<TCtx extends MetadataHandlerCtx>(
  generate: (ctx: TCtx) => Robots | Promise<Robots>,
  options: MetadataHandlerOptions = {},
): (ctx: TCtx) => Promise<Response> {
  return async (ctx) => {
    const robots = await generate(ctx)
    return createMetadataResponse(
      renderRobots(robots, { baseUrl: resolveBaseUrl(options, ctx) }),
      'text/plain; charset=utf-8',
      options.headers,
    )
  }
}
