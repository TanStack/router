/**
 * JSON-LD Schema Types
 *
 * These types represent common Schema.org types used for structured data.
 * Import types using the JsonLd namespace:
 *
 * @example
 * ```ts
 * import type { JsonLd } from '@tanstack/meta/json-ld'
 *
 * const product: JsonLd.Product = { ... }
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base Types
// ─────────────────────────────────────────────────────────────────────────────

/** Base properties shared by all Schema.org types */
export interface Thing {
  '@type': string
  '@id'?: string
  name?: string
  description?: string
  url?: string
  image?: string | Image | Array<string | Image>
  sameAs?: string | Array<string>
}

export interface Image extends Thing {
  '@type': 'ImageObject'
  contentUrl?: string
  width?: number | string
  height?: number | string
  caption?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Organization Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Organization extends Thing {
  '@type': 'Organization'
  logo?: string | Image
  email?: string
  telephone?: string
  address?: PostalAddress | string
  contactPoint?: ContactPoint | Array<ContactPoint>
}

export interface ContactPoint extends Thing {
  '@type': 'ContactPoint'
  telephone?: string
  contactType?: string
  email?: string
  areaServed?: string | Array<string>
}

export interface PostalAddress extends Thing {
  '@type': 'PostalAddress'
  streetAddress?: string
  addressLocality?: string
  addressRegion?: string
  postalCode?: string
  addressCountry?: string
}

export interface Person extends Thing {
  '@type': 'Person'
  givenName?: string
  familyName?: string
  email?: string
  telephone?: string
  jobTitle?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Website & Page Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WebSite extends Thing {
  '@type': 'WebSite'
  publisher?: Organization | Person
  potentialAction?: SearchAction | Array<SearchAction>
}

export interface SearchAction {
  '@type': 'SearchAction'
  target: string | { '@type': 'EntryPoint'; urlTemplate: string }
  'query-input'?: string
}

export interface WebPage extends Thing {
  '@type': 'WebPage'
  breadcrumb?: BreadcrumbList
  datePublished?: string
  dateModified?: string
  author?: Person | Organization
  publisher?: Organization
  inLanguage?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Article extends Thing {
  '@type': 'Article' | 'NewsArticle' | 'BlogPosting' | 'TechArticle'
  headline?: string
  datePublished?: string
  dateModified?: string
  author?: Person | Organization | Array<Person>
  publisher?: Organization
  articleSection?: string
  wordCount?: number
  keywords?: string | Array<string>
  thumbnailUrl?: string
}

export interface BreadcrumbList {
  '@type': 'BreadcrumbList'
  itemListElement: Array<ListItem>
}

export interface ListItem {
  '@type': 'ListItem'
  position: number
  name?: string
  item?: string | Thing
}

export interface FAQPage extends Thing {
  '@type': 'FAQPage'
  mainEntity: Array<Question>
}

export interface Question extends Thing {
  '@type': 'Question'
  acceptedAnswer?: Answer
}

export interface Answer extends Thing {
  '@type': 'Answer'
  text?: string
}

export interface HowTo extends Thing {
  '@type': 'HowTo'
  step: Array<HowToStep>
  totalTime?: string
  estimatedCost?: string
}

export interface HowToStep {
  '@type': 'HowToStep'
  name?: string
  text?: string
  url?: string
  image?: string | Image
}

// ─────────────────────────────────────────────────────────────────────────────
// Product & Commerce Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Product extends Thing {
  '@type': 'Product'
  brand?: Organization | { '@type': 'Brand'; name: string }
  sku?: string
  gtin?: string
  mpn?: string
  offers?: Offer | Array<Offer>
  aggregateRating?: AggregateRating
  review?: Review | Array<Review>
}

export interface Offer extends Thing {
  '@type': 'Offer'
  price?: number | string
  priceCurrency?: string
  priceValidUntil?: string
  availability?:
    | 'https://schema.org/InStock'
    | 'https://schema.org/OutOfStock'
    | 'https://schema.org/PreOrder'
    | string
  itemCondition?:
    | 'https://schema.org/NewCondition'
    | 'https://schema.org/UsedCondition'
    | string
  seller?: Organization | Person
}

export interface AggregateRating {
  '@type': 'AggregateRating'
  ratingValue: number | string
  ratingCount?: number
  reviewCount?: number
  bestRating?: number | string
  worstRating?: number | string
}

export interface Review extends Thing {
  '@type': 'Review'
  author?: Person | Organization
  datePublished?: string
  reviewBody?: string
  reviewRating?: {
    '@type': 'Rating'
    ratingValue: number | string
    bestRating?: number | string
    worstRating?: number | string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Event extends Thing {
  '@type': 'Event' | 'MusicEvent' | 'BusinessEvent' | string
  startDate?: string
  endDate?: string
  location?: Place | VirtualLocation | string
  organizer?: Organization | Person
  performer?: Person | Organization | Array<Person>
  offers?: Offer | Array<Offer>
  eventStatus?:
    | 'https://schema.org/EventScheduled'
    | 'https://schema.org/EventCancelled'
    | 'https://schema.org/EventPostponed'
    | string
  eventAttendanceMode?:
    | 'https://schema.org/OfflineEventAttendanceMode'
    | 'https://schema.org/OnlineEventAttendanceMode'
    | 'https://schema.org/MixedEventAttendanceMode'
    | string
}

export interface Place extends Thing {
  '@type': 'Place'
  address?: PostalAddress | string
  geo?: { '@type': 'GeoCoordinates'; latitude?: number; longitude?: number }
}

export interface VirtualLocation {
  '@type': 'VirtualLocation'
  url?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Business Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalBusiness extends Omit<Organization, '@type'> {
  '@type': 'LocalBusiness' | 'Restaurant' | 'Store' | string
  address?: PostalAddress | string
  geo?: { '@type': 'GeoCoordinates'; latitude?: number; longitude?: number }
  openingHours?: string | Array<string>
  priceRange?: string
  aggregateRating?: AggregateRating
  review?: Review | Array<Review>
}

// ─────────────────────────────────────────────────────────────────────────────
// Media Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Video extends Thing {
  '@type': 'VideoObject'
  contentUrl?: string
  embedUrl?: string
  uploadDate?: string
  duration?: string
  thumbnailUrl?: string | Array<string>
  transcript?: string
}

export interface SoftwareApplication extends Thing {
  '@type': 'SoftwareApplication' | 'MobileApplication' | 'WebApplication'
  applicationCategory?: string
  operatingSystem?: string
  offers?: Offer | Array<Offer>
  aggregateRating?: AggregateRating
  downloadUrl?: string
  softwareVersion?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Education Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Course extends Thing {
  '@type': 'Course'
  provider?: Organization
  courseCode?: string
  aggregateRating?: AggregateRating
  offers?: Offer | Array<Offer>
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe Type
// ─────────────────────────────────────────────────────────────────────────────

export interface Recipe extends Thing {
  '@type': 'Recipe'
  author?: Person | Organization
  datePublished?: string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  recipeYield?: string
  recipeIngredient?: Array<string>
  recipeInstructions?: Array<HowToStep> | string
  recipeCategory?: string
  recipeCuisine?: string
  aggregateRating?: AggregateRating
  keywords?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON-LD type namespace
 *
 * @example
 * ```ts
 * import type { JsonLd } from '@tanstack/meta/json-ld'
 *
 * const product: JsonLd.Product = {
 *   '@type': 'Product',
 *   name: 'Cool Product',
 * }
 * ```
 */
export namespace JsonLd {
  export type {
    Thing,
    Image,
    Organization,
    ContactPoint,
    PostalAddress,
    Person,
    WebSite,
    SearchAction,
    WebPage,
    Article,
    BreadcrumbList,
    ListItem,
    FAQPage,
    Question,
    Answer,
    HowTo,
    HowToStep,
    Product,
    Offer,
    AggregateRating,
    Review,
    Event,
    Place,
    VirtualLocation,
    LocalBusiness,
    Video,
    SoftwareApplication,
    Course,
    Recipe,
  }
}
