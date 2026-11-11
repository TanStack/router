/**
 * Executes a route module, or the outputs compiled from it, as real ES
 * modules (`node:vm` `SourceTextModule`: the worker runs with
 * `--experimental-vm-modules`), so import order, cycles and uninitialised
 * bindings are the engine's, and records what an observer sees: the effects
 * logged while modules evaluate, in order, and what each route option
 * returns when called.
 */
import vm from 'node:vm'

const LIB = `
const T = globalThis.__T
export const track = (x) => { T.log.push(T.phase + ':' + String(x)); return x }
export const box = (k) => { T.log.push(T.phase + ':box' + k); return { v: k } }
export const mk = (k) => ({ v: k })
export const wrap = (x) => { T.log.push(T.phase + ':wrap'); return x }
export const snap = (x) => T.snap(x)
export const run = (f) => { T.log.push(T.phase + ':run'); return f() }
export const later = (f) => { T.log.push(T.phase + ':later'); T.queue.push(f); return 0 }
export const define = (o) => o
// (an option value's wrapper: relocated with the value on the user's request, so not logged)
export const hoc = (x) => x
`
const ROUTER = `
export const createFileRoute = (p) => (o) => o
export const lazyRouteComponent = (imp, key) => ({ $lazy: true, load: () => imp().then((m) => m[key]) })
export const lazyFn = lazyRouteComponent
export const __tsrRouteHmr = () => {}
`
// createServerFn's links copy their options; createMiddleware's write the
// receiver's (packages/start-client-core: createServerFn.ts, createMiddleware.ts)
const START = `
const sf = (o) => {
  const f = () => (o.handler ? o.handler() : undefined)
  f.o = o
  f.middleware = (m) => sf({ ...o, n: (o.n ?? 0) + 1, mw: [...(o.mw ?? []), ...m] })
  f.validator = (v) => sf({ ...o, n: (o.n ?? 0) + 1, val: v })
  f.handler = (h, impl) => sf({ ...o, n: (o.n ?? 0) + 1, handler: impl ?? h })
  return f
}
export const createServerFn = () => sf({})
export const createMiddleware = () => {
  const m = { o: { n: 0 } }
  m.middleware = (x) => { m.o.n++; m.o.mw = x; return m }
  m.server = (f) => { m.o.n++; m.o.server = f(); return m }
  m.client = (f) => { m.o.n++; m.o.client = f(); return m }
  return m
}
`

const RPC = `
export const createClientRpc = () => () => ({ $rpc: 1 })
export const createSsrRpc = () => () => ({ $rpc: 1 })
export const createServerRpc = (meta, fn) => fn
`

export function ser(v: any, seen = new Set<unknown>()): unknown {
  if (v === undefined) {
    return '$undefined'
  }
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) {
    return typeof v === 'number' && Number.isNaN(v) ? '$NaN' : v
  }
  if (seen.has(v)) {
    return '$cycle'
  }
  seen.add(v)
  let out: any
  const tag = Object.prototype.toString.call(v)
  if (Array.isArray(v)) {
    out = v.map((e) => ser(e, seen))
  } else if (tag === '[object Map]') {
    out = { $map: [...v].map((e) => ser(e, seen)) }
  } else if (tag === '[object Set]') {
    out = { $set: [...v].map((e) => ser(e, seen)) }
  } else {
    out = {}
    if (typeof v === 'function') {
      out.$fn = 1
    }
    for (const key of Object.keys(v)) {
      out[key] = ser(v[key], seen)
    }
    if (Object.isFrozen(v)) {
      out.$frozen = 1
    }
  }
  seen.delete(v)
  return out
}

export interface Protocol {
  /** The option keys, in the order they are loaded and called. */
  order: Array<string>
  /** Whether another module uses the route file's other exports. */
  external: boolean
  /** The route module's re-exports of extracted modules are dropped (nothing imports them through the route file: a bundler drops them). */
  strip?: boolean
  /**
   * When code that runs later runs, against the chunks' loading:
   * - `first`: every chunk loads, then everything is called. Only what
   *   evaluates at load is reordered: P2 (order, initialised).
   * - `late`: the exported functions and each option are called once (results
   *   dropped) as soon as they exist, before the next chunk loads; results are
   *   taken after everything loaded. The source runs the same calls after its
   *   load. A write at an unknown time now runs before a chunk's load: P3 (V).
   * - `calls`: each option's result is taken when its chunk has loaded, before
   *   the next chunk loads. Also sees a moved effect that a function called
   *   earlier would have seen done (outside design 2's model: G3).
   */
  when: 'first' | 'late' | 'calls'
}

export interface Seen {
  /** The effects logged while modules evaluated. */
  load: Array<string>
  results: Record<string, string>
  error?: string
}

