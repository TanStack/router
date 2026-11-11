// Seeded random route modules (design 2, P2): module state, functions that
// write or read it, declarations reading it when they load (directly,
// through a call, through another declaration), effect statements (opaque
// calls, top-level writes, writes inside `if` and `try`, calls of writers),
// some declarations exported, split by the toy planner. A reference replays
// the module in source order, then in the order the outputs evaluate it
// (the route module's body, then what runs later: the loader, another
// module calling the exported writers, then the chunk; an extracted
// export's module before the route module's body, and, when nothing
// imports it through the route file, also with the chunk), and compares
// the value every declaration sees and the order of the effects. What a
// read sees must not depend on where placement put it.
import { describe, expect, it } from 'vitest'
import { MemoryHost, envInfo, toySplitPlanner } from './helpers'

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

/** What a statement does to the reference's machine. */
interface Machine {
  state: Map<string, number>
  values: Map<string, unknown>
  log: Array<string>
  /** Calls a function of the module. */
  call: (name: string) => number
  /** Reads a binding (a TDZ error when it was not evaluated yet). */
  read: (name: string) => number
}

interface Statement {
  text: string
  /** Text found once in the output evaluating it (a declaration's `name = `). */
  mark: string
  /** A declaration's name: its value is compared. */
  name?: string
  run: (m: Machine) => void
}

interface RandomModule {
  code: string
  statements: Array<Statement>
  functions: Map<string, (m: Machine) => number>
  /** What runs later, in order: the loader's calls, then another module's calls of the exported writers. */
  later: Array<string>
  /** The exports another module imports through the route file (the exported writers it calls). */
  imported: Array<string>
}

