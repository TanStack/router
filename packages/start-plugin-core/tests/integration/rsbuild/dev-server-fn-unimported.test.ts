/**
 * Start's Rsbuild dev server, a server function file whose last import is
 * removed (H2-dev): the function leaves the registry and the file leaves the
 * server compilation, as on main. A provider the server-function resolver
 * imports is not a caller of its own (rule 2 of the Rsbuild host).
 * Source: hotspot 3 cross-review rows (review-hotspot3-fable-on-gemini.md,
 * H2-dev).
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { rsbuildEntries } from '../route-css-cases'

const timeout = 120_000

const root = `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
`
const fns = `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_GREET')
`
const withFn = `import { createFileRoute } from '@tanstack/react-router'
import { greet } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => greet(),
  component: () => <p>MARK_INDEX</p>,
})
`
const withoutFn = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => <p>MARK_INDEX</p>,
})
`

describe('rsbuild dev: a server function file nothing imports any more', () => {
  // H2-dev, what the user sees: the file is still a module of the server
  // compilation (the resolver imports its provider, whose record keeps the
  // function registered), so deleting it fails the compile.
  test(
    'the route drops its import, then the file is deleted: the server compiles',
    async () => {
      const server = await startRsbuildStartDevServer({
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/fns.ts': fns,
          'src/routes/index.tsx': withFn,
        },
      })
      await server.settle()
      await server.edit({ 'src/routes/index.tsx': withoutFn })
      expect(server.errors).toEqual([])
      await server.edit({ 'src/fns.ts': null }, { accept: () => true })
      // (the next compile takes every change the watcher saw: a file that is
      // still a module is built again with it)
      await server.edit({ 'src/routes/index.tsx': `${withoutFn}// again\n` })
      expect(server.rebuilt.filter((file) => file.includes('fns'))).toEqual([])
      expect(server.errors).toEqual([])
    },
    timeout,
  )

  // the same file, edited to something that does not compile
  test(
    'the route drops its import, then the file gets a syntax error: the server compiles',
    async () => {
      const server = await startRsbuildStartDevServer({
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/fns.ts': fns,
          'src/routes/index.tsx': withFn,
        },
      })
      await server.settle()
      await server.edit({ 'src/routes/index.tsx': withoutFn })
      // (a file no compilation reads gets no compile: the edit is accepted)
      await server.edit(
        { 'src/fns.ts': `export const broken = (\n` },
        { accept: () => true },
      )
      // (the next compile takes every change the watcher saw: a file that is
      // still a module is built again with it)
      await server.edit({ 'src/routes/index.tsx': `${withoutFn}// again\n` })
      expect(server.rebuilt.filter((file) => file.includes('fns'))).toEqual([])
      expect(server.errors).toEqual([])
    },
    timeout,
  )
})

describe('rsbuild dev: a server function file nothing imports any more is no module', () => {
  // H2-dev, strict: one save of the route (again) and of the file. A file
  // that is still a module of a compilation is built again with it. On
  // head the server-function resolver keeps importing the file's provider,
  // whose record keeps the function registered: the file stays a module.
  // Main drops it on the edit that removes the import.
  test(
    'the route drops its import: a later save of the file compiles nothing of it',
    async () => {
      const server = await startRsbuildStartDevServer({
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/fns.ts': fns,
          'src/routes/index.tsx': withFn,
        },
      })
      await server.settle()
      await server.edit({ 'src/routes/index.tsx': withoutFn })
      await server.edit({
        'src/fns.ts': fns.replace('MARK_GREET', 'MARK_GREET_2'),
        'src/routes/index.tsx': `${withoutFn}// again\n`,
      })
      expect(server.rebuilt.filter((file) => file.includes('fns'))).toEqual([])
      expect(server.errors).toEqual([])
    },
    timeout,
  )

  // and back: the import returns, the function is provided again
  test(
    'the route drops its import, then imports the file again: the server compiles it',
    async () => {
      const server = await startRsbuildStartDevServer({
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/fns.ts': fns,
          'src/routes/index.tsx': withFn,
        },
      })
      await server.settle()
      await server.edit({ 'src/routes/index.tsx': withoutFn })
      await server.edit({ 'src/routes/index.tsx': withFn })
      expect(
        server.rebuilt.filter((file) => file.includes('fns')).length,
      ).toBeGreaterThan(0)
      expect(server.errors).toEqual([])
    },
    timeout,
  )
})

describe('rsbuild dev: a server function file that is still imported', () => {
  // the positive control of the rows above: with the import kept, the file
  // is a module and its syntax error is reported
  test(
    'with the import kept, a syntax error in the file is reported',
    async () => {
      const server = await startRsbuildStartDevServer({
        files: {
          ...rsbuildEntries,
          'src/routes/__root.tsx': root,
          'src/fns.ts': fns,
          'src/routes/index.tsx': withFn,
        },
      })
      await server.settle()
      const since = server.diagnostics.length
      await server.edit({ 'src/fns.ts': `export const broken = (\n` })
      expectDiagnostic(server.diagnostics.slice(since), {
        severity: 'error',
        file: 'src/fns.ts',
        root: server.root,
      })
    },
    timeout,
  )
})
