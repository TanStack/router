/**
 * What only split code needs and stays in the route module is reported once,
 * at the cause (guarantee 7), and the fix the warning offers works when
 * applied as written (guarantee 13): the fixed app builds without the
 * warning and shows the values the source gives. The shapes where an export
 * stays only because it reads what another cause keeps: that export is the
 * cause's cascade, not reported (round tools class B: a read before a later
 * write at load; and an export reading another export). A move the warning
 * offers names what the moved code reads when the module loads (a holder, a
 * function it calls and what that reads) and what reads a moved binding
 * before a moved write (round tools class A): what stays would otherwise be
 * imported back from the route module, a cycle. So does the move offered for
 * an export that stays because it reads what the route module keeps (a
 * binding that one reads, a holder, a function it calls, a write at load),
 * and the move offered for a binding a statement that stays changes or uses
 * (what the binding reads at load; the code writing a moved binding then).
 * A statement a known method makes a writer of a kept binding (`Set.add`)
 * keeps a binding it uses with one warning, as an unknown call does, and so
 * does an unused declaration making that call (`const n = table.add(d).size`).
 * When code the route module keeps reads that binding (`beforeLoad`), no move
 * keeps what it sees (`d` must be in `table` before the split component
 * loads): the warning offers none, and the values are the source's.
 * Vite and Rspack client builds, mounted in a DOM.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, routeApp } from '../build-harness'

const timeout = 120_000

/** The client build of `route` (`routes/index.tsx`) with `files`: what its component shows, the result of `before` (a script run before it mounts), and the diagnostics about the route file. */
async function mounted(
  bundler: 'vite' | 'rspack',
  route: string,
  files: Record<string, string> = {},
  before = 'const seen = null',
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(route, { env: 'client', files }),
  })
  try {
    const run = await app.run(
      `${before}\nawait entry.mount(entry.Route.options.component)\nreturn seen`,
    )
    return {
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      seen: run.result,
      diagnostics: findDiagnostics([...app.warnings, ...app.consoleMessages], {
        file: 'routes/index.tsx',
        root: app.root,
      }),
    }
  } finally {
    await app.dispose()
  }
}

const shows = `export const Route = createFileRoute('/')({
  component: () => <p>{String(r2)} {String(r13[0])}</p>,
})
`

