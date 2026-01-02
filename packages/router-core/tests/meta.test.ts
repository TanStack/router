import { describe, expect, it } from 'vitest'
import {
  title,
  description,
  charset,
  viewport,
  robots,
  canonical,
  alternate,
  openGraph,
  twitter,
  verification,
  themeColor,
  appMeta,
  jsonLd,
  jsonLdWebsite,
  jsonLdOrganization,
  jsonLdArticle,
  jsonLdProduct,
  jsonLdBreadcrumbs,
  jsonLdFaq,
  jsonLdEvent,
  jsonLdLocalBusiness,
  jsonLdSoftwareApp,
  jsonLdVideo,
  jsonLdRecipe,
  jsonLdCourse,
  mergeMeta,
  mergeMetaWithOptions,
  baseMeta,
  excludeMeta,
  pickMeta,
} from '../src/meta'

describe('Core Meta Builders', () => {
  describe('title', () => {
    it('should create a title descriptor from a string', () => {
      const result = title('My Page')
      expect(result).toEqual([{ title: 'My Page' }])
    })

    it('should create a title descriptor from options object', () => {
      const result = title({ title: 'My Page' })
      expect(result).toEqual([{ title: 'My Page' }])
    })

    it('should apply template to title', () => {
      const result = title({ title: 'My Page', template: '%s | My Site' })
      expect(result).toEqual([{ title: 'My Page | My Site' }])
    })

    it('should handle multiple %s placeholders (only first replaced)', () => {
      const result = title({ title: 'Test', template: '%s - %s Site' })
      expect(result).toEqual([{ title: 'Test - %s Site' }])
    })
  })

  describe('description', () => {
    it('should create a description meta descriptor', () => {
      const result = description('This is my page description')
      expect(result).toEqual([
        { name: 'description', content: 'This is my page description' },
      ])
    })
  })

  describe('charset', () => {
    it('should create a charset descriptor with utf-8', () => {
      const result = charset()
      expect(result).toEqual([{ charSet: 'utf-8' }])
    })
  })

  describe('viewport', () => {
    it('should create a viewport descriptor with default value', () => {
      const result = viewport()
      expect(result).toEqual([
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ])
    })

    it('should create a viewport descriptor with custom value', () => {
      const result = viewport(
        'width=device-width, initial-scale=1, maximum-scale=5',
      )
      expect(result).toEqual([
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=5',
        },
      ])
    })
  })
})

