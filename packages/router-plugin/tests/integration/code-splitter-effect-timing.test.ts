/**
 * When an effect that sets state only the split component reads runs: the
 * same whether the module writes the state in its declaration
 * (`let calls = seed()`) or in a statement after it (`calls = seed()`,
 * `calls += seed()`). Moving an initialiser to a lazy chunk is allowed (G3;
 * DECISIONS R29/R31), so either may run at load or at the first render, but
 * both run at the same time, once, with the value the code gives. A write of
 * a pure value (`calls = 5`) is the control: it runs nothing. Vite, Rspack
 * and webpack SSR builds and an Rsbuild client build, run in Node; the
 * Vite dev server is in ../code-splitter-effect-timing.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  build,
  buildWithRsbuild,
  head,
  rootRoute,
  ssrRenderEntry,
} from '../build-harness'

const timeout = 180_000

/** Each shape's route renders `calls`. */
const shapes = {
  initialiser: `let calls = globalThis.seed('initialiser')`,
  assignment: `let calls = 0\ncalls = globalThis.seed('assignment')`,
  'compound assignment': `let calls = 0\ncalls += globalThis.seed('compound assignment')`,
  'pure value (control)': `let calls = 0\ncalls = 5`,
}
const rows = Object.entries(shapes)
const file = (i: number) => `routes/r${i}.tsx`

const files = {
  'routes/__root.tsx': rootRoute,
  // evaluated before the routes: records each effect, in order
  'seed.ts': `;(globalThis as any).seeded = []
;(globalThis as any).seed = (name: string) => {
  ;(globalThis as any).seeded.push(name)
  return 1
}
`,
  ...Object.fromEntries(
    rows.map(([, code], i) => [
      file(i),
      `${head}${code}
export const Route = createFileRoute('/')({ component: () => <p>{String(calls)}</p> })
`,
    ]),
  ),
  'entry.ts': `import './seed'
${ssrRenderEntry.replace(/^export \{ Route \}.*$/m, '')}
${rows.map((_, i) => `import { Route as R${i} } from './routes/r${i}'`).join('\n')}
export const routes = [${rows.map((_, i) => `R${i}`).join(', ')}]
`,
}

const builds = {
  vite: () => build({ bundler: 'vite', env: 'ssr', minify: false, files }),
  rspack: () => build({ bundler: 'rspack', env: 'ssr', minify: false, files }),
  webpack: () =>
    build({ bundler: 'webpack', env: 'ssr', minify: false, files }),
  // a client build (ES modules), run in Node as the others
  rsbuild: () => buildWithRsbuild({ files, registerCleanup: () => {} }),
}

describe.each(Object.entries(builds))('a %s build', (_name, create) => {
  it(
    'runs an effect setting state only the split component reads at the same time, written in its declaration or after it',
    async () => {
      const app = await create()
      try {
        const { result } = (await app.run(`
          const atLoad = [...globalThis.seeded]
          const html = []
          for (const route of entry.routes) {
            html.push((await entry.render(route.options.component)).replace(/<[^>]*>/g, ''))
          }
          return { atLoad, after: globalThis.seeded, html }
        `)) as {
          result: {
            atLoad: Array<string>
            after: Array<string>
            html: Array<string>
          }
        }
        const { atLoad, after, html } = result
        expect(
          Object.fromEntries(rows.map(([name], i) => [name, html[i]])),
        ).toEqual({
          initialiser: '1',
          assignment: '1',
          'compound assignment': '1',
          'pure value (control)': '5',
        })
        // each effect once; the pure value runs none
        expect([...after].sort()).toEqual([
          'assignment',
          'compound assignment',
          'initialiser',
        ])
        // the write after the declaration runs when the declaration's would
        const loaded = (name: string) => atLoad.includes(name)
        expect(loaded('assignment')).toBe(loaded('initialiser'))
        expect(loaded('compound assignment')).toBe(loaded('initialiser'))
        // and the build says as much about one as about the other
        const diagnostics = [...app.warnings, ...app.consoleMessages]
        const reports = (i: number) =>
          findDiagnostics(diagnostics, { file: file(i), root: app.root }).length
        expect(reports(1)).toBe(reports(0))
        expect(reports(2)).toBe(reports(0))
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )
})
