/**
 * Source maps of real client builds point at the code the user wrote: an
 * error thrown inside a split route component maps, through the emitted
 * source map of the chunk it runs in, to the line (and, unminified, the
 * column) of the throw in the route file, also when another plugin
 * transformed the file before the router plugin (composed maps); so does a
 * throw in code the splitter leaves in the route module or moves into a
 * shared module. The map holds the route file as written (what a debugger
 * shows), in development builds too. Map layout, `names`, granularity and
 * the source names a map lists are free (SPEC G6, §5.14).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { originalFrameOf } from '@tanstack/compiler-test-utils/build-harness'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import { positionAt } from '@tanstack/compiler-test-utils/source-maps'
import { tanstackRouter as tanstackRouterVite } from '../../src/vite'
import { build, routeApp, routeHead } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { RouterPluginOptions } from '../build-harness'

const appsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const timeout = 60_000

const route = `${routeHead()}import { label } from '../lib/label'
const shared = { label }
function Page(): never {
  throw new Error('MARK_PAGE_THROW ' + shared.label)
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`

/** Mounts a component and returns the stack of the error it threw. */
const mountEntry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
export * from './routes/index'
export async function mountError(component: any) {
  await component.preload?.()
  let stack: string | undefined
  const root = createRoot(document.getElementById('root')!, {
    onUncaughtError: (error: unknown) => {
      stack = (error as Error).stack
    },
  })
  flushSync(() => root.render(createElement(component)))
  return stack
}
`

/**
 * Where the error of the route file's throw is created (its first
 * `new Error(`, which a stack frame points at), by its offset in the
 * route file as written: 1-based line and column, as `originalFrameOf`
 * reports them.
 */
function thrownAt(code: string) {
  const { line, column } = positionAt(code, code.indexOf('new Error('))
  return { line, column: column + 1 }
}

/**
 * Asserts that the innermost frame of `stack` in a chunk of `app` maps to
 * the throw of `source` (`routes/index.tsx`): its line always, its column
 * unless the build minified (minifiers map the throw to different tokens of
 * the statement), and that the map holds `source` for the file.
 */
function expectFrameAtThrow(
  app: Parameters<typeof originalFrameOf>[0],
  stack: unknown,
  source: string,
  { minify }: { minify: boolean },
) {
  const { file, line, column, text } =
    originalFrameOf(app, stack as string) ?? {}
  const expected = thrownAt(source)
  expect(
    minify ? { file, line, text } : { file, line, column, text },
    `the frame of ${String(stack).split('\n')[1]?.trim()}`,
  ).toEqual(
    minify
      ? { file: 'routes/index.tsx', line: expected.line, text: source }
      : { file: 'routes/index.tsx', ...expected, text: source },
  )
}

const builds = [
  { name: 'minified', minify: true },
  { name: 'unminified', minify: false },
]

/**
 * Builds the route for the client with source maps, mounts its split
 * component, which throws, and maps the error's stack frame through the
 * emitted source map. `routerPlugins` puts other plugins around the router
 * plugin.
 */
async function expectThrowMapsToRouteFile(
  bundler: Bundler,
  options: {
    minify: boolean
    mode?: 'development'
    routerPlugins?: (config: RouterPluginOptions) => Array<unknown>
  },
) {
  const app = await build({
    bundler,
    env: 'client',
    mode: options.mode,
    minify: options.minify,
    sourcemap: true,
    routerPlugins: options.routerPlugins,
    files: routeApp(route, {
      env: 'client',
      files: {
        'lib/label.ts': `export const label = 'MARK_LABEL'\n`,
        'entry.ts': mountEntry,
      },
    }),
  })
  expect(app.where('MARK_PAGE_THROW')).toBe('lazy')
  const { result: stack } = await app.run(
    'return await entry.mountError(entry.Route.options.component)',
  )
  expect(stack).toMatch(/MARK_PAGE_THROW MARK_LABEL/)
  expectFrameAtThrow(app, stack, route, options)
}

/**
 * Throws from code the splitter leaves in the route module, and from code
 * it moves into the module the route module and a chunk share.
 */
const moduleThrows = [
  {
    name: 'the route module (an unsplit loader)',
    route: `${routeHead()}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  loader: () => {
    throw new Error('MARK_LOADER_THROW')
  },
  component: Page,
})
`,
    marker: 'MARK_LOADER_THROW',
  },
  {
    name: 'a function the loader and the split component share',
    route: `${routeHead()}import { label } from '../lib/label'
