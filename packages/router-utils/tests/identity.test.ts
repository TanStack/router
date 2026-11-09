import { describe, expect, it } from 'vitest'
import {
  EXTRACTED_EXPORT_QUERY_RE,
  SAME_FILE_SPECIFIER_RE,
  deriveId,
  identify,
  isSplitGroupValue,
  langFromId,
  resolveSameFileSpecifier,
  revision,
  sameFileSpecifier,
} from '../src/compiler'
import { pathOfId } from '../src/compiler/identity'

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
    expect(langFromId('/app/page.tsx?raw#a')).toBe('tsx')
  })

  it("`pathOfId` is `identify`'s path for every id shape", () => {
    for (const id of [
      '/app/page.tsx',
      '/app/page.tsx?flavour=b&tsr-split=component',
      '/app/C#/page.tsx',
      '/app/C#/page.tsx?raw#frag',
      '/app/page.tsx?',
      '\0virtual:x',
      '\0virtual:x?side=1',
      'virtual:y?tsr-split=component',
      '/@id/__x00__virtual:z',
    ]) {
      expect(pathOfId(id)).toBe(identify(id).path)
    }
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
    expect(deriveId('/app/page.tsx', { kind: 'hydrate', value: 'h1' })).toBe(
      '/app/page.tsx?tss-hydrate=h1',
    )
    expect(deriveId('/app/page.tsx', { kind: 'provider', value: '' })).toBe(
      '/app/page.tsx?tss-serverfn-split',
    )
    expect(identify('/app/page.tsx?tss-serverfn-split').derived).toEqual({
      kind: 'provider',
      value: '',
    })
    expect(identify('/app/page.tsx?tsr-split=%').derived).toEqual({
      kind: 'split',
      value: '%',
    })
  })

  // The format of the Babel splitter, which apps' chunk naming reads
  // (`/routes/<file>.tsx?tsr-split=<a>---<b>`): a group's options sorted and
  // joined by `---`. The modules it had no counterpart for are named in the
  // same style, after a first key that no route option has.
  it("names a split group as main did: the options joined by '---'", () => {
    const grouped = deriveId('/app/page.tsx', {
      kind: 'split',
      value: 'component~loader',
    })
    expect(grouped).toBe('/app/page.tsx?tsr-split=component---loader')
    expect(identify(grouped).derived).toEqual({
      kind: 'split',
      value: 'component~loader',
    })
  })

  it("names a shared module after the options of the groups needing it, after 'shared'", () => {
    // the groups `component~loader` and `errorComponent`, and a Hydrate chunk
    const shared = deriveId('/app/page.tsx?flavour=b', {
      kind: 'shared',
      value: 'errorComponent+component~loader+a1_0123456789',
    })
    expect(shared).toBe(
      '/app/page.tsx?flavour=b&tsr-split=shared---a1_0123456789---component---errorComponent---loader',
    )
    const parsed = identify(shared)
    expect(parsed.canonicalId).toBe('/app/page.tsx?flavour=b')
    expect(parsed.derived?.kind).toBe('shared')
    // the id it parses to is the id
    expect(deriveId(parsed.canonicalId, parsed.derived!)).toBe(shared)
  })

  it('tells a split group value from a shared or an extracted-export value of the same key', () => {
    for (const base of [
      '/app/page.tsx',
      '/app/Page.vue?vue&type=script&lang.ts',
    ]) {
      for (const q of [
        { kind: 'split', value: 'component' },
        { kind: 'split', value: 'component~loader' },
        { kind: 'shared', value: 'component+errorComponent' },
        { kind: 'shared', value: 'component~errorComponent' },
        ...[
          'Card',
          'a---b',
          'shared',
          'export',
          'default',
          '',
          'a+b',
          'x&y=z',
          'é',
        ].map((value) => ({ kind: 'export', value }) as const),
      ] as const) {
        const id = deriveId(base, q)
        const value = new URLSearchParams(id.slice(id.indexOf('?') + 1)).get(
          'tsr-split',
        )!
        expect(isSplitGroupValue(value), id).toBe(q.kind === 'split')
      }
    }
  })

  it("names an extracted export after 'export', anything but a word character percent-encoded", () => {
    expect(deriveId('/app/page.tsx', { kind: 'export', value: 'Card' })).toBe(
      '/app/page.tsx?tsr-split=export---Card',
    )
    for (const [name, printed] of [
      ['a/b.css!é', 'export---a%2fb%2ecss%21%c3%a9'],
      ['a---b', 'export---a%2d%2d%2db'],
      ['a~b+c', 'export---a%7eb%2bc'],
      ['$x_1', 'export---$x_1'],
      ['a&b%?#c', 'export---a%26b%25%3f%23c'],
    ] as const) {
      const id = deriveId('/app/page.tsx', { kind: 'export', value: name })
      expect(id).toBe(`/app/page.tsx?tsr-split=${printed}`)
      expect(identify(id).derived).toEqual({ kind: 'export', value: name })
    }
    expect(EXTRACTED_EXPORT_QUERY_RE.test('?tsr-split=export---Card')).toBe(
      true,
    )
    expect(EXTRACTED_EXPORT_QUERY_RE.test('?x=1&tsr-split=export---a')).toBe(
      true,
    )
    expect(EXTRACTED_EXPORT_QUERY_RE.test('?tsr-split=component')).toBe(false)
    expect(
      EXTRACTED_EXPORT_QUERY_RE.test('?tsr-split=shared---component'),
    ).toBe(false)
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

  // An output imports another output of its file by the file's absolute
  // path, as main did; the `#` of a project path (`C#`, `project #2`) is
  // escaped as webpack-family requests read it (`\0#`), and the Vite hosts
  // resolve such a specifier only for the importer's own file (a browser
  // URL `/src/…?tsr-split=…` is Vite's).
  it("imports an output of the importer's own file by its absolute path", () => {
    expect(
      sameFileSpecifier('/app/dir/page.tsx?flavour=b&tsr-split=component'),
    ).toBe('/app/dir/page.tsx?flavour=b&tsr-split=component')
    expect(sameFileSpecifier('/app/dir/page.tsx')).toBe('/app/dir/page.tsx')
    expect(
      sameFileSpecifier('/home/me/C#/src/a#b.tsx?tsr-split=component#frag'),
    ).toBe('/home/me/C\0#/src/a\0#b.tsx?tsr-split=component#frag')
    expect(sameFileSpecifier('C:/Users/me/C#/src/a.tsx?tss-hydrate=h1')).toBe(
      'C:/Users/me/C\0#/src/a.tsx?tss-hydrate=h1',
    )

    const importer = '/home/me/C#/src/a.tsx?tsr-split=component'
    for (const target of [
      '/home/me/C#/src/a.tsx?tsr-split=shared---component---loader',
      '/home/me/C#/src/a.tsx',
      '/home/me/C#/src/a.tsx?tss-hydrate=h1',
    ]) {
      const specifier = sameFileSpecifier(target)
      expect(SAME_FILE_SPECIFIER_RE.test(specifier)).toBe(true)
      expect(resolveSameFileSpecifier(specifier, importer)).toBe(target)
      expect(resolveSameFileSpecifier(specifier, '/home/me/C#/src/a.tsx')).toBe(
        target,
      )
    }
    // another file, a browser URL, no importer: not ours to resolve
    expect(
      resolveSameFileSpecifier(
        '/home/me/C#/src/b.tsx?tsr-split=component',
        importer,
      ),
    ).toBeNull()
    expect(
      resolveSameFileSpecifier(
        '/src/a.tsx?tsr-split=component',
        '/app/src/a.tsx',
      ),
    ).toBeNull()
    expect(
      resolveSameFileSpecifier('/app/src/a.tsx?tsr-split=component', undefined),
    ).toBeNull()
    expect(
      resolveSameFileSpecifier('./b.tsx?tsr-split=component', '/app/src/a.tsx'),
    ).toBeNull()
    // a specifier of ours carries an owned key or an escaped `#`
    expect(SAME_FILE_SPECIFIER_RE.test('/app/src/a.tsx')).toBe(false)
    expect(SAME_FILE_SPECIFIER_RE.test('/app/src/a.tsx?raw')).toBe(false)
  })

  // A `!` separates loaders in a webpack-family request and has no escape:
  // such a path is imported by its basename, relative to its own file.
  it('imports an output of a file under a path with ! by its basename', () => {
    const route = '/home/me/my!app/src/routes/a#b.tsx'
    const chunk = deriveId(route, { kind: 'split', value: 'component~loader' })
    expect(sameFileSpecifier(chunk)).toBe(
      './a\0#b.tsx?tsr-split=component---loader',
    )
    expect(sameFileSpecifier(route)).toBe('./a\0#b.tsx')
    expect(resolveSameFileSpecifier(sameFileSpecifier(chunk), route)).toBe(
      chunk,
    )
    expect(resolveSameFileSpecifier(sameFileSpecifier(route), chunk)).toBe(
      route,
    )
    // another file of the directory, or below it: not ours
    expect(
      resolveSameFileSpecifier('./other.tsx?tsr-split=component', route),
    ).toBeNull()
    expect(
      resolveSameFileSpecifier('./x/a#b.tsx?tsr-split=component', route),
    ).toBeNull()
  })

  // Windows: Vite's ids have forward slashes (`C:/…`), webpack's resources
  // backslashes; the hosts normalise both to forward slashes.
  it('resolves the own-file specifier of a Windows path to the derived id', () => {
    const route = 'C:/Users/me/app/src/routes/posts.tsx'
    const chunk = deriveId(route, { kind: 'split', value: 'component~loader' })
    expect(chunk).toBe(
      'C:/Users/me/app/src/routes/posts.tsx?tsr-split=component---loader',
    )
    expect(sameFileSpecifier(chunk)).toBe(chunk)
    expect(resolveSameFileSpecifier(sameFileSpecifier(chunk), route)).toBe(
      chunk,
    )
    expect(
      resolveSameFileSpecifier(
        sameFileSpecifier(route),
        'C:\\Users\\me\\app\\src\\routes\\posts.tsx?tsr-split=component---loader',
      ),
    ).toBe(route)
    expect(
      resolveSameFileSpecifier(
        sameFileSpecifier(chunk),
        'C:/Users/me/app/src/routes/other.tsx',
      ),
    ).toBeNull()
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
