import type { MetaDescriptor } from './route'

// ============================================================================
// Core Meta Types
// ============================================================================

/**
 * Options for the title meta tag
 */
export interface TitleOptions {
  /**
   * The page title
   */
  title: string
  /**
   * Optional template for the title (e.g., "%s | My Site")
   * Use %s as placeholder for the title
   */
  template?: string
}

/**
 * Robot directives for search engine crawlers
 */
export interface RobotsOptions {
  /**
   * Allow search engines to index the page
   * @default true
   */
  index?: boolean
  /**
   * Allow search engines to follow links on the page
   * @default true
   */
  follow?: boolean
  /**
   * Prevent caching of the page
   */
  noarchive?: boolean
  /**
   * Prevent showing a snippet in search results
   */
  nosnippet?: boolean
  /**
   * Prevent translation of the page
   */
  notranslate?: boolean
  /**
   * Prevent showing images in search results
   */
  noimageindex?: boolean
  /**
   * Maximum snippet length in characters
   */
  maxSnippet?: number
  /**
   * Maximum size of image preview (none, standard, large)
   */
  maxImagePreview?: 'none' | 'standard' | 'large'
  /**
   * Maximum video preview length in seconds
   */
  maxVideoPreview?: number
  /**
   * Date after which the page should not be shown in search results
   */
  unavailableAfter?: string
}

/**
 * Open Graph meta options following the Open Graph protocol
 * @see https://ogp.me/
 */
export interface OpenGraphOptions {
  /**
   * The title of the content
   */
  title?: string
  /**
   * A one to two sentence description
   */
  description?: string
  /**
   * The canonical URL of the content
   */
  url?: string
  /**
   * The site name (e.g., "IMDb")
   */
  siteName?: string
  /**
   * The locale of the content (e.g., "en_US")
   */
  locale?: string
  /**
   * Alternate locales available
   */
  alternateLocales?: Array<string>
  /**
   * The type of content
   */
  type?:
    | 'website'
    | 'article'
    | 'book'
    | 'profile'
    | 'music.song'
    | 'music.album'
    | 'music.playlist'
    | 'music.radio_station'
    | 'video.movie'
    | 'video.episode'
    | 'video.tv_show'
    | 'video.other'
    | string
  /**
   * Image URL(s) for the content
   */
  images?: Array<string | OpenGraphImage>
  /**
   * Video URL(s) for the content
   */
  videos?: Array<string | OpenGraphVideo>
  /**
   * Audio URL(s) for the content
   */
  audio?: Array<string | OpenGraphAudio>
  /**
   * Article-specific properties
   */
  article?: {
    publishedTime?: string
    modifiedTime?: string
    expirationTime?: string
    authors?: Array<string>
    section?: string
    tags?: Array<string>
  }
}

export interface OpenGraphImage {
  url: string
  secureUrl?: string
  type?: string
  width?: number
  height?: number
  alt?: string
}

export interface OpenGraphVideo {
  url: string
  secureUrl?: string
  type?: string
  width?: number
  height?: number
}

export interface OpenGraphAudio {
  url: string
  secureUrl?: string
  type?: string
}

/**
 * Twitter Card meta options
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup
 */
export interface TwitterOptions {
  /**
   * The card type
   */
  card?: 'summary' | 'summary_large_image' | 'app' | 'player'
  /**
   * @username of website
   */
  site?: string
  /**
   * @username of content creator
   */
  creator?: string
  /**
   * Title of content (max 70 characters)
   */
  title?: string
  /**
   * Description of content (max 200 characters)
   */
  description?: string
  /**
   * URL of image to use in the card
   */
  image?: string
  /**
   * Alt text for the image
   */
  imageAlt?: string
}

// ============================================================================
// JSON-LD Types (Schema.org)
// ============================================================================

/**
 * Base Thing type - all schema.org types extend this
 */
export interface ThingSchema {
  '@type': string
  '@id'?: string
  name?: string
  description?: string
  url?: string
  image?: string | ImageObjectSchema | Array<string | ImageObjectSchema>
  sameAs?: string | Array<string>
}

export interface ImageObjectSchema extends ThingSchema {
  '@type': 'ImageObject'
  contentUrl?: string
  width?: number | string
  height?: number | string
  caption?: string
}

export interface OrganizationSchema extends ThingSchema {
  '@type': 'Organization'
  logo?: string | ImageObjectSchema
  contactPoint?: ContactPointSchema | Array<ContactPointSchema>
  address?: PostalAddressSchema
  email?: string
  telephone?: string
  foundingDate?: string
  founders?: Array<PersonSchema>
  employees?: Array<PersonSchema>
  numberOfEmployees?: number | QuantitativeValueSchema
}

export interface ContactPointSchema extends ThingSchema {
  '@type': 'ContactPoint'
  telephone?: string
  contactType?: string
  email?: string
  areaServed?: string | Array<string>
  availableLanguage?: string | Array<string>
}

export interface PostalAddressSchema extends ThingSchema {
  '@type': 'PostalAddress'
  streetAddress?: string
  addressLocality?: string
  addressRegion?: string
  postalCode?: string
  addressCountry?: string
}

