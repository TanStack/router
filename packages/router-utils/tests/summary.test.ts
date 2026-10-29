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

function summarise(code: string) {
  const parsed = parseModule(code, { lang: 'ts', path: '/app/m.ts' })
  if (!parsed.ok) {
    throw new Error('parse failed')
  }
  const a = new ModuleAnalysis(parsed.file, parsed.source, {
    path: '/app/m.ts',
  })
  return buildSummary(a, TABLE)
}

describe('export facts', () => {
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
  })

  it('digests what importers observe: not positions or local code', () => {
    const base = summarise(`
      export const options = { a: 1 }
      export const fn = () => 1
    `)
    const moved = summarise(`
      // a comment moves every position
      const local = 2
      export const fn = () => 2
      export const options = { a: 1 }
    `)
    expect(moved.digest).toBe(base.digest)

    const star = summarise(`
      export const options = { a: 1 }
      export const fn = () => 1
      export * from './more'
    `)
    expect(star.digest).not.toBe(base.digest)
  })
})