describe.each(['vite', 'rspack'] as const)('a %s client build', (bundler) => {
  // round tools class B (placement-exec seeds 1112264, 1612539, 1300879,
  // 1600380): `r2` reads `o0` before a later write at load, so it stays,
  // and `r13`, which reads it, stays for it
  test(
    'warns once at a read before a later write, not at the export reading it, and its fix keeps the values',
    async () => {
      const route = `${head}export const o0: { v: number; p?: number } = { v: 1 }
const r2 = o0.p
o0.p = 6
export const r13 = [r2]
${shows}`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('undefined undefined')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'r2 = o0.p'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: `r2`, `o0` and the statements writing them when the module
      // loads in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { r2 } from '../state'
export { o0 } from '../state'
export const r13 = [r2]
${shows}`,
        {
          'state.ts': `export const o0: { v: number; p?: number } = { v: 1 }
export const r2 = o0.p
o0.p = 6
`,
        },
      )
      expect(fixed.text).toBe('undefined undefined')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // (the write before the read moves too: with `o0` and `r2` alone, the
  // route module's first write would run after the read)
  test(
    'warns once at a read between two writes at load, and its fix keeps the value between them',
    async () => {
      const route = `${head}export const o0: { v: number; p?: number } = { v: 1 }
o0.p = 5
const r2 = o0.p
o0.p = 6
export const r13 = [r2]
${shows}`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('5 5')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'r2 = o0.p'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      const fixed = await mounted(
        bundler,
        `${head}import { r2 } from '../state'
export { o0 } from '../state'
export const r13 = [r2]
${shows}`,
        {
          'state.ts': `export const o0: { v: number; p?: number } = { v: 1 }
o0.p = 5
export const r2 = o0.p
o0.p = 6
`,
        },
      )
      expect(fixed.text).toBe('5 5')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // `options` stays only because it reads `base`, which stays because it
  // reads `kept`, which the loader reads
  test(
    'warns once at an export another export reads, and its fix frees both',
    async () => {
      const route = `${head}const kept = { n: 1 }
export const base = { n: kept.n }
export const options = { base }
export const Route = createFileRoute('/')({
  loader: () => kept.n,
  component: () => <p>{String(options.base.n)} {String(base.n)}</p>,
})
`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('1 1')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'base = {'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: `base` and `kept` in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { base, kept } from '../base'
export { base }
export const options = { base }
export const Route = createFileRoute('/')({
  loader: () => kept.n,
  component: () => <p>{String(options.base.n)} {String(base.n)}</p>,
})
`,
        {
          'base.ts': `export const kept = { n: 1 }
export const base = { n: kept.n }
`,
        },
      )
      expect(fixed.text).toBe('1 1')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // round tools class A (placement-exec seeds 13017, 1302957, 1310446,
  // 1604480; router planner 1300510): `r11` reads `o0` through the holder
  // `h6` before the write at load the loader orders it with
  test.each([
    ['a function', 'function Page() { h6.c.v = 12; return <p>{r11[0]}</p> }'],
    [
      'a wrapped function',
      'hoc(function Page() { h6.c.v = 12; return <p>{r11[0]}</p> })',
    ],
  ])(
    'warns once at a read through a holder before a later write, and its fix (the component is %s) moves the holder too',
    async (_, component) => {
      const options = `  loader: () => o0,
  component: ${component},
})
`
      const route = `${head}const hoc = <T,>(f: T): T => f
const o0 = { v: 1 }
const h6 = { c: o0 }
const r11 = [h6.c.v]
o0.v = 5
export const Route = createFileRoute('/')({
${options}`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('1')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'r11 = [h6.c.v]'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: `r11`, `o0`, `h6` and the statements writing them when the
      // module loads in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { h6, o0, r11 } from '../state'
const hoc = <T,>(f: T): T => f
export const Route = createFileRoute('/')({
${options}`,
        {
          'state.ts': `export const o0 = { v: 1 }
export const h6 = { c: o0 }
export const r11 = [h6.c.v]
o0.v = 5
`,
        },
      )
      expect(fixed.text).toBe('1')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // `snap` reads `o0` before the write that moves: it moves too, or it
  // would read the moved write's value
  test(
    'warns once at a read through a holder, and its fix moves what reads the moved binding before its write',
    async () => {
      const options = `  loader: () => snap,
  component: function Page() {
    h6.c.v = 12
    return <p>{r11[0]} {snap}</p>
  },
})
`
      const route = `${head}const o0 = { v: 1 }
const snap = o0.v
const h6 = { c: o0 }
const r11 = [h6.c.v]
o0.v = 5
export const Route = createFileRoute('/')({
${options}`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('1 1')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'r11 = [h6.c.v]'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: `r11`, `o0`, `snap`, `h6` and the statements writing them
      // when the module loads in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { h6, r11, snap } from '../state'
export const Route = createFileRoute('/')({
${options}`,
        {
          'state.ts': `export const o0 = { v: 1 }
export const snap = o0.v
export const h6 = { c: o0 }
export const r11 = [h6.c.v]
o0.v = 5
`,
        },
      )
      expect(fixed.text).toBe('1 1')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // `r11` calls `get`, which reads `cfg`, when it loads
  test(
    'warns once at a read before a later write, and its fix moves the function it calls and what that reads',
    async () => {
      const options = `  loader: () => o0,
  component: () => <p>{r11.join(' ')}</p>,
})
`
      const route = `${head}const o0 = { v: 1 }
const cfg = { k: 2 }
function get() {
  return cfg.k
}
const r11 = [o0.v, get()]
o0.v = 5
export const Route = createFileRoute('/')({
${options}`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('1 2')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'r11 = [o0.v'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: `r11`, `o0`, `cfg`, `get` and the statements writing them
      // when the module loads in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { o0, r11 } from '../state'
export const Route = createFileRoute('/')({
${options}`,
        {
          'state.ts': `export const o0 = { v: 1 }
const cfg = { k: 2 }
function get() {
  return cfg.k
}
export const r11 = [o0.v, get()]
o0.v = 5
`,
        },
      )
      expect(fixed.text).toBe('1 2')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // an export only split code uses reads, when it loads, `kept`, which the
  // loader keeps in the route module: the move takes what the two read
  // then, and the statements writing them (left behind, the new module
  // would import it back from the route module)
  test.each([
    [
      'a binding the read one reads',
      `const cfg = { k: 2 }
const kept = { n: cfg.k }
export const count = kept.n
`,
      'kept',
      'count = kept.n',
      '2',
      `const cfg = { k: 2 }
export const kept = { n: cfg.k }
export const count = kept.n
`,
    ],
    [
      'a holder',
      `const o0 = { v: 1 }
const h6 = { c: o0 }
export const count = h6.c.v
`,
      'o0',
      'count = h6.c.v',
      '1',
      `export const o0 = { v: 1 }
const h6 = { c: o0 }
export const count = h6.c.v
`,
    ],
    [
      'a function it calls',
      `const unit = 2
const kept = { n: 1 }
function total() {
  return kept.n * unit
}
export const count = total()
`,
      'kept',
      'count = total()',
      '2',
      `const unit = 2
export const kept = { n: 1 }
function total() {
  return kept.n * unit
}
export const count = total()
`,
    ],
    [
      'a write when the module loads',
      `const kept = { n: 1 }
kept.n = 3
export const count = kept.n
`,
      'kept',
      'count = kept.n',
      '3',
      `export const kept = { n: 1 }
kept.n = 3
export const count = kept.n
`,
    ],
  ])(
    'warns once at an export reading what the route module keeps through %s, and its fix moves what they read when the module loads',
    async (_, declarations, loaded, at, value, own) => {
      const options = (
        imports: string,
      ) => `${head}${imports}export const Route = createFileRoute('/')({
  loader: () => ${loaded},
  component: () => <p>{String(count)}</p>,
})
`
      const route = options(declarations)
      const r = await mounted(bundler, route)
      expect(r.text).toBe(value)
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, at),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: the export, the binding it reads and what the warning
      // names with them in a module of their own
      const fixed = await mounted(
        bundler,
        options(`import { count, ${loaded} } from '../own'
export { count }
`),
        { 'own.ts': own },
      )
      expect(fixed.text).toBe(value)
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // an export reading `Route` when it loads: no module of its own can take
  // it (it would import `Route` back), so the warning offers no move
  test(
    'warns once at an export reading `Route` when the module loads',
    async () => {
      const route = `${head}export const Route = createFileRoute('/')({
  component: () => <p>{label}</p>,
})
export const label = typeof Route.options.component
`
      const r = await mounted(bundler, route)
      expect(r.text).toBe('function')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'label = typeof'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
    },
    timeout,
  )

  // `flags` stays with the statement using it, which code that runs later
  // changes too: the move takes `prefix`, which `flags` reads when the
  // module loads (the route module imports the new module to re-export
  // `flags`)
  test(
    'warns once at an export a statement that stays uses, and its fix moves what the export reads when the module loads',
    async () => {
      const options = `export const Route = createFileRoute('/')({
  component: () => {
    flags.base = 1
    return <p>{flags.p} {String(context.flags === flags)}</p>
  },
})
`
      const route = `${head}import { context, setContext } from '../context'
const prefix = { p: 'x' }
export const flags: { beta: boolean; p: string; base?: number } = {
  beta: false,
  p: prefix.p,
}
setContext('flags', flags)
${options}`
      const files = {
        'context.ts': `export const context: Record<string, unknown> = {}
export function setContext(key: string, value: unknown) {
  context[key] = value
}
`,
      }
      const r = await mounted(bundler, route, files)
      expect(r.text).toBe('x true')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'flags: {'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
      // the fix: `flags`, `prefix` and the statements using them when the
      // module loads in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { context } from '../context'
import { flags } from '../flags'
export { flags }
${options}`,
        {
          ...files,
          'flags.ts': `import { setContext } from './context'
const prefix = { p: 'x' }
export const flags: { beta: boolean; p: string; base?: number } = {
  beta: false,
  p: prefix.p,
}
setContext('flags', flags)
`,
        },
      )
      expect(fixed.text).toBe('x true')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // round tools class C (fuzz seeds 6104927, 6407720, 6510105, 6518119): the
  // statement on line 7 uses `Title`, an export, and `count`, which the
  // chunk takes with its write at load: no module serves both, so both
  // stay, reported at each. The move takes the statement writing `count`
  // when the module loads (left behind, it would assign an import)
  test(
    'warns at each binding a statement that stays uses, and their fix moves the statements writing them when the module loads',
    async () => {
      const rest = `async function load(x: unknown) {
  return format(x, count)
}
const Header = () => [format('H'), Title()]
export const Route = createFileRoute('/')({
  component: () => <p>{format(Header, load)} {count}</p>,
})
`
      const route = `${head}import { format, log } from '../lib'
export function Title() { return format('T') }
let count = format('C')
count = log('T2', count)
${rest.replace('const Header', "log('T5', count, Title)\nconst Header")}`
      const files = {
        'lib.ts': `export function format(...a: Array<unknown>) {
  return a.length
}
export function log(_tag: string, v: unknown, ..._rest: Array<unknown>) {
  return typeof v === 'number' ? v + 1 : v
}
`,
      }
      const r = await mounted(bundler, route, files)
      expect(r.text).toBe('2 2')
      for (const at of ['export function Title', 'count = format']) {
        expectDiagnostic(r.diagnostics, {
          severity: 'warning',
          position: diagnosticPosition(route, at),
          times: 1,
        })
      }
      expect(r.diagnostics).toHaveLength(2)
      // the fix: `Title`, `count`, that statement and the statements
      // writing them when the module loads in a module of their own
      const fixed = await mounted(
        bundler,
        `${head}import { format } from '../lib'
import { Title, count } from '../own'
export { Title }
${rest}`,
        {
          ...files,
          'own.ts': `import { format, log } from './lib'
export function Title() { return format('T') }
export let count = format('C')
count = log('T2', count)
log('T5', count, Title)
`,
        },
      )
      expect(fixed.text).toBe('2 2')
      expect(fixed.diagnostics).toEqual([])
    },
    timeout,
  )

  // phase 6 step 3 (P04b written with the bindings file's `init()`):
  // `table.add(d)` changes `table`, which `beforeLoad` keeps, so it stays,
  // and so does `d`, which only the component reads: one warning, as with
  // `table.link(d)`. `beforeLoad` runs before the component and sees `d` in
  // `table`: no move keeps that, and none is offered
  const p04b = (statement: string) => `${head}import { init } from '../state'
const table = init(new Set<object>())
const d = init({ name: 'MARK_D' })
${statement}
export const Route = createFileRoute('/')({
  beforeLoad: () => table.size,
  component: () => <p>{d.name}</p>,
})
`
  test.each([
    ['a statement', 'table.add(d)'],
    ['an unused declaration', 'const n = table.add(d).size'],
  ])(
    'warns once at a binding %s calling a known method on a kept binding uses, and keeps what beforeLoad sees',
    async (_, statement) => {
      const route = p04b(statement)
      const r = await mounted(
        bundler,
        route,
        { 'state.ts': 'export const init = <T,>(value: T): T => value\n' },
        'const seen = entry.Route.options.beforeLoad()',
      )
      expect(r.seen).toBe(1)
      expect(r.text).toBe('MARK_D')
      expectDiagnostic(r.diagnostics, {
        severity: 'warning',
        position: diagnosticPosition(route, 'd = init'),
        times: 1,
      })
      expect(r.diagnostics).toHaveLength(1)
    },
    timeout,
  )
})
