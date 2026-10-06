import { execFile, spawn } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { rspack } from '@rsbuild/core'
import * as esbuild from 'esbuild'
import webpack from 'webpack'
import { describe, expect, it } from 'vitest'
import { tanstackRouter as tanstackRouterEsbuild } from '../src/esbuild'
import { tanstackRouter as tanstackRouterRspack } from '../src/rspack'
import { tanstackRouter as tanstackRouterWebpack } from '../src/webpack'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Config } from '../src/core/config'

const runNode = promisify(execFile)

const COMPONENT_MARKER = 'about-component-marker'
const LOADER_MARKER = 'about-loader-marker'

type Mode = 'production' | 'development'

type BuildOptions = {
  entry: string
  outDir: string
  mode: Mode
  routerOptions: Partial<Config>
  /**
   * Bundle `@tanstack/*` instead of requiring its CommonJS build at runtime.
   * Route HMR needs the router's development-only HMR methods, which the
   * CommonJS build does not initialize.
   */
  bundleTanStack?: boolean
}

type WebpackLikeName = 'webpack' | 'rspack'

type Bundler = {
  name: WebpackLikeName | 'esbuild'
  /** Builds `entry` into `outDir` and returns the emitted entry file name. */
  build: (options: BuildOptions) => Promise<string>
}

type WebpackLikeStats = {
  hasErrors: () => boolean
  toString: (options: Record<string, boolean>) => string
}

type WebpackLikeWatching = {
  close: (callback: () => void) => void
}

type WebpackLikeCompiler = {
  run: (
    callback: (error: Error | null, stats?: WebpackLikeStats) => void,
  ) => void
  watch: (
    options: { aggregateTimeout: number },
    callback: (error: Error | null, stats?: WebpackLikeStats) => void,
  ) => WebpackLikeWatching | undefined
  close: (callback: () => void) => void
}

function getBuildError(error: Error | null, stats?: WebpackLikeStats) {
  if (error) {
    return error
  }
  if (stats?.hasErrors()) {
    return new Error(
      stats.toString({ all: false, errors: true, moduleTrace: true }),
    )
  }
  return undefined
}

