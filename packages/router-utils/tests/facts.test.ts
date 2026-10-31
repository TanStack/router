import { describe, expect, it } from 'vitest'
import { RawFactsCache } from '../src/compiler'

describe('RawFactsCache', () => {
  it('does not publish a read in flight when the file changes meanwhile', async () => {
    let text = 'export const a = 1\n'
    let release: (() => void) | null = null
    const cache = new RawFactsCache({
      readFile: () =>
        new Promise<string>((resolve) => {
          const current = text
          release = () => resolve(current)
        }),
      loadVirtual: () => Promise.resolve(null),
    })
    const first = cache.get('/app/a.ts', 'client')
    // the file changes while the first read is pending; the host reports it
    text = 'export const a = 2\n'
    cache.markStale('/app/a.ts')
    release!()
    await first
    // the next read sees the new text, not the superseded read's
    const second: Promise<unknown> = cache.get('/app/a.ts', 'client')
    release!()
    const facts = (await second) as { rawRevision: string }
    const superseded = (await first) as { rawRevision: string }
    expect(facts.rawRevision).not.toBe(superseded.rawRevision)
    expect(cache.peekRevision('/app/a.ts')?.revision).toBe(facts.rawRevision)
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(false)
  })

  it('marker(): a target without a marker literal is answered from its text, parsed only when its facts are asked', async () => {
    const files: Record<string, string> = {
      '/app/a.ts': `export const a = 1\n`,
      '/app/s.ts': `import 'server-only'\nexport const s = 1\n`,
      '/app/c.ts': `export const c = 'client-only'\n`,
      '/app/n.ts': `import x from 'client-only'\nexport const n = x\n`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
    })
    expect(await cache.marker('/app/a.ts', 'client')).toBe(null)
    expect(await cache.marker('/app/missing.ts', 'client')).toBe(null)
    expect(cache.stats(false)).toMatchObject({
      rawFacts: 1,
      rawFactsMarkerless: 1,
      factsReads: 2,
    })
    // the scan knew the revision: a compile of the same text publishes its analysis
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(false)
    // the literal is there: parsed, and an import of the marker is the marker
    expect(await cache.marker('/app/s.ts', 'client')).toBe('server-only')
    expect(await cache.marker('/app/n.ts', 'client')).toBe('client-only')
    // the literal is there but it is not an import: no marker (the parse decides)
    expect(await cache.marker('/app/c.ts', 'client')).toBe(null)
    expect(cache.stats(false)).toMatchObject({
      rawFacts: 4,
      rawFactsMarkerless: 1,
    })
    // asked again: no read
    await cache.marker('/app/a.ts', 'client')
    await cache.marker('/app/s.ts', 'client')
    expect(cache.stats(false).factsReads).toBe(8)
    // the full facts of a scanned target are built when asked, once
    const facts = await cache.get('/app/a.ts', 'client')
    expect(Object.keys(facts.summary!.exports)).toEqual(['a'])
    expect(cache.stats(false)).toMatchObject({
      rawFactsMarkerless: 0,
      factsReads: 9,
    })
    // a change makes the next question read again
    files['/app/a.ts'] = `import 'server-only'\nexport const a = 2\n`
    cache.markStale('/app/a.ts')
    expect(await cache.marker('/app/a.ts', 'client')).toBe('server-only')
  })

  it('an opaque module is not parsed: no summary, its marker from the text, target facts when asked', async () => {
    const files: Record<string, string> = {
      '/app/node_modules/lib/index.js': `export const lib = () => 1\n`,
      '/app/node_modules/marked/index.js': `import 'server-only'\nexport const m = 1\n`,
      '/app/src/a.ts': `export const a = 1\n`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      opaque: (path) => path.includes('/node_modules/'),
    })
    const lib = await cache.get('/app/node_modules/lib/index.js', 'client')
    expect(lib.opaque).toBe(true)
    expect(lib.summary).toBe(null)
    expect(await cache.marker('/app/node_modules/lib/index.js', 'client')).toBe(
      null,
    )
    expect(cache.stats(false)).toMatchObject({ rawFacts: 1, rawFactsOpaque: 1 })
    // a mock of it asks for its target facts: parsed then, and kept; the
    // module stays opaque to the summaries (its summary digest never
    // changes: no plan that summarised the package is evicted by the question)
    const before = await cache.digestOf(
      '/app/node_modules/lib/index.js',
      'client',
    )
    const target = await cache.getTarget(
      '/app/node_modules/lib/index.js',
      'client',
    )
    expect(target.opaque).toBeUndefined()
    expect(target.targetFacts.exportNames).toEqual(['lib'])
    expect(
      (await cache.get('/app/node_modules/lib/index.js', 'client')).summary,
    ).toBe(null)
    expect(
      await cache.digestOf('/app/node_modules/lib/index.js', 'client'),
    ).toBe(before)
    expect(
      await cache.targetDigestOf('/app/node_modules/lib/index.js', 'client'),
    ).toBe(target.targetFacts.digest)
    expect(cache.stats(false)).toMatchObject({ rawFacts: 1, rawFactsOpaque: 0 })
    // a marker literal is never opaque: the marker is a parse's finding
    expect(
      await cache.marker('/app/node_modules/marked/index.js', 'client'),
    ).toBe('server-only')
    expect(
      (await cache.get('/app/node_modules/marked/index.js', 'client')).opaque,
    ).toBeUndefined()
    // the app's own modules are never opaque
    expect((await cache.get('/app/src/a.ts', 'client')).opaque).toBeUndefined()
  })

  it('a change or deletion of a file reaches every identity at its path, and the bookkeeping is bounded by the live files', async () => {
    const files: Record<string, string> = {
      '/app/a.ts': 'export const a = 1\n',
      '/app/b.ts': 'export const b = 1\n',
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p.split('?')[0]!] ?? null),
      loadVirtual: () => Promise.resolve(null),
    })
    await cache.get('/app/a.ts', 'client')
    await cache.get('/app/a.ts?flavour=b', 'client')
    await cache.get('/app/b.ts', 'client')
    expect(cache.stats(false)).toMatchObject({ rawFacts: 3, rawFactPaths: 2 })
    cache.markStale('/app/a.ts')
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(true)
    expect(cache.peekRevision('/app/a.ts?flavour=b')?.stale).toBe(true)
    expect(cache.peekRevision('/app/b.ts')?.stale).toBe(false)
    cache.forget('/app/a.ts')
    expect(cache.peekRevision('/app/a.ts')).toBeNull()
    expect(cache.peekRevision('/app/a.ts?flavour=b')).toBeNull()
    expect(cache.stats(false)).toMatchObject({ rawFacts: 1, rawFactPaths: 1 })
    // a missing file's facts are not kept either
    await cache.get('/app/missing.ts', 'client')
    expect(cache.stats(false)).toMatchObject({ rawFacts: 1, rawFactPaths: 1 })
    cache.retain(() => false)
    expect(cache.stats(false)).toMatchObject({ rawFacts: 0, rawFactPaths: 0 })
  })
})