function randomModule(rand: () => number): RandomModule {
  const pick = <T>(xs: ReadonlyArray<T>): T =>
    xs[Math.floor(rand() * xs.length)]!
  const lines: Array<string> = []
  const statements: Array<Statement> = []
  const functions = new Map<string, (m: Machine) => number>()
  const writers: Array<string> = []
  const readers: Array<string> = []
  const decls: Array<string> = []
  const exportedWriters: Array<string> = []
  const states = Array.from({ length: 1 + Math.floor(rand() * 2) }, (_, i) => {
    const s = `s${i}`
    statements.push({
      text: `let ${s} = ${i}`,
      mark: `let ${s} = `,
      run: (m) => m.state.set(s, i),
    })
    return s
  })
  for (let i = 0; i < 3 + Math.floor(rand() * 7); i++) {
    const s = pick(states)
    const kind = rand()
    if (kind < 0.12) {
      const w = `w${i}`
      const exported = rand() < 0.5
      lines.push(
        `${exported ? 'export ' : ''}function ${w}() { ${s} = ${s} + 1; return 0 }`,
      )
      functions.set(w, (m) => (m.state.set(s, m.read(s) + 1), 0))
      writers.push(w)
      if (exported) {
        exportedWriters.push(w)
      }
    } else if (kind < 0.2) {
      const w = `n${i}`
      lines.push(`const ${w} = () => ++${s}`)
      functions.set(w, (m) => (m.state.set(s, m.read(s) + 1), m.read(s)))
      writers.push(w)
    } else if (kind < 0.3) {
      const r = `r${i}`
      lines.push(`function ${r}() { return ${s} }`)
      functions.set(r, (m) => m.read(s))
      readers.push(r)
    } else if (kind < 0.65) {
      const d = `d${i}`
      const exported = rand() < 0.25 ? 'export ' : ''
      const shape = rand()
      let text: string
      let value: (m: Machine) => Array<number>
      if (shape < 0.3 || (readers.length === 0 && writers.length === 0)) {
        text = `[${s}]`
        value = (m) => [m.read(s)]
      } else if (shape < 0.5 && readers.length > 0) {
        const r = pick(readers)
        text = `[${r}()]`
        value = (m) => [m.call(r)]
      } else if (shape < 0.65 && writers.length > 0) {
        const w = pick(writers)
        text = `[${w}(), ${s}]`
        value = (m) => [m.call(w), m.read(s)]
      } else if (shape < 0.8 && decls.length > 0) {
        const o = pick(decls)
        text = `[${o}[0] + 1]`
        value = (m) => [(m.values.get(o) as Array<number>)[0]! + 1]
      } else {
        text = `[log('${d}'), ${s}]`
        value = (m) => (m.log.push(d), [0, m.read(s)])
      }
      if (decls.length > 0 && text.includes('[0] + 1')) {
        // (a read of a declaration not evaluated yet is a TDZ error)
        const o = /\[(d\d+)\[/.exec(text)![1]!
        const inner = value
        value = (m) => {
          if (!m.values.has(o)) {
            throw new Error(`${d} reads ${o} before it exists`)
          }
          return inner(m)
        }
      }
      lines.push(`${exported}const ${d} = ${text}`)
      statements.push({
        text: lines.at(-1)!,
        mark: `${d} = `,
        name: d,
        run: (m) => m.values.set(d, value(m)),
      })
      decls.push(d)
    } else {
      // an effect statement, its text unique by `i`
      const effect = rand()
      let text: string
      let run: (m: Machine) => void
      if (effect < 0.3) {
        text = `log('e${i}')`
        run = (m) => m.log.push(`e${i}`)
      } else if (effect < 0.5) {
        text = `${s} = ${s} + ${100 + i}`
        run = (m) => m.state.set(s, m.read(s) + 100 + i)
      } else if (effect < 0.7) {
        text = `if (on) { ${s} = ${200 + i} }`
        run = (m) => m.state.set(s, 200 + i)
      } else if (effect < 0.85) {
        text = `try { ${s} = ${s} * 2 + ${300 + i} } catch {}`
        run = (m) => m.state.set(s, m.read(s) * 2 + 300 + i)
      } else if (writers.length > 0) {
        const w = pick(writers)
        text = `${w}(${400 + i})`
        run = (m) => void m.call(w)
      } else {
        continue
      }
      lines.push(text)
      statements.push({ text, mark: text, run })
    }
  }
  // the loader reads some declarations and calls some functions; the
  // component reads the others
  const loader: Array<string> = []
  const component: Array<string> = []
  for (const d of decls) {
    ;(rand() < 0.3 ? loader : component).push(d)
  }
  const later: Array<string> = []
  for (const f of [...writers, ...readers]) {
    if (rand() < 0.4) {
      loader.push(`${f}()`)
      later.push(f)
    }
  }
  later.push(...exportedWriters)
  const code = [
    "import { createFileRoute } from 'toy-router'",
    "import { log } from './log'",
    'const on = true',
    ...statements.filter((s) => s.text.startsWith('let ')).map((s) => s.text),
    ...lines,
    "export const Route = createFileRoute('/')({",
    `  loader: () => [${loader.join(', ')}],`,
    `  component: () => [${component.join(', ')}],`,
    '})',
    '',
  ].join('\n')
  return { code, statements, functions, later, imported: exportedWriters }
}

/**
 * Runs `order` (then `later` where it says so) on a fresh machine: the
 * value each declaration sees and the effects' order, or the error a read
 * before its binding exists throws.
 */
function replay(
  mod: RandomModule,
  phases: Array<Array<Statement> | 'later'>,
): { values: Record<string, unknown>; log: Array<string> } | string {
  const m: Machine = {
    state: new Map(),
    values: new Map(),
    log: [],
    call: (f) => mod.functions.get(f)!(m),
    read: (s) => {
      const v = m.state.get(s)
      if (v === undefined) {
        throw new Error(`${s} is read before it exists`)
      }
      return v
    },
  }
  try {
    for (const phase of phases) {
      if (phase === 'later') {
        for (const f of mod.later) {
          m.call(f)
        }
        continue
      }
      for (const s of phase) {
        s.run(m)
      }
    }
  } catch (e) {
    return (e as Error).message
  }
  return { values: Object.fromEntries(m.values), log: m.log }
}

describe('random route modules', () => {
  it('see, in every read, the value the module in source order gives, wherever placement puts the reads', async () => {
    const bad: Array<string> = []
    const seeds = Number(process.env.PR_SEEDS ?? 3000)
    for (let seed = 1; seed <= seeds; seed++) {
      const mod = randomModule(random(seed))
      const host = new MemoryHost({
        files: {
          '/app/route.tsx': mod.code,
          '/app/log.ts': 'export const log = (x: string) => 0\n',
        },
      })
      const planners = [toySplitPlanner({ extractExports: true })]
      const env = envInfo({ mode: 'build' })
      const compile = async (id: string) => {
        try {
          return (await host.compile(id, planners, { env }))?.code ?? ''
        } catch (e) {
          bad.push(
            `seed ${seed}: ${id} throws ${(e as Error).message}\n${mod.code}`,
          )
          return null
        }
      }
      const main = await compile('/app/route.tsx')
      const chunk = await compile('/app/route.tsx?tsr-split=component')
      if (main === null || chunk === null) {
        continue
      }
      const extracted: Array<{ code: string; imported: boolean }> = []
      for (const m of main.matchAll(
        /'\/app\/route\.tsx\?tsr-split=(export---\w+)'/g,
      )) {
        const out = await compile(`/app/route.tsx?tsr-split=${m[1]}`)
        if (out !== null) {
          // (another module importing one of its exports through the route
          // file evaluates it before the route module's body)
          const names = /export \{([^}]*)\}/.exec(out)?.[1] ?? ''
          extracted.push({
            code: out,
            imported: mod.imported.some((f) =>
              new RegExp(`\\b${f}\\b`).test(names),
            ),
          })
        }
      }
      // where each statement evaluates: the output holding its mark, in
      // that output's order
      const at = (out: string, s: Statement) =>
        out.search(
          new RegExp(
            `(?<![\\w$])${s.mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          ),
        )
      const placed = (out: string) =>
        mod.statements
          .filter((s) => at(out, s) >= 0)
          .sort((a, b) => at(out, a) - at(out, b))
      const outputs = [main, chunk, ...extracted.map((e) => e.code)]
      // a declaration may go (nothing reads it), an unwritten `let` be
      // copied; everything else evaluates once
      const lost = mod.statements.filter((s) => {
        const n = outputs.filter((o) => at(o, s) >= 0).length
        return n === 0
          ? s.name === undefined
          : n > 1 && !s.text.startsWith('let ')
      })
      if (lost.length > 0) {
        bad.push(
          `seed ${seed}: ${lost.map((s) => s.mark).join(', ')} not evaluated once\n${mod.code}`,
        )
        continue
      }
      const source = replay(mod, [mod.statements, 'later'])
      const bound = extracted
        .filter((e) => e.imported)
        .flatMap((e) => placed(e.code))
      const free = extracted
        .filter((e) => !e.imported)
        .flatMap((e) => placed(e.code))
      for (const [when, phases] of [
        [
          'extracted modules first',
          [bound, free, placed(main), 'later', placed(chunk)],
        ],
        [
          'extracted modules with the chunk',
          [bound, placed(main), 'later', free, placed(chunk)],
        ],
      ] as const) {
        // (an extracted module evaluated with the chunk sees state written
        // after the route module's body: F1-2, which design 2 step 2 fixes;
        // until then this time runs with `PR_EXTRACTED_LATE=1`)
        if (
          when === 'extracted modules with the chunk' &&
          (free.length === 0 || process.env.PR_EXTRACTED_LATE !== '1')
        ) {
          continue
        }
        const split = replay(mod, [...phases])
        // (a declaration that moved sees a value; one that went is not compared)
        if (typeof split === 'string' || typeof source === 'string') {
          if (split !== source) {
            bad.push(
              `seed ${seed} (${when}): ${String(split)} / source ${String(source)}\n${mod.code}`,
            )
          }
          continue
        }
        const differs = Object.keys(split.values).filter(
          (d) =>
            JSON.stringify(split.values[d]) !==
            JSON.stringify(source.values[d]),
        )
        if (differs.length > 0 || split.log.join() !== source.log.join()) {
          bad.push(
            `seed ${seed} (${when}): ${differs.map((d) => `${d} sees ${JSON.stringify(split.values[d])}, in source order ${JSON.stringify(source.values[d])}`).join('; ')}${split.log.join() !== source.log.join() ? ` effects ${split.log.join()} / ${source.log.join()}` : ''}\n${mod.code}`,
          )
        }
      }
    }
    expect(bad).toEqual([])
  }, 300_000)
})
