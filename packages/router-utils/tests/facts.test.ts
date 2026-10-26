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