describe('facts of a module that is not JavaScript', () => {
  it('are never read from its file: an asset, a stylesheet or a `?url` import is no module of ours', async () => {
    const read: Array<string> = []
    const loaded: Array<[string, string]> = []
    const cache = new RawFactsCache({
      readFile: (p) => {
        read.push(p)
        return Promise.resolve('export const a = 1\n')
      },
      loadVirtual: (id, env) => {
        loaded.push([id, env])
        return Promise.resolve('export const v = 1\n')
      },
    })
    for (const id of [
      '/app/node_modules/esbuild-wasm/esbuild.wasm?url',
      '/app/styles.css',
      '/app/data.ts?raw',
    ]) {
      const facts = await cache.get(id, 'client')
      expect(facts.summary).toBeNull()
      expect(facts.targetFacts).toMatchObject({
        exists: true,
        esm: false,
        effectful: true,
        exportNames: [],
      })
    }
    expect(read).toEqual([])
    // a module that is JavaScript is read, a virtual one loaded by the
    // environment asking (the one that resolved it)
    expect((await cache.get('/app/a.ts', 'client')).summary).not.toBeNull()
    expect((await cache.get('\0virtual:thing', 'ssr')).summary).not.toBeNull()
    expect(read).toEqual(['/app/a.ts'])
    expect(loaded).toEqual([['\0virtual:thing', 'ssr']])
    expect(cache.stats(false)).toMatchObject({ factsReads: 2 })
  })
})

describe('target facts of a marked module', () => {
  it('counts a marker import neither as an evaluation edge nor as an effect', async () => {
    const files: Record<string, string> = {
      '/app/marked.ts': `import '@tanstack/react-start/server-only'\nexport const secret = () => 'MARK_SECRET'\n`,
      '/app/effects.ts': `import './side-effect'\nexport const x = 1\n`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      markerSpecifiers: {
        '@tanstack/react-start/server-only': 'server-only',
        '@tanstack/react-start/client-only': 'client-only',
      },
    })
    const marked = await cache.get('/app/marked.ts', 'client')
    expect(marked.targetFacts.marker).toBe('server-only')
    expect(marked.targetFacts.imports).toEqual([])
    expect(marked.targetFacts.effectful).toBe(false)
    // a bare import of anything else still is
    const effects = await cache.get('/app/effects.ts', 'client')
    expect(effects.targetFacts.imports).toEqual(['./side-effect'])
    expect(effects.targetFacts.effectful).toBe(true)
  })
})

