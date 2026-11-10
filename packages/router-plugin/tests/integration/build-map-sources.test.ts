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
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { viteVersions } from '@tanstack/compiler-vite-versions'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import {
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

interface EmittedMap {
  sources: Array<string>
  sourcesContent?: Array<string | null>
  sourceRoot?: string
}

/** Every emitted JavaScript file with the map next to it (`<file>.map`). */
async function emittedMaps(outDir: string) {
  const out: Array<{ file: string; code: string; map: EmittedMap }> = []
  for (const entry of await readdir(outDir, { recursive: true })) {
    if (!/\.m?js$/.test(entry)) {
      continue
    }
    const file = path.join(outDir, entry)
    const map = await readFile(`${file}.map`, 'utf8').then(
      (text) => JSON.parse(text) as EmittedMap,
      () => undefined,
    )
    if (map) {
      out.push({ file, code: await readFile(file, 'utf8'), map })
    }
  }
  return out
}

/**
 * Where a source of the map of `file` points, as a debugger resolves it:
 * webpack and Rspack name it `webpack://<namespace>/<path from the root>`,
 * the others relative to the map (or absolute). The query stays.
 */
function resolveSource(source: string, file: string, root: string) {
  const webpack = /^webpack:\/\/[^/]*\/(.*)$/.exec(source)
  if (webpack) {
    return path.resolve(root, webpack[1]!)
  }
  if (source.startsWith('file://')) {
    return fileURLToPath(source)
  }
  return path.resolve(path.dirname(file), source)
}

async function expectRouteFileNamedOnce(root: string, outDir: string) {
  const routeFile = path.join(root, 'routes/index.tsx')
  const maps = await emittedMaps(outDir)
  // every source naming the route file, in any map
  const named = maps.flatMap(({ file, map }) =>
    map.sources.flatMap((source, i) => {
      const at = resolveSource(`${map.sourceRoot ?? ''}${source}`, file, root)
      return at.split('?')[0] === routeFile
        ? [{ at, content: map.sourcesContent?.[i] ?? null }]
        : []
    }),
  )
  expect(named.length).toBeGreaterThan(0)
  expect(new Set(named.map((n) => n.at))).toEqual(new Set([routeFile]))
  for (const { content } of named) {
    expect(content).toBe(route)
  }
  // a position of the split component's code maps to its line in the route file
  const page = maps.find(({ code }) => code.includes('MARK_PAGE '))
  expect(page, 'the chunk of the split component').toBeDefined()
  const original = originalPositionOf(
    page!.map as never,
    positionAt(page!.code, page!.code.indexOf('MARK_PAGE ')),
  )
  expect(original && resolveSource(original.source, page!.file, root)).toBe(
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

test(
  'a Vite 7 build names the route file once in every map',
  async () => {
    const vite = await viteVersions.find((v) => v.major === 7)!.load()
    const app = await createApp({
      dir: path.dirname(fileURLToPath(import.meta.url)),
      prefix: '.map-sources-vite7-',
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
        },
      },
    })
    await expectRouteFileNamedOnce(app.root, outDir)
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
