import { describe, expect, it } from 'vitest'
import { mergeMeta, mergeMetaWith, excludeMeta, pickMeta } from '../src/merge'
import { title, description, charset, canonical, openGraph, twitter } from '../src/builders'

describe('mergeMeta', () => {
  it('should merge multiple meta arrays', () => {
    const result = mergeMeta(
      title('Page Title'),
      description('Description'),
      charset(),
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

  it('should deduplicate JSON-LD by @type', () => {
    const result = mergeMeta(
      [{ 'script:ld+json': { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site 1' } }],
      [{ 'script:ld+json': { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site 2' } }],
    )
    expect(result).toHaveLength(1)
    expect((result[0] as any)['script:ld+json'].name).toBe('Site 2')
  })

  it('should not deduplicate different JSON-LD types', () => {
    const result = mergeMeta(
      [{ 'script:ld+json': { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site' } }],
      [{ 'script:ld+json': { '@context': 'https://schema.org', '@type': 'Organization', name: 'Org' } }],
    )
    expect(result).toHaveLength(2)
  })

  it('should deduplicate JSON-LD by @id when present', () => {
    const result = mergeMeta(
      [{ 'script:ld+json': { '@context': 'https://schema.org', '@type': 'WebSite', '@id': 'site', name: 'Site 1' } }],
      [{ 'script:ld+json': { '@context': 'https://schema.org', '@type': 'WebSite', '@id': 'site', name: 'Site 2' } }],
    )
    expect(result).toHaveLength(1)
    expect((result[0] as any)['script:ld+json'].name).toBe('Site 2')
  })
})

describe('mergeMetaWith', () => {
  it('should use first-wins strategy', () => {
    const result = mergeMetaWith(
      { strategy: 'first-wins' },
      title('Title 1'),
      title('Title 2'),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ title: 'Title 1' })
  })

  it('should use append strategy (no deduplication)', () => {
    const result = mergeMetaWith(
      { strategy: 'append' },
      title('Title 1'),
      title('Title 2'),
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ title: 'Title 1' })
    expect(result[1]).toEqual({ title: 'Title 2' })
  })

  it('should use last-wins strategy by default', () => {
    const result = mergeMetaWith(
      {},
      title('Title 1'),
      title('Title 2'),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ title: 'Title 2' })
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
    expect(result).not.toContainEqual({
      name: 'twitter:card',
      content: 'summary',
    })
  })

  it('should handle description key normalization', () => {
    const meta = [
      { title: 'Title' },
      { name: 'description', content: 'Desc' },
    ]
    const result = excludeMeta(meta, ['description'])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ title: 'Title' })
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

  it('should pick description with normalized key', () => {
    const meta = [
      { title: 'Title' },
      { name: 'description', content: 'Desc' },
    ]
    const result = pickMeta(meta, ['description'])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'description', content: 'Desc' })
  })

  it('should pick twitter keys', () => {
    const meta = [
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'Title' },
      { name: 'description', content: 'Desc' },
    ]
    const result = pickMeta(meta, ['twitter:card', 'twitter:title'])
    expect(result).toHaveLength(2)
  })
})

describe('Composability', () => {
  it('should allow spreading multiple helpers into meta array', () => {
    const meta = [
      ...charset(),
      ...title('My Page'),
      ...description('Description'),
      ...openGraph({ title: 'My Page', type: 'website' }),
      ...twitter({ card: 'summary' }),
    ]
    expect(meta.length).toBeGreaterThan(5)
  })

  it('should compose JSON-LD with regular meta', () => {
    const regularMeta = [
      ...title('Product Page'),
      ...description('A great product'),
    ]
    const jsonLdMeta = [
      { 'script:ld+json': { '@context': 'https://schema.org', '@type': 'Product', name: 'Great Product' } },
    ]
    const result = mergeMeta(regularMeta, jsonLdMeta)

    expect(result).toContainEqual({ title: 'Product Page' })
    expect(result.some((m) => 'script:ld+json' in m)).toBe(true)
  })
})
