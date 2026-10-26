/**
 * A module Start compiles that the compiler cannot parse never ships
 * untransformed (SPEC J4.12, G5). A TypeScript grammar error the bundler's
 * transpiler lets through (`value!: string = '…'`: a definite assignment
 * assertion with an initializer, which SWC and esbuild accept) in a module
 * that defines a server function fails the build with an error positioned in
 * that module, instead of a client bundle carrying the handler and what it
 * reads. Rsbuild (SWC) is the row where the bundler alone would have shipped
 * the module; on Vite its own transpiler rejects the file too.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a server-fn module the compiler cannot parse fails the build with an error positioned in the module',
    async () => {
      const outcome = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
class Secret {
  value!: string = 'MARK_SERVER_SECRET'
}
export const reveal = createServerFn().handler(async () => new Secret().value)
`,
          'src/entry.ts': `export { reveal } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      }).then(
        (build) => ({
          built: true as const,
          secret: build.client.where('MARK_SERVER_SECRET'),
        }),
        (error: unknown) => {
          if (!(error instanceof StartBuildError)) {
            throw error
          }
          return {
            built: false as const,
            diagnostics: error.diagnostics,
            root: error.root,
          }
        },
      )
      if (outcome.built) {
        expect.fail(
          `the build succeeded; the handler's text is ${outcome.secret} in the client bundle`,
        )
      }
      expectDiagnostic(outcome.diagnostics, {
        severity: 'error',
        file: 'src/fns.ts',
        root: outcome.root,
        position: { line: 3 },
      })
    },
    timeout,
  )
})
