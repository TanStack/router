// Seeded random rewrite trees (design note 1, §5, widened after the review of
// step 1): random edits of every scope, keep-slices, inserts and claims (of
// sub-regions of two kinds, owned in the env module or a derived output;
// live, dead and read elsewhere; with other text at their place in one output) on
// nested calls, registered in source order, reversed or shuffled. What the
// planners' liveness reports of every name must be what the env module
// holds; in a derived output holding some claimed text, a name it holds is
// live. Text reported erased (calls whole and inside their parentheses) is
// held by neither. Users' runs (self-checks off, as the review's
// generator): what is checked is the rendered text. A claim of a statement's
// unit is not generated (a core test covers it: 'claims on the tree').
import { describe, expect, it, vi } from 'vitest'
import type { PlanContext, Planner } from '../src/compiler'
import type { EditScope, GenFrag, OutputId } from '../src/compiler/rewrite'
import type { RegionId } from '../src/compiler/units'

/** A small seeded generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A module of effect statements of nested calls; every name is an import and occurs once (`c<i>_` callees, `a<i>_` leaves). */
function randomModule(rand: () => number): {
  code: string
  names: Array<string>
} {
  const names: Array<string> = []
  const expr = (depth: number): string => {
    if (depth > 3 || rand() < 0.3) {
      const name = `a${names.length}_`
      names.push(name)
      return name
    }
    const callee = `c${names.length}_`
    names.push(callee)
    const args: Array<string> = []
    const n = Math.floor(rand() * 3) + 1
    for (let i = 0; i < n; i++) {
      args.push(expr(depth + 1))
    }
    return `${callee}(${args.join(', ')})`
  }
  const statements: Array<string> = []
  const count = Math.floor(rand() * 4) + 1
  for (let i = 0; i < count; i++) {
    const callee = `c${names.length}_`
    names.push(callee)
    statements.push(`${callee}(${expr(1)})`)
  }
  return {
    code: `import { ${names.join(', ')} } from 'toy-names'\n${statements.join('\n')}\n`,
    names,
  }
}

interface Call {
  start: number
  end: number
  args: Array<{ start: number; end: number }>
  /** A statement's own call (its claim would take the statement). */
  top: boolean
}

/** What `liveness` reports for one output: of each name, and of each call (whole, inside its parentheses). */
interface Reported {
  live: Map<string, boolean>
  erased: Array<string>
  /** The names whose innermost claimed text the derived output owns (they render there, with its edits). */
  elsewhere: Set<string>
}