describe('SEO Meta Builders', () => {
  describe('robots', () => {
    it('should return empty array for default options', () => {
      const result = robots()
      expect(result).toEqual([])
    })

    it('should create index directive', () => {
      const result = robots({ index: true })
      expect(result).toEqual([{ name: 'robots', content: 'index' }])
    })

    it('should create noindex directive', () => {
      const result = robots({ index: false })
      expect(result).toEqual([{ name: 'robots', content: 'noindex' }])
    })

    it('should create follow directive', () => {
      const result = robots({ follow: true })
      expect(result).toEqual([{ name: 'robots', content: 'follow' }])
    })

    it('should create nofollow directive', () => {
      const result = robots({ follow: false })
      expect(result).toEqual([{ name: 'robots', content: 'nofollow' }])
    })

    it('should combine multiple directives', () => {
      const result = robots({
        index: true,
        follow: true,
        noarchive: true,
        maxSnippet: 160,
      })
      expect(result).toEqual([
        {
          name: 'robots',
          content: 'index, follow, noarchive, max-snippet:160',
        },
      ])
    })

    it('should include all available directives', () => {
      const result = robots({
        index: false,
        follow: false,
        noarchive: true,
        nosnippet: true,
        notranslate: true,
        noimageindex: true,
        maxSnippet: 100,
        maxImagePreview: 'large',
        maxVideoPreview: 30,
        unavailableAfter: '2025-12-31',
      })
      expect(result).toEqual([
        {
          name: 'robots',
          content:
            'noindex, nofollow, noarchive, nosnippet, notranslate, noimageindex, max-snippet:100, max-image-preview:large, max-video-preview:30, unavailable_after:2025-12-31',
        },
      ])
    })
  })

  describe('canonical', () => {
    it('should create a canonical link descriptor', () => {
      const result = canonical('https://example.com/page')
      expect(result).toEqual([
        { tagName: 'link', rel: 'canonical', href: 'https://example.com/page' },
      ])
    })
  })

  describe('alternate', () => {
    it('should create alternate link descriptors', () => {
      const result = alternate([
        { hreflang: 'en', href: 'https://example.com/en/page' },
        { hreflang: 'es', href: 'https://example.com/es/page' },
        { hreflang: 'x-default', href: 'https://example.com/page' },
      ])
      expect(result).toEqual([
        {
          tagName: 'link',
          rel: 'alternate',
          hreflang: 'en',
          href: 'https://example.com/en/page',
        },
        {
          tagName: 'link',
          rel: 'alternate',
          hreflang: 'es',
          href: 'https://example.com/es/page',
        },
        {
          tagName: 'link',
          rel: 'alternate',
          hreflang: 'x-default',
          href: 'https://example.com/page',
        },
      ])
    })
  })

  describe('openGraph', () => {
    it('should create basic Open Graph descriptors', () => {
      const result = openGraph({
        title: 'My Page',
        description: 'Page description',
        type: 'website',
      })
      expect(result).toEqual([
        { property: 'og:title', content: 'My Page' },
        { property: 'og:description', content: 'Page description' },
        { property: 'og:type', content: 'website' },
      ])
    })

    it('should create Open Graph descriptors with images', () => {
      const result = openGraph({
        title: 'My Page',
        images: [
          {
            url: 'https://example.com/og.jpg',
            width: 1200,
            height: 630,
            alt: 'OG Image',
          },
        ],
      })
      expect(result).toEqual([
        { property: 'og:title', content: 'My Page' },
        { property: 'og:image', content: 'https://example.com/og.jpg' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'OG Image' },
      ])
    })

    it('should handle string images', () => {
      const result = openGraph({
        images: ['https://example.com/image.jpg'],
      })
      expect(result).toEqual([
        { property: 'og:image', content: 'https://example.com/image.jpg' },
      ])
    })

    it('should handle article properties', () => {
      const result = openGraph({
        type: 'article',
        article: {
          publishedTime: '2024-01-15T08:00:00+00:00',
          modifiedTime: '2024-01-16T10:00:00+00:00',
          section: 'Technology',
          authors: ['John Doe', 'Jane Doe'],
          tags: ['tech', 'news'],
        },
      })
      expect(result).toContainEqual({
        property: 'article:published_time',
        content: '2024-01-15T08:00:00+00:00',
      })
      expect(result).toContainEqual({
        property: 'article:modified_time',
        content: '2024-01-16T10:00:00+00:00',
      })
      expect(result).toContainEqual({
        property: 'article:section',
        content: 'Technology',
      })
      expect(result).toContainEqual({
        property: 'article:author',
        content: 'John Doe',
      })
      expect(result).toContainEqual({
        property: 'article:author',
        content: 'Jane Doe',
      })
      expect(result).toContainEqual({
        property: 'article:tag',
        content: 'tech',
      })
      expect(result).toContainEqual({
        property: 'article:tag',
        content: 'news',
      })
    })

    it('should handle alternate locales', () => {
      const result = openGraph({
        locale: 'en_US',
        alternateLocales: ['es_ES', 'fr_FR'],
      })
      expect(result).toEqual([
        { property: 'og:locale', content: 'en_US' },
        { property: 'og:locale:alternate', content: 'es_ES' },
        { property: 'og:locale:alternate', content: 'fr_FR' },
      ])
    })

    it('should handle videos', () => {
      const result = openGraph({
        videos: [
          {
            url: 'https://example.com/video.mp4',
            width: 1920,
            height: 1080,
            type: 'video/mp4',
          },
        ],
      })
      expect(result).toEqual([
        { property: 'og:video', content: 'https://example.com/video.mp4' },
        { property: 'og:video:type', content: 'video/mp4' },
        { property: 'og:video:width', content: '1920' },
        { property: 'og:video:height', content: '1080' },
      ])
    })

    it('should handle audio', () => {
      const result = openGraph({
        audio: [
          {
            url: 'https://example.com/audio.mp3',
            type: 'audio/mpeg',
          },
        ],
      })
      expect(result).toEqual([
        { property: 'og:audio', content: 'https://example.com/audio.mp3' },
        { property: 'og:audio:type', content: 'audio/mpeg' },
      ])
    })
  })

  describe('twitter', () => {
    it('should create Twitter Card descriptors', () => {
      const result = twitter({
        card: 'summary_large_image',
        title: 'My Page',
        description: 'Page description',
        image: 'https://example.com/twitter.jpg',
        site: '@mysite',
        creator: '@author',
      })
      expect(result).toEqual([
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@mysite' },
        { name: 'twitter:creator', content: '@author' },
        { name: 'twitter:title', content: 'My Page' },
        { name: 'twitter:description', content: 'Page description' },
        { name: 'twitter:image', content: 'https://example.com/twitter.jpg' },
      ])
    })

    it('should include image alt when provided', () => {
      const result = twitter({
        image: 'https://example.com/image.jpg',
        imageAlt: 'Description of image',
      })
      expect(result).toEqual([
        { name: 'twitter:image', content: 'https://example.com/image.jpg' },
        { name: 'twitter:image:alt', content: 'Description of image' },
      ])
    })
  })

  describe('verification', () => {
    it('should create verification meta tags', () => {
      const result = verification({
        google: 'google-code',
        bing: 'bing-code',
        yandex: 'yandex-code',
        pinterest: 'pinterest-code',
      })
      expect(result).toEqual([
        { name: 'google-site-verification', content: 'google-code' },
        { name: 'msvalidate.01', content: 'bing-code' },
        { name: 'yandex-verification', content: 'yandex-code' },
        { name: 'p:domain_verify', content: 'pinterest-code' },
      ])
    })

    it('should only include provided verification codes', () => {
      const result = verification({ google: 'google-code' })
      expect(result).toEqual([
        { name: 'google-site-verification', content: 'google-code' },
      ])
    })
  })

  describe('themeColor', () => {
    it('should create a single theme-color meta tag', () => {
      const result = themeColor('#ffffff')
      expect(result).toEqual([{ name: 'theme-color', content: '#ffffff' }])
    })

    it('should create theme-color meta tags for light and dark modes', () => {
      const result = themeColor({ light: '#ffffff', dark: '#000000' })
      expect(result).toEqual([
        {
          name: 'theme-color',
          content: '#ffffff',
          media: '(prefers-color-scheme: light)',
        },
        {
          name: 'theme-color',
          content: '#000000',
          media: '(prefers-color-scheme: dark)',
        },
      ])
    })
  })

  describe('appMeta', () => {
    it('should create application meta tags', () => {
      const result = appMeta({
        name: 'My App',
        appleItunesApp: { appId: '123456789' },
        googlePlayApp: { appId: 'com.example.app' },
      })
      expect(result).toEqual([
        { name: 'application-name', content: 'My App' },
        { name: 'apple-itunes-app', content: 'app-id=123456789' },
        { name: 'google-play-app', content: 'app-id=com.example.app' },
      ])
    })

    it('should include Apple iTunes app with affiliate data', () => {
      const result = appMeta({
        appleItunesApp: {
          appId: '123456789',
          affiliateData: 'affiliate123',
          appArgument: 'myapp://page',
        },
      })
      expect(result).toEqual([
        {
          name: 'apple-itunes-app',
          content:
            'app-id=123456789, affiliate-data=affiliate123, app-argument=myapp://page',
        },
      ])
    })
  })
})

