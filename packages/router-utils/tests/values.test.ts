/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of two Start paths no oracle
 * test reaches yet (builder values read through a destructured binding, an
 * export resolver bounded to some modules); to become start-plugin-core
 * behaviour tests.
 */
import { describe, expect, it } from 'vitest'
import { ModuleAnalysis, ValueAnalysis, parseModule } from '../src/compiler'
import { MemoryHost } from './helpers'
import type { Planner, RecognizerTable } from '../src/compiler'

const TABLE: RecognizerTable = {
  factories: {
    'toy-start': {
      createServerFn: 'serverFn',
      createIsomorphicFn: 'isoFn',
      createServerOnlyFn: 'serverOnly',
      createStart: 'start',
    },
  },
  builderKinds: new Set(['serverFn', 'isoFn', 'middleware']),
  terminal: { serverFn: 'serverFn', isoFn: 'isoFn', middleware: 'middleware' },
  envOnlyKinds: { serverOnly: 'server' },
  startKind: 'start',
  startMembers: { createMiddleware: 'middleware' },
}

function analyse(code: string) {
  const parsed = parseModule(code, { lang: 'ts', path: '/app/m.ts' })
  if (!parsed.ok) {
    throw new Error('parse failed')
  }
  return new ModuleAnalysis(parsed.file, parsed.source, { path: '/app/m.ts' })
}

describe('destructuring, sequences, joins and factory bodies', () => {
  const localValues = (code: string) => {
    const a = analyse(code)
    const values = new ValueAnalysis(a.file, {
      table: TABLE,
      resolveImport: (spec, name) =>
        spec === './factory' && name === 'csf'
          ? { t: 'factory', kind: 'serverFn' }
          : { t: 'unknown' },
    })
    return (name: string) => {
      const e = a.exports.find((x) => x.kind === 'local' && x.name === name)
      return e && e.kind === 'local' && e.local !== null
        ? values.valueOfBinding(e.local)
        : null
    }
  }

  it('reads a destructured binding as the member of its initialiser', () => {
    const valueOf = localValues(`
      import * as S from 'toy-start'
      import { createStart } from 'toy-start'
      export const { createServerFn: csf, 'createIsomorphicFn': iso } = S
      export const { createMiddleware } = createStart()
      export const { a: { createServerFn: nested } } = { a: S }
      export const { createServerFn: withDefault = 1 } = S
    `)
    expect(valueOf('csf')).toEqual({ t: 'factory', kind: 'serverFn' })
    expect(valueOf('iso')).toEqual({ t: 'factory', kind: 'isoFn' })
    expect(valueOf('createMiddleware')).toEqual({
      t: 'factory',
      kind: 'middleware',
    })
    expect(valueOf('nested')).toEqual({ t: 'unknown' })
    expect(valueOf('withDefault')).toEqual({ t: 'unknown' })
  })
})

describe('export resolution', () => {
  it('a resolver within some modules leaves a re-export of another unresolved and skips its star, apart from the full memo', async () => {
    const host = new MemoryHost({
      files: {
        '/app/barrel.ts': `export { createServerFn } from './lib/named'\nexport * from './lib/star'\n`,
        '/app/lib/named.ts': `export { createServerFn } from 'toy-start'\n`,
        '/app/lib/star.ts': `export { createServerOnlyFn } from 'toy-start'\n`,
      },
      recognizer: TABLE,
    })
    const seen: Record<string, unknown> = {}
    const planner: Planner = {
      name: 'toy-within',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        const target = (await ctx.resolve('./barrel'))!
        const within = ctx.resolver.within((id) => !id.includes('/lib/'))
        seen.withinNamed = await within.resolve(target, 'createServerFn')
        seen.withinStar = await within.resolve(target, 'createServerOnlyFn')
        seen.named = await ctx.resolver.resolve(target, 'createServerFn')
        seen.star = await ctx.resolver.resolve(target, 'createServerOnlyFn')
      },
      plan() {},
    }
    await host.compile('/app/m.ts', [planner], {
      code: `import { createServerFn } from './barrel'\nexport const x = createServerFn\n`,
    })
    expect(seen).toMatchObject({
      withinNamed: {
        k: 'found',
        value: { t: 'importRef', specifier: './lib/named' },
      },
      withinStar: { k: 'absent' },
      named: { k: 'found', value: { t: 'factory', kind: 'serverFn' } },
      star: { k: 'found', value: { t: 'factory', kind: 'serverOnly' } },
    })
  })
})
