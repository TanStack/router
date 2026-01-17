import { describe, expect, it } from 'vitest'
import { createMeta } from '../src/createMeta'

describe('createMeta', () => {
  describe('basic usage', () => {
    it('should create essential meta tags with minimal config', () => {
      const result = createMeta({
        title: 'My Page',
        description: 'A great page',
      })

      // Should include charset
      expect(result).toContainEqual({ charSet: 'utf-8' })

      // Should include viewport
      expect(result).toContainEqual({
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      })

      // Should include title
      expect(result).toContainEqual({ title: 'My Page' })

      // Should include description
      expect(result).toContainEqual({
        name: 'description',
        content: 'A great page',
      })

      // Should include Open Graph basics
      expect(result).toContainEqual({
        property: 'og:title',
        content: 'My Page',
      })
      expect(result).toContainEqual({
        property: 'og:description',
        content: 'A great page',
      })
      expect(result).toContainEqual({
        property: 'og:type',
        content: 'website',
      })

      // Should include Twitter Card
      expect(result).toContainEqual({
        name: 'twitter:card',
        content: 'summary',
      })
      expect(result).toContainEqual({
        name: 'twitter:title',
        content: 'My Page',
      })
      expect(result).toContainEqual({
        name: 'twitter:description',
        content: 'A great page',
      })
    })

    it('should create full meta tags with url and image', () => {
      const result = createMeta({
        title: 'My Page',
        description: 'A great page',
        url: 'https://example.com/page',
        image: 'https://example.com/og.jpg',
      })

      // Should include canonical
      expect(result).toContainEqual({
        tagName: 'link',
        rel: 'canonical',
        href: 'https://example.com/page',
      })

      // Should include OG image
      expect(result).toContainEqual({
        property: 'og:image',
        content: 'https://example.com/og.jpg',
      })

      // Should include OG url
      expect(result).toContainEqual({
        property: 'og:url',
        content: 'https://example.com/page',
      })

      // Should use summary_large_image when image is present
      expect(result).toContainEqual({
        name: 'twitter:card',
        content: 'summary_large_image',
      })

      // Should include twitter image
      expect(result).toContainEqual({
        name: 'twitter:image',
        content: 'https://example.com/og.jpg',
      })
    })
  })

  describe('title template', () => {
    it('should apply title template', () => {
      const result = createMeta({
        title: 'About',
        description: 'About us',
        titleTemplate: '%s | My Site',
      })

      expect(result).toContainEqual({ title: 'About | My Site' })
    })
  })

  describe('image with dimensions', () => {
    it('should include image dimensions when provided', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Description',
        image: {
          url: 'https://example.com/og.jpg',
          width: 1200,
          height: 630,
          alt: 'Alt text',
        },
      })

      expect(result).toContainEqual({
        property: 'og:image',
        content: 'https://example.com/og.jpg',
      })
      expect(result).toContainEqual({
        property: 'og:image:width',
        content: '1200',
      })
      expect(result).toContainEqual({
        property: 'og:image:height',
        content: '630',
      })
      expect(result).toContainEqual({
        property: 'og:image:alt',
        content: 'Alt text',
      })
      expect(result).toContainEqual({
        name: 'twitter:image:alt',
        content: 'Alt text',
      })
    })
  })

  describe('optional properties', () => {
    it('should include siteName when provided', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        siteName: 'My Site',
      })

      expect(result).toContainEqual({
        property: 'og:site_name',
        content: 'My Site',
      })
    })

    it('should include locale when provided', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        locale: 'en_US',
      })

      expect(result).toContainEqual({
        property: 'og:locale',
        content: 'en_US',
      })
    })

    it('should include Twitter site/creator handles', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        twitterSite: '@mysite',
        twitterCreator: '@author',
      })

      expect(result).toContainEqual({
        name: 'twitter:site',
        content: '@mysite',
      })
      expect(result).toContainEqual({
        name: 'twitter:creator',
        content: '@author',
      })
    })
  })

  describe('robots', () => {
    it('should include robots directive when provided', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        robots: { index: false, follow: true, noarchive: true },
      })

      expect(result).toContainEqual({
        name: 'robots',
        content: 'noindex, follow, noarchive',
      })
    })

    it('should handle maxSnippet and maxImagePreview', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        robots: { maxSnippet: 160, maxImagePreview: 'large' },
      })

      expect(result).toContainEqual({
        name: 'robots',
        content: 'max-snippet:160, max-image-preview:large',
      })
    })
  })

  describe('theme color', () => {
    it('should include single theme color', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        themeColor: '#ffffff',
      })

      expect(result).toContainEqual({
        name: 'theme-color',
        content: '#ffffff',
      })
    })

    it('should include light/dark theme colors', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        themeColor: { light: '#ffffff', dark: '#000000' },
      })

      expect(result).toContainEqual({
        name: 'theme-color',
        content: '#ffffff',
        media: '(prefers-color-scheme: light)',
      })
      expect(result).toContainEqual({
        name: 'theme-color',
        content: '#000000',
        media: '(prefers-color-scheme: dark)',
      })
    })
  })

  describe('type', () => {
    it('should default to website type', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
      })

      expect(result).toContainEqual({
        property: 'og:type',
        content: 'website',
      })
    })

    it('should use custom type when provided', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        type: 'article',
      })

      expect(result).toContainEqual({
        property: 'og:type',
        content: 'article',
      })
    })
  })

  describe('Open Graph overrides', () => {
    it('should override inferred values with openGraph config', () => {
      const result = createMeta({
        title: 'Page Title',
        description: 'Page Desc',
        openGraph: {
          title: 'OG Title',
          description: 'OG Desc',
        },
      })

      expect(result).toContainEqual({
        property: 'og:title',
        content: 'OG Title',
      })
      expect(result).toContainEqual({
        property: 'og:description',
        content: 'OG Desc',
      })
    })

    it('should include article properties', () => {
      const result = createMeta({
        title: 'Article',
        description: 'Desc',
        type: 'article',
        openGraph: {
          article: {
            publishedTime: '2024-01-15T08:00:00+00:00',
            modifiedTime: '2024-01-16T10:00:00+00:00',
            section: 'Technology',
            authors: ['John Doe'],
            tags: ['tech', 'news'],
          },
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
        property: 'article:tag',
        content: 'tech',
      })
    })
  })

  describe('Twitter overrides', () => {
    it('should override inferred values with twitter config', () => {
      const result = createMeta({
        title: 'Page Title',
        description: 'Page Desc',
        twitter: {
          title: 'Twitter Title',
          card: 'app',
        },
      })

      expect(result).toContainEqual({
        name: 'twitter:title',
        content: 'Twitter Title',
      })
      expect(result).toContainEqual({
        name: 'twitter:card',
        content: 'app',
      })
    })
  })

  describe('control flags', () => {
    it('should omit charset when charset=false', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        charset: false,
      })

      expect(result).not.toContainEqual({ charSet: 'utf-8' })
    })

    it('should omit viewport when viewport=false', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        viewport: false,
      })

      expect(result).not.toContainEqual({
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      })
    })

    it('should use custom viewport when string provided', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
      })

      expect(result).toContainEqual({
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, maximum-scale=5',
      })
    })

    it('should omit canonical when canonical=false', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        url: 'https://example.com',
        canonical: false,
      })

      expect(result).not.toContainEqual({
        tagName: 'link',
        rel: 'canonical',
        href: 'https://example.com',
      })
    })
  })

  describe('extend', () => {
    it('should append extended meta descriptors', () => {
      const result = createMeta({
        title: 'Page',
        description: 'Desc',
        extend: [
          { name: 'author', content: 'John Doe' },
          { name: 'keywords', content: 'a, b, c' },
        ],
      })

      expect(result).toContainEqual({
        name: 'author',
        content: 'John Doe',
      })
      expect(result).toContainEqual({
        name: 'keywords',
        content: 'a, b, c',
      })
    })
  })
})
