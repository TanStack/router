import { describe, expect, it } from 'vitest'
import {
  deriveId,
  identify,
  langFromId,
  revision,
  siblingSpecifier,
} from '../src/compiler'

describe('identity', () => {
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

  it("gives an asset query (`?raw`, `?url`, `?worker`) no language: its module is not the file's code", () => {
    expect(langFromId('/app/page.tsx?raw')).toBeNull()
    expect(langFromId('/app/page.ts?v=1&url')).toBeNull()
    expect(langFromId('/app/worker.ts?worker')).toBeNull()
    expect(langFromId('/app/esbuild.wasm?url')).toBeNull()
    // the worker's own code is code
    expect(langFromId('/app/worker.ts?worker_file&type=module')).toBe('ts')
    expect(langFromId('/app/page.tsx?rawish')).toBe('tsx')
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

  it('keeps a trailing language key of a foreign query last', () => {
    const sfc = '/app/Page.vue?vue&type=script&lang.ts'
    const handler = deriveId(sfc, { kind: 'handler', value: '' })
    expect(handler).toBe(
      '/app/Page.vue?vue&type=script&tss-serverfn-handler&lang.ts',
    )
    expect(identify(handler)).toMatchObject({
      canonicalId: sfc,
      derived: { kind: 'handler', value: '' },
      lang: 'ts',
    })
    expect(
      deriveId('/app/Page.vue?lang.tsx#f', { kind: 'split', value: 'a' }),
    ).toBe('/app/Page.vue?tsr-split=a&lang.tsx#f')
    // `lang` with a value is an ordinary key
    expect(deriveId('/app/x.ts?lang=ts', { kind: 'handler', value: '' })).toBe(
      '/app/x.ts?lang=ts&tss-serverfn-handler',
    )
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

  // A project path may carry `#`, spaces, `%` and non-ASCII characters;
  // Vite and Rspack hand such ids with the characters as they are. A `#` is
  // a URL fragment only after the query.
  it('keeps a # of the path and reads a fragment only after the query', () => {
    const plain = identify('/home/me/C#/project #2/src/routes/a.tsx')
    expect(plain.path).toBe('/home/me/C#/project #2/src/routes/a.tsx')
    expect(plain.canonicalId).toBe('/home/me/C#/project #2/src/routes/a.tsx')
    expect(plain.lang).toBe('tsx')
    expect(plain.derived).toBeNull()

    const split = identify('/home/me/C#/src/a.tsx?tsr-split=component')
    expect(split.path).toBe('/home/me/C#/src/a.tsx')
    expect(split.canonicalId).toBe('/home/me/C#/src/a.tsx')
    expect(split.derived).toEqual({ kind: 'split', value: 'component' })
    expect(split.lang).toBe('tsx')
    expect(
      deriveId('/home/me/C#/src/a.tsx', { kind: 'split', value: 'component' }),
    ).toBe('/home/me/C#/src/a.tsx?tsr-split=component')
    expect(
      siblingSpecifier('/home/me/C#/src/a#b.tsx?tsr-split=component'),
    ).toBe('./a#b.tsx?tsr-split=component')

    const fragment = identify(
      '/app/page.tsx?flavour=b&tsr-split=component#frag',
    )
    expect(fragment.path).toBe('/app/page.tsx')
    expect(fragment.canonicalId).toBe('/app/page.tsx?flavour=b#frag')
    expect(fragment.derived).toEqual({ kind: 'split', value: 'component' })
    expect(
      deriveId('/app/page.tsx?flavour=b#frag', {
        kind: 'split',
        value: 'component',
      }),
    ).toBe('/app/page.tsx?flavour=b&tsr-split=component#frag')

    for (const dir of [
      '/home/me/my app (2)+',
      '/home/me/caf\u00e9 \u65e5\u672c\u8a9e',
      '/home/me/100%',
    ]) {
      const id = identify(`${dir}/src/a.tsx`)
      expect(id.path).toBe(`${dir}/src/a.tsx`)
      expect(id.lang).toBe('tsx')
    }
  })

  it('revision is stable and content-only', () => {
    expect(revision('a')).toBe(revision('a'))
    expect(revision('a')).not.toBe(revision('b'))
    expect(revision('a')).toHaveLength(22)
  })
})
