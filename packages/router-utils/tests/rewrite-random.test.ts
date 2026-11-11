// Seeded random rewrite trees (design note 1, §5, widened after the reviews
// of steps 1 and 2): random edits, keep-slices, placeholders and inserts of
// every scope, and claims (of sub-regions of two kinds, owned in the env
// module or a derived output; live, dead and read elsewhere; for every
// output, for the outputs other than those a placeholder stands in, or for
// the derived output only) on nested calls, registered in source order,
// reversed or shuffled. What the planners' liveness reports of every name
// must be what the env module holds; in a derived output holding some
// claimed text, a name it holds is live. Text reported erased (calls whole
// and inside their parentheses) is held by neither. Users' runs (self-checks
// off, as the review's generator): what is checked is the rendered text. A
// claim of a statement's unit is not generated (a core test covers it:
// 'claims on the tree').
import { describe, expect, it, vi } from 'vitest'
import { RewriteSet } from '../src/compiler/rewrite'
import type { PlanContext, Planner, SymbolId } from '../src/compiler'
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
      /** The claims made: their range, their owner's home, whether the env module claims them. */
      const made: Array<{
        start: number
        end: number
        home: unknown
        inEnv: boolean
      }> = []
      const claim = (
        region: RegionId,
        read: boolean,
        scope: EditScope,
        home: 'auto' | OutputId,
        envPlace: boolean,
      ) => {
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
          home,
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
          scope,
          by: 'toy-random',
        })
        const { start, end } = ctx.rewrites.regions.get(region).range
        made.push({
          start,
          end,
          home,
          inEnv: RewriteSet.inScope(scope, 'env') || envPlace,
        })
      }
      for (const call of calls) {
        const range = { start: call.start, end: call.end }
        const pick = rand()
        /** The outputs of a placeholder at the call's place. */
        let placed: ReadonlyArray<OutputId> | null = null
        if (pick < 0.2) {
          const s = scope()
          if (s === 'all-outputs') {
            ctx.rewrites.edit({
              range,
              body: [{ k: 'text', parts: ['0'] }],
              by: 'toy-random',
            })
          } else {
            placed = s as ReadonlyArray<OutputId>
            ctx.rewrites.placeholder({
              range,
              body: [{ k: 'text', parts: ['0'] }],
              scope: placed,
              by: 'toy-random',
            })
          }
        } else if (pick < 0.4) {
          const kept = call.args[Math.floor(rand() * call.args.length)]!
          ctx.rewrites.edit({
            range,
            body: [
              { k: 'text', parts: ['k('] },
              { k: 'slice', range: kept },
              { k: 'text', parts: [')'] },
            ],
            by: 'toy-random',
          })
        }
        if (rand() < 0.15) {
          ctx.rewrites.insert({
            at: rand() < 0.5 ? call.start : call.end,
            body: [{ k: 'text', parts: ['/*i*/'] }],
            scope: scope(),
            by: 'toy-random',
          })
        }
        if (call.top) {
          continue
        }
        if (rand() < 0.6) {
          continue
        }
        const kind = rand() < 0.5 ? 'nested-chain' : 'custom'
        const read = rand() < 0.5
        // (the derived output holds the claimed text it owns)
        const home = rand() < 0.3 ? other : 'auto'
        if (placed !== null) {
          // claimed for the other outputs: the placeholder stands at its
          // place in these, where its text renders in its owner, if read
          claim(
            ctx.region(range, kind),
            read,
            { except: placed },
            home,
            placed.includes('env'),
          )
        } else if (rand() < 0.2) {
          // claimed for the derived output, owned there: in the env module
          // its text stands at its place (a server fn nested in the RSC
          // provider's env module)
          claim(
            ctx.region(range, kind),
            read,
            { except: ['env'] },
            other,
            false,
          )
        } else {
          claim(ctx.region(range, kind), read, 'all-outputs', home, true)
        }
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
            // (the innermost claim the env module claims: one claimed for
            // other outputs only is text in place there)
            let innermost: (typeof made)[number] | null = null
            for (const cl of made) {
              if (
                cl.inEnv &&
                cl.start <= ref.range.start &&
                ref.range.end <= cl.end &&
                (innermost === null || cl.start >= innermost.start)
              ) {
                innermost = cl
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

// Seeded random modules for the env module's pieces (final review of
// design 1, finding 4): declarations (one or two declarators), functions
// and effect statements reading each other, edits that orphan some of them
// (placement drops their statements), `custom` regions on a statement
// (rendered as their source), generated units anchored before and
// after units (some rooted in the env module), and inserts naming a
// binding at unit starts and call edges. I5: an insert renders at most
// once; I2: every binding name the env module renders is declared there
// (an insert renders only where the member reading what it names does).
/** A module of statements naming the earlier ones: `d<i>`/`e<i>` consts, `f<i>` functions, effect calls `c<i>_(…)`. */
function randomStatements(rand: () => number): {
  code: string
  names: Array<string>
} {
  const names: Array<string> = []
  const callees: Array<string> = []
  const ref = () =>
    names.length > 0 && rand() < 0.8
      ? names[Math.floor(rand() * names.length)]!
      : '1'
  const lines: Array<string> = []
  const count = 3 + Math.floor(rand() * 5)
  for (let i = 0; i < count; i++) {
    const c = `c${i}_`
    const kind = rand()
    if (kind < 0.35) {
      callees.push(c)
      lines.push(`const d${i} = ${c}(${ref()})`)
      names.push(`d${i}`)
    } else if (kind < 0.55) {
      lines.push(`const d${i} = ${ref()}, e${i} = ${ref()}`)
      names.push(`d${i}`, `e${i}`)
    } else if (kind < 0.75) {
      lines.push(`function f${i}() { return ${ref()} }`)
      names.push(`f${i}`)
    } else {
      callees.push(c)
      lines.push(`${c}(${ref()})`)
    }
  }
  lines.push(`export const y = [${ref()}, ${ref()}]`)
  callees.push('k')
  return {
    code: `import { ${callees.join(', ')} } from 'toy-names'\n${lines.join('\n')}\n`,
    names,
  }
}

function piecesPlanner(seed: number, names: ReadonlyArray<string>): Planner {
  return {
    name: 'toy-pieces',
    tier: 1,
    gate: () => true,
    plan(ctx: PlanContext) {
      const rand = random(seed * 104729 + 7)
      const { t1 } = ctx
      const code = ctx.analysis.source.code
      const symOf = new Map<string, SymbolId>()
      for (const u of t1.units) {
        for (const s of u.declares) {
          symOf.set(ctx.symbols.name(s), s)
        }
      }
      const binding = () => symOf.get(names[Math.floor(rand() * names.length)]!)
      // statements after the imports, and their units
      const units = t1.units.filter(
        (u) => u.kind === 'declaration' || u.kind === 'effect',
      )
      // edits: a reference of a binding becomes `0` (what only it read is orphaned)
      for (const r of t1.refs.all) {
        if (
          r.kind === 'value' &&
          names.includes(ctx.symbols.name(r.sym)) &&
          rand() < 0.3
        ) {
          ctx.rewrites.edit({
            range: r.range,
            body: [{ k: 'text', parts: ['0'] }],
            by: 'toy-pieces',
          })
        }
      }
      // a region on exactly a statement's range (renders as its source;
      // a region holding statements is refused: it nests in one unit)
      if (units.length > 0 && rand() < 0.5) {
        ctx.region(units[Math.floor(rand() * units.length)]!.range, 'custom')
      }
      // generated units at statements, naming a binding
      let gens = 0
      for (let n = Math.floor(rand() * 3); n > 0; n--) {
        const s = binding()
        const u = units[Math.floor(rand() * units.length)]!
        const g = ctx.names.alloc(`g${gens++}`)
        const id = ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [
                'const ',
                { sym: g.sym },
                ' = ',
                ...(s ? [{ sym: s }] : ['1']),
                '\n',
              ],
            },
          ],
          declares: [g.sym],
          effectful: false,
          anchor: {
            k: rand() < 0.5 ? 'before-unit' : 'after-unit',
            unit: u.id,
          },
          home: 'auto',
          by: 'toy-pieces',
        })
        if (rand() < 0.5) {
          ctx.addRoot('env', { t: 'gen', id })
        }
      }
      // inserts naming a binding: at a unit's start or end, at a call's edges
      let inserts = 0
      const positions: Array<number> = []
      for (const u of units) {
        positions.push(u.range.start)
      }
      for (const r of t1.refs.all) {
        if (r.ctx !== 'callee') {
          continue
        }
        const call = t1.parentOf(t1.nodeAt(r.range.start)!)!
        if (call.type === 'CallExpression') {
          positions.push(call.start, call.end - 1)
        }
      }
      for (const at of positions) {
        if (rand() < 0.25) {
          const s = binding()
          ctx.rewrites.insert({
            at,
            body: [
              {
                k: 'text',
                parts: [`/*i${inserts++}*/`, ...(s ? [{ sym: s }, ','] : [])],
              },
            ],
            by: 'toy-pieces',
          })
        }
      }
      void code
    },
  }
}

