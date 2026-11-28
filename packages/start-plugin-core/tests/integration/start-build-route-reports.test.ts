/**
 * Reports about route files of a Start app, on Vite and Rsbuild. A listed
 * route file whose `Route` the compiler does not read is reported, naming
 * the file (SPEC J2.8, J2.10, G5), and the fix the report offers makes it
 * a route whose server options stay out of the client; a parenthesised
 * route id is a string literal the generator keeps up; a generator warning
 * prints once per build, also when Start's plugins are passed inline to
 * Vite (the same objects for every config resolution); the warning about
 * the id of a constructor the generator repairs prints once, at the id's
 * position in the file as the generator wrote it. Source: review rounds 1
 * and 2 (F5-1 to F5-4).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'

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
    },
    {
      name: 'round 1 F5-2: a `Route` destructured from an object',
      route: `import { createFileRoute } from '${RP}'
export const { Route } = { Route: createFileRoute('/x')(${options}) }
`,
    },
    {
      name: 'round 1 F5-2: a `Route` destructured from an array',
      route: `import { createFileRoute } from '${RP}'
export const [Route] = [createFileRoute('/x')(${options})]
`,
    },
  ])(
    '$name in a listed route file is reported, and the offered fix keeps them out of the client',
    async ({ route }) => {
      const before = await build(bundler, route)
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
  )

  // The client's compile reports it (Start's server environments compile the
  // same options): one text, saying what applies to a root in a build (it
  // is not split, a build has no hot updates; its server options are not
  // removed). Source: diagnostics spike (2026-11-24), Fable 1d, decision 4.
  test('a wrapped root route is reported once, with what applies to it', async () => {
    const result = await buildStart({
      bundler,
      files: {
        'src/routes/__root.tsx': `import { Outlet, createRootRoute } from '${RP}'
const wrap = <T,>(route: T) => route
export const Route = wrap(createRootRoute({ component: () => <Outlet /> }))
`,
        'src/routes/x.tsx': fixed,
        'src/entry.ts': `export { routeTree } from './routeTree.gen'\n`,
      },
      entry: 'src/entry.ts',
    })
    const reports = findDiagnostics(result.diagnostics, {
      severity: 'warning',
      file: 'src/routes/__root.tsx',
      root: result.root,
    })
    // reported, and once on each channel that carries it (Vite's build
    // warnings; Rsbuild's printed report and the stats behind it)
    expect(reports.length).toBeGreaterThan(0)
    const perChannel = new Map<unknown, number>()
    for (const { source } of reports) {
      perChannel.set(source, (perChannel.get(source) ?? 0) + 1)
    }
    expect([...perChannel.values()]).toEqual(
      [...perChannel.values()].map(() => 1),
    )
    for (const { text } of reports) {
      expect(text).toContain('are not removed')
      expect(text).not.toContain('code-split')
      expect(text).not.toContain('hot-updated')
    }
  })

  test.each([
    { name: 'the file’s own', id: `('/x')` },
    { name: 'a stale', id: `('/wrong')` },
  ])(
    '$name route id in parentheses is a string literal the generator keeps up, with no message',
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
  )

  // (the generator repairs `createLazyFileRoute` in a route file into
  // `createFileRoute`, four characters shorter, before the id it reports)
  test('a non-literal id of a constructor the generator repairs is reported once, at its position in the repaired file', async () => {
    const result = await build(
      bundler,
      `import { createLazyFileRoute } from '${RP}'
const ID = '/x'
export const Route = createLazyFileRoute(ID as any)({ component: () => null } as any)
`,
    )
    const written = await readFile(
      path.join(result.root, 'src/routes/x.tsx'),
      'utf8',
    )
    expect(written).toContain('= createFileRoute(ID as any)(')
    const printed = findDiagnostics(
      result.diagnostics.filter((d) => d.source === 'console'),
      { severity: 'warning', file: 'src/routes/x.tsx', root: result.root },
    )
    expect(printed).toHaveLength(1)
    expectDiagnostic(printed, {
      severity: 'warning',
      file: 'src/routes/x.tsx',
      root: result.root,
      position: diagnosticPosition(written, 'ID as any'),
    })
  })

  // (Vite: the harness passes Start's plugins inline, the same objects to
  // the top-level config resolution and to each environment's)
  test('a generator warning is printed once per build', async () => {
    const result = await build(
      bundler,
      `import { createFileRoute } from '${RP}'
const id = '/x'
export const Route = createFileRoute(id)(${options})
`,
    )
    expect(
      findDiagnostics(
        result.diagnostics.filter((d) => d.source === 'console'),
        { severity: 'warning', file: 'src/routes/x.tsx', root: result.root },
      ),
    ).toHaveLength(1)
  })
})