export interface QuantitativeValueSchema {
  '@type': 'QuantitativeValue'
  value?: number
  minValue?: number
  maxValue?: number
  unitText?: string
}

export interface PersonSchema extends ThingSchema {
  '@type': 'Person'
  givenName?: string
  familyName?: string
  email?: string
  telephone?: string
  jobTitle?: string
  worksFor?: OrganizationSchema
  address?: PostalAddressSchema
}

export interface WebSiteSchema extends ThingSchema {
  '@type': 'WebSite'
  potentialAction?: SearchActionSchema | Array<SearchActionSchema>
  publisher?: OrganizationSchema | PersonSchema
}

export interface SearchActionSchema {
  '@type': 'SearchAction'
  target:
    | string
    | {
        '@type': 'EntryPoint'
        urlTemplate: string
      }
  'query-input'?: string
}

export interface WebPageSchema extends ThingSchema {
  '@type': 'WebPage'
  breadcrumb?: BreadcrumbListSchema
  mainEntity?: ThingSchema
  datePublished?: string
  dateModified?: string
  author?: PersonSchema | OrganizationSchema
  publisher?: OrganizationSchema
  isPartOf?: WebSiteSchema
  inLanguage?: string
  primaryImageOfPage?: ImageObjectSchema
}

export interface ArticleSchema extends ThingSchema {
  '@type': 'Article' | 'NewsArticle' | 'BlogPosting' | 'TechArticle'
  headline?: string
  alternativeHeadline?: string
  datePublished?: string
  dateModified?: string
  author?: PersonSchema | OrganizationSchema | Array<PersonSchema>
  publisher?: OrganizationSchema
  articleBody?: string
  articleSection?: string
  wordCount?: number
  keywords?: string | Array<string>
  mainEntityOfPage?: string | WebPageSchema
  thumbnailUrl?: string
}

export interface BreadcrumbListSchema {
  '@type': 'BreadcrumbList'
  itemListElement: Array<ListItemSchema>
}

export interface ListItemSchema {
  '@type': 'ListItem'
  position: number
  name?: string
  item?: string | ThingSchema
}

export interface ProductSchema extends ThingSchema {
  '@type': 'Product'
  brand?: OrganizationSchema | { '@type': 'Brand'; name: string }
  sku?: string
  gtin?: string
  gtin8?: string
  gtin13?: string
  gtin14?: string
  mpn?: string
  offers?: OfferSchema | Array<OfferSchema>
  aggregateRating?: AggregateRatingSchema
  review?: ReviewSchema | Array<ReviewSchema>
  color?: string
  material?: string
  weight?: string
  width?: string
  height?: string
  depth?: string
}

export interface OfferSchema extends ThingSchema {
  '@type': 'Offer'
  price?: number | string
  priceCurrency?: string
  priceValidUntil?: string
  availability?:
    | 'https://schema.org/InStock'
    | 'https://schema.org/OutOfStock'
    | 'https://schema.org/PreOrder'
    | 'https://schema.org/Discontinued'
    | string
  itemCondition?:
    | 'https://schema.org/NewCondition'
    | 'https://schema.org/UsedCondition'
    | 'https://schema.org/RefurbishedCondition'
    | string
  seller?: OrganizationSchema | PersonSchema
  url?: string
}

export interface AggregateRatingSchema {
  '@type': 'AggregateRating'
  ratingValue: number | string
  ratingCount?: number
  reviewCount?: number
  bestRating?: number | string
  worstRating?: number | string
}

export interface ReviewSchema extends ThingSchema {
  '@type': 'Review'
  author?: PersonSchema | OrganizationSchema
  datePublished?: string
  reviewBody?: string
  reviewRating?: RatingSchema
  itemReviewed?: ThingSchema
}

export interface RatingSchema {
  '@type': 'Rating'
  ratingValue: number | string
  bestRating?: number | string
  worstRating?: number | string
}

export interface FAQPageSchema extends ThingSchema {
  '@type': 'FAQPage'
  mainEntity: Array<QuestionSchema>
}

export interface QuestionSchema extends ThingSchema {
  '@type': 'Question'
  acceptedAnswer?: AnswerSchema
}

export interface AnswerSchema extends ThingSchema {
  '@type': 'Answer'
  text?: string
}

export interface HowToSchema extends ThingSchema {
  '@type': 'HowTo'
  step: Array<HowToStepSchema>
  totalTime?: string
  estimatedCost?: string | MonetaryAmountSchema
  supply?: Array<HowToSupplySchema>
  tool?: Array<HowToToolSchema>
}

export interface HowToStepSchema {
  '@type': 'HowToStep'
  name?: string
  text?: string
  url?: string
  image?: string | ImageObjectSchema
}

export interface HowToSupplySchema {
  '@type': 'HowToSupply'
  name?: string
}

export interface HowToToolSchema {
  '@type': 'HowToTool'
  name?: string
}

export interface MonetaryAmountSchema {
  '@type': 'MonetaryAmount'
  currency?: string
  value?: number | string
}

