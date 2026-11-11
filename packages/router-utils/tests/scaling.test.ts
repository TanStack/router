// Module-size scaling of one compile (review of 2026-11-10, F9-3: a query of
// the rewrite tree scanned every edit, so a module of many server functions
// compiled in time quadratic in their number; design 2 step 2 review,
// finding 2: a registry filled by statements compiled in cubic time; the
// statement-start guard lane: a guard asked per JSX child of one statement).
import { describe, expect, it, vi } from 'vitest'
import { envInfo, toySplitPlanner } from './helpers'
import type { EnvInfo, Planner } from '../src/compiler'

/** A module of `n` exported server functions, each reading a helper of its own. */
function serverModule(n: number): string {
  const lines = [`import { wrapServer } from 'toy-start'`]
  for (let i = 0; i < n; i++) {
    lines.push(`const helper${i} = (x) => x + ${i}`)
    lines.push(`export const fn${i} = wrapServer(() => helper${i}(${i}))`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * A route module with a registry filled by `n` statements and read through
 * one function by `n` declarations, which the route's options read (split
 * code reads all of them, the loader every fourth). Each declaration's load
 * may run anything attached to the registry, so each evaluation reads `n`
 * statements: the module's own cost is quadratic in `n`.
 */
function registryModule(n: number): string {
  const lines = [
    `import { createFileRoute } from 'toy-router'`,
    'const handlers = {}',
  ]
  for (let i = 0; i < n; i++) {
    lines.push(`handlers.k${i} = () => ${i}`)
  }
  lines.push('function run(k) { return handlers[k]() }')
  for (let i = 0; i < n; i++) {
    lines.push(`const d${i} = [run('k${i}')]`)
  }
  const all = Array.from({ length: n }, (_, i) => `d${i}`)
  lines.push(
    `export const Route = createFileRoute('/')({ loader: () => [${all.filter((_, i) => i % 4 === 0).join(', ')}], component: () => [${all.join(', ')}] })`,
  )
  return `${lines.join('\n')}\n`
}

/** One statement rendering `n` JSX children, each a `<Lazy>` boundary. */
function boundaryModule(n: number): string {
  const lines = ['export function Page() {', '  return (', '    <div>']
  for (let i = 0; i < n; i++) {
    lines.push(`      <Lazy>{${i}}</Lazy>`)
  }
  lines.push('    </div>', '  )', '}')
  return `${lines.join('\n')}\n`
}

/**
 * Each `<Lazy>` boundary replaced by JSX text, as Hydrate and `<ClientOnly>`
 * do: the statement-start guard asks about every one.
 */
const boundaries: Planner = {
  name: 'toy-boundaries',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    const code = ctx.analysis.source.code
    for (const m of code.matchAll(/<Lazy>\{(\d+)\}<\/Lazy>/g)) {
      ctx.rewrites.edit({
        range: { start: m.index, end: m.index + m[0].length },
        body: [{ k: 'text', parts: [`<Shell n={${m[1]}} />`] }],
        by: 'toy-boundaries',
      })
    }
  },
}

/**
 * The client side of a server function, each `wrapServer(…)` call a stub,
 * and a rename of every reference and exported name (found in the text and
 * the reference index: the planner's own lookups are not measured).
 */
const stubs: Planner = {
  name: 'toy-stubs',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    const code = ctx.analysis.source.code
    for (const m of code.matchAll(/wrapServer\(.*\)/g)) {
      ctx.rewrites.edit({
        range: { start: m.index, end: m.index + m[0].length },
        body: [{ k: 'text', parts: ['tsrStub()'] }],
        by: 'toy-stubs',
      })
    }
    const rename = (start: number, end: number) =>
      ctx.rewrites.edit({
        range: { start, end },
        body: [{ k: 'text', parts: [`${code.slice(start, end)}_`] }],
        by: 'toy-stubs',
      })
    for (const ref of ctx.t1.refs.all) {
      rename(ref.range.start, ref.range.end)
    }
    for (const m of code.matchAll(/export const (fn\d+)/g)) {
      const start = m.index + 'export const '.length
      rename(start, start + m[1]!.length)
    }
  },
}

/**
 * The provider side: every handler claimed and hoisted into a unit of its
 * own (the owner renders the claimed region), and the same renames.
 */
