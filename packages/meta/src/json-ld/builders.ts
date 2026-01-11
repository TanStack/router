import type { MetaDescriptor } from '../types'
import type {
  Article,
  Course,
  Event,
  FAQPage,
  HowTo,
  LocalBusiness,
  Organization,
  Person,
  Product,
  Recipe,
  SoftwareApplication,
  Thing,
  Video,
  WebPage,
  WebSite,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Core JSON-LD Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a JSON-LD script meta descriptor.
 *
 * This is the low-level builder for any Schema.org type.
 * For common types, prefer the specific builders like `jsonLd.product()`.
 *
 * @example
 * ```ts
 * import { jsonLd } from '@tanstack/meta/json-ld'
 *
 * // Single schema
 * jsonLd.create({
 *   '@type': 'WebSite',
 *   name: 'My Site',
 *   url: 'https://example.com',
 * })
 *
 * // Multiple schemas with @graph
 * jsonLd.create([
 *   { '@type': 'WebSite', name: 'My Site' },
 *   { '@type': 'Organization', name: 'My Org' },
 * ])
 * ```
 */
function create<T extends Thing>(schema: T | Array<T>): Array<MetaDescriptor> {
  const document = Array.isArray(schema)
    ? { '@context': 'https://schema.org', '@graph': schema }
    : { '@context': 'https://schema.org', ...schema }

  return [{ 'script:ld+json': document }]
}

// ─────────────────────────────────────────────────────────────────────────────
// Simplified Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a WebSite JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.website({
 *   name: 'My Site',
 *   url: 'https://example.com',
 *   searchUrl: 'https://example.com/search?q={query}',
 * })
 * ```
 */
function website(config: {
  name: string
  url?: string
  description?: string
  searchUrl?: string
}): Array<MetaDescriptor> {
  const schema: WebSite = {
    '@type': 'WebSite',
    name: config.name,
    url: config.url,
    description: config.description,
  }

  if (config.searchUrl) {
    schema.potentialAction = {
      '@type': 'SearchAction',
      target: config.searchUrl.includes('{')
        ? { '@type': 'EntryPoint', urlTemplate: config.searchUrl }
        : config.searchUrl,
      'query-input': 'required name=query',
    }
  }

  return create(schema)
}

/**
 * Creates an Organization JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.organization({
 *   name: 'My Company',
 *   url: 'https://example.com',
 *   logo: 'https://example.com/logo.png',
 *   socials: ['https://twitter.com/company', 'https://linkedin.com/company/...'],
 * })
 * ```
 */
function organization(config: {
  name: string
  url?: string
  logo?: string
  description?: string
  email?: string
  telephone?: string
  address?: { street?: string; city?: string; region?: string; postal?: string; country?: string }
  socials?: Array<string>
}): Array<MetaDescriptor> {
  const schema: Organization = {
    '@type': 'Organization',
    name: config.name,
    url: config.url,
    description: config.description,
    logo: config.logo,
    email: config.email,
    telephone: config.telephone,
    sameAs: config.socials,
  }

  if (config.address) {
    schema.address = {
      '@type': 'PostalAddress',
      streetAddress: config.address.street,
      addressLocality: config.address.city,
      addressRegion: config.address.region,
      postalCode: config.address.postal,
      addressCountry: config.address.country,
    }
  }

  return create(schema)
}

/**
 * Creates a Person JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.person({
 *   name: 'John Doe',
 *   url: 'https://johndoe.com',
 *   jobTitle: 'Software Engineer',
 * })
 * ```
 */
function person(config: {
  name: string
  url?: string
  image?: string
  jobTitle?: string
  email?: string
  socials?: Array<string>
}): Array<MetaDescriptor> {
  const schema: Person = {
    '@type': 'Person',
    name: config.name,
    url: config.url,
    image: config.image,
    jobTitle: config.jobTitle,
    email: config.email,
    sameAs: config.socials,
  }

  return create(schema)
}

/**
 * Creates an Article JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.article({
 *   headline: 'Article Title',
 *   description: 'Article description',
 *   author: 'John Doe',
 *   datePublished: '2024-01-15',
 *   image: 'https://example.com/image.jpg',
 * })
 * ```
 */