export interface EventSchema extends ThingSchema {
  '@type':
    | 'Event'
    | 'BusinessEvent'
    | 'ChildrensEvent'
    | 'ComedyEvent'
    | 'CourseInstance'
    | 'DanceEvent'
    | 'DeliveryEvent'
    | 'EducationEvent'
    | 'ExhibitionEvent'
    | 'Festival'
    | 'FoodEvent'
    | 'LiteraryEvent'
    | 'MusicEvent'
    | 'PublicationEvent'
    | 'SaleEvent'
    | 'ScreeningEvent'
    | 'SocialEvent'
    | 'SportsEvent'
    | 'TheaterEvent'
    | 'VisualArtsEvent'
  startDate?: string
  endDate?: string
  location?: PlaceSchema | VirtualLocationSchema | string
  organizer?: OrganizationSchema | PersonSchema
  performer?: PersonSchema | OrganizationSchema | Array<PersonSchema>
  offers?: OfferSchema | Array<OfferSchema>
  eventStatus?:
    | 'https://schema.org/EventScheduled'
    | 'https://schema.org/EventCancelled'
    | 'https://schema.org/EventMovedOnline'
    | 'https://schema.org/EventPostponed'
    | 'https://schema.org/EventRescheduled'
    | string
  eventAttendanceMode?:
    | 'https://schema.org/OfflineEventAttendanceMode'
    | 'https://schema.org/OnlineEventAttendanceMode'
    | 'https://schema.org/MixedEventAttendanceMode'
    | string
}

export interface PlaceSchema extends ThingSchema {
  '@type': 'Place'
  address?: PostalAddressSchema | string
  geo?: GeoCoordinatesSchema
}

export interface GeoCoordinatesSchema {
  '@type': 'GeoCoordinates'
  latitude?: number
  longitude?: number
}

export interface VirtualLocationSchema {
  '@type': 'VirtualLocation'
  url?: string
}

export interface LocalBusinessSchema
  extends Omit<OrganizationSchema, '@type' | 'address'> {
  '@type':
    | 'LocalBusiness'
    | 'Restaurant'
    | 'Store'
    | 'MedicalBusiness'
    | 'LegalService'
    | 'FinancialService'
    | 'RealEstateAgent'
    | 'TravelAgency'
    | string
  address?: PostalAddressSchema | string
  geo?: GeoCoordinatesSchema
  openingHours?: string | Array<string>
  openingHoursSpecification?: Array<OpeningHoursSpecificationSchema>
  priceRange?: string
  aggregateRating?: AggregateRatingSchema
  review?: ReviewSchema | Array<ReviewSchema>
}

export interface OpeningHoursSpecificationSchema {
  '@type': 'OpeningHoursSpecification'
  dayOfWeek?:
    | string
    | Array<
        | 'Monday'
        | 'Tuesday'
        | 'Wednesday'
        | 'Thursday'
        | 'Friday'
        | 'Saturday'
        | 'Sunday'
      >
  opens?: string
  closes?: string
  validFrom?: string
  validThrough?: string
}

export interface SoftwareApplicationSchema extends ThingSchema {
  '@type': 'SoftwareApplication' | 'MobileApplication' | 'WebApplication'
  applicationCategory?: string
  operatingSystem?: string
  offers?: OfferSchema | Array<OfferSchema>
  aggregateRating?: AggregateRatingSchema
  downloadUrl?: string
  softwareVersion?: string
  fileSize?: string
  requirements?: string
}

export interface VideoObjectSchema extends ThingSchema {
  '@type': 'VideoObject'
  contentUrl?: string
  embedUrl?: string
  uploadDate?: string
  duration?: string
  thumbnailUrl?: string | Array<string>
  transcript?: string
  expires?: string
  hasPart?: Array<ClipSchema>
  publication?: BroadcastEventSchema
}

export interface ClipSchema extends ThingSchema {
  '@type': 'Clip'
  startOffset?: number
  endOffset?: number
  url?: string
}

export interface BroadcastEventSchema extends ThingSchema {
  '@type': 'BroadcastEvent'
  isLiveBroadcast?: boolean
  startDate?: string
  endDate?: string
}

export interface CourseSchema extends ThingSchema {
  '@type': 'Course'
  provider?: OrganizationSchema
  courseCode?: string
  hasCourseInstance?: CourseInstanceSchema | Array<CourseInstanceSchema>
  aggregateRating?: AggregateRatingSchema
  offers?: OfferSchema | Array<OfferSchema>
}

export interface CourseInstanceSchema extends ThingSchema {
  '@type': 'CourseInstance'
  courseMode?: 'online' | 'onsite' | 'blended' | string
  instructor?: PersonSchema | Array<PersonSchema>
  startDate?: string
  endDate?: string
}

export interface RecipeSchema extends ThingSchema {
  '@type': 'Recipe'
  author?: PersonSchema | OrganizationSchema
  datePublished?: string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  recipeYield?: string
  recipeIngredient?: Array<string>
  recipeInstructions?: Array<HowToStepSchema> | string
  recipeCategory?: string
  recipeCuisine?: string
  nutrition?: NutritionInformationSchema
  aggregateRating?: AggregateRatingSchema
  video?: VideoObjectSchema
  keywords?: string
}

export interface NutritionInformationSchema {
  '@type': 'NutritionInformation'
  calories?: string
  carbohydrateContent?: string
  cholesterolContent?: string
  fatContent?: string
  fiberContent?: string
  proteinContent?: string
  saturatedFatContent?: string
  servingSize?: string
  sodiumContent?: string
  sugarContent?: string
  transFatContent?: string
  unsaturatedFatContent?: string
}

