/**
 * Seeded random route modules for the executing placement test
 * (`property.ts`; REVIEW-design2-final): one top-level statement per line:
 * state (objects, arrays, maps, `let`s, functions, classes, call results),
 * other names for it (aliases, conditional aliases, holders, destructured
 * names, identity calls), reads that copy a value where they evaluate,
 * writes (assignments, `Object.assign`, `delete`, mutating methods, inside
 * blocks and callbacks, through functions called at load or later),
 * builders and their links, effect statements, exports, and route options
 * whose values are functions, identifiers, wrapped functions,
 * `define({ setup })` objects and sequences that write. `shrinks()` gives
 * the modules one deletion away (the minimiser's steps).
 */

export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Opt {
  key: string
  /** fn: `() => ({…})`; ident: a named function; wrapfn: `wrap(function P() {…})`; wrapid: `wrap(P)`; define: `define({ setup() {…} })`; seq: `(W, () => ({…}))`; writer: the function writes when called */
  kind: 'fn' | 'ident' | 'wrapfn' | 'wrapid' | 'define' | 'seq' | 'writer'
  names: Array<string>
  /** A statement run by the function before it returns (a call of a writer), or the sequence's write. */
  extra?: string
}

export interface Mod {
  body: Array<string>
  /** Index in `body` before which `Route` stands. */
  routeAt: number
  opts: Array<Opt>
  builders: boolean
}

type Shape =
  | 'obj'
  | 'arr'
  | 'map'
  | 'set'
  | 'num'
  | 'fn'
  | 'cls'
  | 'hobj'
  | 'harr'
  | 'custom'
  | 'ccls'
  | 'sf'
  | 'mw'
  | 'val'
  | 'rfn'
  | 'wfn'

interface B {
  name: string
  shape: Shape
  isLet?: boolean
}

export interface GenOptions {
  identity?: boolean
  builders?: boolean
  later?: boolean
  custom?: boolean
  exports?: boolean
  /** Start readings: no link the Start compiler drops in one environment (`validator`, a middleware's `server` and `client`). */
  startLinks?: boolean
  size?: number
}

