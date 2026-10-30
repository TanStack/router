/**
 * A route module that does not parse never silently drops out of a build
 * (R86, SPEC J2.8): the route generator cannot read it, so a build that
 * does not watch fails, naming the file, also where the bundler's own
 * transpiler lets it through. The grammar error here
 * (`let label!: string = '…'`: a definite assignment assertion with an
 * initializer) is one SWC accepts on a variable (since Rspack 2.2.9 it
 * rejects the class-field form): Rspack is the row where the bundler alone
 * would have said nothing.
 */
import { expect, test } from 'vitest'
import { diagnosticsOf } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, rootRoute, ssrRenderEntry } from '../build-harness'

test.each(['vite', 'rspack', 'webpack'] as const)(
  'a route module that does not parse fails the build, naming the file (%s)',
  async (bundler) => {
    const failure = await build({
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
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure, 'the build succeeded').toBeDefined()
    expect(
      diagnosticsOf(failure).some(({ text }) =>
        text.includes('routes/index.tsx'),
      ),
      String(failure),
    ).toBe(true)
  },
  120_000,
)