/**
 * Union of all supported JSON-LD schema types
 */
export type JsonLdSchema =
  | ThingSchema
  | WebSiteSchema
  | WebPageSchema
  | ArticleSchema
  | OrganizationSchema
  | PersonSchema
  | ProductSchema
  | FAQPageSchema
  | HowToSchema
  | EventSchema
  | LocalBusinessSchema
  | SoftwareApplicationSchema
  | VideoObjectSchema
  | CourseSchema
  | RecipeSchema
  | BreadcrumbListSchema

/**
 * JSON-LD document with @context
 */
export interface JsonLdDocument<T extends JsonLdSchema = JsonLdSchema> {
  '@context': 'https://schema.org' | string
  '@graph'?: Array<T>
}

// ============================================================================
// Meta Builder Functions
// ============================================================================

/**
 * Creates a title meta descriptor
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...title({ title: 'My Page', template: '%s | My Site' }),
 *   ]
 * })
 * ```
 */
export function title(options: string | TitleOptions): Array<MetaDescriptor> {
  const titleString =
    typeof options === 'string' ? options : formatTitle(options)
  return [{ title: titleString }]
}

function formatTitle(options: TitleOptions): string {
  if (options.template) {
    return options.template.replace('%s', options.title)
  }
  return options.title
}

/**
 * Creates a description meta descriptor
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...description('This is my page description'),
 *   ]
 * })
 * ```
 */
export function description(content: string): Array<MetaDescriptor> {
  return [{ name: 'description', content }]
}

/**
 * Creates a charset meta descriptor
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...charset(),
 *   ]
 * })
 * ```
 */
export function charset(): Array<MetaDescriptor> {
  return [{ charSet: 'utf-8' }]
}

/**
 * Creates a viewport meta descriptor with sensible defaults
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...viewport(),
 *     // or with custom options
 *     ...viewport('width=device-width, initial-scale=1, maximum-scale=5'),
 *   ]
 * })
 * ```
 */
export function viewport(
  content: string = 'width=device-width, initial-scale=1',
): Array<MetaDescriptor> {
  return [{ name: 'viewport', content }]
}

/**
 * Creates robots meta descriptor for search engine directives
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...robots({ index: true, follow: true, maxSnippet: 160 }),
 *   ]
 * })
 * ```
 */
export function robots(options: RobotsOptions = {}): Array<MetaDescriptor> {
  const directives: Array<string> = []

  // Index/noindex
  if (options.index === false) {
    directives.push('noindex')
  } else if (options.index === true) {
    directives.push('index')
  }

  // Follow/nofollow
  if (options.follow === false) {
    directives.push('nofollow')
  } else if (options.follow === true) {
    directives.push('follow')
  }

  // Other directives
  if (options.noarchive) directives.push('noarchive')
  if (options.nosnippet) directives.push('nosnippet')
  if (options.notranslate) directives.push('notranslate')
  if (options.noimageindex) directives.push('noimageindex')
  if (options.maxSnippet !== undefined)
    directives.push(`max-snippet:${options.maxSnippet}`)
  if (options.maxImagePreview)
    directives.push(`max-image-preview:${options.maxImagePreview}`)
  if (options.maxVideoPreview !== undefined)
    directives.push(`max-video-preview:${options.maxVideoPreview}`)
  if (options.unavailableAfter)
    directives.push(`unavailable_after:${options.unavailableAfter}`)

  if (directives.length === 0) {
    return []
  }

  return [{ name: 'robots', content: directives.join(', ') }]
}

/**
 * Creates a canonical link descriptor (returned as meta with tagName: 'link')
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...canonical('https://example.com/page'),
 *   ]
 * })
 * ```
 */
export function canonical(href: string): Array<MetaDescriptor> {
  return [{ tagName: 'link', rel: 'canonical', href }]
}

/**
 * Creates alternate link descriptors for language/region variants
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...alternate([
 *       { hreflang: 'en', href: 'https://example.com/en/page' },
 *       { hreflang: 'es', href: 'https://example.com/es/page' },
 *       { hreflang: 'x-default', href: 'https://example.com/page' },
 *     ]),
 *   ]
 * })
 * ```
 */
export function alternate(
  links: Array<{ hreflang: string; href: string }>,
): Array<MetaDescriptor> {
  return links.map((link) => ({
    tagName: 'link',
    rel: 'alternate',
    hreflang: link.hreflang,
    href: link.href,
  }))
}

/**
 * Creates Open Graph meta descriptors
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...openGraph({
 *       title: 'My Page',
 *       description: 'Page description',
 *       type: 'website',
 *       url: 'https://example.com/page',
 *       images: [{ url: 'https://example.com/og.jpg', width: 1200, height: 630 }],
 *     }),
 *   ]
 * })
 * ```
 */