const hoists: Planner = {
  name: 'toy-hoists',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    const code = ctx.analysis.source.code
    let i = 0
    for (const m of code.matchAll(/wrapServer\((.*)\)/g)) {
      const start = m.index + 'wrapServer('.length
      const range = { start, end: start + m[1]!.length }
      const region = ctx.region(range, 'custom')
      const local = ctx.names.alloc(`tsrH${i++}`)
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: local.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [local.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: 'toy-hoists',
      })
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: local.sym }] }],
        by: 'toy-hoists',
      })
    }
    const rename = (start: number, end: number) =>
      ctx.rewrites.edit({
        range: { start, end },
        body: [{ k: 'text', parts: [`${code.slice(start, end)}_`] }],
        by: 'toy-hoists',
      })
    for (const ref of ctx.t1.refs.all) {
      rename(ref.range.start, ref.range.end)
    }
  },
}

describe('module-size scaling', () => {
  // (users' runs: the test runs' output checks are not what is measured)
  /**
   * Median compile time of a module of `large` against one of `small`
   * (fresh caches each time). The two sizes are sampled alternately, so load
   * from other processes weighs on both alike.
   */
  async function ratio(
    planner: Planner,
    check: (code: string, n: number) => void,
    {
      module = serverModule,
      file = '/app/fns.ts',
      env,
      small = 400,
      large = 6400,
      samples = 9,
    }: {
      module?: (n: number) => string
      file?: string
      env?: EnvInfo
      small?: number
      large?: number
      samples?: number
    } = {},
  ): Promise<number> {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const { MemoryHost } = await import('./helpers')
      const sample = async (n: number, code: string): Promise<number> => {
        const host = new MemoryHost({ files: { [file]: code } })
        const t = performance.now()
        const out = await host.compile(file, [planner], { env })
        const elapsed = performance.now() - t
        check(out!.code, n)
        return elapsed
      }
      const smallCode = module(small)
      const largeCode = module(large)
      // warm the compiler's code paths first
      await sample(small, smallCode)
      await sample(large, largeCode)
      const smalls: Array<number> = []
      const larges: Array<number> = []
      for (let i = 0; i < samples; i++) {
        smalls.push(await sample(small, smallCode))
        larges.push(await sample(large, largeCode))
      }
      const median = (xs: Array<number>) =>
        xs.sort((a, b) => a - b)[samples >> 1]!
      return median(larges) / median(smalls)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  }

  // At 16 times the size (6,400 against 400), linear time reads about 15 to
  // 21 (up to 34 under heavy load) and quadratic about 256, so the bound of
  // 48 tells them apart with room for load.

  it('compiles a module of 6,400 server functions in less than 48 times one of 400', async () => {
    const r = await ratio(stubs, (code, n) => {
      expect(code).toContain(`export const fn${n - 1}_ = tsrStub()`)
      expect(code).not.toContain('helper')
    })
    expect(r).toBeLessThan(48)
  }, 60_000)

  it('compiles a module of 6,400 hoisted server functions in less than 48 times one of 400', async () => {
    const r = await ratio(hoists, (code, n) => {
      expect(code).toContain(
        `const tsrH${n - 1} = () => helper${n - 1}_(${n - 1})`,
      )
    })
    expect(r).toBeLessThan(48)
  }, 60_000)

  // At 64 times the size (25,600 against 400), linear time reads about 50 to
  // 70 and a guard scanning the statement's children per child (quadratic in
  // them) about 800, so the bound of 160 tells them apart with room for load.
  it('compiles a statement of 25,600 replaced JSX children in less than 160 times one of 400', async () => {
    const r = await ratio(
      boundaries,
      (code, n) => {
        expect(code).toContain(`<Shell n={${n - 1}} />`)
        expect(code).not.toContain('Lazy')
      },
      {
        module: boundaryModule,
        file: '/app/page.tsx',
        large: 25600,
        samples: 5,
      },
    )
    expect(r).toBeLessThan(160)
  }, 120_000)

  // At 4 times the size (1,600 against 400), quadratic time reads about 10 to
  // 16 and cubic about 50 to 64, so the bound of 32 tells them apart with
  // room for load.
  it('compiles a route module of 1,600 registry entries read by 1,600 declarations in less than 32 times one of 400', async () => {
    const r = await ratio(
      toySplitPlanner(),
      (code, n) => {
        expect(code).toContain(`handlers.k${n - 1} = () => ${n - 1}`)
      },
      {
        module: registryModule,
        file: '/app/route.tsx',
        env: envInfo({ mode: 'build' }),
        small: 400,
        large: 1600,
        samples: 5,
      },
    )
    expect(r).toBeLessThan(32)
  }, 120_000)
})
