import { describe, expect, it } from 'vitest'
import { ModuleAnalysis, buildSummary, parseModule } from '../src/compiler'
import type { RecognizerTable } from '../src/compiler'

const TABLE: RecognizerTable = {
  factories: {
    'toy-start': { createServerFn: 'serverFn' },
  },
  builderKinds: new Set(['serverFn']),
  terminal: { serverFn: 'serverFn' },
  envOnlyKinds: {},
  startKind: 'start',
  startMembers: {},
}

function summarise(code: string, revision = 'r') {
  const parsed = parseModule(code, { lang: 'ts', path: '/app/m.ts' })
  if (!parsed.ok) {
    throw new Error('parse failed')
  }
  const a = new ModuleAnalysis(parsed.file, parsed.source, {
    path: '/app/m.ts',
  })
  return buildSummary(a, '/app/m.ts', revision, TABLE)
}

describe('export facts', () => {
  it('records the keys of an exported object literal, string keys included', () => {
    const s = summarise(`
      export const options = { component: () => null, 'not-found': 1, loader }
      export const opaque = { ...base }
      export const computed = { [key]: 1 }
    `)
    expect(s.objectKeys).toEqual({
      options: ['component', 'not-found', 'loader'],
    })
    expect(s.exports.opaque).toEqual({ kind: 'local', value: { t: 'unknown' } })
  })

  it('leaves objectKeys out when no export is an object literal', () => {
    expect(summarise('export const a = 1\n').objectKeys).toBeUndefined()
  })

  it('summarises a default export expression, re-exports, namespaces and stars', () => {
    const s = summarise(`
      import { createServerFn } from 'toy-start'
      export default createServerFn()
      export { a as b } from './a'
      export * as ns from './ns'
      export * from './star'
      export type { T } from './types'
      export type U = string
    `)
    expect(s.exports.default).toEqual({
      kind: 'local',
      value: expect.objectContaining({ t: 'builder', kind: 'serverFn' }),
    })
    expect(s.exports.b).toEqual({
      kind: 'reExport',
      specifier: './a',
      fromName: 'a',
    })
    expect(s.exports.ns).toEqual({ kind: 'namespace', specifier: './ns' })
    expect(s.stars).toEqual(['./star'])
    expect(Object.keys(s.exports).sort()).toEqual(['b', 'default', 'ns'])
    expect(s.hasImportOrExport).toBe(true)
  })

  it('digests what importers observe: not positions, revisions or local code', () => {
    const base = summarise(`
      export const options = { a: 1 }
      export const fn = () => 1
    `)
    const moved = summarise(
      `
      // a comment moves every position
      const local = 2
      export const fn = () => 2
      export const options = { a: 1 }
    `,
      'other-revision',
    )
    expect(moved.digest).toBe(base.digest)
    expect(moved.rawRevision).toBe('other-revision')

    const keys = summarise(`
      export const options = { a: 1, b: 2 }
      export const fn = () => 1
    `)
    expect(keys.digest).not.toBe(base.digest)
    const star = summarise(`
      export const options = { a: 1 }
      export const fn = () => 1
      export * from './more'
    `)
    expect(star.digest).not.toBe(base.digest)
  })
})