export function openGraph(options: OpenGraphOptions): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (options.title) meta.push({ property: 'og:title', content: options.title })
  if (options.description)
    meta.push({ property: 'og:description', content: options.description })
  if (options.url) meta.push({ property: 'og:url', content: options.url })
  if (options.siteName)
    meta.push({ property: 'og:site_name', content: options.siteName })
  if (options.locale)
    meta.push({ property: 'og:locale', content: options.locale })
  if (options.type) meta.push({ property: 'og:type', content: options.type })

  // Alternate locales
  if (options.alternateLocales) {
    for (const locale of options.alternateLocales) {
      meta.push({ property: 'og:locale:alternate', content: locale })
    }
  }

  // Images
  if (options.images) {
    for (const image of options.images) {
      if (typeof image === 'string') {
        meta.push({ property: 'og:image', content: image })
      } else {
        meta.push({ property: 'og:image', content: image.url })
        if (image.secureUrl)
          meta.push({ property: 'og:image:secure_url', content: image.secureUrl })
        if (image.type)
          meta.push({ property: 'og:image:type', content: image.type })
        if (image.width)
          meta.push({
            property: 'og:image:width',
            content: String(image.width),
          })
        if (image.height)
          meta.push({
            property: 'og:image:height',
            content: String(image.height),
          })
        if (image.alt)
          meta.push({ property: 'og:image:alt', content: image.alt })
      }
    }
  }

  // Videos
  if (options.videos) {
    for (const video of options.videos) {
      if (typeof video === 'string') {
        meta.push({ property: 'og:video', content: video })
      } else {
        meta.push({ property: 'og:video', content: video.url })
        if (video.secureUrl)
          meta.push({ property: 'og:video:secure_url', content: video.secureUrl })
        if (video.type)
          meta.push({ property: 'og:video:type', content: video.type })
        if (video.width)
          meta.push({
            property: 'og:video:width',
            content: String(video.width),
          })
        if (video.height)
          meta.push({
            property: 'og:video:height',
            content: String(video.height),
          })
      }
    }
  }

  // Audio
  if (options.audio) {
    for (const audio of options.audio) {
      if (typeof audio === 'string') {
        meta.push({ property: 'og:audio', content: audio })
      } else {
        meta.push({ property: 'og:audio', content: audio.url })
        if (audio.secureUrl)
          meta.push({ property: 'og:audio:secure_url', content: audio.secureUrl })
        if (audio.type)
          meta.push({ property: 'og:audio:type', content: audio.type })
      }
    }
  }

  // Article properties
  if (options.article) {
    if (options.article.publishedTime)
      meta.push({
        property: 'article:published_time',
        content: options.article.publishedTime,
      })
    if (options.article.modifiedTime)
      meta.push({
        property: 'article:modified_time',
        content: options.article.modifiedTime,
      })
    if (options.article.expirationTime)
      meta.push({
        property: 'article:expiration_time',
        content: options.article.expirationTime,
      })
    if (options.article.section)
      meta.push({
        property: 'article:section',
        content: options.article.section,
      })
    if (options.article.authors) {
      for (const author of options.article.authors) {
        meta.push({ property: 'article:author', content: author })
      }
    }
    if (options.article.tags) {
      for (const tag of options.article.tags) {
        meta.push({ property: 'article:tag', content: tag })
      }
    }
  }

  return meta
}

/**
 * Creates Twitter Card meta descriptors
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...twitter({
 *       card: 'summary_large_image',
 *       title: 'My Page',
 *       description: 'Page description',
 *       image: 'https://example.com/twitter.jpg',
 *       site: '@mysite',
 *     }),
 *   ]
 * })
 * ```
 */
export function twitter(options: TwitterOptions): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (options.card) meta.push({ name: 'twitter:card', content: options.card })
  if (options.site) meta.push({ name: 'twitter:site', content: options.site })
  if (options.creator)
    meta.push({ name: 'twitter:creator', content: options.creator })
  if (options.title)
    meta.push({ name: 'twitter:title', content: options.title })
  if (options.description)
    meta.push({ name: 'twitter:description', content: options.description })
  if (options.image)
    meta.push({ name: 'twitter:image', content: options.image })
  if (options.imageAlt)
    meta.push({ name: 'twitter:image:alt', content: options.imageAlt })

  return meta
}

/**
 * Creates common meta tags for SEO verification (Google, Bing, etc.)
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...verification({
 *       google: 'google-site-verification-code',
 *       bing: 'bing-site-verification-code',
 *     }),
 *   ]
 * })
 * ```
 */
export function verification(options: {
  google?: string
  bing?: string
  yandex?: string
  pinterest?: string
  norton?: string
}): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (options.google)
    meta.push({ name: 'google-site-verification', content: options.google })
  if (options.bing)
    meta.push({ name: 'msvalidate.01', content: options.bing })
  if (options.yandex)
    meta.push({ name: 'yandex-verification', content: options.yandex })
  if (options.pinterest)
    meta.push({ name: 'p:domain_verify', content: options.pinterest })
  if (options.norton)
    meta.push({ name: 'norton-safeweb-site-verification', content: options.norton })

  return meta
}

/**
 * Creates theme-color meta tags for browsers
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...themeColor('#ffffff'),
 *     // or with dark mode support
 *     ...themeColor({ light: '#ffffff', dark: '#000000' }),
 *   ]
 * })
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
 * Creates application-related meta tags
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...appMeta({
 *       name: 'My App',
 *       appleItunesApp: { appId: '123456789' },
 *     }),
 *   ]
 * })
 * ```
 */
