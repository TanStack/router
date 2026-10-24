/**
 * The generator fixtures (tests/generator/<name>, configured in
 * generator-fixture.ts): each app's route tree is loaded with the real
 * router (route-tree.ts), and its routes (ids, full paths, parents, route
 * files and lazily loaded files) must be the ones listed in
 * generator-fixtures.ts (SPEC J1.4). Fixtures with conflicting routes must
 * fail with an error naming the files (J1.7). Route files the generator
 * edits or scaffolds are checked for what the edit may change
 * (owned-edits.ts) and for the custom templates. The trees' types are
 * checked against the same routes in integration/fixture-types-*.test.ts
 * (J1.13).
 */
import fs from 'node:fs/promises'
import path, { join } from 'node:path'
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { Generator } from '../src'
import {
  conflictingFiles,
  copyFixture,
  customTemplates,
  fixtureConfig,
  fixtureNames,
  prepareFixture,
} from './generator-fixture'
import { crlfRoutes, generateCrlf } from './crlf-app'
import { fixtureRoutes } from './generator-fixtures'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeCallOf } from './route-id'
import { withRouteTree } from './route-tree'
import type { FixtureRoute } from './generator-fixtures'
import type { Config } from '../src'

/**
 * Asserts that `written` applies `template` for the route at `routePath`:
 * the template's own statements (here its `react` import and its component
 * returning `Hello <path>!`) are in the scaffolded file, which the
 * generator may print in the configured style.
 */
function expectTemplateApplied(
  template: string,
  routePath: string,
  written: string,
) {
  const imports = (code: string) =>
    parseSync('route.tsx', code)
      .program.body.filter(
        (node) =>
          node.type === 'ImportDeclaration' && node.source.value === 'react',
      )
      .flatMap((node) =>
        node.type === 'ImportDeclaration'
          ? node.specifiers.map((specifier) => ({
              kind: specifier.type,
              local: specifier.local.name,
              imported:
                specifier.type === 'ImportSpecifier'
                  ? specifier.imported.type === 'Identifier'
                    ? specifier.imported.name
                    : specifier.imported.value
                  : undefined,
            }))
          : [],
      )
  expect(imports(written)).toEqual(imports(template.split('%%')[0]!))
  expect(written).toContain(`Hello ${routePath}!`)
}

/** The route id a route file of the file-modification fixture gets. */
function fileModificationRoute(file: string) {
  const name = path.basename(file).replace(/(\.lazy)?\.tsx$/, '')
  return {
    constructor: file.endsWith('.lazy.tsx')
      ? 'createLazyFileRoute'
      : 'createFileRoute',
    id: `/(test)/${name.replaceAll('.', '/')}`,
  }
}

/** Fixture-specific checks after the run, beyond the routes. */
async function postprocess(
  name: string,
  config: Config,
  before: Record<string, string>,
) {
  const routeFile = (file: string) =>
    fs.readFile(join(config.routesDirectory, file), 'utf8')
  switch (name) {
    case 'file-modification': {
      for (const [file, source] of Object.entries(before)) {
        const written = await routeFile(file)
        expect(routeCallOf(written), file).toEqual(fileModificationRoute(file))
        if (source !== '') {
          expectOnlyOwnedEdits(source, written)
        }
      }
      // (the lazy file switched to createLazyFileRoute gives the page)
      await withRouteTree(config.generatedRouteTree, async ({ renderAt }) => {
        expect(await renderAt('/bar')).toContain('Bar from its lazy file')
      })
      break
    }
    case 'custom-scaffolding': {
      for (const [file, routePath] of [
        ['index.tsx', '/'],
        ['api/bar.tsx', '/api/bar'],
        ['foo.lazy.tsx', '/foo'],
      ] as const) {
        expectTemplateApplied(
          file.endsWith('.lazy.tsx')
            ? customTemplates.lazyRouteTemplate
            : customTemplates.routeTemplate,
          routePath,
          await routeFile(file),
        )
      }
      // (the scaffolds are routes whose components render)
      await withRouteTree(config.generatedRouteTree, async ({ renderAt }) => {
        for (const url of ['/', '/api/bar', '/foo']) {
          expect(await renderAt(url)).toContain(`Hello ${url}!`)
        }
      })
      break
    }
    case 'route-groups': {
      // (the `(bar)` group's pathless layout wraps its children's pages)
      await withRouteTree(config.generatedRouteTree, async ({ renderAt }) => {
        for (const page of ['about', 'xyz']) {
          const html = await renderAt(`/asdf/${page}`)
          expect(html).toContain('Hello /(foo)/asdf/(bar)/_layout!')
          expect(html).toContain(`Hello /(foo)/asdf/(bar)/_layout/${page}!`)
        }
      })
      break
    }
    case 'append-and-prepend': {
      // (routeTreeFileHeader / routeTreeFileFooter, api/file-based-routing.md)
      const lines = (await fs.readFile(config.generatedRouteTree, 'utf8'))
        .split('\n')
        .filter((line) => line.trim() !== '')
      expect(lines.slice(0, 2)).toEqual(['// prepend1', '// prepend2'])
      expect(lines.slice(-2)).toEqual(['// append1', '// append2'])
      break
    }
  }
}

