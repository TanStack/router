/**
 * Split groupings the compiler cannot honour fail the build of a webpack
 * or Rspack app with one error naming the route file, as `main`'s does
 * (audit-diagnostics N2: the route module's error was printed again for
 * each split chunk its code imports, whose compile reads the same file).
 * Groupings of a route that is never split (the root route, a `.lazy`
 * file) are not read: the app builds and renders, as `main`'s does, and an
 * ordinary route file with the same groupings keeps its error.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  diagnosticsOf,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import {
  build,
  rootRoute,
  routeApp,
  routeHead,
  ssrRenderEntry,
} from '../build-harness'

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

const groupingsModule = `export const groupings: Array<Array<'component'>> = [['component']]
`

describe.each(['vite', 'rspack'] as const)('%s', (bundler) => {
  test.each([
    [
      'a root route with imported groupings',
      'routes/__root.tsx',
      `import { createRootRoute } from '@tanstack/react-router'
import { groupings } from '../groupings'
export const Route = createRootRoute({
  codeSplitGroupings: groupings,
  component: () => <p>MARK_PAGE</p>,
})
`,
    ],
    [
      'a root route with groupings listing an option twice',
      'routes/__root.tsx',
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  codeSplitGroupings: [['component'], ['component']] as any,
  component: () => <p>MARK_PAGE</p>,
})
`,
    ],
    [
      'a .lazy route file with imported groupings',
      'routes/index.lazy.tsx',
      `import { createLazyFileRoute } from '@tanstack/react-router'
import { groupings } from '../groupings'
export const Route = createLazyFileRoute('/')({
  codeSplitGroupings: groupings,
  component: () => <p>MARK_PAGE</p>,
} as any)
`,
    ],
  ])(
    '%s builds and renders',
    async (_, file, route) => {
      const result = await build({
        bundler,
        minify: false,
        files: {
          'routes/__root.tsx': rootRoute,
          [file]: route,
          'groupings.ts': groupingsModule,
          'entry.ts': ssrRenderEntry.replace(
            './routes/index',
            `./${file.replace(/\.tsx$/, '')}`,
          ),
        },
      })
      expect(
        (
          await result.run(
            `return await entry.render(entry.Route.options.component)`,
          )
        ).result,
      ).toContain('MARK_PAGE')
    },
    timeout,
  )

  test(
    'an ordinary route file with imported groupings fails the build',
    async () => {
      const route = `${routeHead()}import { groupings } from '../groupings'
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  component: () => <p>MARK_PAGE</p>,
})
`
      const failure = await build({
        bundler,
        files: routeApp(route, { files: { 'groupings.ts': groupingsModule } }),
      }).then(
        () => expect.fail('the build succeeded'),
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(BuildError)
      expectDiagnostic(diagnosticsOf(failure), {
        severity: 'error',
        file: 'routes/index.tsx',
        position: { line: diagnosticPosition(route, 'groupings,').line },
      })
    },
    timeout,
  )
})
