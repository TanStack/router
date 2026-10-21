/**
 * Known route generator bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator, getConfig } from '../src'
import { recordDirectoryInputs } from './consumer-inputs'
import { routeIdOf } from './route-id'
import { routesOf } from './route-tree'

/**
 * Runs the generator on an app with a root route and `routes/moved.tsx`
 * holding `source`, like after moving a route file to `/moved`. Returns the
 * route file as the generator wrote it, the routes of the route tree (route
 * id to file) and the warnings.
 */
async function generateMovedRoute(
  source: string,
  otherFiles: Record<string, string> = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'tsr-known-bugs-'))
  try {
    await mkdir(path.join(root, 'routes'))
    await writeFile(
      path.join(root, 'routes/__root.tsx'),
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()`,
    )
    await writeFile(path.join(root, 'routes/moved.tsx'), source)
    for (const [file, content] of Object.entries(otherFiles)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), content)
    }
    const config = getConfig({
      routesDirectory: path.join(root, 'routes'),
      generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
      // Same filesystem as the app, so the generator can rename its temp files
      tmpDir: path.join(root, '.tanstack/tmp'),
    })
    await recordDirectoryInputs(root, config.generatedRouteTree)
    let error: unknown
    const { diagnostics, result: routes } = await captureDiagnostics(
      async () => {
        try {
          await new Generator({ config, root }).run()
          return await routesOf(config.generatedRouteTree)
        } catch (caught) {
          error = caught
          return undefined
        }
      },
    )
    return {
      error,
      written: await readFile(path.join(root, 'routes/moved.tsx'), 'utf8'),
      routes,
      diagnostics,
      root,
      file: path.join(root, 'routes/moved.tsx'),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

// (What Start learns of a route's option keys from the generator, which
// decides whether a route is server-only, is tested through Start's builds:
// start-plugin-core tests/known-bugs-route-options.test.ts.)

describe('route files without a Route export', () => {
  // A file without a Route export is left out of the route tree, with a
  // warning naming it.
  test.each(['export const helper = 1', 'const helper = 1\nexport { helper }'])(
    'a route file without a Route export is left out with a warning: %s',
    async (code) => {
      const { routes, diagnostics, file, root } = await generateMovedRoute(code)
      expect(routes).toEqual({ __root__: 'routes/__root.tsx' })
      expectDiagnostic(diagnostics, { file, root })
    },
  )
})

describe('route constructor imports', () => {
  // Control for the route constructor pin below (same harness).
  test('a moved route gets the id of its new path', async () => {
    const { written, error } =
      await generateMovedRoute(`import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/old')({})`)
    expect(await routeIdOf(written)).toBe('/moved')
    expect(error).toBeUndefined()
  })

  // Bug: the route constructor call is recognized by its callee name, apart
  // from its import: an aliased import (`createFileRoute as route`) is not
  // recognized.
  // Impact: the route keeps its old id when its file moves.
  test.fails(
    'a moved route with an aliased import of the constructor gets the id of its new path',
    async () => {
      const { written, error } =
        await generateMovedRoute(`import { createFileRoute as route } from '@tanstack/react-router'
export const Route = route('/old')({})`)
      expect(await routeIdOf(written)).toBe('/moved')
      expect(error).toBeUndefined()
    },
  )

  // Bug: same root cause as above, for `createFileRoute` imported from a
  // module of the app (a wrapper re-exporting it): no import from the
  // router package names it, so the generator prepends one, next to the
  // user's import of the same name.
  // Source: router-generator/src/transform/transform.ts:502-565
  // (`normalizeRouteImports` adds the import when no import of the router
  // package owns the constructor); fuzzing (oracle mode, V2), 7 unmodified
  // corpus files.
  // Impact: the written route file declares `createFileRoute` twice and no
  // longer parses, so the app fails to build.
  test.fails(
    'a moved route importing createFileRoute from a module of the app stays a valid module',
    async () => {
      const { written, error } = await generateMovedRoute(
        `import { createFileRoute } from '../lib/router'
export const Route = createFileRoute('/old')({})`,
        {
          'lib/router.ts': `export { createFileRoute } from '@tanstack/react-router'`,
        },
      )
      const { errors } = parseSync('route.tsx', written, {
        sourceType: 'module',
        showSemanticErrors: true,
      })
      expect(errors.map((error) => error.message)).toEqual([])
      expect(error).toBeUndefined()
    },
  )
})
