import type {
  MetaDescriptor,
  MetaImage,
  OpenGraphConfig,
  RobotsConfig,
  TwitterConfig,
} from './types'

/**
 * Configuration for createMeta - the main entry point for generating meta tags.
 *
 * @example
 * ```ts
 * // Basic usage - covers 90% of use cases
 * createMeta({
 *   title: 'My Page',
 *   description: 'A great page about something',
 * })
 *
 * // Full configuration
 * createMeta({
 *   title: 'Product Name',
 *   description: 'Product description',
 *   url: 'https://example.com/product',
 *   image: 'https://example.com/og.jpg',
 *   siteName: 'My Store',
 *   type: 'product',
 * })
 * ```
 */
export interface CreateMetaConfig {
  // ─────────────────────────────────────────────────────────────────────────
  // Required - The bare minimum for any page
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Page title - used for <title>, og:title, and twitter:title
   */
  title: string

  /**
   * Page description - used for description, og:description, and twitter:description
   */
  description: string

  // ─────────────────────────────────────────────────────────────────────────
  // Recommended - Significantly improves SEO and social sharing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Canonical URL of the page - used for canonical link and og:url
   */
  url?: string

  /**
   * Primary image for social sharing - used for og:image and twitter:image
   * Can be a URL string or an object with dimensions
   *
   * @example
   * ```ts
   * // Simple URL
   * image: 'https://example.com/og.jpg'
   *
   * // With dimensions (recommended for better rendering)
   * image: {
   *   url: 'https://example.com/og.jpg',
   *   width: 1200,
   *   height: 630,
   *   alt: 'Description of image'
   * }
   * ```
   */
  image?: string | MetaImage

  // ─────────────────────────────────────────────────────────────────────────
  // Optional - Fine-tune behavior
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Template for the title, use %s as placeholder
   * @example '%s | My Site' results in 'Page Title | My Site'
   */
  titleTemplate?: string

  /**
   * Name of the website/application
   */
  siteName?: string

  /**
   * Content type for Open Graph
   * @default 'website'
   */
  type?: 'website' | 'article' | 'product' | 'profile' | string

  /**
   * Locale for Open Graph (e.g., 'en_US')
   */
  locale?: string

  /**
   * Twitter @username for the website
   */
  twitterSite?: string

  /**
   * Twitter @username of the content creator
   */
  twitterCreator?: string

  /**
   * Theme color for browser chrome
   * Can be a single color or light/dark mode colors
   *
   * @example
   * ```ts
   * themeColor: '#ffffff'
   * // or
   * themeColor: { light: '#ffffff', dark: '#000000' }
   * ```
   */
  themeColor?: string | { light: string; dark: string }

  // ─────────────────────────────────────────────────────────────────────────
  // Overrides - Full control when you need it
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Override robot directives
   * @default { index: true, follow: true }
   */
  robots?: RobotsConfig

  /**
   * Override Open Graph properties
   * Values here will override the inferred ones
   */
  openGraph?: OpenGraphConfig

  /**
   * Override Twitter Card properties
   * Values here will override the inferred ones
   */
  twitter?: TwitterConfig

  // ─────────────────────────────────────────────────────────────────────────
  // Control what's included
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Include charset meta tag
   * @default true
   */
  charset?: boolean

  /**
   * Include viewport meta tag
   * @default true
   */
  viewport?: boolean | string

  /**
   * Include canonical link
   * @default true when url is provided
   */
  canonical?: boolean

  /**
   * Additional meta descriptors to append
   * These are added after the generated ones
   */
  extend?: Array<MetaDescriptor>
}

/**
 * Creates a complete set of meta tags for a page.
 *
 * This is the primary API for @tanstack/meta - it handles the 90% use case
 * of generating proper meta tags for SEO and social sharing.
 *
 * @example
 * ```ts
 * import { createMeta } from '@tanstack/meta'
 *
 * // In a TanStack Router route
 * export const Route = createFileRoute('/about')({
 *   head: () => ({
 *     meta: createMeta({
 *       title: 'About Us',
 *       description: 'Learn about our company',
 *       url: 'https://example.com/about',
 *       image: 'https://example.com/about-og.jpg',
 *     }),
 *   }),
 * })
 * ```
 *
 * @example
 * ```ts
 * // Extending with custom meta or JSON-LD
 * import { createMeta } from '@tanstack/meta'
 * import { jsonLd } from '@tanstack/meta/json-ld'
 *
 * head: () => ({
 *   meta: [
 *     ...createMeta({
 *       title: 'Product Name',
 *       description: 'Product description',
 *     }),
 *     ...jsonLd.product({
 *       name: 'Product Name',
 *       price: 99.99,
 *       currency: 'USD',
 *     }),
 *   ],
 * })
 * ```
 *
 * @returns Array of MetaDescriptor objects
 */