function article(config: {
  headline: string
  description?: string
  author?: string | { name: string; url?: string }
  datePublished?: string
  dateModified?: string
  image?: string
  section?: string
  keywords?: Array<string>
  type?: 'Article' | 'NewsArticle' | 'BlogPosting' | 'TechArticle'
}): Array<MetaDescriptor> {
  const authorSchema: Person | undefined = config.author
    ? typeof config.author === 'string'
      ? { '@type': 'Person', name: config.author }
      : { '@type': 'Person', name: config.author.name, url: config.author.url }
    : undefined

  const schema: Article = {
    '@type': config.type ?? 'Article',
    headline: config.headline,
    description: config.description,
    author: authorSchema,
    datePublished: config.datePublished,
    dateModified: config.dateModified,
    image: config.image,
    articleSection: config.section,
    keywords: config.keywords,
  }

  return create(schema)
}

/**
 * Creates a Product JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.product({
 *   name: 'Cool Product',
 *   description: 'A very cool product',
 *   image: 'https://example.com/product.jpg',
 *   price: 99.99,
 *   currency: 'USD',
 *   availability: 'InStock',
 *   brand: 'My Brand',
 * })
 * ```
 */
function product(config: {
  name: string
  description?: string
  image?: string
  price?: number
  currency?: string
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | string
  brand?: string
  sku?: string
  rating?: { value: number; count?: number }
}): Array<MetaDescriptor> {
  const schema: Product = {
    '@type': 'Product',
    name: config.name,
    description: config.description,
    image: config.image,
    sku: config.sku,
  }

  if (config.brand) {
    schema.brand = { '@type': 'Brand', name: config.brand }
  }

  if (config.price !== undefined) {
    const availability = config.availability
      ? config.availability.startsWith('https://')
        ? config.availability
        : `https://schema.org/${config.availability}`
      : undefined

    schema.offers = {
      '@type': 'Offer',
      price: config.price,
      priceCurrency: config.currency ?? 'USD',
      availability,
    }
  }

  if (config.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: config.rating.value,
      ratingCount: config.rating.count,
    }
  }

  return create(schema)
}

/**
 * Creates a BreadcrumbList JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.breadcrumbs([
 *   { name: 'Home', url: 'https://example.com' },
 *   { name: 'Products', url: 'https://example.com/products' },
 *   { name: 'Widget', url: 'https://example.com/products/widget' },
 * ])
 * ```
 */
