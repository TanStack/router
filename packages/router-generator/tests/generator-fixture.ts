/**
 * Shared test helper: the generator fixtures (tests/generator/<name>), each
 * an app with its own configuration, shared by generator.test.ts (routes)
 * and integration/fixture-types-*.test.ts (types). A fixture runs in its own
 * directory or in a copy (`copyFixture`); the expected routes are in
 * generator-fixtures.ts.
 */
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path, { join } from 'node:path'
import { onTestFinished } from 'vitest'
import {
  index,
  layout,
  physical,
  rootRoute,
  route,
} from '@tanstack/virtual-file-routes'
import { getConfig } from '../src'
import type { Config } from '../src'

/** The directory of the fixtures. */
export const fixturesDir = join(import.meta.dirname, 'generator')

/** The names of the fixtures. */
export function fixtureNames() {
  return fs.readdir(fixturesDir)
}

/** The directory of the fixture `name` in this package. */
export function fixtureDir(name: string) {
  return join(fixturesDir, name)
}

/**
 * Copies the fixture `name` (without its generated route trees) to a new
 * temporary directory, with this package's `node_modules` for its imports;
 * the copy is removed when the test finishes. Returns the copy.
 */
export async function copyFixture(name: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `tsr-fixture-${name}-`))
  onTestFinished(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.cp(fixtureDir(name), dir, {
    recursive: true,
    filter: (source) => !/[\\/]routeTree\.gen\.[jt]s$/.test(source),
  })
  await fs.symlink(
    path.resolve(import.meta.dirname, '../node_modules'),
    join(dir, 'node_modules'),
    'junction',
  )
  return dir
}

/** The custom templates of the custom-scaffolding fixture. */
export const customTemplates = {
  routeTemplate: [
    'import * as React from "react";\n',
    '%%tsrImports%%\n\n',
    '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
    'function RouteComponent() { return "Hello %%tsrPath%%!" };\n',
  ].join(''),
  lazyRouteTemplate: [
    'import React, { useState } from "react";\n',
    '%%tsrImports%%\n\n',
    '%%tsrExportStart%%{\n component: RouteComponent\n }%%tsrExportEnd%%\n\n',
    'function RouteComponent() { return "Hello %%tsrPath%%!" };\n',
  ].join(''),
}

/**
 * The configuration of the fixture `name` in `dir`: its `tsr.config.json`
 * if it has one, its `routes` directory and `routeTree.gen.ts`, and the
 * options the fixture is about.
 */
export function fixtureConfig(name: string, dir = fixtureDir(name)): Config {
  const configDirectory = existsSync(join(dir, 'tsr.config.json'))
    ? dir
    : undefined
  const config = getConfig(
    {
      disableLogging: true,
      routesDirectory: dir + '/routes',
      generatedRouteTree: dir + '/routeTree.gen.ts',
    },
    configDirectory,
  )
  switch (name) {
    case 'append-and-prepend':
      config.routeTreeFileHeader = ['// prepend1', '// prepend2']
      config.routeTreeFileFooter = ['// append1', '// append2']
      break
    case 'no-formatted-route-tree':
      config.enableRouteTreeFormatting = false
      break
    case 'custom-tokens':
      config.indexToken = '_1nd3x'
      config.routeToken = '_r0ut3_'
      break
    case 'escaped-custom-tokens':
      config.indexToken = '_1nd3x'
      config.routeToken = '_r0ut3_'
      break
    case 'virtual':
      config.virtualRouteConfig = rootRoute('root.tsx', [
        index('index.tsx'),
        route('$lang', [index('pages.tsx')]),
        layout('layout.tsx', [
          route('/dashboard', 'db/dashboard.tsx', [
            index('db/dashboard-index.tsx'),
            route('/invoices', 'db/dashboard-invoices.tsx', [
              index('db/invoices-index.tsx'),
              route('$id', 'db/invoice-detail.tsx'),
            ]),
          ]),
          physical('/hello', 'subtree'),
        ]),
      ])
      break
    case 'virtual-with-escaped-underscore':
      // Escaped underscores in physical routes mounted via virtual config:
      // originalRoutePath is correctly prefixed when paths are updated.
      config.virtualRouteConfig = rootRoute('__root.tsx', [
        index('index.tsx'),
        physical('/api', 'physical-routes'),
      ])
      break
    case 'types-disabled':
      config.disableTypes = true
      config.generatedRouteTree = dir + `/routeTree.gen.js`
      break
    case 'custom-scaffolding':
      config.customScaffolding = customTemplates
      break
    case 'routeFileIgnore':
      config.routeFileIgnorePattern = 'ignoredPattern'
      config.routeFileIgnorePrefix = 'imIgnored'
      break
    case 'routeFilePrefix':
      config.routeFileIgnorePattern = 'ignoredPattern'
      config.routeFilePrefix = 'r&'
      break
    case 'regex-tokens-inline':
      // indexToken matches patterns like "index-page", "home-page";
      // routeToken matches patterns like "main-layout", "protected-layout".
      config.indexToken = /[a-z]+-page/
      config.routeToken = /[a-z]+-layout/
      break
    case 'virtual-sibling-routes':
      // Issue #5822: virtual routes respect explicit sibling relationships:
      // /posts and /posts/$id stay siblings under the layout, not nested by
      // path.
      config.virtualRouteConfig = rootRoute('__root.tsx', [
        layout('_main', 'layout.tsx', [
          route('/posts', 'posts.tsx'),
          route('/posts/$id', 'post-detail.tsx'),
        ]),
      ])
      break
    case 'virtual-pathless-layout-dotted-filename':
      config.virtualRouteConfig = rootRoute('root.route.tsx', [
        index('index.route.tsx'),
        layout('pathless.layout.tsx', [route('subpath', 'subpath.route.tsx')]),
      ])
      break
    case 'virtual-explicit-dotted-paths':
      config.virtualRouteConfig = rootRoute('root.tsx', [
        route('direct.path', 'direct.tsx'),
        physical('/mounted.path', 'physical-routes'),
      ])
      break
    case 'virtual-root-sibling-routes':
      // Issue #5431: virtual routes that are siblings at the root level are
      // not nested by a shared path prefix: /device/$id and
      // /device/$id/history/$filename are both children of the root.
      config.virtualRouteConfig = rootRoute('__root.tsx', [
        route('/device/$id', 'device/route.tsx'),
        route('/device/$id/history/$filename', 'history/route.tsx'),
      ])
      break
    case 'add-extensions-custom':
      config.addExtensions = '.js'
      break
    case 'virtual-nested-layouts-with-virtual-route':
      // Nested layouts with a virtual file-less route in between.
      config.virtualRouteConfig = rootRoute('__root.tsx', [
        index('home.tsx'),
        layout('first', 'layout/first-layout.tsx', [
          layout('layout/second-layout.tsx', [
            route('route-without-file', [
              route('/layout-a', 'a.tsx'),
              route('/layout-b', 'b.tsx'),
            ]),
          ]),
        ]),
      ])
      break
    default:
      break
  }
  return config
}

