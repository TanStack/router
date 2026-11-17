/**
 * Dev-server work and memory guards (not oracle tests: they count what a
 * compiler does, which a correct compiler need not do the same way). Each
 * guards a reported cost: an Rsbuild dev server keeps no plans or raw facts
 * of modules deleted after the app stopped importing them (the documented
 * stats knob, TSR_COMPILER_STATS=1; other sessions alive in this worker are
 * idle, so the change is this server's), and a Vite dev server compiles each
 * dependent of an edit once per environment.
 */
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { startDevServer } from '../../dev-server'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

const timeout = 30_000

const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`

describe('Rsbuild dev: modules the app stops importing', () => {
  // The compiler's caches are bounded by the live modules. Rspack
  // reports a deleted file only while a module depends on it: a module the
  // app stopped importing and then deleted got no invalidation, and its plans
  // and raw facts stayed for the session (found by the compiler soak,
  // benchmarks/compiler-perf `--scenarios soak --soak-bundlers rsbuild`).
  // Measured through the documented stats knob (TSR_COMPILER_STATS=1); other
  // sessions alive in this worker are idle, so the change is this server's.
  test(
    'leave no plans or raw facts behind once deleted',
    async () => {
      vi.stubEnv('TSR_COMPILER_STATS', '1')
      onTestFinished(() => {
        vi.unstubAllEnvs()
      })
      const server = await startRsbuildStartDevServer({
        compileTimeout: 10_000,
        files: {
          'src/a.ts': `export const a = 'MARK_a'\n`,
          'src/entry.ts': `export { a } from './a'\n`,
        },
      })
      const counts = () => {
        const s: Record<string, number> = compilerStats()['start:rsbuild'] ?? {}
        return { plans: s.plans ?? 0, rawFacts: s.rawFacts ?? 0 }
      }
      const before = counts()
      for (let i = 0; i < 3; i++) {
        // a file nothing imports yet: Rspack does not watch it, no compile
        await server.write({
          [`src/m${i}.ts`]: `export const m = 'MARK_m${i}'\n`,
        })
        await server.edit({
          'src/entry.ts': `export { a } from './a'\nexport { m } from './m${i}'\n`,
        })
        await server.edit({ 'src/entry.ts': `export { a } from './a'\n` })
        // deleted once nothing imports it: Rspack reports no removal either
        await server.write({ [`src/m${i}.ts`]: null })
      }
      expect(server.errors).toEqual([])
      const after = counts()
      expect(after.plans).toBeLessThanOrEqual(before.plans)
      expect(after.rawFacts).toBeLessThanOrEqual(before.rawFacts)
    },
    timeout,
  )
})

describe('Vite dev: dependents whose output is unchanged', () => {
  // A factory re-exported from another module: every importer re-plans and
  // emits the same output. Each is compiled once per environment, during the
  // edit; neither the next SSR import nor the next page load compiles it
  // again, also when the dependents import each other and are compiled at
  // the same time.
  test(
    'are compiled once per environment',
    async () => {
      const names = Array.from({ length: 40 }, (_, i) => `d${i}`)
      const counts: Record<string, Record<string, number>> = {
        client: {},
        ssr: {},
      }
      let counting = false
      const server = await startDevServer({
        plugins: [
          {
            name: 'count-transforms',
            transform(_code, id) {
              const name = /\/src\/(d\d+)\.ts$/.exec(id)?.[1]
              if (counting && name) {
                const env = counts[this.environment.name]!
                env[name] = (env[name] ?? 0) + 1
              }
            },
          },
        ],
        files: {
          'src/fa.ts': factory,
          'src/fb.ts': factory,
          'src/lib.ts': `export { base } from './fa'\n`,
          ...Object.fromEntries(
            names.map((name, i) => [
              `src/${name}.ts`,
              `import { base } from './lib'
${i > 0 ? `import { fn as first } from './d0'\nexport const p = first\n` : ''}export const fn = base.handler(async () => '${name}')
`,
            ]),
          ),
          'src/entry.ts': names
            .map((name) => `export { fn as ${name} } from './${name}'\n`)
            .join(''),
        },
      })
      await server.import('/src/entry.ts')
      await server.load('/src/entry.ts')
      await server.idle()

      counting = true
      await server.edit({ 'src/lib.ts': `export { base } from './fb'\n` })
      await server.import('/src/entry.ts')
      await server.load('/src/entry.ts')
      await server.idle()

      const once = Object.fromEntries(names.map((name) => [name, 1]))
      expect(counts).toEqual({ client: once, ssr: once })
    },
    timeout,
  )
})
