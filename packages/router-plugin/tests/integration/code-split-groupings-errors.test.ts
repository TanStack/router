/**
 * Split groupings the compiler cannot honour fail the build of a webpack
 * or Rspack app with one error naming the route file, as `main`'s does
 * (audit-diagnostics N2: the route module's error was printed again for
 * each split chunk its code imports, whose compile reads the same file).
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { build, routeApp, routeHead } from '../build-harness'

const timeout = 60_000

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    'an option that cannot be split fails the build with one error at the value',
    async () => {
      const groupings = "[['component', 'loaderx']]"
      const route = `${routeHead()}export const Route = createFileRoute('/')({
  codeSplitGroupings: ${groupings} as any,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`
      const failure = await build({
        bundler,
        env: 'client',
        files: routeApp(route, { env: 'client' }),
      }).then(
        () => expect.fail('the build succeeded'),
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(BuildError)
      expectDiagnostic(diagnosticsOf(failure), {
        severity: 'error',
        file: 'routes/index.tsx',
        position: { line: diagnosticPosition(route, groupings).line },
      })
      // (the bundler's errors, each as it prints it)
      expect(
        (failure as BuildError).errors.filter((e) =>
          e.includes('codeSplitGroupings'),
        ),
      ).toHaveLength(1)
    },
    timeout,
  )
})
