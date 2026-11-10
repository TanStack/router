// Seeded random rewrite trees (design note 1, §5): random edits of every
// scope, keep-slices and claims (live, dead and read elsewhere) on nested
// calls; what the planners' liveness reports of each name must be what the
// compiled module holds.
import { describe, expect, it } from 'vitest'
import { MemoryHost } from './helpers'
import type { PlanContext, Planner } from '../src/compiler'
import type { EditScope, Frag, OutputId } from '../src/compiler/rewrite'

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

/**
 * Edits and claims at random on the calls of the module, then records what
 * `liveness` reports for the env module: of each name, and the calls it
 * reports erased whole.
 */
function randomPlanner(
  seed: number,
  live: Map<string, boolean>,
  erased: Array<string>,
): Planner {
  return {
    name: 'toy-random',
    tier: 1,
    gate: () => true,
    plan(ctx: PlanContext) {
      const rand = random(seed * 7919 + 1)
      const { t1 } = ctx
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
      const scopes: Array<EditScope> = ['all-outputs', ['env'], [other]]
      const scope = () => scopes[Math.floor(rand() * scopes.length)]!
      let gens = 0
      const keptSlices = new Set<string>()
      for (const call of calls) {
        const range = { start: call.start, end: call.end }
        const pick = rand()
        let edited: EditScope | null = null
        if (pick < 0.2) {
          ctx.rewrites.add({
            range,
            body: [{ k: 'text', parts: ['0'] }],
            scope: (edited = scope()),
            by: 'toy-random',
          })
        } else if (pick < 0.4) {
          const kept = call.args[Math.floor(rand() * call.args.length)]!
          keptSlices.add(`${kept.start}:${kept.end}`)
          ctx.rewrites.add({
            range,
            body: [
              { k: 'text', parts: ['k('] },
              { k: 'slice', range: kept },
              { k: 'text', parts: [')'] },
            ],
            scope: (edited = scope()),
            by: 'toy-random',
          })
        }
        if (
          call.top ||
          rand() < 0.6 ||
          (edited !== null && edited !== 'all-outputs') ||
          keptSlices.has(`${range.start}:${range.end}`)
        ) {
          continue
        }
        // a claim, read elsewhere one time in two; on an edited range only
        // when the edit is addressed to every output (it travels with the
        // region). Not generated: an edit scoped to some outputs on exactly a
        // claimed region (the placeholder's override), and a claim on exactly
        // a slice another edit keeps: the model renders them otherwise than
        // its liveness reports (design note 1, steps 2 and 3)
        const hoisted = ctx.names.alloc(`g${gens++}`)
        const region = ctx.region(range, 'nested-chain')
        const body: Array<Frag> = [
          { k: 'text', parts: ['const ', { sym: hoisted.sym }, ' = '] },
          { k: 'slice', range },
          { k: 'text', parts: ['\n'] },
        ]
        const owner = ctx.rewrites.addGenerated({
          body,
          declares: [hoisted.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: 'auto',
          by: 'toy-random',
        })
        if (rand() < 0.5) {
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
      const view = ctx.liveness('env')
      for (const ref of t1.refs.all) {
        if (ref.ctx === 'callee' || ref.ctx === 'plain') {
          live.set(ctx.symbols.name(ref.sym), view.live(ref))
        }
      }
      for (const call of calls) {
        if (view.isErased(call)) {
          erased.push(ctx.analysis.source.code.slice(call.start, call.end))
        }
      }
    },
  }
}

describe('random rewrite trees', () => {
  it('report as live exactly the names the env module holds, and as erased only calls it holds nothing of', async () => {
    const bad: Array<string> = []
    for (let seed = 1; seed <= 1000; seed++) {
      const { code, names } = randomModule(random(seed))
      const host = new MemoryHost({ files: { '/app/mod.ts': code } })
      const live = new Map<string, boolean>()
      const erased: Array<string> = []
      const out = await host.compile('/app/mod.ts', [
        randomPlanner(seed, live, erased),
      ])
      const body = out!.code.slice(out!.code.indexOf('\n') + 1)
      const holds = (name: string) => new RegExp(`\\b${name}(?!\\w)`).test(body)
      for (const name of names) {
        const held = holds(name)
        if (live.get(name) !== held) {
          bad.push(`seed ${seed}: ${name} is ${held ? '' : 'not '}held`)
        }
      }
      for (const call of erased) {
        for (const name of call.match(/\w+_/g)!) {
          if (holds(name)) {
            bad.push(`seed ${seed}: ${name} is held in erased ${call}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})
