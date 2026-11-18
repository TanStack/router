/**
 * A `Route` export sharing its name with a declaration. A type has no runtime
 * value: the route splits and nothing is said. A second value isn't a route
 * the compiler can read: the page lands in the route module and the build warns
 * once, naming the file.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head, rootRoute } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

const route = `export const Route = createFileRoute('/')({
  component: () => <p>MARK_PAGE_END</p>,
})
`

const typeShapes: Array<[string, string]> = [
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
  const files = (source: string) => ({
    'routes/__root.tsx': rootRoute,
    'routes/index.tsx': source,
    'entry.ts': `export { Route } from './routes/index'\n`,
  })
  const reportedIn = (app: BuildResult) =>
    findDiagnostics([...app.warnings, ...app.consoleMessages], {
      file: 'routes/index.tsx',
      root: app.root,
    }).length

  test.each(typeShapes)(
    '`Route` merged with %s splits, unreported',
    async (_, declaration) => {
      const app = await build({
        bundler,
        env: 'client',
        minify: false,
        files: files(`${head}${declaration}${route}`),
      })
      try {
        expect({
          where: app.where('MARK_PAGE_END'),
          warnings: reportedIn(app),
        }).toEqual({ where: 'lazy', warnings: 0 })
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )

  test.each([
    ['after the route', `${route}namespace Route { export type T = string }\n`],
    [
      'an options variable merged with a type namespace',
      `namespace opts { export type T = string }
const opts = { component: () => <p>MARK_PAGE_END</p> }
export const Route = createFileRoute('/')(opts)
`,
    ],
  ] as const)(
    '%s splits, unreported',
    async (_, body) => {
      const app = await build({
        bundler,
        env: 'client',
        minify: false,
        files: files(`${head}${body}`),
      })
      try {
        expect({
          where: app.where('MARK_PAGE_END'),
          warnings: reportedIn(app),
        }).toEqual({ where: 'lazy', warnings: 0 })
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )
})