export function appMeta(options: {
  name?: string
  appleItunesApp?: {
    appId: string
    affiliateData?: string
    appArgument?: string
  }
  googlePlayApp?: { appId: string }
}): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = []

  if (options.name)
    meta.push({ name: 'application-name', content: options.name })

  if (options.appleItunesApp) {
    const parts = [`app-id=${options.appleItunesApp.appId}`]
    if (options.appleItunesApp.affiliateData)
      parts.push(`affiliate-data=${options.appleItunesApp.affiliateData}`)
    if (options.appleItunesApp.appArgument)
      parts.push(`app-argument=${options.appleItunesApp.appArgument}`)
    meta.push({ name: 'apple-itunes-app', content: parts.join(', ') })
  }

  if (options.googlePlayApp)
    meta.push({
      name: 'google-play-app',
      content: `app-id=${options.googlePlayApp.appId}`,
    })

  return meta
}

// ============================================================================
// JSON-LD Builder Functions
// ============================================================================

/**
 * Creates a JSON-LD meta descriptor
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLd({
 *       '@type': 'WebSite',
 *       name: 'My Site',
 *       url: 'https://example.com',
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLd<T extends JsonLdSchema>(
  schema: T | Array<T>,
): Array<MetaDescriptor> {
  const document = Array.isArray(schema)
    ? {
        '@context': 'https://schema.org',
        '@graph': schema,
      }
    : {
        '@context': 'https://schema.org',
        ...schema,
      }

  return [{ 'script:ld+json': document }]
}

/**
 * Creates a WebSite JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdWebsite({
 *       name: 'My Site',
 *       url: 'https://example.com',
 *       potentialAction: {
 *         '@type': 'SearchAction',
 *         target: 'https://example.com/search?q={search_term_string}',
 *         'query-input': 'required name=search_term_string',
 *       },
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdWebsite(
  options: Omit<WebSiteSchema, '@type'>,
): Array<MetaDescriptor> {
  return jsonLd({ '@type': 'WebSite', ...options })
}

/**
 * Creates an Organization JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdOrganization({
 *       name: 'My Company',
 *       url: 'https://example.com',
 *       logo: 'https://example.com/logo.png',
 *       sameAs: [
 *         'https://twitter.com/mycompany',
 *         'https://linkedin.com/company/mycompany',
 *       ],
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdOrganization(
  options: Omit<OrganizationSchema, '@type'>,
): Array<MetaDescriptor> {
  return jsonLd({ '@type': 'Organization', ...options })
}

/**
 * Creates an Article JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdArticle({
 *       headline: 'Article Title',
 *       datePublished: '2024-01-15T08:00:00+00:00',
 *       dateModified: '2024-01-16T10:00:00+00:00',
 *       author: { '@type': 'Person', name: 'John Doe' },
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdArticle(
  options: Omit<ArticleSchema, '@type'> & {
    type?: 'Article' | 'NewsArticle' | 'BlogPosting' | 'TechArticle'
  },
): Array<MetaDescriptor> {
  const { type = 'Article', ...rest } = options
  return jsonLd({ '@type': type, ...rest })
}

/**
 * Creates a Product JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdProduct({
 *       name: 'Product Name',
 *       description: 'Product description',
 *       image: 'https://example.com/product.jpg',
 *       offers: {
 *         '@type': 'Offer',
 *         price: 99.99,
 *         priceCurrency: 'USD',
 *         availability: 'https://schema.org/InStock',
 *       },
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdProduct(
  options: Omit<ProductSchema, '@type'>,
): Array<MetaDescriptor> {
  return jsonLd({ '@type': 'Product', ...options })
}

/**
 * Creates a BreadcrumbList JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdBreadcrumbs([
 *       { name: 'Home', url: 'https://example.com' },
 *       { name: 'Category', url: 'https://example.com/category' },
 *       { name: 'Product', url: 'https://example.com/category/product' },
 *     ]),
 *   ]
 * })
 * ```
 */
export function jsonLdBreadcrumbs(
  items: Array<{ name: string; url: string }>,
): Array<MetaDescriptor> {
  return jsonLd({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  })
}

/**
 * Creates a FAQPage JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdFaq([
 *       { question: 'What is...?', answer: 'It is...' },
 *       { question: 'How do I...?', answer: 'You can...' },
 *     ]),
 *   ]
 * })
 * ```
 */
export function jsonLdFaq(
  items: Array<{ question: string; answer: string }>,
): Array<MetaDescriptor> {
  return jsonLd({
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  })
}

