import { describe, expect, test } from 'vitest'

import {
  dedupePatterns,
  stripViteQuery,
} from '../../src/import-protection-plugin/utils'
import type { SourceMapLike } from '../../src/import-protection-plugin/sourceLocation'
import { pickOriginalCodeFromSourcesContent } from '../../src/import-protection-plugin/sourceLocation'

describe('dedupePatterns', () => {
  test('dedupes strings and preserves first occurrence order', () => {
    expect(dedupePatterns(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })

  test('dedupes regexes by toString() and preserves first occurrence order', () => {
    const a1 = /foo/i
    const a2 = /foo/i
    const b = /bar/

    const out = dedupePatterns([a1, b, a2, b])
    expect(out).toEqual([a1, b])
  })

  test('treats strings and regexes as distinct keys', () => {
    const out = dedupePatterns(['/foo/i', /foo/i, '/foo/i', /foo/i])
    expect(out).toEqual(['/foo/i', /foo/i])
  })
})

describe('stripViteQuery', () => {
  test('strips ?query params', () => {
    expect(stripViteQuery('/a/b.ts?x=1')).toBe('/a/b.ts')
  })

  test('strips #fragments', () => {
    expect(stripViteQuery('/a/b.ts#hash')).toBe('/a/b.ts')
  })

  test('strips whichever comes first of ? and #', () => {
    expect(stripViteQuery('/a/b.ts?x=1#hash')).toBe('/a/b.ts')
    expect(stripViteQuery('/a/b.ts#hash?x=1')).toBe('/a/b.ts')
  })
})

describe('pickOriginalCodeFromSourcesContent', () => {
  test('picks exact matching source by path', () => {
    const map = {
      version: 3,
      sources: ['src/a.ts', 'src/b.ts'],
      names: [],
      mappings: '',
      sourcesContent: ['A', 'B'],
    } satisfies SourceMapLike

    const picked = pickOriginalCodeFromSourcesContent(
      map,
      '/project/src/b.ts',
      '/project',
    )

    expect(picked).toBe('B')
  })

  test('falls back to sourcesContent[0] when no match exists', () => {
    const map = {
      version: 3,
      sources: ['src/a.ts'],
      names: [],
      mappings: '',
      sourcesContent: ['A'],
    } satisfies SourceMapLike

    const picked = pickOriginalCodeFromSourcesContent(
      map,
      '/project/src/does-not-exist.ts',
      '/project',
    )

    expect(picked).toBe('A')
  })
})