describe('random env pieces', () => {
  it('render each insert at most once, and declare every binding they name', async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    const { MemoryHost } = await import('./helpers')
    const bad: Array<string> = []
    const seeds = Number(process.env.RT_SEEDS ?? 1000)
    for (let seed = 1; seed <= seeds; seed++) {
      const { code, names } = randomStatements(random(seed))
      const host = new MemoryHost({ files: { '/app/mod.ts': code } })
      let out: string
      try {
        out = (await host.compile('/app/mod.ts', [piecesPlanner(seed, names)]))!
          .code
      } catch (e) {
        bad.push(`seed ${seed}: throws ${String(e).split('\n')[0]}\n${code}`)
        continue
      }
      for (const m of new Set(out.match(/\/\*i\d+\*\//g) ?? [])) {
        if (out.split(m).length > 2) {
          bad.push(`seed ${seed}: ${m} renders twice\n${code}---\n${out}`)
        }
      }
      for (const name of [...names, ...(out.match(/\bg\d+\b/g) ?? [])]) {
        const used = new RegExp(`\\b${name}\\b`).test(out)
        // (nothing is assigned: `<name> =` is its declarator)
        const declared = new RegExp(
          `(?:\\b${name} =|\\bfunction ${name}\\()`,
        ).test(out)
        if (used && !declared) {
          bad.push(
            `seed ${seed}: ${name} is named, not declared\n${code}---\n${out}`,
          )
        }
      }
    }
    vi.unstubAllEnvs()
    vi.resetModules()
    expect(bad).toEqual([])
  }, 120_000)
})
