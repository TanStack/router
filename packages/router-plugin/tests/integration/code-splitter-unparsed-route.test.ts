/**
 * A route module the compiler cannot parse is reported, not silently left
 * as it is (SPEC J2.8, J2.19): a TypeScript grammar error the bundler's
 * transpiler lets through (`let label!: string = '…'`: a definite assignment
 * assertion with an initializer, which SWC accepts on a variable; since
 * Rspack 2.2.9 it rejects the class-field form) leaves the route unsplit
 * and the build warns once, naming the route file. Rspack (SWC) is the row
 * where the bundler alone would have said nothing; Vite's own transpiler, and
 * the harness's webpack loader (Oxc), reject the file themselves.
 */
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, rootRoute, ssrRenderEntry } from '../build-harness'

test.each(['rspack'] as const)(
  'a route module the compiler cannot parse builds unsplit and is reported once, naming the file (%s)',
  async (bundler) => {
    const app = await build({
      bundler,
      env: 'ssr',
      minify: false,
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': `${head}let label!: string = 'MARK_LABEL'
function Page() {
  return <p>MARK_COMPONENT {label}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        'entry.ts': ssrRenderEntry,
      },
    })
    const run = await app.run(
      `return await entry.render(entry.Route.options.component)`,
    )
    expect(run.result).toBe('<p>MARK_COMPONENT <!-- -->MARK_LABEL</p>')
    expectDiagnostic([...app.warnings, ...app.consoleMessages], {
      severity: 'warning',
      file: 'routes/index.tsx',
      root: app.root,
      times: 1,
    })
  },
  120_000,
)
