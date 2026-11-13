/**
 * Route files of a Start app that review round 1 (Fable 5.2, 2026-11-13,
 * findings F5-1 to F5-4) found silent or misreported, on Vite and Rsbuild.
 * A listed route file whose `Route` the compiler does not read is reported,
 * naming the file and saying its server options ship (SPEC J2.8, J2.10, G5),
 * and the fix the report offers makes it a route whose server options stay
 * out of the client (R101); a parenthesised route id is a string literal the
 * generator keeps up; a generator warning prints once per build, also when
 * Start's plugins are passed inline to Vite (the same objects for every
 * config resolution).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000
const RP = '@tanstack/react-router'

const rootFile = `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute({ component: () => <Outlet /> })
`
const options = `{
  headers: () => ({ 'x-secret': 'MARK_HEADERS' }),
  server: { handlers: { GET: () => new Response('MARK_SERVER') } },
  component: () => <p>MARK_PAGE</p>,
}`

function build(bundler: (typeof startBundlers)[number], route: string) {
  return buildStart({
    bundler,
    files: {
      'src/routes/__root.tsx': rootFile,
      'src/routes/x.tsx': route,
      'src/entry.ts': `export { routeTree } from './routeTree.gen'\n`,
    },
    entry: 'src/entry.ts',
  })
}

/** The router plugin's warnings of a build, each text once (a host may print one on several channels). */
function routerWarnings(
  diagnostics: ReadonlyArray<{ severity: string; text: string }>,
) {
  return [
    ...new Set(
      diagnostics.flatMap((d) =>
        d.severity === 'warning'
          ? (d.text.match(/\[tanstack-router\][^\n]*/g) ?? [])
          : [],
      ),
    ),
  ]
}

const fixed = `import { createFileRoute } from '${RP}'
export const Route = createFileRoute('/x')(${options})
`

describe.each(startBundlers)('a %s build', (bundler) => {
  test.each([
    {
      name: 'round 1 F5-1: a code-based `createRoute`',
      route: `import { createRoute } from '${RP}'
import { Route as rootRoute } from './__root'
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/x',
  ...${options},
})
`,
      cause: 'is created by `createRoute`',
    },
    {
      name: 'round 1 F5-2: a `Route` destructured from an object',
      route: `import { createFileRoute } from '${RP}'
export const { Route } = { Route: createFileRoute('/x')(${options}) }
`,
      cause:
        'is not created by a route constructor call bound to its `Route` export',
    },
    {
      name: 'round 1 F5-2: a `Route` destructured from an array',
      route: `import { createFileRoute } from '${RP}'
export const [Route] = [createFileRoute('/x')(${options})]
`,
      cause:
        'is not created by a route constructor call bound to its `Route` export',
    },
  ])(
    '$name in a listed route file is reported, saying its server options ship, and the offered fix keeps them out of the client',
    async ({ route, cause }) => {
      const before = await build(bundler, route)
      // (each environment reports it; the client's, whose build removes
      // the server options, says they ship)
      const warnings = routerWarnings(before.diagnostics)
      expect(warnings).not.toEqual([])
      for (const warning of warnings) {
        expect(warning).toContain(`The route of src/routes/x.tsx ${cause}`)
      }
      expect(warnings).toContainEqual(
        expect.stringContaining('any server code in them ships to the client'),
      )
      expectDiagnostic(before.diagnostics, {
        severity: 'warning',
        file: 'src/routes/x.tsx',
      })
      // (as every unrecognised route shape: the build goes on, the route is
      // not split, and its server options ship with the warning)
      expect({
        page: before.client.where('MARK_PAGE'),
        headers: before.client.where('MARK_HEADERS'),
      }).toEqual({ page: 'eager', headers: 'eager' })

      const after = await build(bundler, fixed)
      expectNoProblems(after.diagnostics)
      expect({
        page: after.client.where('MARK_PAGE'),
        headers: after.client.where('MARK_HEADERS'),
        server: after.client.where('MARK_SERVER'),
      }).toEqual({ page: 'lazy', headers: 'nowhere', server: 'nowhere' })
    },
    timeout,
  )

  test.each([
    { name: 'the file’s own', id: `('/x')` },
    { name: 'a stale', id: `('/wrong')` },
  ])(
    'round 1 F5-3: $name route id in parentheses is a string literal the generator keeps up, with no message',
    async ({ id }) => {
      const result = await build(
        bundler,
        `import { createFileRoute } from '${RP}'
export const Route = createFileRoute(${id})(${options})
`,
      )
      expectNoProblems(result.diagnostics)
      const written = await readFile(
        path.join(result.root, 'src/routes/x.tsx'),
        'utf8',
      )
      expect(written).toContain(`createFileRoute(('/x'))(`)
      expect({
        page: result.client.where('MARK_PAGE'),
        server: result.client.where('MARK_SERVER'),
      }).toEqual({ page: 'lazy', server: 'nowhere' })
    },
    timeout,
  )

  // (Vite: the harness passes Start's plugins inline, the same objects to
  // the top-level config resolution and to each environment's)
  test(
    'round 1 F5-4: a generator warning is printed once per build',
    async () => {
      const result = await build(
        bundler,
        `import { createFileRoute } from '${RP}'
const id = '/x'
export const Route = createFileRoute(id)(${options})
`,
      )
      const printed = result.diagnostics.filter(
        (d) =>
          d.source === 'console' && d.text.includes('not a string literal'),
      )
      expect(printed).toHaveLength(1)
    },
    timeout,
  )
})