const STRIP = /^export \{[^}]*\} from '[^']*\?tsr-split=export---[^']*'\n/gm

/** Runs `mods` (id → code) from `entry` under `p`. `exportNames`: the exports another module reads. */
export async function execute(
  mods: ReadonlyMap<string, string>,
  entry: string,
  p: Protocol,
  exportNames: ReadonlyArray<string>,
): Promise<Seen> {
  const T = {
    log: [] as Array<string>,
    phase: 'load',
    queue: [] as Array<() => void>,
    snap: (x: unknown) => JSON.stringify(ser(x)),
  }
  const context = vm.createContext({ __T: T })
  const cache = new Map<string, any>()
  const sourceOf = (spec: string): string => {
    if (spec === './lib') {
      return LIB
    }
    if (/^@tanstack\/\w+-start\/.*rpc/.test(spec)) {
      return RPC
    }
    if (spec === 'toy-start' || /^@tanstack\/\w+-start$/.test(spec)) {
      return START
    }
    if (spec === 'toy-router' || spec.startsWith('@tanstack/')) {
      return ROUTER
    }
    const code = mods.get(spec)
    if (code === undefined) {
      throw new Error(`no module ${spec}`)
    }
    return p.strip && spec === entry ? code.replace(STRIP, '') : code
  }
  const get = (spec: string): any => {
    let m = cache.get(spec)
    if (m === undefined) {
      m = new (vm as any).SourceTextModule(sourceOf(spec), {
        context,
        identifier: spec,
        initializeImportMeta: () => {},
        importModuleDynamically: async (s: string) => {
          const d = get(s)
          if (d.status === 'unlinked') {
            await d.link(get)
          }
          // (a module loading while a function runs still evaluates at load)
          const phase = T.phase
          T.phase = 'load'
          await d.evaluate()
          T.phase = phase
          return d
        },
      })
      cache.set(spec, m)
    }
    return m
  }
  const seen: Seen = { load: [], results: {} }
  const flush = () => {
    T.phase = 'call'
    for (const f of T.queue.splice(0)) {
      f()
    }
  }
  const isClass = (v: unknown) =>
    typeof v === 'function' &&
    /^class\b/.test(Function.prototype.toString.call(v))
  const call = (v: any) =>
    typeof v === 'function'
      ? v()
      : v && typeof v.setup === 'function'
        ? v.setup()
        : v
  try {
    const main = get(entry)
    await main.link(get)
    await main.evaluate()
    const ns = main.namespace
    flush()
    const external = () => {
      for (const name of p.external ? exportNames : []) {
        const v = ns[name]
        seen.results[`export ${name}`] = T.snap(
          typeof v === 'function' && !isClass(v) ? [v(), v] : v,
        )
      }
    }
    const loaded = new Map<string, any>()
    const load = async (key: string) => {
      let v = ns.Route[key]
      if (v && v.$lazy) {
        T.phase = 'load'
        v = await v.load()
      }
      T.phase = 'call'
      loaded.set(key, v)
    }
    if (p.when === 'calls') {
      external()
      for (const key of p.order) {
        await load(key)
        seen.results[key] = T.snap(call(loaded.get(key)))
        flush()
      }
    } else {
      if (p.when === 'late' && p.external) {
        for (const name of exportNames) {
          if (typeof ns[name] === 'function' && !isClass(ns[name])) {
            ns[name]()
          }
        }
      }
      for (const key of p.order) {
        await load(key)
        if (p.when === 'late') {
          call(loaded.get(key))
          flush()
        }
      }
      flush()
      external()
      for (const key of p.order) {
        seen.results[key] = T.snap(call(loaded.get(key)))
        flush()
      }
    }
  } catch (e) {
    seen.error = String(e instanceof Error ? e.message : e)
  }
  seen.load = T.log.filter((l) => l.startsWith('load:'))
  return seen
}

/** What differs between the source's run and the outputs', or null. */
export function disagreement(source: Seen, split: Seen): string | null {
  if (source.error !== undefined) {
    return null // the generated module does not run: not a case
  }
  if (split.error !== undefined) {
    return `error: ${split.error}`
  }
  const parts: Array<string> = []
  for (const key of Object.keys(source.results)) {
    if (source.results[key] !== split.results[key]) {
      parts.push(
        `${key} sees ${split.results[key]}, the source gives ${source.results[key]}`,
      )
    }
  }
  if (source.load.join() !== split.load.join()) {
    parts.push(
      `effects at load ${split.load.join(' ')}, in the source ${source.load.join(' ')}`,
    )
  }
  return parts.length > 0 ? parts.join('; ') : null
}