/**
 * Prepares the route files the generator edits or scaffolds in a run of
 * the fixture `name` in `dir`; returns their contents before the run (path
 * relative to the routes directory to content). Route files written by
 * earlier runs (gitignored, possibly by an older version of this helper)
 * are removed first: a leftover file would be a route of the fixture.
 */
export async function prepareFixture(name: string, dir = fixtureDir(name)) {
  const before: Record<string, string> = {}
  if (name === 'file-modification') {
    const routePath = (file: string) => join(dir, 'routes', '(test)', file)
    for (const file of await fs.readdir(routePath('.'))) {
      if (file.endsWith('.tsx')) {
        await fs.rm(routePath(file))
      }
    }
    const template = await fs.readFile(join(dir, 'template.tsx'), 'utf8')
    const files: Record<string, string> = {
      'foo.bar.tsx': await fs.readFile(
        join(dir, 'template-verbose.tsx'),
        'utf8',
      ),
      'foo.tsx': template,
      'initiallyLazy.tsx': await fs.readFile(
        join(dir, 'template.lazy.tsx'),
        'utf8',
      ),
      // (a lazy file written with createFileRoute: its options are only
      // what a lazy route takes, here a component)
      'bar.lazy.tsx': [
        "import { createFileRoute } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/foo/bar')({",
        '  component: BarComponent,',
        '})',
        '',
        'function BarComponent() {',
        '  return <p>Bar from its lazy file</p>',
        '}',
        '',
      ].join('\n'),
      'double-quotes.tsx': template.replace(
        "createFileRoute('/foo/bar')",
        'createFileRoute("/foo/bar")',
      ),
      // (a template literal id may be replaced or reported, SPEC J1.1:
      // route-file-upkeep.test.ts)
      'duplicate-import.tsx': [
        "import { createFileRoute } from '@tanstack/react-router'",
        "import * as React from 'react'",
        "import { Link, Outlet } from '@tanstack/react-router'",
        '',
        "export const Route = createFileRoute('/foo/bar')({",
        '  component: PostsLayoutComponent,',
        '})',
        '',
        'function PostsLayoutComponent() {',
        '  return (',
        '    <>',
        '      <Link to="/">Home</Link>',
        '      <Outlet />',
        '    </>',
        '  )',
        '}',
        '',
      ].join('\n'),
      'initiallyEmpty.tsx': '',
      'initiallyEmpty.lazy.tsx': '',
    }
    for (const [file, content] of Object.entries(files)) {
      await fs.writeFile(routePath(file), content)
      before[`(test)/${file}`] = content
    }
  } else if (name === 'custom-scaffolding') {
    for (const file of [
      '__root.tsx',
      'index.tsx',
      'foo.lazy.tsx',
      'api/bar.tsx',
    ]) {
      await fs.mkdir(path.dirname(join(dir, 'routes', file)), {
        recursive: true,
      })
      await fs.writeFile(join(dir, 'routes', file), '')
      before[file] = ''
    }
  }
  return before
}

/**
 * For a fixture whose routes conflict, the route files the generator's error
 * must name (its wording is free).
 */
export function conflictingFiles(
  name: string,
  dir = fixtureDir(name),
): Array<string> | undefined {
  const routeFile = (...file: Array<string>) => join(dir, 'routes', ...file)
  if (name === 'duplicate-fullPath') {
    return [routeFile('index.tsx'), routeFile('_auth', 'index.tsx')]
  }
  if (name === 'virtual-physical-empty-path-conflict-virtual') {
    return [routeFile('about.tsx'), routeFile('merged', 'about.tsx')]
  }
  return undefined
}