describe('JSON-LD Builders', () => {
  describe('jsonLd', () => {
    it('should create a JSON-LD descriptor with single schema', () => {
      const result = jsonLd({
        '@type': 'WebSite',
        name: 'My Site',
        url: 'https://example.com',
      })
      expect(result).toEqual([
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'My Site',
            url: 'https://example.com',
          },
        },
      ])
    })

    it('should create a JSON-LD descriptor with @graph for multiple schemas', () => {
      const result = jsonLd([
        { '@type': 'WebSite', name: 'My Site' },
        { '@type': 'Organization', name: 'My Org' },
      ])
      expect(result).toEqual([
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'WebSite', name: 'My Site' },
              { '@type': 'Organization', name: 'My Org' },
            ],
          },
        },
      ])
    })
  })

  describe('jsonLdWebsite', () => {
    it('should create a WebSite JSON-LD schema', () => {
      const result = jsonLdWebsite({
        name: 'My Site',
        url: 'https://example.com',
      })
      expect(result[0]).toHaveProperty('script:ld+json')
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@context']).toBe('https://schema.org')
      expect(schema['@type']).toBe('WebSite')
      expect(schema.name).toBe('My Site')
    })

    it('should include search action', () => {
      const result = jsonLdWebsite({
        name: 'My Site',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://example.com/search?q={search_term}',
          'query-input': 'required name=search_term',
        },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema.potentialAction).toBeDefined()
      expect(schema.potentialAction['@type']).toBe('SearchAction')
    })
  })

  describe('jsonLdOrganization', () => {
    it('should create an Organization JSON-LD schema', () => {
      const result = jsonLdOrganization({
        name: 'My Company',
        url: 'https://example.com',
        logo: 'https://example.com/logo.png',
        sameAs: [
          'https://twitter.com/mycompany',
          'https://linkedin.com/company/mycompany',
        ],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Organization')
      expect(schema.name).toBe('My Company')
      expect(schema.sameAs).toEqual([
        'https://twitter.com/mycompany',
        'https://linkedin.com/company/mycompany',
      ])
    })
  })

  describe('jsonLdArticle', () => {
    it('should create an Article JSON-LD schema', () => {
      const result = jsonLdArticle({
        headline: 'Article Title',
        datePublished: '2024-01-15T08:00:00+00:00',
        author: { '@type': 'Person', name: 'John Doe' },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Article')
      expect(schema.headline).toBe('Article Title')
    })

    it('should allow custom article type', () => {
      const result = jsonLdArticle({
        type: 'BlogPosting',
        headline: 'Blog Post',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('BlogPosting')
    })
  })

  describe('jsonLdProduct', () => {
    it('should create a Product JSON-LD schema', () => {
      const result = jsonLdProduct({
        name: 'Product Name',
        offers: {
          '@type': 'Offer',
          price: 99.99,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Product')
      expect(schema.offers.price).toBe(99.99)
    })
  })

  describe('jsonLdBreadcrumbs', () => {
    it('should create a BreadcrumbList JSON-LD schema', () => {
      const result = jsonLdBreadcrumbs([
        { name: 'Home', url: 'https://example.com' },
        { name: 'Category', url: 'https://example.com/category' },
        { name: 'Product', url: 'https://example.com/category/product' },
      ])
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('BreadcrumbList')
      expect(schema.itemListElement).toHaveLength(3)
      expect(schema.itemListElement[0].position).toBe(1)
      expect(schema.itemListElement[0].name).toBe('Home')
      expect(schema.itemListElement[2].position).toBe(3)
    })
  })

  describe('jsonLdFaq', () => {
    it('should create a FAQPage JSON-LD schema', () => {
      const result = jsonLdFaq([
        { question: 'What is X?', answer: 'X is...' },
        { question: 'How do I Y?', answer: 'You can Y by...' },
      ])
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('FAQPage')
      expect(schema.mainEntity).toHaveLength(2)
      expect(schema.mainEntity[0]['@type']).toBe('Question')
      expect(schema.mainEntity[0].name).toBe('What is X?')
      expect(schema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer')
      expect(schema.mainEntity[0].acceptedAnswer.text).toBe('X is...')
    })
  })

  describe('jsonLdEvent', () => {
    it('should create an Event JSON-LD schema', () => {
      const result = jsonLdEvent({
        name: 'Concert',
        startDate: '2024-06-15T19:00:00-07:00',
        location: {
          '@type': 'Place',
          name: 'Venue Name',
        },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Event')
      expect(schema.name).toBe('Concert')
    })

    it('should allow custom event type', () => {
      const result = jsonLdEvent({
        type: 'MusicEvent',
        name: 'Concert',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('MusicEvent')
    })
  })

  describe('jsonLdLocalBusiness', () => {
    it('should create a LocalBusiness JSON-LD schema', () => {
      const result = jsonLdLocalBusiness({
        name: 'My Business',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '123 Main St',
          addressLocality: 'City',
        },
        telephone: '+1-555-555-5555',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('LocalBusiness')
      expect(schema.telephone).toBe('+1-555-555-5555')
    })
  })

  describe('jsonLdSoftwareApp', () => {
    it('should create a SoftwareApplication JSON-LD schema', () => {
      const result = jsonLdSoftwareApp({
        name: 'My App',
        operatingSystem: 'iOS, Android',
        applicationCategory: 'GameApplication',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('SoftwareApplication')
      expect(schema.applicationCategory).toBe('GameApplication')
    })
  })

  describe('jsonLdVideo', () => {
    it('should create a VideoObject JSON-LD schema', () => {
      const result = jsonLdVideo({
        name: 'Video Title',
        description: 'Video description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        uploadDate: '2024-01-15',
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('VideoObject')
      expect(schema.name).toBe('Video Title')
    })
  })

  describe('jsonLdRecipe', () => {
    it('should create a Recipe JSON-LD schema', () => {
      const result = jsonLdRecipe({
        name: 'Chocolate Cake',
        prepTime: 'PT30M',
        cookTime: 'PT1H',
        recipeYield: '8 servings',
        recipeIngredient: ['2 cups flour', '1 cup sugar'],
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Recipe')
      expect(schema.name).toBe('Chocolate Cake')
      expect(schema.recipeIngredient).toHaveLength(2)
    })
  })

  describe('jsonLdCourse', () => {
    it('should create a Course JSON-LD schema', () => {
      const result = jsonLdCourse({
        name: 'Introduction to Programming',
        provider: { '@type': 'Organization', name: 'My School' },
      })
      const schema = (result[0] as any)['script:ld+json']
      expect(schema['@type']).toBe('Course')
      expect(schema.provider['@type']).toBe('Organization')
    })
  })
})

describe('Meta Merge Utilities', () => {
  describe('mergeMeta', () => {
    it('should merge multiple meta arrays', () => {
      const result = mergeMeta(
        title('Page 1'),
        description('Description 1'),
        robots({ index: true }),
      )
      expect(result).toHaveLength(3)
    })

    it('should deduplicate by title', () => {
      const result = mergeMeta(title('Title 1'), title('Title 2'))
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ title: 'Title 2' })
    })

    it('should deduplicate by name attribute', () => {
      const result = mergeMeta(
        description('Description 1'),
        description('Description 2'),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'description',
        content: 'Description 2',
      })
    })

    it('should deduplicate by property attribute', () => {
      const result = mergeMeta(
        openGraph({ title: 'Title 1' }),
        openGraph({ title: 'Title 2' }),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ property: 'og:title', content: 'Title 2' })
    })

    it('should preserve order with later values winning', () => {
      const result = mergeMeta(
        [
          { title: 'Title 1' },
          { name: 'description', content: 'Desc 1' },
        ],
        [
          { name: 'description', content: 'Desc 2' },
          { name: 'keywords', content: 'a, b, c' },
        ],
      )
      expect(result).toEqual([
        { title: 'Title 1' },
        { name: 'description', content: 'Desc 2' },
        { name: 'keywords', content: 'a, b, c' },
      ])
    })

    it('should handle null and undefined sources', () => {
      const result = mergeMeta(title('Title'), null, undefined, description('Desc'))
      expect(result).toHaveLength(2)
    })

    it('should deduplicate charset', () => {
      const result = mergeMeta(charset(), charset())
      expect(result).toHaveLength(1)
    })

    it('should deduplicate canonical links', () => {
      const result = mergeMeta(
        canonical('https://example.com/1'),
        canonical('https://example.com/2'),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        tagName: 'link',
        rel: 'canonical',
        href: 'https://example.com/2',
      })
    })
  })

  describe('mergeMetaWithOptions', () => {
    it('should use first-wins strategy', () => {
      const result = mergeMetaWithOptions(
        { strategy: 'first-wins' },
        title('Title 1'),
        title('Title 2'),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ title: 'Title 1' })
    })

    it('should use append strategy (no deduplication)', () => {
      const result = mergeMetaWithOptions(
        { strategy: 'append' },
        title('Title 1'),
        title('Title 2'),
      )
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ title: 'Title 1' })
      expect(result[1]).toEqual({ title: 'Title 2' })
    })
  })
})

describe('Convenience Functions', () => {
  describe('baseMeta', () => {
    it('should create a complete set of base meta tags', () => {
      const result = baseMeta({
        title: 'My Site',
        description: 'Site description',
        url: 'https://example.com',
        image: 'https://example.com/og.jpg',
      })

      // Should include charset
      expect(result).toContainEqual({ charSet: 'utf-8' })

      // Should include viewport
      expect(result).toContainEqual({
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      })

      // Should include title
      expect(result).toContainEqual({ title: 'My Site' })

      // Should include description
      expect(result).toContainEqual({
        name: 'description',
        content: 'Site description',
      })

      // Should include Open Graph tags
      expect(result).toContainEqual({
        property: 'og:title',
        content: 'My Site',
      })
      expect(result).toContainEqual({
        property: 'og:description',
        content: 'Site description',
      })
      expect(result).toContainEqual({
        property: 'og:image',
        content: 'https://example.com/og.jpg',
      })

      // Should include Twitter Card
      expect(result).toContainEqual({
        name: 'twitter:card',
        content: 'summary_large_image',
      })

      // Should include canonical
      expect(result).toContainEqual({
        tagName: 'link',
        rel: 'canonical',
        href: 'https://example.com',
      })
    })

    it('should apply title template', () => {
      const result = baseMeta({
        title: 'My Page',
        titleTemplate: '%s | My Site',
        description: 'Description',
      })
      expect(result).toContainEqual({ title: 'My Page | My Site' })
    })

    it('should use summary card when no image provided', () => {
      const result = baseMeta({
        title: 'My Site',
        description: 'Description',
      })
      expect(result).toContainEqual({
        name: 'twitter:card',
        content: 'summary',
      })
    })
  })

  describe('excludeMeta', () => {
    it('should exclude meta by key', () => {
      const meta = [
        { title: 'Title' },
        { name: 'description', content: 'Desc' },
        { property: 'og:title', content: 'OG Title' },
      ]
      const result = excludeMeta(meta, ['title', 'og:title'])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ name: 'description', content: 'Desc' })
    })

    it('should handle twitter keys', () => {
      const meta = [
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'Title' },
        { name: 'description', content: 'Desc' },
      ]
      const result = excludeMeta(meta, ['twitter:card'])
      expect(result).toHaveLength(2)
    })
  })

  describe('pickMeta', () => {
    it('should pick meta by key', () => {
      const meta = [
        { title: 'Title' },
        { name: 'description', content: 'Desc' },
        { property: 'og:title', content: 'OG Title' },
        { property: 'og:image', content: 'https://example.com/img.jpg' },
      ]
      const result = pickMeta(meta, ['title', 'og:title'])
      expect(result).toHaveLength(2)
      expect(result).toContainEqual({ title: 'Title' })
      expect(result).toContainEqual({
        property: 'og:title',
        content: 'OG Title',
      })
    })
  })
})

describe('Composability', () => {
  it('should allow spreading multiple helpers into meta array', () => {
    const meta = [
      ...charset(),
      ...viewport(),
      ...title('My Page'),
      ...description('Description'),
      ...robots({ index: true, follow: true }),
      ...openGraph({ title: 'My Page', type: 'website' }),
      ...twitter({ card: 'summary' }),
    ]
    expect(meta.length).toBeGreaterThan(5)
  })

  it('should compose JSON-LD with regular meta without conflicts', () => {
    const meta = mergeMeta(
      baseMeta({
        title: 'Product Page',
        description: 'A great product',
        url: 'https://example.com/product',
        image: 'https://example.com/product.jpg',
      }),
      jsonLdProduct({
        name: 'Great Product',
        offers: {
          '@type': 'Offer',
          price: 99.99,
          priceCurrency: 'USD',
        },
      }),
    )
    // Should have both regular meta and JSON-LD
    const jsonLdMeta = meta.find((m) => 'script:ld+json' in m)
    expect(jsonLdMeta).toBeDefined()
    expect(meta).toContainEqual({ title: 'Product Page' })
  })

  it('should allow multiple JSON-LD scripts', () => {
    const meta = mergeMeta(
      jsonLdWebsite({ name: 'My Site', url: 'https://example.com' }),
      jsonLdOrganization({ name: 'My Org' }),
    )
    const jsonLdMetas = meta.filter((m) => 'script:ld+json' in m)
    // With default deduplication, JSON-LD with same @type would be deduplicated
    // Different @types should not be deduplicated
    expect(jsonLdMetas.length).toBe(2)
  })
})
