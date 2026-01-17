import { describe, expect, it } from 'vitest'
import {
  meta,
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
} from '../src/builders'

describe('Core Builders', () => {
  describe('title', () => {
    it('should create a title descriptor', () => {
      const result = title('My Page')
      expect(result).toEqual([{ title: 'My Page' }])
    })

    it('should apply template to title', () => {
      const result = title('My Page', '%s | My Site')
      expect(result).toEqual([{ title: 'My Page | My Site' }])
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

describe('SEO Builders', () => {
  describe('robots', () => {
    it('should return empty array for empty config', () => {
      const result = robots({})
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

    it('should include maxImagePreview', () => {
      const result = robots({
        maxImagePreview: 'large',
      })
      expect(result).toEqual([
        {
          name: 'robots',
          content: 'max-image-preview:large',
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
        { lang: 'en', href: 'https://example.com/en/page' },
        { lang: 'es', href: 'https://example.com/es/page' },
        { lang: 'x-default', href: 'https://example.com/page' },
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
})

describe('Open Graph Builder', () => {
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

  it('should handle string images', () => {
    const result = openGraph({
      image: 'https://example.com/image.jpg',
    })
    expect(result).toEqual([
      { property: 'og:image', content: 'https://example.com/image.jpg' },
    ])
  })

  it('should handle image objects with dimensions', () => {
    const result = openGraph({
      image: {
        url: 'https://example.com/og.jpg',
        width: 1200,
        height: 630,
        alt: 'OG Image',
      },
    })
    expect(result).toEqual([
      { property: 'og:image', content: 'https://example.com/og.jpg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'OG Image' },
    ])
  })

  it('should handle images array', () => {
    const result = openGraph({
      images: [
        'https://example.com/image1.jpg',
        { url: 'https://example.com/image2.jpg', width: 800 },
      ],
    })
    expect(result).toContainEqual({
      property: 'og:image',
      content: 'https://example.com/image1.jpg',
    })
    expect(result).toContainEqual({
      property: 'og:image',
      content: 'https://example.com/image2.jpg',
    })
    expect(result).toContainEqual({
      property: 'og:image:width',
      content: '800',
    })
  })

  it('should include optional properties', () => {
    const result = openGraph({
      url: 'https://example.com',
      siteName: 'My Site',
      locale: 'en_US',
    })
    expect(result).toContainEqual({
      property: 'og:url',
      content: 'https://example.com',
    })
    expect(result).toContainEqual({
      property: 'og:site_name',
      content: 'My Site',
    })
    expect(result).toContainEqual({
      property: 'og:locale',
      content: 'en_US',
    })
  })
})

describe('Twitter Builder', () => {
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
      { name: 'twitter:title', content: 'My Page' },
      { name: 'twitter:description', content: 'Page description' },
      { name: 'twitter:image', content: 'https://example.com/twitter.jpg' },
      { name: 'twitter:site', content: '@mysite' },
      { name: 'twitter:creator', content: '@author' },
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

  it('should only include provided properties', () => {
    const result = twitter({
      card: 'summary',
    })
    expect(result).toEqual([{ name: 'twitter:card', content: 'summary' }])
  })
})

describe('Utility Builders', () => {
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
})

describe('meta namespace', () => {
  it('should export all builders through namespace', () => {
    expect(meta.title).toBe(title)
    expect(meta.description).toBe(description)
    expect(meta.charset).toBe(charset)
    expect(meta.viewport).toBe(viewport)
    expect(meta.robots).toBe(robots)
    expect(meta.canonical).toBe(canonical)
    expect(meta.alternate).toBe(alternate)
    expect(meta.openGraph).toBe(openGraph)
    expect(meta.twitter).toBe(twitter)
    expect(meta.themeColor).toBe(themeColor)
    expect(meta.verification).toBe(verification)
  })

  it('should allow composing via namespace', () => {
    const result = [
      ...meta.charset(),
      ...meta.viewport(),
      ...meta.title('My Page'),
      ...meta.description('Description'),
    ]
    expect(result).toHaveLength(4)
    expect(result).toContainEqual({ charSet: 'utf-8' })
    expect(result).toContainEqual({ title: 'My Page' })
  })
})