/** Edits and claims at random on the calls of the module, then records what `liveness` reports for the env module and the derived one. */
function randomPlanner(
  seed: number,
  reported: Map<'env' | 'other', Reported>,
): Planner {
  return {
    name: 'toy-random',
    tier: 1,
    gate: () => true,
    plan(ctx: PlanContext) {
      const rand = random(seed * 7919 + 1)
      const { t1 } = ctx
      const code = ctx.analysis.source.code
      const other: OutputId = ctx.declareOutput({
        kind: 'split',
        key: 'other',
        derived: { kind: 'split', value: 'other' },
      })
      const calls: Array<Call> = []
      for (const ref of t1.refs.all) {
        if (ref.ctx !== 'callee') {
          continue
        }
        const call = t1.parentOf(t1.nodeAt(ref.range.start)!)!
        if (call.type !== 'CallExpression') {
          continue
        }
        calls.push({
          start: call.start,
          end: call.end,
          args: call.arguments.map((a) => ({ start: a.start, end: a.end })),
          top: t1.parentOf(call)?.type === 'ExpressionStatement',
        })
      }
      const all = [...calls]
      // registration order: source order, reversed, or shuffled
      const order = rand()
      if (order < 0.33) {
        calls.reverse()
      } else if (order < 0.66) {
        for (let i = calls.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1))
          ;[calls[i], calls[j]] = [calls[j]!, calls[i]!]
        }
      }
      const scopes: Array<EditScope> = ['all-outputs', ['env'], [other]]
      const scope = () => scopes[Math.floor(rand() * scopes.length)]!
      let gens = 0
      const claim = (region: RegionId, read: boolean) => {
        const hoisted = ctx.names.alloc(`g${gens++}`)
        const body: Array<GenFrag> = [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ]
        const owner = ctx.rewrites.addGenerated({
          body,
          declares: [hoisted.sym],
          effectful: false,
          anchor: { k: 'end' },
          // (the derived output holds the claimed text it owns)
          home: rand() < 0.3 ? other : 'auto',
          by: 'toy-random',
        })
        if (read) {
          const reader = ctx.names.alloc(`r${gens}`)
          const gen = ctx.rewrites.addGenerated({
            body: [
              {
                k: 'text',
                parts: [
                  'export const ',
                  { sym: reader.sym },
                  ' = () => ',
                  { sym: hoisted.sym },
                  '\n',
                ],
              },
            ],
            declares: [reader.sym],
            effectful: false,
            anchor: { k: 'end' },
            home: 'auto',
            by: 'toy-random',
          })
          ctx.addRoot('env', { t: 'gen', id: gen })
        }
        ctx.rewrites.claim({
          region,
          owner,
          placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
          by: 'toy-random',
        })
      }
      for (const call of calls) {
        const range = { start: call.start, end: call.end }
        const pick = rand()
        if (pick < 0.2) {
          ctx.rewrites.add({
            range,
            body: [{ k: 'text', parts: ['0'] }],
            scope: scope(),
            by: 'toy-random',
          })
        } else if (pick < 0.4) {
          const kept = call.args[Math.floor(rand() * call.args.length)]!
          ctx.rewrites.add({
            range,
            body: [
              { k: 'text', parts: ['k('] },
              { k: 'slice', range: kept },
              { k: 'text', parts: [')'] },
            ],
            scope: scope(),
            by: 'toy-random',
          })
        }
        if (rand() < 0.15) {
          const at = rand() < 0.5 ? call.start : call.end
          ctx.rewrites.add({
            range: { start: at, end: at },
            body: [{ k: 'text', parts: ['/*i*/'] }],
            scope: scope(),
            by: 'toy-random',
          })
        }
        if (call.top) {
          continue
        }
        // (with an edit scoped to some outputs on exactly the claimed
        // region: other text stands at its place there)
        if (rand() < 0.6) {
          continue
        }
        const kind = rand() < 0.5 ? 'nested-chain' : 'custom'
        claim(ctx.region(range, kind), rand() < 0.5)
      }
      for (const o of ['env', 'other'] as const) {
        const view = ctx.liveness(o === 'env' ? 'env' : other)
        const r: Reported = {
          live: new Map(),
          erased: [],
          elsewhere: new Set(),
        }
        for (const ref of t1.refs.all) {
          if (ref.ctx === 'callee' || ref.ctx === 'plain') {
            const name = ctx.symbols.name(ref.sym)
            r.live.set(name, view.live(ref))
            let innermost: {
              start: number
              end: number
              home: unknown
            } | null = null
            for (const cl of ctx.rewrites.claims.values()) {
              const range = ctx.rewrites.regions.get(cl.region).range
              if (
                range.start <= ref.range.start &&
                ref.range.end <= range.end &&
                (innermost === null || range.start >= innermost.start)
              ) {
                innermost = {
                  ...range,
                  home: ctx.rewrites.generated[cl.owner]!.home,
                }
              }
            }
            if (innermost?.home === other) {
              r.elsewhere.add(name)
            }
          }
        }
        for (const call of all) {
          for (const range of [
            call,
            { start: call.start + 1, end: call.end - 1 },
          ]) {
            if (view.isErased(range)) {
              r.erased.push(code.slice(range.start, range.end))
            }
          }
        }
        reported.set(o, r)
      }
    },
  }
}

describe('random rewrite trees', () => {
  it('report as live the names each output holds (exactly, in the env module), and as erased only text it holds nothing of', async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    const { MemoryHost } = await import('./helpers')
    const bad: Array<string> = []
    const seeds = Number(process.env.RT_SEEDS ?? 1000)
    for (let seed = 1; seed <= seeds; seed++) {
      const { code, names } = randomModule(random(seed))
      const host = new MemoryHost({ files: { '/app/mod.ts': code } })
      const reported = new Map<'env' | 'other', Reported>()
      const planners = [randomPlanner(seed, reported)]
      const outputs = {
        env: (await host.compile('/app/mod.ts', planners))!.code,
        other: (await host.compile('/app/mod.ts?tsr-split=other', planners))!
          .code,
      }
      /** The module's text in an output, past the glue imports. */
      const bodyOf = (out: string) =>
        out
          .split('\n')
          .filter((l) => !l.startsWith('import '))
          .join('\n')
      const held = {
        env: bodyOf(outputs.env),
        other: bodyOf(outputs.other),
      }
      const holds = (o: 'env' | 'other', name: string) =>
        new RegExp(`\\b${name}(?!\\w)`).test(held[o])
      for (const o of ['env', 'other'] as const) {
        const { live, erased, elsewhere } = reported.get(o)!
        for (const name of names) {
          // (claimed text renders in its owner's output, with that output's edits)
          const ok =
            o === 'env'
              ? elsewhere.has(name) || live.get(name) === holds('env', name)
              : !holds('other', name) || live.get(name) === true
          if (!ok) {
            bad.push(
              `seed ${seed} ${o}: ${name} is ${live.get(name) ? 'live' : 'erased'}, ${holds(o, name) ? '' : 'not '}held`,
            )
          }
        }
        for (const text of erased) {
          for (const name of text.match(/\w+_/g) ?? []) {
            if (holds(o, name)) {
              bad.push(`seed ${seed} ${o}: ${name} is held in erased ${text}`)
            }
          }
        }
      }
    }
    vi.unstubAllEnvs()
    vi.resetModules()
    expect(bad).toEqual([])
  }, 120_000)
})