/**
 * Asserts the routes of the router built from the generated route tree at
 * `treeFile` against `expected` (generator-fixtures.ts): each route's full
 * path, parent and route file; and, for each route with lazy files, that
 * each of them loads only on demand: it is not loaded before the router
 * loads the route (`loadRouteChunk`, routes loaded one after the other), it
 * is loaded after, and the options of its lazy `Route` are the route's.
 * Other modules the demand loads (generated support, shared dependencies)
 * are free (SPEC J1.4, §5.3, §5.8).
 */
async function expectFixtureRoutes(
  treeFile: string,
  expected: Record<string, FixtureRoute>,
) {
  await withRouteTree(treeFile, async (tree) => {
    const { router, fileOf, loadedFiles } = tree
    expect(
      Object.fromEntries(
        Object.values(router.routesById).map((route) => [
          route.id,
          [route.fullPath, route.parentRoute?.id ?? null, fileOf(route.id)],
        ]),
      ),
      'the routes of the fixture',
    ).toEqual(
      Object.fromEntries(
        Object.entries(expected).map(([id, [fullPath, parent, file]]) => [
          id,
          [fullPath, parent, file],
        ]),
      ),
    )
    const treeDir = path.dirname(await fs.realpath(treeFile))
    for (const [id, [, , , ...lazy]] of Object.entries(expected)) {
      if (lazy.length === 0) {
        continue
      }
      const route = router.routesById[id]!
      expect(
        loadedFiles().filter((file) => lazy.includes(file)),
        `the lazy files of ${id} loaded before the route is loaded`,
      ).toEqual([])
      await router.loadRouteChunk(route)
      expect(
        lazy.filter((file) => !loadedFiles().includes(file)),
        `the lazy files of ${id} not loaded with the route`,
      ).toEqual([])
      for (const file of lazy) {
        const { Route } = await tree.import(path.join(treeDir, file))
        if (Route) {
          const { id: _id, ...options } = Route.options
          for (const [key, value] of Object.entries(options)) {
            expect(
              route.options[key],
              `${id}'s ${key} after loading ${file}`,
            ).toBe(value)
          }
        }
      }
    }
  })
}

describe('generator fixtures', async () => {
  it.each(await fixtureNames())(
    'the "%s" fixture gets its routes',
    async (name) => {
      // A copy: the generator may edit the fixture's route files
      const dir = await copyFixture(name)
      // (temporary files on the copy's filesystem)
      const config = {
        ...fixtureConfig(name, dir),
        tmpDir: path.join(dir, 'tmp'),
      }
      const before = await prepareFixture(name, dir)
      const generator = new Generator({ config, root: dir })
      const conflicting = conflictingFiles(name, dir)
      if (conflicting) {
        const error = await captureThrow(() => generator.run())
        for (const file of conflicting) {
          expectDiagnostic(error, {
            severity: 'error',
            root: dir,
            file,
          })
        }
        return
      }
      await generator.run()

      expect(fixtureRoutes[name], 'the routes of the fixture').toBeDefined()
      await expectFixtureRoutes(config.generatedRouteTree, fixtureRoutes[name]!)
      await postprocess(name, config, before)
    },
  )
})

// Windows checkouts with `autocrlf` give route files CRLF line endings: the
// routes are the same as with LF sources, and a second run changes nothing.
// Source: review of #8504.
describe('route files with CRLF line endings', () => {
  it('gives the routes of LF sources, and a second run changes nothing', async () => {
    const lf = await generateCrlf('\n')
    const crlf = await generateCrlf('\r\n')
    expect(crlf.observed).toEqual(lf.observed)
    expect(crlf.second.observed).toEqual(crlf.first.observed)
    expect(crlf.second.routes).toEqual(crlf.first.routes)
    // The route files are left as written.
    expect(crlf.first.routes).toEqual(
      Object.values(crlfRoutes).map((code) => code.replaceAll('\n', '\r\n')),
    )
  })
})