/**
 * Creates an Event JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdEvent({
 *       name: 'Concert',
 *       startDate: '2024-06-15T19:00:00-07:00',
 *       location: {
 *         '@type': 'Place',
 *         name: 'Venue Name',
 *         address: { '@type': 'PostalAddress', addressLocality: 'City' },
 *       },
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdEvent(
  options: Omit<EventSchema, '@type'> & { type?: EventSchema['@type'] },
): Array<MetaDescriptor> {
  const { type = 'Event', ...rest } = options
  return jsonLd({ '@type': type, ...rest })
}

/**
 * Creates a LocalBusiness JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdLocalBusiness({
 *       name: 'Business Name',
 *       address: {
 *         '@type': 'PostalAddress',
 *         streetAddress: '123 Main St',
 *         addressLocality: 'City',
 *         addressRegion: 'State',
 *         postalCode: '12345',
 *       },
 *       telephone: '+1-555-555-5555',
 *       openingHours: 'Mo-Fr 09:00-17:00',
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdLocalBusiness(
  options: Omit<LocalBusinessSchema, '@type'> & {
    type?: LocalBusinessSchema['@type']
  },
): Array<MetaDescriptor> {
  const { type = 'LocalBusiness', ...rest } = options
  return jsonLd({ '@type': type, ...rest })
}

/**
 * Creates a SoftwareApplication JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdSoftwareApp({
 *       name: 'My App',
 *       operatingSystem: 'iOS, Android',
 *       applicationCategory: 'GameApplication',
 *       aggregateRating: {
 *         '@type': 'AggregateRating',
 *         ratingValue: 4.5,
 *         ratingCount: 1000,
 *       },
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdSoftwareApp(
  options: Omit<SoftwareApplicationSchema, '@type'> & {
    type?: SoftwareApplicationSchema['@type']
  },
): Array<MetaDescriptor> {
  const { type = 'SoftwareApplication', ...rest } = options
  return jsonLd({ '@type': type, ...rest })
}

/**
 * Creates a Video JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdVideo({
 *       name: 'Video Title',
 *       description: 'Video description',
 *       thumbnailUrl: 'https://example.com/thumbnail.jpg',
 *       uploadDate: '2024-01-15',
 *       contentUrl: 'https://example.com/video.mp4',
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdVideo(
  options: Omit<VideoObjectSchema, '@type'>,
): Array<MetaDescriptor> {
  return jsonLd({ '@type': 'VideoObject', ...options })
}

/**
 * Creates a Recipe JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdRecipe({
 *       name: 'Chocolate Cake',
 *       prepTime: 'PT30M',
 *       cookTime: 'PT1H',
 *       recipeYield: '8 servings',
 *       recipeIngredient: ['2 cups flour', '1 cup sugar'],
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdRecipe(
  options: Omit<RecipeSchema, '@type'>,
): Array<MetaDescriptor> {
  return jsonLd({ '@type': 'Recipe', ...options })
}

/**
 * Creates a Course JSON-LD schema
 *
 * @example
 * ```ts
 * head: () => ({
 *   meta: [
 *     ...jsonLdCourse({
 *       name: 'Introduction to Programming',
 *       description: 'Learn the basics of programming',
 *       provider: { '@type': 'Organization', name: 'My School' },
 *     }),
 *   ]
 * })
 * ```
 */
export function jsonLdCourse(
  options: Omit<CourseSchema, '@type'>,
): Array<MetaDescriptor> {
  return jsonLd({ '@type': 'Course', ...options })
}

// ============================================================================
// Meta Merge Utilities
// ============================================================================

/**
 * Options for merging meta arrays
 */
export interface MergeMetaOptions {
  /**
   * Strategy for handling duplicates
   * - 'last-wins': Later values override earlier ones (default)
   * - 'first-wins': Keep first occurrence, ignore later duplicates
   * - 'append': Keep all values, don't deduplicate
   */
  strategy?: 'last-wins' | 'first-wins' | 'append'
}

/**
 * Merges multiple meta arrays with intelligent deduplication.
 * By default, later values override earlier ones for the same key.
 *
 * @example
 * ```ts
 * // In a child route, merge parent meta with child-specific meta
 * head: ({ matches }) => {
 *   const parentMeta = matches[0]?.meta ?? []
 *   return {
 *     meta: mergeMeta(
 *       parentMeta,
 *       title('Child Page'),
 *       description('Child page description'),
 *       openGraph({ title: 'Child Page', type: 'website' }),
 *     ),
 *   }
 * }
 * ```
 */
export function mergeMeta(
  ...sources: Array<Array<MetaDescriptor> | undefined | null>
): Array<MetaDescriptor> {
  return mergeMetaWithOptions({}, ...sources)
}

/**
 * Merges multiple meta arrays with custom options
 *
 * @example
 * ```ts
 * // Keep first occurrence instead of last
 * mergeMetaWithOptions(
 *   { strategy: 'first-wins' },
 *   baseMeta,
 *   overrideMeta,
 * )
 * ```
 */
export function mergeMetaWithOptions(
  options: MergeMetaOptions,
  ...sources: Array<Array<MetaDescriptor> | undefined | null>
): Array<MetaDescriptor> {
  const { strategy = 'last-wins' } = options

  if (strategy === 'append') {
    return sources.filter(Boolean).flat() as Array<MetaDescriptor>
  }

  const metaByKey = new Map<string, MetaDescriptor>()
  const orderedKeys: Array<string> = []

  for (const source of sources) {
    if (!source) continue

    for (const meta of source) {
      const key = getMetaKey(meta)

      if (strategy === 'first-wins' && metaByKey.has(key)) {
        continue
      }

      if (!metaByKey.has(key)) {
        orderedKeys.push(key)
      }

      metaByKey.set(key, meta)
    }
  }

  return orderedKeys.map((key) => metaByKey.get(key)!)
}

