/**
 * A `Route` export sharing its name with a type declaration. What the compiler
 * can't split it must say (R78): the page component lands in the route module
 * and the build warns once, naming the file; a route that splits says nothing.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, rootRoute } from '../build-harness'

const timeout = 60_000

const route = `export const Route = createFileRoute('/')({
  component: () => <p>MARK_PAGE_END</p>,
})
`

const shapes: Array<[string, string]> = [
  ['a type namespace', `namespace Route { export type T = string }\n`],
  [
    'an exported type namespace',
    `export namespace Route { export type T = string }\n`,
  ],
  ['a dotted type namespace', `namespace Route.A { export type T = string }\n`],
  [
    'an exported dotted type namespace',
    `export namespace Route.A { export type T = string }\n`,
  ],
  ['a declared namespace', `declare namespace Route { type T = string }\n`],
  ['a type alias', `type Route = string\n`],
  ['an exported type alias', `export type Route = string\n`],
  ['an interface', `interface Route { a: string }\n`],
]

describe.each(['vite', 'rspack', 'webpack'] as const)('on %s', (bundler) => {
  test.each(shapes)(
    '`Route` merged with %s splits or warns once',
    async (_, declaration) => {
      const app = await build({
        bundler,
        env: 'client',
        minify: false,
        files: {
          'routes/__root.tsx': rootRoute,
          'routes/index.tsx': `${head}${declaration}${route}`,
          'entry.ts': `export { Route } from './routes/index'\n`,
        },
      })
      try {
        const reported = findDiagnostics(
          [...app.warnings, ...app.consoleMessages],
          { file: 'routes/index.tsx', root: app.root },
        )
        expect({
          where: app.where('MARK_PAGE_END'),
          warnings: reported.length,
        }).toEqual(
          app.where('MARK_PAGE_END') === 'lazy'
            ? { where: 'lazy', warnings: 0 }
            : { where: 'eager', warnings: 1 },
        )
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )
})
