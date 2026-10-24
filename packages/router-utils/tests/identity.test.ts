import { describe, expect, it } from 'vitest'
import {
  deriveId,
  identify,
  langFromId,
  revision,
  siblingSpecifier,
} from '../src/compiler'

describe('identity (R35)', () => {
  it('canonicalises only owned keys and keeps foreign queries verbatim', () => {
    const id = identify('/app/page.tsx?flavour=b&tsr-split=component')
    expect(id.canonicalId).toBe('/app/page.tsx?flavour=b')
    expect(id.path).toBe('/app/page.tsx')
    expect(id.foreignQuery).toBe('flavour=b')
    expect(id.derived).toEqual({ kind: 'split', value: 'component' })
    expect(id.lang).toBe('tsx')
    expect(
      identify('/app/page.tsx?tsr-split=component&flavour=b').canonicalId,
    ).toBe('/app/page.tsx?flavour=b')
    expect(identify('/app/page.tsx?raw').canonicalId).toBe('/app/page.tsx?raw')
    expect(identify('/app/page.tsx?raw').derived).toBeNull()
  })

  it('never canonicalises virtual ids beyond owned keys', () => {
    const v = identify('\0virtual:thing?x=1')
    expect(v.canonicalId).toBe('\0virtual:thing?x=1')
    expect(v.lang).toBeNull()
  })

  it('derives ids by appending the owned key to the existing query', () => {
    expect(
      deriveId('/app/page.tsx?flavour=b', {
        kind: 'split',
        value: 'component',
      }),
    ).toBe('/app/page.tsx?flavour=b&tsr-split=component')
    expect(deriveId('/app/page.tsx', { kind: 'shared', value: 'a+b' })).toBe(
      '/app/page.tsx?tsr-split=shared~a+b',
    )
    expect(deriveId('/app/page.tsx', { kind: 'export', value: 'x' })).toBe(
      '/app/page.tsx?tsr-split=export~x',
    )
    expect(deriveId('/app/page.tsx', { kind: 'hydrate', value: 'h1' })).toBe(
      '/app/page.tsx?tss-hydrate=h1',
    )
    expect(deriveId('/app/page.tsx', { kind: 'provider', value: '' })).toBe(
      '/app/page.tsx?tss-serverfn-split',
    )
    expect(
      identify(
        deriveId('/app/page.tsx?flavour=b', { kind: 'shared', value: 'a+b' }),
      ).derived,
    ).toEqual({ kind: 'shared', value: 'a+b' })
    expect(identify('/app/page.tsx?tss-serverfn-split').derived).toEqual({
      kind: 'provider',
      value: '',
    })
  })

  it('builds sibling specifiers with the query verbatim', () => {
    expect(
      siblingSpecifier('/app/dir/page.tsx?flavour=b&tsr-split=component'),
    ).toBe('./page.tsx?flavour=b&tsr-split=component')
    expect(siblingSpecifier('/app/dir/page.tsx')).toBe('./page.tsx')
  })

  it('derives the language from the id, query-aware', () => {
    expect(langFromId('/a/b.ts?tsr-split=component')).toBe('ts')
    expect(langFromId('/a/b.js')).toBe('jsx')
    expect(langFromId('/a/b.mjs?x')).toBe('jsx')
    expect(langFromId('/a/comp.vue?vue&type=script&lang.ts')).toBe('ts')
    expect(langFromId('/a/comp.vue?vue&type=script&lang.tsx')).toBe('tsx')
    expect(langFromId('/a/style.css')).toBeNull()
    expect(langFromId('/a/comp.vue')).toBeNull()
  })

  it('revision is stable and content-only', () => {
    expect(revision('a')).toBe(revision('a'))
    expect(revision('a')).not.toBe(revision('b'))
    expect(revision('a')).toHaveLength(22)
  })
})
