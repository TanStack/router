/**
 * The emitted source maps of a split route name the route file once, as the
 * file it is (DECISIONS D3: a map's `sources` is the file's path without the
 * compiler's query): the chunk of the split component, the route module and
 * the module they share each name `routes/index.tsx`, never
 * `routes/index.tsx?tsr-split=…`, hold its text as written, and map a
 * position of the split component's code to its line in the route file. A
 * debugger then shows one file, a breakpoint set in it binds in the chunk's
 * code, and error trackers group by it. Production and (webpack family)
 * development builds, on every bundler the router plugin builds with. Maps
 * are read from the emitted `.map` files with a standard consumer.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import {
  emittedMaps,
  emittedSourcePath,
  expectNamesFileOnce,
  originalPositionOf,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { tanstackRouter } from '../../src/vite'
import { build, buildWithRsbuild, routeApp, routeHead } from '../build-harness'

const timeout = 60_000

const route = `${routeHead()}import { label } from '../lib/label'
const shared = { label }
function Page() {
  return <p>{'MARK_PAGE ' + shared.label}</p>
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`

const files = routeApp(route, {
  env: 'client',
  files: { 'lib/label.ts': `export const label = 'MARK_LABEL'\n` },
})

async function expectRouteFileNamedOnce(root: string, outDir: string) {
  const routeFile = path.join(root, 'routes/index.tsx')
  const maps = await emittedMaps(outDir)
  expectNamesFileOnce(maps, root, routeFile, route)
  // a position of the split component's code maps to its line in the route file
  const page = maps.find(({ code }) => code.includes('MARK_PAGE '))
  expect(page, 'the chunk of the split component').toBeDefined()
  const original = originalPositionOf(
    page!.map,
    positionAt(page!.code, page!.code.indexOf('MARK_PAGE ')),
  )
  expect(original && emittedSourcePath(original.source, page!.file, root)).toBe(
    routeFile,
  )
  expect(original?.line).toBe(
    positionAt(route, tokenOffsets(route, { string: 'MARK_PAGE ' })[0]!).line,
  )
}

// (Vite's dev server serves its own maps, which name the file:
// dev-source-maps.test.ts; the webpack family also builds for development)
const builds = [
  { bundler: 'vite', mode: 'production' },
  { bundler: 'rspack', mode: 'production' },
  { bundler: 'rspack', mode: 'development' },
  { bundler: 'webpack', mode: 'production' },
  { bundler: 'webpack', mode: 'development' },
] as const

test.each(builds)(
  'a $bundler $mode build names the route file once in every map',
  async ({ bundler, mode }) => {
    const app = await build({
      bundler,
      env: 'client',
      mode,
      minify: false,
      sourcemap: true,
      files,
    })
    await expectRouteFileNamedOnce(app.root, app.outDir)
  },
  timeout,
)

/**
 * Builds the route with `vite` (the workspace's Vite 8 or an older major),
 * the router plugin and `output` options, unminified, with maps.
 */
async function viteBuild(
  vite: { build: (config: never) => Promise<unknown> },
  output: Record<string, unknown> = {},
) {
  const app = await createApp({
    dir: path.dirname(fileURLToPath(import.meta.url)),
    prefix: '.map-sources-vite-',
    files,
    packageJson: { type: 'module' },
    registerCleanup: onTestFinished,
  })
  const outDir = path.join(app.root, 'dist')
  await vite.build({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: path.join(app.root, 'routes'),
        generatedRouteTree: path.join(app.root, 'routeTree.gen.ts'),
      }),
    ],
    esbuild: { jsx: 'automatic' },
    build: {
      outDir,
      minify: false,
      sourcemap: true,
      rollupOptions: {
        input: path.join(app.root, 'entry.ts'),
        preserveEntrySignatures: 'exports-only',
        external: [/^react/, /^@tanstack\//],
        output,
      },
    },
  } as never)
  return { root: app.root, outDir }
}

test(
  'a Vite 7 build names the route file once in every map',
  async () => {
    const vite = await viteVersions.find((v) => v.major === 7)!.load()
    const { root, outDir } = await viteBuild(vite)
    await expectRouteFileNamedOnce(root, outDir)
  },
  timeout,
)

// The app's own `sourcemapPathTransform` still names the sources, once,
// from the file's name.
test(
  'a Vite build with its own sourcemapPathTransform names the route file once, through it',
  async () => {
    const vite = await import('vite')
    const seen: Array<string> = []
    const { outDir } = await viteBuild(vite, {
      sourcemapPathTransform: (source: string) => {
        seen.push(source)
        return `${source}?from-app`
      },
    })
    const routeSources = seen.filter((s) => s.includes('routes/index.tsx'))
    expect(routeSources.length).toBeGreaterThan(0)
    // (the app's transform sees the file's name, without the compiler's query)
    for (const source of routeSources) {
      expect(source).not.toContain('?')
    }
    // a query the app adds is the app's: it stays
    const named = (await emittedMaps(outDir)).flatMap(({ map }) =>
      map.sources.filter((s) => s?.includes('routes/index.tsx')),
    )
    expect(named.length).toBeGreaterThan(0)
    for (const source of named) {
      expect(source).toMatch(/routes\/index\.tsx\?from-app$/)
    }
  },
  timeout,
)

test(
  'an Rsbuild build names the route file once in every map',
  async () => {
    const app = await buildWithRsbuild({
      files,
      rsbuildConfig: { output: { sourceMap: { js: 'source-map' } } },
    })
    await expectRouteFileNamedOnce(app.root, app.outDir)
  },
  timeout,
)
