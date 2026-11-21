/**
 * A Start route file whose `Route` or options variable shares its name with a
 * type namespace, with options only the server may see (SPEC J2, J4): TypeScript
 * erases the namespace, so the route is read as if it weren't there. A helper
 * outside the route tree that exports a `Route` is nobody's route.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`
const options = `{
  component: () => <p>MARK_PAGE_END</p>,
  server: { handlers: { GET: () => new Response('MARK_SERVER_END') } },
}`
const namespace = (name: string) =>
  `namespace ${name} { export type T = string }\n`
const app = (route: string) => ({
  'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Outlet })
`,
  'src/routes/index.tsx': route,
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/entry.ts': `export { getRouter } from './router'\n`,
})

const routes: Array<[string, string]> = [
  [
    '`Route` merged with a type namespace',
    `${head}${namespace('Route')}export const Route = createFileRoute('/')(${options})\n`,
  ],
  [
    '`Route` merged with a dotted type namespace',
    `${head}${namespace('Route.A')}export const Route = createFileRoute('/')(${options})\n`,
  ],
  [
    '`Route` merged with an exported dotted type namespace',
    `${head}export ${namespace('Route.A')}export const Route = createFileRoute('/')(${options})\n`,
  ],
  [
    'an options variable merged with a type namespace',
    `${head}${namespace('opts')}const opts = ${options}\nexport const Route = createFileRoute('/')(opts)\n`,
  ],
]

describe.each(startBundlers)('a %s build', (bundler) => {
  test.each(routes)(
    '%s builds, with its server options out of the client',
    async (_, route) => {
      const build = await buildStart({
        bundler,
        files: app(route),
        entry: 'src/entry.ts',
      })
      expect(build.client.where('MARK_SERVER_END')).toBe('nowhere')
      expect(build.client.where('MARK_PAGE_END')).toBe('lazy')
    },
    timeout,
  )

  test.each([
    ['a function', `export function Route() { return null }\n`],
    ['a class', `export class Route {}\n`],
  ])(
    'a helper outside the route tree exporting %s as `Route` reports nothing',
    async (_, source) => {
      const build = await buildStart({
        bundler,
        files: {
          ...app(`${head}export const Route = createFileRoute('/')({})\n`),
          'src/helper.tsx': `import * as Router from '@tanstack/react-router'
export const usesRouter = () => Router.useRouter
${source}`,
          'src/entry.ts': `export { getRouter } from './router'
export { Route as Helper, usesRouter } from './helper'
`,
        },
        entry: 'src/entry.ts',
      })
      expect(
        findDiagnostics(
          [...build.client.warnings, ...build.client.consoleMessages],
          { file: 'src/helper.tsx', root: build.client.root },
        ),
      ).toEqual([])
    },
    timeout,
  )
})
