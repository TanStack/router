import type { MetaDescriptor, MetaImage, RobotsConfig } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Core Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a title meta descriptor
 *
 * @example
 * ```ts
 * meta.title('My Page')
 * meta.title('My Page', '%s | My Site') // With template
 * ```
 */
export function title(
  value: string,
  template?: string,
): Array<MetaDescriptor> {
  const formatted = template ? template.replace('%s', value) : value
  return [{ title: formatted }]
}

/**
 * Creates a description meta descriptor
 *
 * @example
 * ```ts
 * meta.description('Page description here')
 * ```
 */
export function description(content: string): Array<MetaDescriptor> {
  return [{ name: 'description', content }]
}

/**
 * Creates a charset meta descriptor (UTF-8)
 */
export function charset(): Array<MetaDescriptor> {
  return [{ charSet: 'utf-8' }]
}

/**
 * Creates a viewport meta descriptor
 *
 * @example
 * ```ts
 * meta.viewport() // Default: width=device-width, initial-scale=1
 * meta.viewport('width=device-width, initial-scale=1, maximum-scale=5')
 * ```
 */
export function viewport(
  content: string = 'width=device-width, initial-scale=1',
): Array<MetaDescriptor> {
  return [{ name: 'viewport', content }]
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates robot directive meta descriptor
 *
 * @example
 * ```ts
 * meta.robots({ index: true, follow: true })
 * meta.robots({ index: false }) // noindex
 * meta.robots({ maxSnippet: 160, maxImagePreview: 'large' })
 * ```
 */
export function robots(config: RobotsConfig): Array<MetaDescriptor> {
  const directives: Array<string> = []

  if (config.index === false) directives.push('noindex')
  else if (config.index === true) directives.push('index')

  if (config.follow === false) directives.push('nofollow')
  else if (config.follow === true) directives.push('follow')

  if (config.noarchive) directives.push('noarchive')
  if (config.nosnippet) directives.push('nosnippet')
  if (config.maxSnippet !== undefined)
    directives.push(`max-snippet:${config.maxSnippet}`)
  if (config.maxImagePreview)
    directives.push(`max-image-preview:${config.maxImagePreview}`)

  if (directives.length === 0) return []

  return [{ name: 'robots', content: directives.join(', ') }]
}

/**
 * Creates a canonical link descriptor
 *
 * @example
 * ```ts
 * meta.canonical('https://example.com/page')
 * ```
 */
export function canonical(href: string): Array<MetaDescriptor> {
  return [{ tagName: 'link', rel: 'canonical', href }]
}

/**
 * Creates alternate language link descriptors
 *
 * @example
 * ```ts
 * meta.alternate([
 *   { lang: 'en', href: 'https://example.com/en/page' },
 *   { lang: 'es', href: 'https://example.com/es/page' },
 *   { lang: 'x-default', href: 'https://example.com/page' },
 * ])
 * ```
 */
export function alternate(
  links: Array<{ lang: string; href: string }>,
): Array<MetaDescriptor> {
  return links.map((link) => ({
    tagName: 'link',
    rel: 'alternate',
    hreflang: link.lang,
    href: link.href,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Open Graph Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates Open Graph meta descriptors
 *
 * @example
 * ```ts
 * meta.openGraph({
 *   title: 'My Page',
 *   description: 'Page description',
 *   type: 'website',
 *   url: 'https://example.com/page',
 *   image: 'https://example.com/og.jpg',
 * })
 * ```
 */
export function openGraph(config: {
  title?: string
  description?: string
  type?: string
  url?: string
  siteName?: string
  locale?: string
  image?: string | MetaImage
  images?: Array<string | MetaImage>
}): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (config.title) meta.push({ property: 'og:title', content: config.title })
  if (config.description)
    meta.push({ property: 'og:description', content: config.description })
  if (config.type) meta.push({ property: 'og:type', content: config.type })
  if (config.url) meta.push({ property: 'og:url', content: config.url })
  if (config.siteName)
    meta.push({ property: 'og:site_name', content: config.siteName })
  if (config.locale)
    meta.push({ property: 'og:locale', content: config.locale })

  const images = config.images ?? (config.image ? [config.image] : [])
  for (const img of images) {
    if (typeof img === 'string') {
      meta.push({ property: 'og:image', content: img })
    } else {
      meta.push({ property: 'og:image', content: img.url })
      if (img.width)
        meta.push({ property: 'og:image:width', content: String(img.width) })
      if (img.height)
        meta.push({ property: 'og:image:height', content: String(img.height) })
      if (img.alt) meta.push({ property: 'og:image:alt', content: img.alt })
    }
  }

  return meta
}

// ─────────────────────────────────────────────────────────────────────────────
// Twitter Card Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates Twitter Card meta descriptors
 *
 * @example
 * ```ts
 * meta.twitter({
 *   card: 'summary_large_image',
 *   title: 'My Page',
 *   description: 'Page description',
 *   image: 'https://example.com/twitter.jpg',
 *   site: '@mysite',
 * })
 * ```
 */
export function twitter(config: {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player'
  title?: string
  description?: string
  image?: string
  imageAlt?: string
  site?: string
  creator?: string
}): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (config.card) meta.push({ name: 'twitter:card', content: config.card })
  if (config.title) meta.push({ name: 'twitter:title', content: config.title })
  if (config.description)
    meta.push({ name: 'twitter:description', content: config.description })
  if (config.image) meta.push({ name: 'twitter:image', content: config.image })
  if (config.imageAlt)
    meta.push({ name: 'twitter:image:alt', content: config.imageAlt })
  if (config.site) meta.push({ name: 'twitter:site', content: config.site })
  if (config.creator)
    meta.push({ name: 'twitter:creator', content: config.creator })

  return meta
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates theme-color meta descriptor(s)
 *
 * @example
 * ```ts
 * meta.themeColor('#ffffff')
 * meta.themeColor({ light: '#ffffff', dark: '#000000' })
 * ```
 */
export function themeColor(
  color: string | { light: string; dark: string },
): Array<MetaDescriptor> {
  if (typeof color === 'string') {
    return [{ name: 'theme-color', content: color }]
  }
  return [
    {
      name: 'theme-color',
      content: color.light,
      media: '(prefers-color-scheme: light)',
    } as MetaDescriptor,
    {
      name: 'theme-color',
      content: color.dark,
      media: '(prefers-color-scheme: dark)',
    } as MetaDescriptor,
  ]
}

/**
 * Creates verification meta descriptors for search engines
 *
 * @example
 * ```ts
 * meta.verification({ google: 'code', bing: 'code' })
 * ```
 */
export function verification(config: {
  google?: string
  bing?: string
  yandex?: string
  pinterest?: string
}): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (config.google)
    meta.push({ name: 'google-site-verification', content: config.google })
  if (config.bing) meta.push({ name: 'msvalidate.01', content: config.bing })
  if (config.yandex)
    meta.push({ name: 'yandex-verification', content: config.yandex })
  if (config.pinterest)
    meta.push({ name: 'p:domain_verify', content: config.pinterest })

  return meta
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Namespace Object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Namespace object containing all meta builders.
 * Provides a convenient way to access builders with autocomplete.
 *
 * @example
 * ```ts
 * import { meta } from '@tanstack/meta'
 *
 * head: () => ({
 *   meta: [
 *     ...meta.title('My Page'),
 *     ...meta.description('Description'),
 *     ...meta.openGraph({ title: 'My Page', type: 'website' }),
 *   ],
 * })
 * ```
 */
export const meta = {
  title,
  description,
  charset,
  viewport,
  robots,
  canonical,
  alternate,
  openGraph,
  twitter,
  themeColor,
  verification,
} as const