export function createMeta(config: CreateMetaConfig): Array<MetaDescriptor> {
  const {
    title,
    description,
    url,
    image,
    titleTemplate,
    siteName,
    type = 'website',
    locale,
    twitterSite,
    twitterCreator,
    themeColor,
    robots,
    openGraph,
    twitter,
    charset = true,
    viewport = true,
    canonical = true,
    extend,
  } = config

  const meta: Array<MetaDescriptor> = []

  // ─────────────────────────────────────────────────────────────────────────
  // Essential meta tags
  // ─────────────────────────────────────────────────────────────────────────

  // Charset
  if (charset) {
    meta.push({ charSet: 'utf-8' })
  }

  // Viewport
  if (viewport) {
    const viewportContent =
      typeof viewport === 'string'
        ? viewport
        : 'width=device-width, initial-scale=1'
    meta.push({ name: 'viewport', content: viewportContent })
  }

  // Title
  const formattedTitle = titleTemplate
    ? titleTemplate.replace('%s', title)
    : title
  meta.push({ title: formattedTitle })

  // Description
  meta.push({ name: 'description', content: description })

  // ─────────────────────────────────────────────────────────────────────────
  // Robots
  // ─────────────────────────────────────────────────────────────────────────

  if (robots) {
    const directives: Array<string> = []

    if (robots.index === false) directives.push('noindex')
    else if (robots.index === true) directives.push('index')

    if (robots.follow === false) directives.push('nofollow')
    else if (robots.follow === true) directives.push('follow')

    if (robots.noarchive) directives.push('noarchive')
    if (robots.nosnippet) directives.push('nosnippet')
    if (robots.maxSnippet !== undefined)
      directives.push(`max-snippet:${robots.maxSnippet}`)
    if (robots.maxImagePreview)
      directives.push(`max-image-preview:${robots.maxImagePreview}`)

    if (directives.length > 0) {
      meta.push({ name: 'robots', content: directives.join(', ') })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Canonical URL
  // ─────────────────────────────────────────────────────────────────────────

  if (url && canonical) {
    meta.push({ tagName: 'link', rel: 'canonical', href: url })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Open Graph
  // ─────────────────────────────────────────────────────────────────────────

  const ogTitle = openGraph?.title ?? title
  const ogDescription = openGraph?.description ?? description
  const ogType = openGraph?.type ?? type
  const ogUrl = openGraph?.url ?? url
  const ogSiteName = openGraph?.siteName ?? siteName
  const ogLocale = openGraph?.locale ?? locale
  const ogImages = openGraph?.images ?? (image ? [image] : [])

  meta.push({ property: 'og:title', content: ogTitle })
  meta.push({ property: 'og:description', content: ogDescription })
  meta.push({ property: 'og:type', content: ogType })

  if (ogUrl) meta.push({ property: 'og:url', content: ogUrl })
  if (ogSiteName) meta.push({ property: 'og:site_name', content: ogSiteName })
  if (ogLocale) meta.push({ property: 'og:locale', content: ogLocale })

  for (const img of ogImages) {
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

  // Article-specific properties
  if (openGraph?.article) {
    const article = openGraph.article
    if (article.publishedTime) {
      meta.push({
        property: 'article:published_time',
        content: article.publishedTime,
      })
    }
    if (article.modifiedTime) {
      meta.push({
        property: 'article:modified_time',
        content: article.modifiedTime,
      })
    }
    if (article.section) {
      meta.push({ property: 'article:section', content: article.section })
    }
    if (article.authors) {
      for (const author of article.authors) {
        meta.push({ property: 'article:author', content: author })
      }
    }
    if (article.tags) {
      for (const tag of article.tags) {
        meta.push({ property: 'article:tag', content: tag })
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Twitter Card
  // ─────────────────────────────────────────────────────────────────────────

  const hasImage = ogImages.length > 0
  const twitterCard = twitter?.card ?? (hasImage ? 'summary_large_image' : 'summary')
  const twitterTitle = twitter?.title ?? title
  const twitterDescription = twitter?.description ?? description
  const twitterImage = twitter?.image ?? (typeof image === 'string' ? image : image?.url)
  const twitterImageAlt = twitter?.imageAlt ?? (typeof image === 'object' ? image?.alt : undefined)
  const twitterSiteHandle = twitter?.site ?? twitterSite
  const twitterCreatorHandle = twitter?.creator ?? twitterCreator

  meta.push({ name: 'twitter:card', content: twitterCard })
  meta.push({ name: 'twitter:title', content: twitterTitle })
  meta.push({ name: 'twitter:description', content: twitterDescription })

  if (twitterImage) meta.push({ name: 'twitter:image', content: twitterImage })
  if (twitterImageAlt)
    meta.push({ name: 'twitter:image:alt', content: twitterImageAlt })
  if (twitterSiteHandle)
    meta.push({ name: 'twitter:site', content: twitterSiteHandle })
  if (twitterCreatorHandle)
    meta.push({ name: 'twitter:creator', content: twitterCreatorHandle })

  // ─────────────────────────────────────────────────────────────────────────
  // Theme Color
  // ─────────────────────────────────────────────────────────────────────────

  if (themeColor) {
    if (typeof themeColor === 'string') {
      meta.push({ name: 'theme-color', content: themeColor })
    } else {
      meta.push({
        name: 'theme-color',
        content: themeColor.light,
        media: '(prefers-color-scheme: light)',
      } as MetaDescriptor)
      meta.push({
        name: 'theme-color',
        content: themeColor.dark,
        media: '(prefers-color-scheme: dark)',
      } as MetaDescriptor)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Extensions
  // ─────────────────────────────────────────────────────────────────────────

  if (extend) {
    meta.push(...extend)
  }

  return meta
}