export function generate(seed: number, force: GenOptions = {}): Mod {
  const rand = random(seed)
  const chance = (p: number) => rand() < p
  const pick = <T>(xs: ReadonlyArray<T>): T =>
    xs[Math.floor(rand() * xs.length)]!
  const feat = {
    identity: force.identity ?? chance(0.25),
    builders: force.builders ?? chance(0.25),
    later: force.later ?? chance(0.15),
    custom: force.custom ?? chance(0.5),
    exports: force.exports ?? chance(0.4),
  }
  const body: Array<string> = []
  const bs: Array<B> = []
  let k = 0
  const K = () => ++k
  const of = (...shapes: Array<Shape>) =>
    bs.filter((b) => shapes.includes(b.shape))
  const objLike = () => of('obj', 'fn', 'cls')
  /** Reads prefer another name of an object (an alias, a destructured or wrapped one), writes the first name. */
  const other = (b: B) => /^[ldw]/.test(b.name)
  const toRead = () => {
    const xs = objLike()
    const others = xs.filter(other)
    return others.length > 0 && chance(0.6) ? others : xs
  }
  const toWrite = () => {
    const xs = objLike()
    const firsts = xs.filter((b) => !other(b))
    return firsts.length > 0 && chance(0.6) ? firsts : xs
  }
  const exp = () => (feat.exports && chance(0.2) ? 'export ' : '')
  let i = 0
  const id = (p: string) => `${p}${i}`

  /** A write expression (no statement wrapper) of some state, or null. */
  const writeExpr = (): string | null => {
    const kinds: Array<() => string | null> = [
      () => {
        const x = pick(toWrite())
        return pick([
          `${x.name}.v = ${K()}`,
          `${x.name}.p = ${K()}`,
          `${x.name}.v = track(${K()})`,
          `Object.assign(${x.name}, { v: ${K()} })`,
          `delete ${x.name}.v`,
          `${x.name}.q ||= ${K()}`,
          `${x.name}['v'] = ${K()}`,
          `({ v: ${x.name}.v } = { v: ${K()} })`,
          `[${x.name}.v] = [${K()}]`,
          `${x.name}.v = [${K()}]`,
        ])
      },
      () => {
        const x = pick(of('arr'))
        return pick([
          `${x.name}.push(${K()})`,
          `${x.name}[0] = ${K()}`,
          `${x.name}.unshift(${K()})`,
          `${x.name}.reverse()`,
          `${x.name}.length = 0`,
        ])
      },
      () => {
        const x = pick(of('map', 'set'))
        return x.shape === 'map'
          ? `${x.name}.set('k${K()}', ${K()})`
          : `${x.name}.add(${K()})`
      },
      () => {
        const x = pick(of('num'))
        return pick([
          `${x.name} = ${K()}`,
          `${x.name}++`,
          `${x.name} += ${K()}`,
        ])
      },
      () => {
        const x = pick(of('hobj', 'harr'))
        return x.shape === 'hobj'
          ? pick([`${x.name}.c.v = ${K()}`, `${x.name}.c.p = ${K()}`])
          : `${x.name}[0].v = ${K()}`
      },
      () => {
        const x = pick(of('custom', 'ccls'))
        return x.shape === 'custom'
          ? `${x.name}.push(${K()})`
          : `${x.name}.add(${K()})`
      },
      () => {
        const x = pick(of('mw'))
        return force.startLinks
          ? `${x.name}.middleware([${K()}])`
          : `${x.name}.server(() => ${K()})`
      },
      () => {
        const x = pick(bs.filter((b) => b.isLet && b.shape === 'obj'))
        const y = pick(of('obj'))
        return `${x.name} = ${y.name}`
      },
    ]
    for (let n = 0; n < 6; n++) {
      try {
        const w = pick(kinds)()
        if (w !== null && !w.includes('undefined')) {
          return w
        }
      } catch {
        // an empty pool: next
      }
    }
    return null
  }
  const wrapWrite = (w: string): string => {
    const r = rand()
    const expr = !/^(delete |\(\{|\[)/.test(w)
    if (r < 0.5) {
      return w
    }
    if (r < 0.6) {
      return `if (on) { ${w} }`
    }
    if (r < 0.68) {
      return `try { ${w} } catch {}`
    }
    if (r < 0.74) {
      return `{ ${w} }`
    }
    if (r < 0.8) {
      return `for (const e of [1]) { ${w} }`
    }
    if (r < 0.86 && expr) {
      return `on && (${w})`
    }
    if (r < 0.93) {
      return `run(() => { ${w} })`
    }
    if (feat.later) {
      return `later(() => { ${w} })`
    }
    return w
  }

  /** A read expression of some state (a value copied where it evaluates), or null. */
  const readExpr = (): string | null => {
    const kinds: Array<() => string> = [
      () => {
        const x = pick(toRead()).name
        return pick([
          `${x}.v`,
          `{ ...${x} }`,
          `snap(${x})`,
          `/* @__PURE__ */ snap(${x})`,
          `[${x}.v]`,
          `\`\${${x}.v}\``,
          `${x}.v + 1`,
          `Object.keys(${x}).join()`,
          `'p' in ${x}`,
          `${x}.p`,
          `JSON.stringify(${x})`,
          `[${x}.v, ${x}.p]`,
          `${x}.v ?? 0`,
        ])
      },
      () => {
        const x = pick(of('arr')).name
        return pick([
          `${x}.length`,
          `[...${x}]`,
          `${x}[0]`,
          `${x}.join()`,
          `snap(${x})`,
          `${x}.map((e) => e)`,
          `${x}.slice()`,
        ])
      },
      () => {
        const x = pick(of('map', 'set')).name
        return pick([`${x}.size`, `[...${x}]`, `snap(${x})`])
      },
      () => {
        const x = pick(of('num')).name
        return pick([`${x}`, `${x} + 1`, `[${x}]`, `snap(${x})`])
      },
      () => {
        const x = pick(of('hobj', 'harr'))
        return x.shape === 'hobj'
          ? pick([
              `${x.name}.c.v`,
              `{ ...${x.name}.c }`,
              `snap(${x.name})`,
              `[${x.name}.c.v]`,
            ])
          : pick([
              `${x.name}[0].v`,
              `snap(${x.name})`,
              `${x.name}.map((e) => e.v)`,
              `[...${x.name}].length + ${x.name}[0].v`,
            ])
      },
      () => {
        const x = pick(of('custom', 'ccls')).name
        return pick([
          `${x}.items.length`,
          `snap(${x}.items)`,
          `[...${x}.items]`,
        ])
      },
      () => {
        const x = pick(of('sf', 'mw')).name
        return pick([`snap(${x})`, `{ ...${x}.o }`, `${x}.o.n`])
      },
      () => {
        const x = pick(of('val')).name
        return pick([`[${x}]`, `snap(${x})`])
      },
      () => `${pick(of('rfn')).name}()`,
      () => `[${pick(of('rfn')).name}()]`,
    ]
    for (let n = 0; n < 6; n++) {
      try {
        return pick(kinds)()
      } catch {
        // next
      }
    }
    return null
  }

  const n = force.size ?? 7 + Math.floor(rand() * 14)
  for (i = 0; i < n; i++) {
    const r = rand()
    if (i < 2 || (r < 0.2 && chance(0.6)) || bs.length === 0) {
      // state
      const s = feat.custom && i === 1 ? 0.99 : rand()
      if (s < 0.3) {
        bs.push({ name: id('o'), shape: 'obj' })
        body.push(`${exp()}const ${id('o')} = { v: ${K()} }`)
      } else if (s < 0.4) {
        bs.push({ name: id('a'), shape: 'arr' })
        body.push(`${exp()}const ${id('a')} = [${K()}]`)
      } else if (s < 0.47) {
        const map = chance(0.5)
        bs.push({ name: id('m'), shape: map ? 'map' : 'set' })
        body.push(`const ${id('m')} = new ${map ? 'Map' : 'Set'}()`)
      } else if (s < 0.57) {
        bs.push({ name: id('n'), shape: 'num', isLet: true })
        body.push(`${exp()}let ${id('n')} = ${K()}`)
      } else if (s < 0.7) {
        const form = pick([
          `function ${id('F')}() { return ${K()} }`,
          `const ${id('F')} = () => ${K()}`,
          `const ${id('F')} = function () { return ${K()} }`,
        ])
        bs.push({ name: id('F'), shape: 'fn' })
        body.push(`${exp()}${form}`)
      } else if (s < 0.75) {
        bs.push({ name: id('C'), shape: 'cls' })
        body.push(`${exp()}class ${id('C')} { static v = ${K()} }`)
      } else if (s < 0.87) {
        bs.push({ name: id('o'), shape: 'obj' })
        body.push(
          chance(0.6)
            ? `const ${id('o')} = box(${K()})`
            : `const ${id('o')} = /* @__PURE__ */ mk(${K()})`,
        )
      } else if (s < 0.93) {
        bs.push({ name: id('o'), shape: 'obj', isLet: true })
        body.push(`let ${id('o')} = { v: ${K()} }`)
      } else if (feat.custom) {
        if (chance(0.5)) {
          bs.push({ name: id('q'), shape: 'custom' })
          body.push(
            `const ${id('q')} = { items: [], push(x) { track('q' + x); this.items.push(x) } }`,
          )
        } else {
          bs.push({ name: id('R'), shape: 'ccls' })
          body.push(
            `class ${id('R')} { static items = []; static add(x) { track('R' + x); ${id('R')}.items.push(x) } }`,
          )
        }
      }
    } else if (r < 0.32) {
      // another name for an object
      const s = rand()
      const xs = [...objLike(), ...of('arr')]
      if (xs.length === 0) {
        continue
      }
      const x = pick(xs)
      if (s < 0.35) {
        bs.push({ name: id('l'), shape: x.shape })
        body.push(`${exp()}const ${id('l')} = ${x.name}`)
      } else if (s < 0.45 && x.shape === 'obj') {
        bs.push({ name: id('l'), shape: x.shape, isLet: true })
        body.push(`let ${id('l')} = ${x.name}`)
      } else if (s < 0.6 && x.shape !== 'arr') {
        bs.push({ name: id('h'), shape: 'hobj' })
        body.push(`const ${id('h')} = { c: ${x.name} }`)
      } else if (s < 0.7 && x.shape !== 'arr') {
        bs.push({ name: id('h'), shape: 'harr' })
        body.push(`const ${id('h')} = [${x.name}]`)
      } else if (s < 0.8) {
        const hs = of('hobj')
        if (hs.length > 0) {
          bs.push({ name: id('d'), shape: 'obj' })
          body.push(`const { c: ${id('d')} } = ${pick(hs).name}`)
        }
      } else if (s < 0.87) {
        bs.push({ name: id('l'), shape: x.shape })
        body.push(`const ${id('l')} = on ? ${x.name} : null`)
      } else if (feat.identity) {
        bs.push({ name: id('w'), shape: x.shape })
        body.push(
          pick([
            `const ${id('w')} = wrap(${x.name})`,
            `const ${id('w')} = Object.freeze(${x.name})`,
            `const ${id('w')} = Object.assign(${x.name}, { p: ${K()} })`,
          ]),
        )
        if (body.at(-1)!.includes('freeze')) {
          bs.pop() // frozen: no later write through it
          bs.splice(bs.indexOf(x), 1)
        }
      }
    } else if (r < 0.55) {
      const e = readExpr()
      if (e === null) {
        continue
      }
      if (chance(0.08) && /^\w+$/.test(e.replace(/\.v$/, ''))) {
        bs.push({ name: id('r'), shape: 'val' })
        body.push(`const { v: ${id('r')} } = ${e.replace(/\.v$/, '')}`)
      } else if (chance(0.12)) {
        // read by a function, called by a later read
        bs.push({ name: id('g'), shape: 'rfn' })
        body.push(
          pick([
            `function ${id('g')}() { return ${e} }`,
            `const ${id('g')} = () => ${e}`,
          ]),
        )
      } else if (chance(0.06)) {
        bs.push({ name: id('g'), shape: 'rfn' })
        body.push(
          `const ${id('t')} = { get: () => ${e} }`,
          `function ${id('g')}() { return ${id('t')}.get() }`,
        )
      } else {
        bs.push({ name: id('r'), shape: 'val' })
        body.push(`${exp()}const ${id('r')} = ${e}`)
      }
    } else if (r < 0.78) {
      const w = writeExpr()
      if (w === null) {
        continue
      }
      if (chance(0.15)) {
        bs.push({ name: id('W'), shape: 'wfn' })
        body.push(
          pick([
            `${exp()}function ${id('W')}() { ${w} }`,
            `const ${id('W')} = () => { ${w} }`,
          ]),
        )
      } else {
        body.push(wrapWrite(w))
      }
    } else if (r < 0.84) {
      const ws = of('wfn')
      body.push(
        ws.length > 0 && chance(0.6) ? `${pick(ws).name}()` : `track('e${i}')`,
      )
    } else if (r < 0.9) {
      body.push(`track('e${i}')`)
    } else if (feat.builders) {
      const s = rand()
      const sfs = of('sf')
      const mws = of('mw')
      if (s < 0.25) {
        bs.push({ name: id('b'), shape: 'sf' })
        body.push(
          chance(0.5)
            ? `const ${id('b')} = createServerFn()`
            : `const ${id('b')} = createServerFn().middleware([${K()}])`,
        )
      } else if (s < 0.45) {
        bs.push({ name: id('b'), shape: 'mw' })
        body.push(`const ${id('b')} = createMiddleware()`)
      } else if (s < 0.75 && sfs.length > 0) {
        bs.push({ name: id('b'), shape: 'sf' })
        body.push(
          `${exp()}const ${id('b')} = ${pick(sfs).name}.${pick(['handler(() => ' + K() + ')', 'middleware([' + K() + '])', ...(force.startLinks ? [] : ['validator(' + K() + ')'])])}`,
        )
      } else if (mws.length > 0) {
        if (force.startLinks !== true && chance(0.5)) {
          bs.push({ name: id('b'), shape: 'mw' })
          body.push(`const ${id('b')} = ${pick(mws).name}.client(() => ${K()})`)
        } else {
          body.push(`${pick(mws).name}.middleware([${K()}])`)
        }
      }
    }
  }

  // the route options
  const keys = ['beforeLoad', 'loader', 'component', 'errorComponent']
  const used = keys.filter((key) => key === 'component' || chance(0.6))
  const observable = bs.filter((b) => b.shape !== 'wfn' && b.shape !== 'rfn')
  const opts: Array<Opt> = used.map((key) => ({
    key,
    kind: 'fn' as const,
    names: [],
  }))
  for (const b of observable) {
    if (chance(b.shape === 'val' ? 0.9 : 0.45)) {
      const component = opts.find((o) => o.key === 'component')!
      ;(chance(0.5) ? component : pick(opts)).names.push(b.name)
      if (chance(0.15)) {
        const o = pick(opts)
        if (!o.names.includes(b.name)) {
          o.names.push(b.name)
        }
      }
    }
  }
  const routeAt = Math.max(
    1,
    body.length - Math.floor(rand() * Math.max(1, body.length / 3)),
  )
  for (const o of opts) {
    const s = rand()
    const ws = of('wfn')
    if (s < 0.5) {
      if (ws.length > 0 && chance(0.2)) {
        o.extra = `${pick(ws).name}()`
      }
    } else if (s < 0.62) {
      o.kind = 'ident'
    } else if (s < 0.72) {
      o.kind = 'wrapfn'
    } else if (s < 0.8) {
      o.kind = 'wrapid'
    } else if (s < 0.86) {
      o.kind = 'define'
    } else if (s < 0.93) {
      const w = writeExpr()
      // (a relocated value's own logged effect moves on the user's request: not generated)
      if (w !== null && !/^(delete |\(\{|\[|[qR]\d+\.)/.test(w)) {
        o.kind = 'seq'
        o.extra = w.replace(/track\((\d+)\)/, '$1')
      }
    } else {
      const w = writeExpr()
      if (w !== null) {
        o.kind = 'writer'
        o.extra = w
      }
    }
  }
  return { body, routeAt, opts, builders: feat.builders }
}

const pascal = (key: string) => `P${key}`

/** The module's text; `router` is the router's import specifier. */
export function render(mod: Mod, router: string, start = 'toy-start'): string {
  const ret = (o: Opt) => `({ ${o.names.join(', ')} })`
  const pre: Array<string> = []
  const entries: Array<string> = []
  for (const o of mod.opts) {
    const P = pascal(o.key)
    switch (o.kind) {
      case 'fn':
        entries.push(
          `  ${o.key}: () => ${o.extra ? `{ ${o.extra}; return ${ret(o)} }` : ret(o)},`,
        )
        break
      case 'ident':
        pre.push(`function ${P}() { return ${ret(o)} }`)
        entries.push(`  ${o.key}: ${P},`)
        break
      case 'wrapfn':
        entries.push(`  ${o.key}: hoc(function ${P}() { return ${ret(o)} }),`)
        break
      case 'wrapid':
        pre.push(`function ${P}() { return ${ret(o)} }`)
        entries.push(`  ${o.key}: hoc(${P}),`)
        break
      case 'define':
        entries.push(`  ${o.key}: define({ setup() { return ${ret(o)} } }),`)
        break
      case 'raw' as any:
        entries.push(`  ${o.key}: ${o.extra},`)
        break
      case 'seq':
        entries.push(`  ${o.key}: (${o.extra}, () => ${ret(o)}),`)
        break
      case 'writer':
        entries.push(
          `  ${o.key}: hoc(function ${P}() { ${o.extra}; return ${ret(o)} }),`,
        )
        break
    }
  }
  return [
    `import { createFileRoute } from '${router}'`,
    "import { track, box, mk, wrap, hoc, snap, run, later, define } from './lib'",
    ...(mod.builders
      ? [`import { createServerFn, createMiddleware } from '${start}'`]
      : []),
    'const on = true',
    ...mod.body.slice(0, mod.routeAt),
    ...pre,
    `export const Route = createFileRoute('/x')({`,
    ...entries,
    '})',
    ...mod.body.slice(mod.routeAt),
    '',
  ].join('\n')
}

/** The smaller modules one deletion away. */
export function* shrinks(mod: Mod): Generator<Mod> {
  for (let i = mod.body.length - 1; i >= 0; i--) {
    yield {
      ...mod,
      body: mod.body.filter((_, j) => j !== i),
      routeAt: i < mod.routeAt ? mod.routeAt - 1 : mod.routeAt,
    }
  }
  for (let i = 0; i < mod.opts.length; i++) {
    if (mod.opts.length > 1) {
      yield { ...mod, opts: mod.opts.filter((_, j) => j !== i) }
    }
    const o = mod.opts[i]!
    for (let n = 0; n < o.names.length; n++) {
      yield {
        ...mod,
        opts: mod.opts.map((x, j) =>
          j === i ? { ...x, names: x.names.filter((_, m) => m !== n) } : x,
        ),
      }
    }
    if (o.kind !== 'fn' || o.extra !== undefined) {
      yield {
        ...mod,
        opts: mod.opts.map((x, j) =>
          j === i ? { key: x.key, kind: 'fn' as const, names: x.names } : x,
        ),
      }
    }
  }
  if (mod.routeAt < mod.body.length) {
    yield { ...mod, routeAt: mod.body.length }
  }
  // unwrap a statement, drop an `export`
  for (let i = 0; i < mod.body.length; i++) {
    const line = mod.body[i]!
    const m =
      /^(?:if \(on\) \{ (.*) \}|try \{ (.*) \} catch \{\}|\{ (.*) \}|for \(const e of \[1\]\) \{ (.*) \}|on && \((.*)\)|run\(\(\) => \{ (.*) \}\))$/.exec(
        line,
      )
    const simpler = m
      ? (m.slice(1) as Array<string | undefined>).find((x) => x !== undefined)
      : line.startsWith('export ')
        ? line.slice(7)
        : undefined
    if (simpler !== undefined) {
      yield { ...mod, body: mod.body.map((l, j) => (j === i ? simpler : l)) }
    }
  }
}
