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
    const first = cache.get('/app/a.ts')
    // the file changes while the first read is pending; the host reports it
    text = 'export const a = 2\n'
    cache.markStale('/app/a.ts')
    release!()
    await first
    // the next read sees the new text, not the superseded read's
    const second: Promise<unknown> = cache.get('/app/a.ts')
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
      '/app/c.ts': `import x from 'client-only'\nexport const c = x\n`,
    }
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
    })
    expect(await cache.marker('/app/a.ts')).toBe(null)
    expect(await cache.marker('/app/missing.ts')).toBe(null)
    expect(cache.stats(false)).toMatchObject({
      rawFacts: 1,
      rawFactsMarkerless: 1,
      factsReads: 2,
    })
    // the scan knew the revision: a compile of the same text publishes its analysis
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(false)
    // the literal is there: parsed, and a bare marker import is the marker
    expect(await cache.marker('/app/s.ts')).toBe('server-only')
    // the literal is there but it is not a bare import: no marker (the parse decides)
    expect(await cache.marker('/app/c.ts')).toBe(null)
    expect(cache.stats(false)).toMatchObject({
      rawFacts: 3,
      rawFactsMarkerless: 1,
    })
    // asked again: no read
    await cache.marker('/app/a.ts')
    await cache.marker('/app/s.ts')
    expect(cache.stats(false).factsReads).toBe(6)
    // the full facts of a scanned target are built when asked, once
    const facts = await cache.get('/app/a.ts')
    expect(Object.keys(facts.summary!.exports)).toEqual(['a'])
    expect(cache.stats(false)).toMatchObject({
      rawFactsMarkerless: 0,
      factsReads: 7,
    })
    // a change makes the next question read again
    files['/app/a.ts'] = `import 'server-only'\nexport const a = 2\n`
    cache.markStale('/app/a.ts')
    expect(await cache.marker('/app/a.ts')).toBe('server-only')
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
    await cache.get('/app/a.ts')
    await cache.get('/app/a.ts?flavour=b')
    await cache.get('/app/b.ts')
    expect(cache.stats(false)).toMatchObject({ rawFacts: 3, rawFactPaths: 2 })
    cache.markStale('/app/a.ts')
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(true)
    expect(cache.peekRevision('/app/a.ts?flavour=b')?.stale).toBe(true)
    expect(cache.peekRevision('/app/b.ts')?.stale).toBe(false)
    cache.forget('/app/a.ts')
    expect(cache.has('/app/a.ts')).toBe(false)
    expect(cache.has('/app/a.ts?flavour=b')).toBe(false)
    expect(cache.stats(false)).toMatchObject({ rawFacts: 1, rawFactPaths: 1 })
    // a missing file's facts are not kept either
    await cache.get('/app/missing.ts')
    expect(cache.stats(false)).toMatchObject({ rawFacts: 1, rawFactPaths: 1 })
    cache.retain(() => false)
    expect(cache.stats(false)).toMatchObject({ rawFacts: 0, rawFactPaths: 0 })
  })
})

describe('facts of a module that is not JavaScript', () => {
  it('are never read from its file: an asset, a stylesheet or a `?url` import is no module of ours', async () => {
    const read: Array<string> = []
    const cache = new RawFactsCache({
      readFile: (p) => {
        read.push(p)
        return Promise.resolve('export const a = 1\n')
      },
      loadVirtual: () => Promise.resolve('export const v = 1\n'),
    })
    for (const id of [
      '/app/node_modules/esbuild-wasm/esbuild.wasm?url',
      '/app/styles.css',
      '/app/data.ts?raw',
    ]) {
      const facts = await cache.get(id)
      expect(facts.summary).toBeNull()
      expect(facts.targetFacts).toMatchObject({
        exists: true,
        esm: false,
        effectful: true,
        exportNames: [],
      })
    }
    expect(read).toEqual([])
    // a module that is JavaScript is read, a virtual one loaded
    expect((await cache.get('/app/a.ts')).summary).not.toBeNull()
    expect((await cache.get('\0virtual:thing')).summary).not.toBeNull()
    expect(read).toEqual(['/app/a.ts'])
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
    const marked = await cache.get('/app/marked.ts')
    expect(marked.targetFacts.marker).toBe('server-only')
    expect(marked.targetFacts.imports).toEqual([])
    expect(marked.targetFacts.effectful).toBe(false)
    expect(marked.targetFacts.effectProvenance).toBe(null)
    // a bare import of anything else still is
    const effects = await cache.get('/app/effects.ts')
    expect(effects.targetFacts.imports).toEqual(['./side-effect'])
    expect(effects.targetFacts.effectful).toBe(true)
    expect(effects.targetFacts.effectProvenance).toBe('own')
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
    const facts = await cache.get('/app/a.ts')
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
    const parsed = await cache.get('/app/a.ts')
    expect(parsed.targetFacts.exportNames).toEqual(['a'])
    // the file is saved half-written: it does not parse
    files['/app/a.ts'] = 'export const a = 1\nconst = ;\n'
    cache.markStale('/app/a.ts')
    const broken = await cache.get('/app/a.ts')
    expect(broken.targetFacts.digest).toBe(parsed.targetFacts.digest)
    expect(broken.summary?.digest).toBe(parsed.summary?.digest)
    expect(cache.peekRevision('/app/a.ts')?.stale).toBe(false)
    // parsing again with other exports: the facts follow the file
    files['/app/a.ts'] = 'export const b = 1\n'
    cache.markStale('/app/a.ts')
    const fixed = await cache.get('/app/a.ts')
    expect(fixed.targetFacts.exportNames).toEqual(['b'])
    expect(fixed.targetFacts.digest).not.toBe(parsed.targetFacts.digest)
  })

  it('a file that never parsed has unknown facts', async () => {
    const cache = new RawFactsCache({
      readFile: () => Promise.resolve('const = ;\n'),
      loadVirtual: () => Promise.resolve(null),
    })
    const facts = await cache.get('/app/a.ts')
    expect(facts.summary).toBeNull()
    expect(facts.targetFacts.esm).toBe(false)
  })
})