function createWebpackLikeCompiler(
  name: WebpackLikeName,
  { entry, outDir, mode, routerOptions, bundleTanStack }: BuildOptions,
): WebpackLikeCompiler {
  const config = {
    mode,
    target: 'node' as const,
    devtool: false as const,
    entry,
    output: {
      path: outDir,
      filename: 'entry.cjs',
      chunkFilename: '[name].chunk.cjs',
      hotUpdateChunkFilename: '[id].[fullhash].hot-update.cjs',
      library: { type: 'commonjs2' as const },
    },
    // Resolve these from the package at runtime instead of bundling them.
    externals: [
      /^react(-dom)?(\/.*)?$/,
      ...(bundleTanStack ? [] : [/^@tanstack\//]),
    ],
    externalsType: 'commonjs' as const,
    module: {
      // The fixture lives in this `"type": "module"` package, whose `.js`
      // files require fully specified imports; the route tree omits them.
      rules: [{ test: /\.js$/, resolve: { fullySpecified: false } }],
    },
    optimization: { minimize: false },
    infrastructureLogging: { level: 'error' as const },
  }

  if (name === 'webpack') {
    return webpack({
      ...config,
      // Workspace package tsconfigs map `@tanstack/*` imports to sources that
      // published packages do not ship.
      resolve: { tsconfig: false },
      plugins: [
        tanstackRouterWebpack(routerOptions),
        ...(mode === 'development'
          ? [new webpack.HotModuleReplacementPlugin()]
          : []),
      ],
    }) as WebpackLikeCompiler
  }

  return rspack({
    ...config,
    plugins: [
      tanstackRouterRspack(routerOptions),
      ...(mode === 'development'
        ? [new rspack.HotModuleReplacementPlugin()]
        : []),
    ],
  }) as unknown as WebpackLikeCompiler
}

function runWebpackLikeBuild(name: WebpackLikeName, options: BuildOptions) {
  const compiler = createWebpackLikeCompiler(name, options)
  return new Promise<string>((resolve, reject) => {
    compiler.run((error, stats) => {
      compiler.close(() => {
        const buildError = getBuildError(error, stats)
        if (buildError) {
          reject(buildError)
        } else {
          resolve('entry.cjs')
        }
      })
    })
  })
}

const bundlers: Array<Bundler> = [
  {
    name: 'webpack',
    build: (options) => runWebpackLikeBuild('webpack', options),
  },
  {
    name: 'rspack',
    build: (options) => runWebpackLikeBuild('rspack', options),
  },
  {
    name: 'esbuild',
    async build({ entry, outDir, mode, routerOptions }) {
      await esbuild.build({
        entryPoints: { entry },
        outdir: outDir,
        outExtension: { '.js': '.mjs' },
        bundle: true,
        splitting: true,
        format: 'esm',
        platform: 'node',
        packages: 'external',
        logLevel: 'silent',
        define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
        plugins: [tanstackRouterEsbuild(routerOptions)],
      })
      return 'entry.mjs'
    },
  },
]

const aboutRouteSource = (
  loaderData: string,
) => `import { createElement } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  loader: () => '${loaderData}',
  component: AboutComponent,
})

function AboutComponent() {
  return createElement('h1', null, '${COMPONENT_MARKER}')
}
`

async function writeFixture(root: string) {
  await mkdir(path.join(root, 'routes'))
  await writeFile(
    path.join(root, 'routes/__root.js'),
    `import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({})
`,
  )
  await writeFile(
    path.join(root, 'routes/about.js'),
    aboutRouteSource(LOADER_MARKER),
  )
  await writeFile(
    path.join(root, 'entry.js'),
    `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { routeTree } from './routeTree.gen.js'

export async function run() {
  const route = routeTree.children.find(
    (child) => child.options.path === '/about',
  )
  const loaderData = await route.options.loader()
  await route.options.component.preload()
  return {
    loaderData,
    html: renderToString(createElement(route.options.component)),
  }
}
`,
  )
}

function getRouterOptions(root: string, mode: Mode): Partial<Config> {
  return {
    target: 'react',
    autoCodeSplitting: true,
    disableTypes: true,
    routesDirectory: path.join(root, 'routes'),
    generatedRouteTree: path.join(root, 'routeTree.gen.js'),
    codeSplittingOptions: { addHmr: mode === 'development' },
  }
}

async function readEmittedScripts(outDir: string) {
  const files = await readdir(outDir)
  return Promise.all(
    files
      .filter((file) => /\.(c|m)?js$/.test(file))
      .map(async (file) => ({
        file,
        code: await readFile(path.join(outDir, file), 'utf8'),
      })),
  )
}

/** Imports an emitted entry (ESM or CommonJS) and returns its API. */
function importEntrySource(entryFile: string) {
  return `const ns = await import(${JSON.stringify(pathToFileURL(entryFile).href)})
const api = typeof ns.run === 'function' ? ns : ns.default`
}

async function runEntry(entryFile: string) {
  const { stdout } = await runNode(process.execPath, [
    '--input-type=module',
    '--eval',
    `${importEntrySource(entryFile)}
console.log(JSON.stringify(await api.run()))`,
  ])
  return JSON.parse(stdout)
}

// Keep temporary apps inside the package so runtime imports resolve.
async function withTempApp(
  name: string,
  callback: (root: string) => Promise<void>,
) {
  const root = await mkdtemp(path.join(__dirname, `.bundler-${name}-`))
  try {
    await writeFixture(root)
    await callback(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe.each(bundlers)('router-plugin/$name', (bundler) => {
  it.each<Mode>(['production', 'development'])(
    'generates the route tree and lazy-loads the split route component (%s)',
    (mode) =>
      withTempApp(bundler.name, async (root) => {
        const outDir = path.join(root, 'dist')
        const entryFileName = await bundler.build({
          entry: path.join(root, 'entry.js'),
          outDir,
          mode,
          routerOptions: getRouterOptions(root, mode),
        })

        const routeTree = await readFile(
          path.join(root, 'routeTree.gen.js'),
          'utf8',
        )
        expect(routeTree).toContain("from './routes/about'")

        const scripts = await readEmittedScripts(outDir)
        const entry = scripts.find(({ file }) => file === entryFileName)
        expect(entry).toBeDefined()
        expect(entry!.code).toContain(LOADER_MARKER)
        expect(entry!.code).not.toContain(COMPONENT_MARKER)

        const componentChunks = scripts.filter(({ code }) =>
          code.includes(COMPONENT_MARKER),
        )
        expect(componentChunks).toHaveLength(1)
        expect(componentChunks[0]!.file).not.toBe(entryFileName)
        expect(componentChunks[0]!.code).not.toContain(LOADER_MARKER)

        if (mode === 'development' && bundler.name !== 'esbuild') {
          // Webpack and Rspack use the `import.meta.webpackHot` adapter.
          expect(entry!.code).toContain('tsr-route-id')
          expect(entry!.code).toContain('tsr-split-component:component')
          expect(entry!.code).not.toContain('import.meta.hot')
        }

        await expect(
          runEntry(path.join(outDir, entryFileName)),
        ).resolves.toEqual({
          loaderData: LOADER_MARKER,
          html: `<h1>${COMPONENT_MARKER}</h1>`,
        })
      }),
    60_000,
  )
})

function watchBuilds(compiler: WebpackLikeCompiler) {
  const settled: Array<Error | undefined> = []
  const waiting: Array<{
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  const watching = compiler.watch({ aggregateTimeout: 50 }, (error, stats) => {
    const buildError = getBuildError(error, stats)
    const waiter = waiting.shift()
    if (!waiter) {
      settled.push(buildError)
    } else if (buildError) {
      waiter.reject(buildError)
    } else {
      waiter.resolve()
    }
  })
  return {
    nextBuild() {
      if (settled.length) {
        const buildError = settled.shift()
        return buildError ? Promise.reject(buildError) : Promise.resolve()
      }
      return new Promise<void>((resolve, reject) => {
        waiting.push({ resolve, reject })
      })
    },
    close() {
      return new Promise<void>((resolve) => {
        if (watching) {
          watching.close(() => resolve())
        } else {
          resolve()
        }
      })
    },
  }
}

function readLines(child: ChildProcessWithoutNullStreams) {
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  return async () => {
    const line = await lines.next()
    if (line.done) {
      throw new Error(`HMR client exited early:\n${stderr}`)
    }
    return JSON.parse(line.value)
  }
}

describe.each<WebpackLikeName>(['webpack', 'rspack'])(
  'router-plugin/%s HMR',
  (name) => {
    it(
      'patches the live route through the bundler HMR runtime',
      () =>
        withTempApp(`${name}-hmr`, async (root) => {
          const entry = path.join(root, 'hmr-entry.js')
          await writeFile(
            entry,
            `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen.js'

const router = createRouter({ routeTree, history: createMemoryHistory() })
// The route HMR handler patches the router registered for the browser.
globalThis.window = { __TSR_ROUTER__: router }

export function run() {
  const route = router.routesById['/about']
  return { route, loaderData: route.options.loader() }
}

export function check() {
  return import.meta.webpackHot.check(true)
}
`,
          )
          // Generate the route tree up front so the watcher does not rebuild
          // because the generator wrote it after the first compilation started.
          await runWebpackLikeBuild(name, {
            entry,
            outDir: path.join(root, 'prebuild'),
            mode: 'development',
            routerOptions: getRouterOptions(root, 'development'),
            bundleTanStack: true,
          })

          const outDir = path.join(root, 'dist')
          const builds = watchBuilds(
            createWebpackLikeCompiler(name, {
              entry,
              outDir,
              mode: 'development',
              routerOptions: getRouterOptions(root, 'development'),
              bundleTanStack: true,
            }),
          )
          let child: ChildProcessWithoutNullStreams | undefined
          try {
            await builds.nextBuild()
            child = spawn(process.execPath, [
              '--input-type=module',
              '--eval',
              `import { createInterface } from 'node:readline'
${importEntrySource(path.join(outDir, 'entry.cjs'))}
const before = api.run()
console.log(JSON.stringify({ loaderData: before.loaderData }))
for await (const _ of createInterface({ input: process.stdin })) {
  const updatedModules = await api.check()
  const after = api.run()
  console.log(JSON.stringify({
    loaderData: after.loaderData,
    updatedModules: updatedModules.length,
    sameRoute: after.route === before.route,
    sameComponent: after.route.options.component === before.route.options.component,
  }))
}`,
            ])
            const nextLine = readLines(child)
            await expect(nextLine()).resolves.toEqual({
              loaderData: LOADER_MARKER,
            })

            const update = builds.nextBuild()
            await writeFile(
              path.join(root, 'routes/about.js'),
              aboutRouteSource(`${LOADER_MARKER}-updated`),
            )
            await update
            child.stdin.write('check\n')

            const result = await nextLine()
            expect(result).toMatchObject({
              loaderData: `${LOADER_MARKER}-updated`,
              sameRoute: true,
              sameComponent: true,
            })
            expect(result.updatedModules).toBeGreaterThan(0)
          } finally {
            child?.kill()
            await builds.close()
          }
        }),
      60_000,
    )
  },
)
