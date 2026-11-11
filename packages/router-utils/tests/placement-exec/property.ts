/**
 * The executing placement property (design 2, P2 and P3; REVIEW-design2-
 * final): each random module (`gen.ts`) is compiled in a build and in dev,
 * then the source and the outputs run as ES modules (`exec.ts`) under
 * several timings, and what an observer sees (the effects logged while
 * modules load, what every route option returns) must agree. The compiler
 * is injected (`Config`): the core's toy planner (router-utils) or the real
 * router planner (router-plugin). The first disagreements are minimised (the
 * smallest module that still disagrees the same way) for the report.
 *
 * Timings (`Protocol.when`): `first`, every chunk loads, then everything is
 * called (P2); `late`, functions run between the loads (P3); `calls`,
 * results taken before the next chunk loads. Chunks load in option order
 * and reversed; with extracted modules also with the route module's
 * re-exports dropped (nothing imports them through the route file).
 */
import { generate, render, shrinks } from './gen'
import { disagreement, execute } from './exec'
import type { GenOptions, Mod } from './gen'
import type { Protocol } from './exec'

export interface Config {
  label: string
  /** The router package the module imports `createFileRoute` from. */
  router: string
  /** The package the builders are imported from. */
  start?: string
  file: string
  compile: (
    code: string,
    mode: 'build' | 'dev',
    builders: boolean,
  ) => Promise<Compiled>
}

export interface Compiled {
  mods: Map<string, string>
  diagnostics: Array<string>
  error?: string
}

/** The functions every generated module imports from `./lib` (`exec.ts` gives them their behaviour). */
export const LIB_TS =
  'export const track: any = 0, box: any = 0, mk: any = 0, wrap: any = 0, hoc: any = 0, snap: any = 0, run: any = 0, later: any = 0, define: any = 0\n'