function fail(): never {
  throw new Error('MARK_SHARED_THROW ' + label)
}
function Page() {
  return <p>{typeof fail}</p>
}
export const Route = createFileRoute('/')({
  loader: () => fail(),
  component: Page,
})
`,
    marker: 'MARK_SHARED_THROW',
  },
]

/**
 * Builds `source` for the client (unminified, with source maps), calls its
 * loader, which throws `marker`, and maps the error's stack frame through
 * the emitted source map to the throw's line and column in the route file.
 */
async function expectModuleThrowMapsToRouteFile(
  bundler: Bundler,
  source: string,
  marker: string,
) {
  if (bundler === 'vite') {
    await expectModuleThrowMapsToRouteFileVite(source, marker)
    return
  }
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    sourcemap: true,
    files: routeApp(source, {
      env: 'client',
      files: {
        'lib/label.ts': `export const label = 'MARK_LABEL'\n`,
        'entry.ts': `export * from './routes/index'\n`,
      },
    }),
  })
  const { result: stack } = await app.run(
    `try { entry.Route.options.loader() } catch (error) { return error.stack }`,
  )
  expect(stack).toMatch(marker)
  expectFrameAtThrow(app, stack, source, { minify: false })
}

// Control for the pins below.
describe('vite', () => {
  test.each(builds)(
    'a throw in a split component maps to its line in the route file ($name)',
    (options) => expectThrowMapsToRouteFile('vite', options),
    timeout,
  )

  // A plugin that transforms the route file before the router plugin (here
  // Babel erasing TypeScript, with its own map): the maps compose, and the
  // frame still resolves to the user's line and column.
  test(
    'a throw in a split component maps to its line in the route file through the map of a plugin before the router plugin (unminified)',
    async () => {
      const [{ default: babel }, { tanstackRouter }] = await Promise.all([
        import('@rolldown/plugin-babel'),
        import('../../src/vite'),
      ])
      // @ts-expect-error -- the preset ships no type declarations
      const { default: typescript } = await import('@babel/preset-typescript')
      await expectThrowMapsToRouteFile('vite', {
        minify: false,
        routerPlugins: (config) => [
          babel({
            presets: [[typescript, { allExtensions: true, isTSX: true }]],
          }),
          tanstackRouter(config),
        ],
      })
    },
    timeout,
  )

  // Code the splitter leaves in the route module, and code it moves into the
  // module the route module and a chunk share, map back the same way.
  test.each(moduleThrows)(
    'a throw in $name maps to its line and column in the route file',
    ({ route: source, marker }) =>
      expectModuleThrowMapsToRouteFile('vite', source, marker),
    timeout,
  )
})

// Bug: unplugin's webpack and Rspack transform loaders drop the source map
// a plugin's `transform` returns when no earlier loader passed one in
// (`callback(null, res.code, map == null ? map : res.map || map)` in
// unplugin/dist/{webpack,rspack}/loaders/transform.mjs), and the router
// plugin's transform is the first loader of a route file. The bundler then
// maps the chunk to the code splitter's output instead of the route file.
// (On webpack the harness's own TypeScript loader composes the map it gets.)
// These rows flip once unplugin keeps the map: with a loader passing an
// identity map in front of unplugin's (so it returns the plugin's map), the
// four split-component rows pass (checked 2026-10-18). The route-module and
// shared-module rows fail the same way: the frame
// maps to the generated module's line, one above the throw's.
// Source: upstream (unplugin), not the router plugin.
// Impact: stack traces, devtools and error trackers point at lines of the
// generated split module (here line 3 instead of line 5 of the route file).
describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
  test.each(builds)(
    'a throw in a split component maps to its line in the route file ($name)',
    (options) => expectThrowMapsToRouteFile(bundler, options),
    timeout,
  )

  // A development build hot-updates the modules whose code changed, which
  // these bundlers tell by a module's code and map: the file's text reaches
  // the emitted map another way than a production build's.
  test(
    'a throw in a split component maps to its line in the route file (development build)',
    () =>
      expectThrowMapsToRouteFile(bundler, {
        minify: false,
        mode: 'development',
      }),
    timeout,
  )

  test.each(moduleThrows)(
    'a throw in $name maps to its line and column in the route file',
    ({ route: source, marker }) =>
      expectModuleThrowMapsToRouteFile(bundler, source, marker),
    timeout,
  )
})

/**
 * `expectModuleThrowMapsToRouteFile` on Vite, through the public plugin host
 * (`vite build` with the app's plugins): every chunk the build emits is
 * read with the map it has, if any (a chunk with no mapping of its own, e.g.
 * a facade re-exporting another chunk, may have none); the frame of the
 * throw is resolved through the map of the chunk it names.
 */
async function expectModuleThrowMapsToRouteFileVite(
  source: string,
  marker: string,
) {
  const host = await createPluginHost({
    dir: appsDir,
    prefix: '.build-source-maps-',
    registerCleanup: onTestFinished,
    serve: false,
    files: routeApp(source, {
      env: 'client',
      files: {
        'lib/label.ts': `export const label = 'MARK_LABEL'\n`,
        'entry.ts': `export * from './routes/index'\n`,
      },
    }),
    plugins: () => [
      tanstackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
      }),
      react(),
    ],
  })
  const built = await host.build({
    config: {
      build: {
        minify: false,
        sourcemap: true,
        rollupOptions: {
          input: 'entry.ts',
          preserveEntrySignatures: 'exports-only',
          output: { entryFileNames: 'entry.mjs' },
        },
      },
    },
  })
  const app = await built.describe('client')
  const { result: stack } = await app.run(
    `try { entry.Route.options.loader() } catch (error) { return error.stack }`,
  )
  expect(stack).toMatch(marker)
  expectFrameAtThrow(
    {
      root: host.root,
      outDir: built.environments.client!.outDir,
      chunks: built.environments.client!.chunks,
    },
    stack,
    source,
    { minify: false },
  )
}