function breadcrumbs(
  items: Array<{ name: string; url: string }>,
): Array<MetaDescriptor> {
  return create({
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
 * jsonLd.faq([
 *   { question: 'What is...?', answer: 'It is...' },
 *   { question: 'How do I...?', answer: 'You can...' },
 * ])
 * ```
 */
function faq(
  items: Array<{ question: string; answer: string }>,
): Array<MetaDescriptor> {
  const schema: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return create(schema)
}

/**
 * Creates an Event JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.event({
 *   name: 'Concert',
 *   startDate: '2024-06-15T19:00:00-07:00',
 *   endDate: '2024-06-15T22:00:00-07:00',
 *   location: 'Madison Square Garden, New York',
 *   // or
 *   location: { name: 'Madison Square Garden', address: 'NYC' },
 * })
 * ```
 */
function event(config: {
  name: string
  description?: string
  startDate?: string
  endDate?: string
  location?: string | { name: string; address?: string; url?: string }
  image?: string
  organizer?: string
  url?: string
  type?: Event['@type']
}): Array<MetaDescriptor> {
  let locationSchema: Event['location']

  if (config.location) {
    if (typeof config.location === 'string') {
      locationSchema = config.location
    } else if (config.location.url) {
      locationSchema = {
        '@type': 'VirtualLocation',
        url: config.location.url,
      }
    } else {
      locationSchema = {
        '@type': 'Place',
        name: config.location.name,
        address: config.location.address,
      }
    }
  }

  const schema: Event = {
    '@type': config.type ?? 'Event',
    name: config.name,
    description: config.description,
    startDate: config.startDate,
    endDate: config.endDate,
    location: locationSchema,
    image: config.image,
    url: config.url,
    organizer: config.organizer
      ? { '@type': 'Organization', name: config.organizer }
      : undefined,
  }

  return create(schema)
}

/**
 * Creates a LocalBusiness JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.localBusiness({
 *   name: 'My Restaurant',
 *   type: 'Restaurant',
 *   address: '123 Main St, City, State 12345',
 *   telephone: '+1-555-555-5555',
 *   openingHours: 'Mo-Fr 09:00-17:00',
 *   priceRange: '$$',
 * })
 * ```
 */
function localBusiness(config: {
  name: string
  type?: 'LocalBusiness' | 'Restaurant' | 'Store' | string
  description?: string
  url?: string
  image?: string
  telephone?: string
  email?: string
  address?: string | { street?: string; city?: string; region?: string; postal?: string; country?: string }
  openingHours?: string | Array<string>
  priceRange?: string
  rating?: { value: number; count?: number }
}): Array<MetaDescriptor> {
  let addressSchema: LocalBusiness['address']

  if (config.address) {
    if (typeof config.address === 'string') {
      addressSchema = config.address
    } else {
      addressSchema = {
        '@type': 'PostalAddress',
        streetAddress: config.address.street,
        addressLocality: config.address.city,
        addressRegion: config.address.region,
        postalCode: config.address.postal,
        addressCountry: config.address.country,
      }
    }
  }

  const schema: LocalBusiness = {
    '@type': config.type ?? 'LocalBusiness',
    name: config.name,
    description: config.description,
    url: config.url,
    image: config.image,
    telephone: config.telephone,
    email: config.email,
    address: addressSchema,
    openingHours: config.openingHours,
    priceRange: config.priceRange,
  }

  if (config.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: config.rating.value,
      ratingCount: config.rating.count,
    }
  }

  return create(schema)
}

/**
 * Creates a SoftwareApplication JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.softwareApp({
 *   name: 'My App',
 *   type: 'MobileApplication',
 *   operatingSystem: 'iOS, Android',
 *   category: 'GameApplication',
 *   price: 0,
 *   rating: { value: 4.5, count: 1000 },
 * })
 * ```
 */
function softwareApp(config: {
  name: string
  type?: 'SoftwareApplication' | 'MobileApplication' | 'WebApplication'
  description?: string
  url?: string
  operatingSystem?: string
  category?: string
  price?: number
  currency?: string
  rating?: { value: number; count?: number }
}): Array<MetaDescriptor> {
  const schema: SoftwareApplication = {
    '@type': config.type ?? 'SoftwareApplication',
    name: config.name,
    description: config.description,
    url: config.url,
    operatingSystem: config.operatingSystem,
    applicationCategory: config.category,
  }

  if (config.price !== undefined) {
    schema.offers = {
      '@type': 'Offer',
      price: config.price,
      priceCurrency: config.currency ?? 'USD',
    }
  }

  if (config.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: config.rating.value,
      ratingCount: config.rating.count,
    }
  }

  return create(schema)
}

/**
 * Creates a VideoObject JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.video({
 *   name: 'Video Title',
 *   description: 'Video description',
 *   thumbnail: 'https://example.com/thumb.jpg',
 *   uploadDate: '2024-01-15',
 *   contentUrl: 'https://example.com/video.mp4',
 *   duration: 'PT5M30S', // 5 minutes 30 seconds
 * })
 * ```
 */
function video(config: {
  name: string
  description?: string
  thumbnail?: string
  uploadDate?: string
  contentUrl?: string
  embedUrl?: string
  duration?: string
}): Array<MetaDescriptor> {
  const schema: Video = {
    '@type': 'VideoObject',
    name: config.name,
    description: config.description,
    thumbnailUrl: config.thumbnail,
    uploadDate: config.uploadDate,
    contentUrl: config.contentUrl,
    embedUrl: config.embedUrl,
    duration: config.duration,
  }

  return create(schema)
}

/**
 * Creates a Recipe JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.recipe({
 *   name: 'Chocolate Cake',
 *   description: 'Delicious chocolate cake',
 *   author: 'Chef John',
 *   prepTime: 'PT30M',
 *   cookTime: 'PT1H',
 *   servings: '8 servings',
 *   ingredients: ['2 cups flour', '1 cup sugar', '...'],
 * })
 * ```
 */
function recipe(config: {
  name: string
  description?: string
  author?: string
  image?: string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  servings?: string
  ingredients?: Array<string>
  instructions?: string | Array<string>
  category?: string
  cuisine?: string
  keywords?: string
  rating?: { value: number; count?: number }
}): Array<MetaDescriptor> {
  const schema: Recipe = {
    '@type': 'Recipe',
    name: config.name,
    description: config.description,
    image: config.image,
    prepTime: config.prepTime,
    cookTime: config.cookTime,
    totalTime: config.totalTime,
    recipeYield: config.servings,
    recipeIngredient: config.ingredients,
    recipeCategory: config.category,
    recipeCuisine: config.cuisine,
    keywords: config.keywords,
  }

  if (config.author) {
    schema.author = { '@type': 'Person', name: config.author }
  }

  if (config.instructions) {
    if (typeof config.instructions === 'string') {
      schema.recipeInstructions = config.instructions
    } else {
      schema.recipeInstructions = config.instructions.map((text) => ({
        '@type': 'HowToStep',
        text,
      }))
    }
  }

  if (config.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: config.rating.value,
      ratingCount: config.rating.count,
    }
  }

  return create(schema)
}

