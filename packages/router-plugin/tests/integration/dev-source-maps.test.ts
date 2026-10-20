/**
 * Source maps in development (SPEC G6, dev as in build): the dev server
 * serves a map for the route module and every module derived from it (the
 * split component's module, the module the route module and the component
 * share), and a thrown error's position in each resolves to the user's file
 * and line, through Vite's dev server and through Rsbuild's. The modules
 * are found by following the served route module's imports; their ids and
 * how many there are is free (SPEC §5.3). Maps are read with a standard
 * consumer (`@tanstack/compiler-test-utils/source-maps`).
 * Source: V2-15a (#6667, #3828).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import {
  expectMapsTo,
  inlineSourceMap,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { routeHead } from '../build-harness'
import { routerDevServer } from '../dev-server'
import { importRequests } from '../regression-helpers'
import type { AnySourceMap } from '@tanstack/compiler-test-utils/source-maps'

const timeout = 60_000

/** The apps live next to the other harness apps, where imports resolve. */
const appsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A route that throws from its loader (route module), from a function the
 * loader and the split component share, and from the split component, each
 * with its own marker string on the line of the throw.
 */
const route = `${routeHead()}function fail(): never {
  throw new Error('MARK_SHARED_THROW')
}
function Page(): never {
  throw new Error('MARK_PAGE_THROW ' + typeof fail)
}
export const Route = createFileRoute('/')({
  loader: () => {
    if (Math.random() > 2) {
      throw new Error('MARK_LOADER_THROW')
    }
    return fail()
  },
  component: Page,
})
`
const markers = ['MARK_SHARED_THROW', 'MARK_PAGE_THROW ', 'MARK_LOADER_THROW']

/**
 * Where the string `marker` starts in the route file (1-based line, 0-based
 * column): what its string in a served module maps to.
 */
function positionOf(marker: string) {
  return positionAt(route, tokenOffsets(route, { string: marker })[0]!)
}

/**
 * Asserts that every marker a served module holds maps, through the
 * module's map, to the route file at the marker's line and column.
 */
function expectMarkersMapToRouteFile(
  id: string,
  code: string,
  map: AnySourceMap | undefined,
  root: string,
) {
  const held = markers.filter((marker) => code.includes(marker))
  if (held.length === 0) {
    return
  }
  expect(
    map,
    `${id} holds ${held.join(', ')} and has a source map`,
  ).toBeDefined()
  for (const marker of held) {
    const [offset] = tokenOffsets(code, { string: marker }, { filename: id })
    expect(offset, `the string ${marker} in ${id}`).toBeDefined()
    expectMapsTo(map!, positionAt(code, offset!), {
      file: 'routes/index.tsx',
      root,
      ...positionOf(marker),
    })
  }
}

describe('vite dev server', () => {
  /**
   * URLs of the app's own modules, wherever a compiler puts what it derives
   * from the route file (next to it, elsewhere in the app, or a virtual
   * module, which Vite serves under `/@id/__x00__`): not Vite's client, not
   * dependencies.
   */
  const isAppModule = (url: string) =>
    url.startsWith('/@id/__x00__') ||
    (url.startsWith('/') &&
      !url.startsWith('/@') &&
      !url.includes('/node_modules/'))

  test(
    'the route module and every module derived from it map a throw to its line in the route file',
    async () => {
      const server = await routerDevServer({
        listen: true,
        files: { 'routes/index.tsx': route },
      })
      // Every app module the route module leads to, as the browser gets
      // them: static and dynamic imports followed transitively.
      const served = new Map<string, string>()
      const queue = ['/routes/index.tsx']
      while (queue.length > 0) {
        const url = queue.shift()!
        if (served.has(url) || !isAppModule(url)) {
          continue
        }
        const { status, body } = await server.fetch(url)
        expect(status, url).toBe(200)
        served.set(url, body)
        for (const { specifier } of importRequests(body, url)) {
          queue.push(
            specifier.replace(/([?&])t=\d+(&|$)/, '$1').replace(/[?&]$/, ''),
          )
        }
      }
      const checked: Array<string> = []
      for (const [url, body] of served) {
        if (markers.some((marker) => body.includes(marker))) {
          checked.push(url)
          expectMarkersMapToRouteFile(
            url,
            body,
            inlineSourceMap(body),
            server.root,
          )
        }
      }
      // The three throws live in at least two modules: the route module and
      // the split component's.
      expect(checked.length).toBeGreaterThanOrEqual(2)
    },
    timeout,
  )
})

describe('rsbuild dev server', () => {
  // Bug: unplugin's Rspack transform loader drops the source map the
  // router plugin's `transform` returns when no earlier loader passed one
  // in, and the router plugin's loader is the first of a route file (same
  // upstream cause as the Rspack and webpack pins of
  // build-source-maps.test.ts). The split component's module then maps to
  // the lines of the code splitter's output (here line 3 instead of 6).
  // Source: V2-15a (#6667, #3828); upstream (unplugin), not the router
  // plugin.
  // Impact: in Rsbuild dev, a thrown error in a split component, and a
  // breakpoint in it, resolve to the generated split module's lines.
  test.fails(
    'the route module and every module derived from it map a throw to its line in the route file',
    async () => {
      const { tanstackRouter } = await import('../../src/rspack')
      const server = await createRsbuildDevServer({
        dir: appsDir,
        prefix: '.dev-source-maps-rsbuild-',
        registerCleanup: onTestFinished,
        entry: 'main.tsx',
        files: {
          'main.tsx': `import { routeTree } from './routeTree.gen'
console.log(routeTree)
`,
          'routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
          'routes/index.tsx': route,
        },
        config: { output: { sourceMap: { js: 'source-map' } } },
        plugins: ({ root }) => [
          pluginReact({ fastRefresh: false }),
          {
            name: 'dev-source-maps',
            setup(api) {
              api.modifyRspackConfig((config) => {
                config.plugins.push(
                  tanstackRouter({
                    target: 'react',
                    autoCodeSplitting: true,
                    routesDirectory: path.join(root, 'routes'),
                    generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                  }),
                )
              })
            },
          },
        ],
      })
      await server.settle()
      const outputs = await server.outputs()
      const checked: Array<string> = []
      for (const [file, code] of Object.entries(outputs)) {
        if (!markers.some((marker) => code.includes(marker))) {
          continue
        }
        checked.push(file)
        const map = await readFile(
          path.join(server.root, 'dist', `${file}.map`),
          'utf8',
        ).then(JSON.parse, () => undefined)
        expectMarkersMapToRouteFile(file, code, map, server.root)
      }
      expect(checked.length).toBeGreaterThanOrEqual(2)
    },
    timeout,
  )
})