/**
 * Gets a unique key for a meta descriptor for deduplication purposes
 */
function getMetaKey(meta: MetaDescriptor): string {
  // Handle specific meta types
  if ('charSet' in meta) return 'charset'
  if ('title' in meta) return 'title'
  if ('name' in meta && 'content' in meta) return `name:${(meta as any).name}`
  if ('property' in meta && 'content' in meta)
    return `property:${(meta as any).property}`
  if ('httpEquiv' in meta) return `http-equiv:${(meta as any).httpEquiv}`
  if ('script:ld+json' in meta) {
    // For JSON-LD, use @type and @id if available for deduplication
    const ldJson = (meta as any)['script:ld+json']
    if (ldJson['@id']) return `jsonld:${ldJson['@id']}`
    if (ldJson['@type']) return `jsonld:${ldJson['@type']}`
    if (ldJson['@graph']) return 'jsonld:graph'
    return `jsonld:${JSON.stringify(ldJson)}`
  }
  if ('tagName' in meta) {
    const tagName = (meta as any).tagName
    if (tagName === 'link' && (meta as any).rel === 'canonical')
      return 'link:canonical'
    if (tagName === 'link' && (meta as any).rel === 'alternate') {
      const hreflang = (meta as any).hreflang || ''
      return `link:alternate:${hreflang}`
    }
    return `${tagName}:${JSON.stringify(meta)}`
  }

  // Fallback to stringified version
  return JSON.stringify(meta)
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Creates a complete set of base meta tags for a page with sensible defaults
 *
 * @example
 * ```ts
 * // In your root route
 * head: () => ({
 *   meta: [
 *     ...baseMeta({
 *       title: 'My Site',
 *       description: 'My site description',
 *       url: 'https://example.com',
 *       image: 'https://example.com/og.jpg',
 *     }),
 *   ]
 * })
 * ```
 */
export function baseMeta(options: {
  title: string
  titleTemplate?: string
  description: string
  url?: string
  image?: string | OpenGraphImage
  locale?: string
  siteName?: string
  twitterSite?: string
}): Array<MetaDescriptor> {
  const meta: Array<MetaDescriptor> = [
    ...charset(),
    ...viewport(),
    ...title(
      options.titleTemplate
        ? { title: options.title, template: options.titleTemplate }
        : options.title,
    ),
    ...description(options.description),
  ]

  // Open Graph
  const ogOptions: OpenGraphOptions = {
    title: options.title,
    description: options.description,
    type: 'website',
  }
  if (options.url) ogOptions.url = options.url
  if (options.siteName) ogOptions.siteName = options.siteName
  if (options.locale) ogOptions.locale = options.locale
  if (options.image) {
    ogOptions.images = [
      typeof options.image === 'string' ? options.image : options.image,
    ]
  }
  meta.push(...openGraph(ogOptions))

  // Twitter Card
  const twitterOptions: TwitterOptions = {
    card: options.image ? 'summary_large_image' : 'summary',
    title: options.title,
    description: options.description,
  }
  if (options.twitterSite) twitterOptions.site = options.twitterSite
  if (options.image) {
    twitterOptions.image =
      typeof options.image === 'string' ? options.image : options.image.url
  }
  meta.push(...twitter(twitterOptions))

  // Canonical
  if (options.url) {
    meta.push(...canonical(options.url))
  }

  return meta
}

/**
 * Removes specific meta tags from an array by their keys
 *
 * @example
 * ```ts
 * // Remove og:image from parent meta
 * head: ({ matches }) => {
 *   const parentMeta = matches[0]?.meta ?? []
 *   return {
 *     meta: [
 *       ...excludeMeta(parentMeta, ['og:image', 'twitter:image']),
 *       ...newMeta,
 *     ]
 *   }
 * }
 * ```
 */
export function excludeMeta(
  meta: Array<MetaDescriptor>,
  keys: Array<string>,
): Array<MetaDescriptor> {
  const keySet = new Set(
    keys.map((k) => {
      // Normalize key format
      if (k.startsWith('og:')) return `property:${k}`
      if (k.startsWith('twitter:')) return `name:${k}`
      if (k.startsWith('article:')) return `property:${k}`
      return k
    }),
  )

  return meta.filter((m) => {
    const key = getMetaKey(m)
    return !keySet.has(key)
  })
}

/**
 * Picks specific meta tags from an array by their keys
 *
 * @example
 * ```ts
 * // Only keep title and description from parent meta
 * head: ({ matches }) => {
 *   const parentMeta = matches[0]?.meta ?? []
 *   return {
 *     meta: [
 *       ...pickMeta(parentMeta, ['title', 'description']),
 *       ...newMeta,
 *     ]
 *   }
 * }
 * ```
 */
export function pickMeta(
  meta: Array<MetaDescriptor>,
  keys: Array<string>,
): Array<MetaDescriptor> {
  const keySet = new Set(
    keys.map((k) => {
      // Normalize key format
      if (k.startsWith('og:')) return `property:${k}`
      if (k.startsWith('twitter:')) return `name:${k}`
      if (k.startsWith('article:')) return `property:${k}`
      return k
    }),
  )

  return meta.filter((m) => {
    const key = getMetaKey(m)
    return keySet.has(key)
  })
}
