import { describe, expect, it } from 'vitest'
import { buildMetaTags, dedupByLastKey } from '../src'

describe('dedupByLastKey', () => {
  it('keeps the last occurrence of each keyed entry', () => {
    const items = [
      { key: 'canonical', href: '/first' },
      { key: 'canonical', href: '/second' },
      { key: 'canonical', href: '/third' },
    ]
    expect(dedupByLastKey(items)).toEqual([{ key: 'canonical', href: '/third' }])
  })

  it('preserves keyless entries while deduplicating keyed ones', () => {
    const items = [
      { href: '/favicon.ico' },
      { key: 'canonical', href: '/fallback' },
      { href: '/another-keyless' },
      { key: 'canonical', href: '/resolved' },
    ]
    expect(dedupByLastKey(items)).toEqual([
      { href: '/favicon.ico' },
      { href: '/another-keyless' },
      { key: 'canonical', href: '/resolved' },
    ])
  })

  it('deduplicates each key independently', () => {
    const items = [
      { key: 'canonical', href: '/canonical-old' },
      { key: 'alt-es', href: '/alt-old' },
      { key: 'canonical', href: '/canonical-new' },
      { key: 'alt-es', href: '/alt-new' },
    ]
    expect(dedupByLastKey(items)).toEqual([
      { key: 'canonical', href: '/canonical-new' },
      { key: 'alt-es', href: '/alt-new' },
    ])
  })

  it('returns an empty array unchanged', () => {
    expect(dedupByLastKey([])).toEqual([])
  })

  it('returns a fully keyless array unchanged', () => {
    const items: Array<{ key?: string; href: string }> = [
      { href: '/a' },
      { href: '/b' },
    ]
    expect(dedupByLastKey(items)).toEqual(items)
  })
})

describe('buildMetaTags', () => {
  it('keeps the last meta entry when multiple share the same key', () => {
    const tags = buildMetaTags([
      [
        { name: 'description', content: 'first', key: 'desc' },
        { name: 'description', content: 'last', key: 'desc' },
      ],
    ])
    const metas = tags.filter((t) => t.tag === 'meta')
    expect(metas).toHaveLength(1)
    expect(metas[0]!.attrs).toMatchObject({
      name: 'description',
      content: 'last',
    })
  })

  it('still dedupes by name/property even without a key', () => {
    const tags = buildMetaTags([
      [
        { name: 'description', content: 'first' },
        { name: 'description', content: 'last' },
      ],
    ])
    const metas = tags.filter((t) => t.tag === 'meta')
    expect(metas).toHaveLength(1)
    expect(metas[0]!.attrs).toMatchObject({ content: 'last' })
  })

  it('a failed JSON-LD entry does not reserve its key against a sibling', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const tags = buildMetaTags([
      [
        // Throws inside JSON.stringify and is skipped — its key must NOT block
        // the sibling below.
        { 'script:ld+json': circular as any, key: 'shared' },
        { name: 'description', content: 'survives', key: 'shared' },
      ],
    ])

    expect(tags.some((t) => t.tag === 'script')).toBe(false)
    const meta = tags.find((t) => t.tag === 'meta')
    expect(meta?.attrs).toMatchObject({
      name: 'description',
      content: 'survives',
    })
  })

  it('a parent title that loses to a child does not reserve its key', () => {
    const tags = buildMetaTags([
      // Parent: title + meta sharing a key.
      [
        { title: 'Parent', key: 'shared' },
        { name: 'description', content: 'parent-desc', key: 'shared' },
      ],
      // Child: a title that wins (deeper match takes precedence).
      [{ title: 'Child' }],
    ])

    const title = tags.find((t) => t.tag === 'title')
    expect(title?.children).toBe('Child')

    const meta = tags.find((t) => t.tag === 'meta')
    expect(meta?.attrs).toMatchObject({
      name: 'description',
      content: 'parent-desc',
    })
  })

  it('keys are scoped per output tag type — title, meta, and script:ld+json can share a key', () => {
    const tags = buildMetaTags([
      [
        { title: 'My Page', key: 'shared' },
        { name: 'description', content: 'desc', key: 'shared' },
        {
          'script:ld+json': { '@context': 'https://schema.org' },
          key: 'shared',
        },
      ],
    ])

    expect(tags.find((t) => t.tag === 'title')?.children).toBe('My Page')
    expect(tags.find((t) => t.tag === 'meta')?.attrs).toMatchObject({
      content: 'desc',
    })
    expect(tags.find((t) => t.tag === 'script')?.attrs).toMatchObject({
      type: 'application/ld+json',
    })
  })

  it('HTML-escapes JSON-LD content to prevent XSS', () => {
    const tags = buildMetaTags([
      [{ 'script:ld+json': { name: '</script><script>alert(1)</script>' } }],
    ])
    const ldScript = tags.find((t) => t.tag === 'script')!
    expect(ldScript.children).not.toContain('</script>')
    expect(ldScript.children).toContain('\\u003c/script')
  })

  it('appends a csp-nonce meta tag and propagates the nonce to meta attrs', () => {
    const tags = buildMetaTags(
      [[{ name: 'description', content: 'hello' }]],
      'abc123',
    )

    const descMeta = tags.find(
      (t) => t.tag === 'meta' && t.attrs?.name === 'description',
    )!
    expect(descMeta.attrs).toMatchObject({ nonce: 'abc123' })

    const cspMeta = tags.find(
      (t) => t.tag === 'meta' && t.attrs?.property === 'csp-nonce',
    )!
    expect(cspMeta.attrs).toMatchObject({ content: 'abc123' })
  })
})
