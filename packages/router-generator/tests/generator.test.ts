/**
 * The generator fixtures (tests/generator/<name>, configured in
 * generator-fixture.ts): each app's route tree is loaded with the real
 * router (route-tree.ts), and its routes (ids, full paths, parents, route
 * files and lazily loaded files) must be the ones listed in
 * generator-fixtures.ts (SPEC J1.4). Fixtures with conflicting routes must
 * fail with an error naming the files (J1.7). Route files the generator
 * edits or scaffolds are checked for what the edit may change
 * (owned-edits.ts) and for the custom templates. The trees' types are
 * checked against the same routes in integration/fixture-types.test.ts
 * (J1.13).
 */
import fs from 'node:fs/promises'
import path, { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  captureThrow,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import { Generator, getConfig } from '../src'
import {
  conflictingFiles,
  customTemplates,
  fixtureConfig,
  fixtureDir,
  fixtureNames,
  prepareFixture,
} from './generator-fixture'
import { fixtureRoutes } from './generator-fixtures'
import { expectOnlyOwnedEdits } from './owned-edits'
import { routeCallOf } from './route-id'
import { observeRouteTree, withRouteTree } from './route-tree'
import type { FixtureRoute } from './generator-fixtures'
import type { ObservedRoute } from './route-tree'
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
  const reactImport = /^import (.+) from "react";$/m.exec(template)![1]!
  expect(written).toMatch(
    new RegExp(
      `^import ${reactImport.replace(/[{}*]/g, '\\$&').replaceAll(' ', '\\s*')} from ['"]react['"];?$`,
      'm',
    ),
  )
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

/** Observed routes in the form of generator-fixtures.ts. */
function asFixtureRoutes(observed: Record<string, ObservedRoute>) {
  return Object.fromEntries(
    Object.entries(observed).map(([id, route]) => [
      id,
      [route.fullPath, route.parent, route.file, ...route.lazy],
    ]),
  ) as Record<string, FixtureRoute>
}

describe('generator fixtures', async () => {
  it.each(await fixtureNames())(
    'the "%s" fixture gets its routes',
    async (name) => {
      const config = fixtureConfig(name)
      const before = await prepareFixture(name)
      const generator = new Generator({ config, root: fixtureDir(name) })
      const conflicting = conflictingFiles(name)
      if (conflicting) {
        const error = await captureThrow(() => generator.run())
        for (const file of conflicting) {
          expectDiagnostic(error, {
            severity: 'error',
            file,
            distinctFrom: conflicting.filter((other) => other !== file),
          })
        }
        return
      }
      await generator.run()

      expect(fixtureRoutes[name], 'the routes of the fixture').toBeDefined()
      expect(
        asFixtureRoutes(await observeRouteTree(config.generatedRouteTree)),
      ).toEqual(fixtureRoutes[name])
      await postprocess(name, config, before)
    },
  )
})

// Windows checkouts with `autocrlf` give route files CRLF line endings: the
// routes are the same as with LF sources, and a second run changes nothing.
// Source: the #8504 confidence campaign (crlf-gen-run).
describe('route files with CRLF line endings', () => {
  const routes = {
    '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    'index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => null,
})
`,
    'posts.$postId.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/posts/$postId')({
  loader: () => 'post',
})
`,
  }

  /** Runs the generator twice on the routes with `newline` line endings. */
  async function generate(newline: string) {
    const root = await fs.mkdtemp(path.join(process.cwd(), '.tsr-crlf-'))
    try {
      await fs.mkdir(join(root, 'routes'))
      for (const [file, code] of Object.entries(routes)) {
        await fs.writeFile(
          join(root, 'routes', file),
          code.replaceAll('\n', newline),
        )
      }
      const config = getConfig({
        disableLogging: true,
        routesDirectory: join(root, 'routes'),
        generatedRouteTree: join(root, 'routeTree.gen.ts'),
        tmpDir: join(root, '.tanstack/tmp'),
      })
      const read = async () => ({
        tree: await fs.readFile(config.generatedRouteTree, 'utf8'),
        routes: await Promise.all(
          Object.keys(routes).map((file) =>
            fs.readFile(join(root, 'routes', file), 'utf8'),
          ),
        ),
      })
      await new Generator({ config, root }).run()
      const first = await read()
      const observed = await observeRouteTree(config.generatedRouteTree)
      await new Generator({ config, root }).run()
      return { first, observed, second: await read() }
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }

  it('gives the routes of LF sources, and a second run changes nothing', async () => {
    const lf = await generate('\n')
    const crlf = await generate('\r\n')
    expect(crlf.observed).toEqual(lf.observed)
    expect(crlf.second).toEqual(crlf.first)
    // The route files are left as written.
    expect(crlf.first.routes).toEqual(
      Object.values(routes).map((code) => code.replaceAll('\n', '\r\n')),
    )
  })
})
