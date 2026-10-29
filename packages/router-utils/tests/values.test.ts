import { describe, expect, it } from 'vitest'
import {
  ModuleAnalysis,
  ValueAnalysis,
  applyCall,
  applyMember,
  buildSummary,
  parseModule,
  stampSites,
  stripSites,
} from '../src/compiler'
import { MemoryHost, toySummaryPlanner } from './helpers'
import type { AbstractValue, Planner, RecognizerTable } from '../src/compiler'

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

describe('symbolic value terms', () => {
  it('keeps calls and members of unresolved imports symbolic, in summaries too', () => {
    const a = analyse(`
      import { csf } from './factory'
      import * as F from './factories'
      export const authed = csf().middleware([])
      export const other = F.make().handler(() => 1)
    `)
    const summary = buildSummary(a, TABLE)
    const authed = summary.exports.authed!
    expect(authed.kind).toBe('local')
    if (authed.kind !== 'local') {
      return
    }
    expect(stripSites(authed.value)).toEqual({
      t: 'call',
      callee: {
        t: 'member',
        object: {
          t: 'call',
          callee: { t: 'importRef', specifier: './factory', name: 'csf' },
          args: [],
        },
        name: 'middleware',
      },
      args: [{ t: 'unknown' }],
    })
    const other = summary.exports.other!
    expect(other.kind === 'local' && other.value.t).toBe('call')
  })

  it('reduces a symbolic term once the import is known, stamping link owners', () => {
    const a = analyse(`
      import { csf } from './factory'
      export const authed = csf().middleware([])
    `)
    const summary = buildSummary(a, TABLE)
    const term = (summary.exports.authed as { value: AbstractValue }).value
    const reduce = (v: AbstractValue): AbstractValue => {
      switch (v.t) {
        case 'importRef':
          return { t: 'factory', kind: 'serverFn' }
        case 'member':
          return applyMember(TABLE, reduce(v.object), v.name)
        case 'call':
          return applyCall(
            TABLE,
            reduce(v.callee),
            () => v.args.map((x) => (x === null ? null : reduce(x))),
            v.site,
          )
        default:
          return v
      }
    }
    const reduced = stampSites(reduce(term), '/app/m.ts')
    expect(reduced.t).toBe('builder')
    if (reduced.t !== 'builder') {
      return
    }
    expect(reduced.links.map((l) => l.method)).toEqual(['middleware'])
    expect(reduced.links[0]!.site.canonicalId).toBe('/app/m.ts')
  })

  it('resolves imports through the local analysis callback and a start instance', () => {
    const a = analyse(`
      import { csf } from './factory'
      import { createStart } from 'toy-start'
      const start = createStart()
      export const mw = start.createMiddleware({ type: 'function' })
      export const fn = csf().handler(() => 1)
      export const stub = (x) => x
      export const same = stub(csf())
    `)
    const values = new ValueAnalysis(a.file, {
      table: TABLE,
      resolveImport: (spec, name) =>
        spec === './factory' && name === 'csf'
          ? { t: 'factory', kind: 'serverFn' }
          : { t: 'unknown' },
    })
    const valueOf = (name: string) => {
      const e = a.exports.find((x) => x.kind === 'local' && x.name === name)
      return e && e.kind === 'local' && e.local !== null
        ? values.valueOfBinding(e.local)
        : null
    }
    expect(valueOf('mw')).toMatchObject({ t: 'builder', kind: 'middleware' })
    expect(valueOf('fn')).toMatchObject({ t: 'serverFn' })
    expect(valueOf('same')).toMatchObject({ t: 'builder', kind: 'serverFn' })
  })
})

describe('export resolution', () => {
  it('resolves two names through two star exports concurrently without a false cycle', async () => {
    const host = new MemoryHost({
      files: {
        '/app/start.ts': `export * from './a'\nexport * from './b'\n`,
        '/app/a.ts': `export { createServerFn } from 'toy-start'\n`,
        '/app/b.ts': `export { createServerOnlyFn } from 'toy-start'\n`,
      },
      recognizer: TABLE,
    })
    const seen: Record<string, unknown> = {}
    const planner: Planner = {
      name: 'toy-two-stars',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        const target = (await ctx.resolve('./start'))!
        const [a, b] = await Promise.all([
          ctx.resolver.resolve(target, 'createServerFn'),
          ctx.resolver.resolve(target, 'createServerOnlyFn'),
        ])
        seen.a = a
        seen.b = b
      },
      plan() {},
    }
    await host.compile('/app/start.ts', [planner], {
      code: `import { createServerFn, createServerOnlyFn } from './start'\nexport const x = [createServerFn, createServerOnlyFn]\n`,
    })
    expect(seen.a).toMatchObject({
      k: 'found',
      value: { t: 'factory', kind: 'serverFn' },
    })
    expect(seen.b).toMatchObject({
      k: 'found',
      value: { t: 'factory', kind: 'serverOnly' },
    })
  })
})

describe('known specifiers and planner withdrawal', () => {
  it('serves a synthetic summary for a known package specifier without resolving it', async () => {
    const host = new MemoryHost({
      files: {
        '/app/barrel.ts': `export * from 'toy-start'\n`,
        '/app/user.ts': `import { make } from './barrel'\nexport const run = () => make()\n`,
      },
      recognizer: TABLE,
    })
    const planners: Array<Planner> = [toySummaryPlanner()]
    const out = await host.compile('/app/user.ts', planners)
    expect(out!.facts.planners['toy-summary']).toEqual({ './barrel': 'absent' })
    expect(host.resolveCalls.some((c) => c.specifier === 'toy-start')).toBe(
      false,
    )
    const facts = await host.rawFacts.get('toy-start')
    expect(facts.summary?.exports.createServerFn).toMatchObject({
      kind: 'local',
      value: { t: 'factory', kind: 'serverFn' },
    })
    expect(facts.targetFacts.effectful).toBe(false)
  })

  it('a planner withdrawing in prefetch still records its dependencies (verbatim plan)', async () => {
    const host = new MemoryHost({
      files: {
        '/app/dep.ts': `export const x = 1\n`,
        '/app/user.ts': `import { x } from './dep'\nexport const y = x\n`,
      },
    })
    let planned = 0
    const planner: Planner = {
      name: 'toy-withdraw',
      tier: 1,
      gate: (t0) => t0.hasImportOrExport,
      async prefetch(t0, ctx) {
        for (const imp of t0.imports) {
          await ctx.resolve(imp.specifier)
        }
        return false
      },
      plan() {
        planned++
      },
    }
    const out = await host.compile('/app/user.ts', [planner])
    expect(planned).toBe(0)
    expect(out!.code).toBe(host.files['/app/user.ts'])
    expect(out!.dependencies).toEqual(['/app/dep.ts'])
  })
})