/**
 * Creates a Course JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.course({
 *   name: 'Introduction to Programming',
 *   description: 'Learn the basics',
 *   provider: 'Online Academy',
 *   url: 'https://example.com/course',
 * })
 * ```
 */
function course(config: {
  name: string
  description?: string
  provider?: string
  url?: string
  image?: string
}): Array<MetaDescriptor> {
  const schema: Course = {
    '@type': 'Course',
    name: config.name,
    description: config.description,
    url: config.url,
    image: config.image,
  }

  if (config.provider) {
    schema.provider = { '@type': 'Organization', name: config.provider }
  }

  return create(schema)
}

/**
 * Creates a HowTo JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.howTo({
 *   name: 'How to Make Coffee',
 *   description: 'A simple guide',
 *   totalTime: 'PT5M',
 *   steps: [
 *     'Boil water',
 *     'Add coffee grounds',
 *     'Pour water over grounds',
 *     'Wait 4 minutes',
 *   ],
 * })
 * ```
 */
function howTo(config: {
  name: string
  description?: string
  totalTime?: string
  steps: Array<string | { name?: string; text: string; image?: string }>
}): Array<MetaDescriptor> {
  const schema: HowTo = {
    '@type': 'HowTo',
    name: config.name,
    description: config.description,
    totalTime: config.totalTime,
    step: config.steps.map((step) =>
      typeof step === 'string'
        ? { '@type': 'HowToStep', text: step }
        : { '@type': 'HowToStep', name: step.name, text: step.text, image: step.image },
    ),
  }

  return create(schema)
}

/**
 * Creates a WebPage JSON-LD schema
 *
 * @example
 * ```ts
 * jsonLd.webpage({
 *   name: 'About Us',
 *   description: 'Learn about our company',
 *   url: 'https://example.com/about',
 * })
 * ```
 */
function webpage(config: {
  name: string
  description?: string
  url?: string
  datePublished?: string
  dateModified?: string
  inLanguage?: string
}): Array<MetaDescriptor> {
  const schema: WebPage = {
    '@type': 'WebPage',
    name: config.name,
    description: config.description,
    url: config.url,
    datePublished: config.datePublished,
    dateModified: config.dateModified,
    inLanguage: config.inLanguage,
  }

  return create(schema)
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON-LD builder namespace.
 *
 * Provides convenient methods for creating structured data for search engines.
 *
 * @example
 * ```ts
 * import { jsonLd } from '@tanstack/meta/json-ld'
 *
 * // In a route's head function
 * head: () => ({
 *   meta: [
 *     ...createMeta({ title: 'Product', description: 'Great product' }),
 *     ...jsonLd.product({
 *       name: 'Cool Widget',
 *       price: 99.99,
 *       currency: 'USD',
 *     }),
 *   ],
 * })
 * ```
 */
export const jsonLd = {
  /** Create raw JSON-LD from any schema */
  create,
  /** WebSite schema */
  website,
  /** WebPage schema */
  webpage,
  /** Organization schema */
  organization,
  /** Person schema */
  person,
  /** Article/BlogPosting schema */
  article,
  /** Product schema */
  product,
  /** BreadcrumbList schema */
  breadcrumbs,
  /** FAQPage schema */
  faq,
  /** Event schema */
  event,
  /** LocalBusiness schema */
  localBusiness,
  /** SoftwareApplication schema */
  softwareApp,
  /** VideoObject schema */
  video,
  /** Recipe schema */
  recipe,
  /** Course schema */
  course,
  /** HowTo schema */
  howTo,
} as const
