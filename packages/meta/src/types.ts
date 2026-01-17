/**
 * Meta descriptor type compatible with TanStack Router's head function.
 * Each descriptor represents a single meta tag, link, or script element.
 */
export type MetaDescriptor =
  | { charSet: 'utf-8' }
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { httpEquiv: string; content: string }
  | { 'script:ld+json': JsonLdObject }
  | { tagName: 'meta' | 'link'; [name: string]: string }
  | Record<string, unknown>

type JsonLdObject = { [Key in string]: JsonLdValue } & {
  [Key in string]?: JsonLdValue | undefined
}
type JsonLdArray = Array<JsonLdValue> | ReadonlyArray<JsonLdValue>
type JsonLdPrimitive = string | number | boolean | null
type JsonLdValue = JsonLdPrimitive | JsonLdObject | JsonLdArray

/**
 * Image configuration for Open Graph and Twitter cards
 */
export interface MetaImage {
  /** Image URL */
  url: string
  /** Image width in pixels */
  width?: number
  /** Image height in pixels */
  height?: number
  /** Alt text for accessibility */
  alt?: string
}

/**
 * Robot directives for search engine crawlers
 */
export interface RobotsConfig {
  /** Allow indexing (default: true) */
  index?: boolean
  /** Allow following links (default: true) */
  follow?: boolean
  /** Prevent caching */
  noarchive?: boolean
  /** Prevent snippets */
  nosnippet?: boolean
  /** Maximum snippet length */
  maxSnippet?: number
  /** Maximum image preview size */
  maxImagePreview?: 'none' | 'standard' | 'large'
}

/**
 * Open Graph configuration for social sharing
 */
export interface OpenGraphConfig {
  /** Content title (defaults to main title) */
  title?: string
  /** Content description (defaults to main description) */
  description?: string
  /** Content type */
  type?: 'website' | 'article' | 'product' | 'profile' | string
  /** Canonical URL */
  url?: string
  /** Site name */
  siteName?: string
  /** Locale (e.g., 'en_US') */
  locale?: string
  /** Images */
  images?: Array<string | MetaImage>
  /** Article-specific properties */
  article?: {
    publishedTime?: string
    modifiedTime?: string
    authors?: Array<string>
    section?: string
    tags?: Array<string>
  }
}

/**
 * Twitter Card configuration
 */
export interface TwitterConfig {
  /** Card type */
  card?: 'summary' | 'summary_large_image' | 'app' | 'player'
  /** @username of website */
  site?: string
  /** @username of content creator */
  creator?: string
  /** Title (defaults to main title) */
  title?: string
  /** Description (defaults to main description) */
  description?: string
  /** Image URL */
  image?: string
  /** Image alt text */
  imageAlt?: string
}