/** Compiles `file` and every derived module its outputs import, from `compile`. */
export async function collect(
  file: string,
  compile: (id: string) => Promise<{
    code: string
    diagnostics: ReadonlyArray<{ code?: string; message: string }>
  } | null>,
): Promise<Compiled> {
  const mods = new Map<string, string>()
  const diagnostics: Array<string> = []
  const ids = [file]
  try {
    for (let i = 0; i < ids.length; i++) {
      const out = await compile(ids[i]!)
      if (out === null) {
        if (i === 0) {
          return { mods, diagnostics, error: 'not compiled (null)' }
        }
        continue
      }
      mods.set(ids[i]!, out.code)
      for (const d of out.diagnostics) {
        const text = `${d.code}: ${d.message}`
        if (!diagnostics.includes(text)) {
          diagnostics.push(text)
        }
      }
      for (const m of out.code.matchAll(/['"]([^'"\n]*\?tsr-[^'"\n]+)['"]/g)) {
        if (!ids.includes(m[1]!)) {
          ids.push(m[1]!)
        }
      }
    }
  } catch (e) {
    return {
      mods,
      diagnostics,
      error: String((e as Error).message)
        .split('\n')
        .slice(0, 4)
        .join(' | '),
    }
  }
  return { mods, diagnostics }
}

const exportsOf = (mod: Mod): Array<string> =>
  mod.body.flatMap((l) => {
    const m = /^export (?:const|let|function|class) (\w+)/.exec(l)
    return m ? [m[1]!] : []
  })

interface Failure {
  proto: string
  what: string
}

async function check(
  cfg: Config,
  mod: Mod,
  mode: 'build' | 'dev',
  only?: string,
): Promise<{ failure: Failure | null; compiled: Compiled; code: string }> {
  const code = render(mod, cfg.router, cfg.start)
  const compiled = await cfg.compile(code, mode, mod.builders)
  if (compiled.error !== undefined) {
    return {
      failure: { proto: 'compile', what: compiled.error },
      compiled,
      code,
    }
  }
  const keys = mod.opts.map((o) => o.key)
  const names = exportsOf(mod)
  const extracted = [...compiled.mods.keys()].some((id) =>
    id.includes('export---'),
  )
  const rev = [...keys].reverse()
  const protocols: Array<[string, Protocol]> = [
    ['order: chunks first', { order: keys, external: true, when: 'first' }],
    [
      'order: chunks first, reversed',
      { order: rev, external: true, when: 'first' },
    ],
    ...(extracted
      ? ([
          [
            'order: chunks first, re-exports dropped',
            { order: keys, external: false, strip: true, when: 'first' },
          ],
        ] as Array<[string, Protocol]>)
      : []),
    [
      'volatile: late writes before chunks',
      { order: keys, external: true, when: 'late' },
    ],
    [
      'volatile: late writes before chunks, reversed',
      { order: rev, external: true, when: 'late' },
    ],
    ...(extracted
      ? ([
          [
            'volatile: late writes before chunks, re-exports dropped',
            { order: keys, external: false, strip: true, when: 'late' },
          ],
        ] as Array<[string, Protocol]>)
      : []),
    [
      'delayed: results before the next chunk',
      { order: keys, external: true, when: 'calls' },
    ],
  ]
  const src = new Map([[cfg.file, code]])
  for (const [name, p] of protocols) {
    if (only !== undefined && only !== name) {
      continue
    }
    const source = await execute(src, cfg.file, { ...p, strip: false }, names)
    const split = await execute(compiled.mods, cfg.file, p, names)
    const what = disagreement(source, split)
    if (what !== null) {
      return { failure: { proto: name, what }, compiled, code }
    }
  }
  return { failure: null, compiled, code }
}

/** The category of a disagreement (kept while minimising). */
const category = (f: Failure): string =>
  f.proto === 'compile'
    ? 'compile'
    : `${f.proto.split(':')[0]}/${f.what.startsWith('error:') ? 'error' : f.what.includes(' sees ') ? 'value' : 'effects'}`

async function minimise(
  cfg: Config,
  mod: Mod,
  mode: 'build' | 'dev',
  f: Failure,
): Promise<Mod> {
  const cat = category(f)
  const only = f.proto === 'compile' ? undefined : f.proto
  let cur = mod
  for (let progress = true, rounds = 0; progress && rounds < 200; rounds++) {
    progress = false
    for (const next of shrinks(cur)) {
      const r = await check(cfg, next, mode, only)
      if (r.failure !== null && category(r.failure) === cat) {
        cur = next
        progress = true
        break
      }
    }
  }
  return cur
}

/**
 * Runs seeds `from` to `to` (the configuration of a seed: `configs[seed %
 * length]`), each in a build and in dev, and reports every disagreement,
 * minimised: the empty list is the property.
 */
export async function disagreements(
  configs: ReadonlyArray<Config>,
  from: number,
  to: number,
  gen: GenOptions = {},
): Promise<Array<string>> {
  const out: Array<string> = []
  for (let seed = from; seed <= to; seed++) {
    const mod = generate(seed, gen)
    const cfg = configs[seed % configs.length]!
    // (a module that does not run as written is no case)
    const code = render(mod, cfg.router, cfg.start)
    const probe = await execute(
      new Map([[cfg.file, code]]),
      cfg.file,
      { order: mod.opts.map((o) => o.key), external: true, when: 'calls' },
      exportsOf(mod),
    )
    if (probe.error !== undefined) {
      continue
    }
    for (const mode of ['build', 'dev'] as const) {
      const r = await check(cfg, mod, mode)
      if (r.failure === null) {
        continue
      }
      // (the first few minimised: a regression fails many seeds)
      const min =
        out.length < 3 ? await minimise(cfg, mod, mode, r.failure) : mod
      const again = await check(
        cfg,
        min,
        mode,
        r.failure.proto === 'compile' ? undefined : r.failure.proto,
      )
      out.push(
        `seed ${seed}, ${cfg.label}, ${mode}, ${r.failure.proto}: ${again.failure?.what ?? r.failure.what}\n${again.code}\n${again.compiled.diagnostics.join('\n')}`,
      )
    }
  }
  return out
}

/** The seed range `value` names (`from-to`), else `fallback`. */
export function seedRange(
  value: string | undefined,
  fallback: [number, number],
): [number, number] {
  const m = value === undefined ? null : /^(\d+)-(\d+)$/.exec(value)
  return m === null ? fallback : [Number(m[1]), Number(m[2])]
}