describe('target facts of an opaque module', () => {
  it('are the parsed ones even when a read of the module is in flight (a change raced the question)', async () => {
    const files: Record<string, string> = {
      '/app/node_modules/lib/index.js': `export const lib = () => 1\n`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      opaque: (path) => path.includes('/node_modules/'),
    })
    await cache.get('/app/node_modules/lib/index.js', 'client')
    cache.markStale('/app/node_modules/lib/index.js')
    // the facts are re-read (opaque again) while a mock asks for the target facts
    const [, target] = await Promise.all([
      cache.get('/app/node_modules/lib/index.js', 'client'),
      cache.getTarget('/app/node_modules/lib/index.js', 'client'),
    ])
    expect(target.targetFacts.exportNames).toEqual(['lib'])
    expect(
      (await cache.getTarget('/app/node_modules/lib/index.js', 'client'))
        .targetFacts.exportNames,
    ).toEqual(['lib'])
  })
})

describe('target facts: own effects', () => {
  // `#__NO_SIDE_EFFECTS__` on a callee the module declares counts whatever
  // the order of the declaration and the call (function declarations are
  // hoisted); Tier 0 and the unit model classify the same statement alike
  it('count a call of a `#__NO_SIDE_EFFECTS__` callee declared before or after it as pure', async () => {
    const files: Record<string, string> = {
      '/app/before.ts': `/* #__NO_SIDE_EFFECTS__ */ function make(s) { return s }\nexport const schema = make({})\n`,
      '/app/after.ts': `export const schema = make({})\n/* #__NO_SIDE_EFFECTS__ */ function make(s) { return s }\n`,
      '/app/plain.ts': `export const schema = make({})\nfunction make(s) { return s }\n`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
    })
    expect(
      (await cache.get('/app/before.ts', 'client')).targetFacts,
    ).toMatchObject({
      effectful: false,
      codeEffects: false,
    })
    expect(
      (await cache.get('/app/after.ts', 'client')).targetFacts,
    ).toMatchObject({
      effectful: false,
      codeEffects: false,
    })
    expect(
      (await cache.get('/app/plain.ts', 'client')).targetFacts,
    ).toMatchObject({
      effectful: true,
      codeEffects: true,
    })
  })
})

describe('target facts: lazy imports', () => {
  it('lists the literal specifiers of import() and require() apart from the evaluation edges', async () => {
    const files: Record<string, string> = {
      '/app/a.ts': `import { b } from './b'
export const load = () => import('./panel')
export const other = () => import(/* webpackChunkName: "x" */ './other')
export const dyn = (name: string) => import(name)
export const cjs = () => require('./legacy')
export const value = b
`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
    })
    const facts = await cache.get('/app/a.ts', 'client')
    expect(facts.targetFacts.imports).toEqual(['./b'])
    expect(facts.targetFacts.lazyImports).toEqual([
      './panel',
      './other',
      './legacy',
    ])
  })
})

describe('facts of a file that stops parsing', () => {
  it('keeps the last facts the file parsed to, until it parses again', async () => {
    const files: Record<string, string> = {
      '/app/a.ts': 'export const a = 1\n',
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
    })
    const parsed = await cache.get('/app/a.ts', 'client')
    expect(parsed.targetFacts.exportNames).toEqual(['a'])
    // the file is saved half-written: it does not parse
    files['/app/a.ts'] = 'export const a = 1\nconst = ;\n'
    cache.markStale('/app/a.ts')
    const broken = await cache.get('/app/a.ts', 'client')
    expect(broken.targetFacts.digest).toBe(parsed.targetFacts.digest)
    expect(broken.summary?.digest).toBe(parsed.summary?.digest)
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(false)
    // parsing again with other exports: the facts follow the file
    files['/app/a.ts'] = 'export const b = 1\n'
    cache.markStale('/app/a.ts')
    const fixed = await cache.get('/app/a.ts', 'client')
    expect(fixed.targetFacts.exportNames).toEqual(['b'])
    expect(fixed.targetFacts.digest).not.toBe(parsed.targetFacts.digest)
  })

  it('a file that never parsed has unknown facts', async () => {
    const cache = new RawFactsCache({
      readFile: () => Promise.resolve('const = ;\n'),
      loadVirtual: () => Promise.resolve(null),
    })
    const facts = await cache.get('/app/a.ts', 'client')
    expect(facts.summary).toBeNull()
    expect(facts.targetFacts.esm).toBe(false)
  })
})
