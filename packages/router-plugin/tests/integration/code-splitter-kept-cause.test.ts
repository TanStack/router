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
 * imported back from the route module, a cycle. Vite and Rspack client
 * builds, mounted in a DOM.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, routeApp } from '../build-harness'

const timeout = 120_000

/** The client build of `route` (`routes/index.tsx`) with `files`: what its component shows, and the diagnostics about the route file. */
async function mounted(
  bundler: 'vite' | 'rspack',
  route: string,
  files: Record<string, string> = {},
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(route, { env: 'client', files }),
  })
  try {
    const run = await app.run(
      'await entry.mount(entry.Route.options.component)\nreturn null',
    )
    return {
      text: (run.html as string).replace(/<[^>]*>/g, ''),
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
})
