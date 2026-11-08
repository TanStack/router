/**
 * Source maps of split routes name the route file the user wrote: in real
 * webpack and Rspack builds, the map of a split component, and of code the
 * route module and a split chunk share, names the route file itself, not
 * the `?tsr-split` / `?tsr-shared` module id. Issues #3828 and #6667. That
 * a throw maps to its line and column: integration/build-source-maps.test.ts;
 * Vite's dev server: integration/dev-source-maps.test.ts.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { SourceMap } from 'node:module'
import path from 'node:path'
import { rspack } from '@rsbuild/core'
import webpack from 'webpack'
import { describe, expect, test } from 'vitest'
import type { SourceMapPayload } from 'node:module'

const timeout = 60_000

/**
 * A route whose split component throws, and whose loader and component share
 * a function that throws, each on its own line.
 */
function routeSource({ types }: { types: boolean }) {
  const never = types ? ': never' : ''
  return `import { createFileRoute } from '@tanstack/react-router'

function fail()${never} {
  throw new Error('MARK_SHARED_THROW')
}

function Page()${never} {
  throw new Error('MARK_PAGE_THROW ' + typeof fail)
}

export const Route = createFileRoute('/')({
  loader: () => fail(),
  component: Page,
})
`
}

const rootSource = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`

/**
 * The source `code`'s source map sends the opening quote of the string
 * `marker` to, as `source` gives it.
 */
function originalSourceOf(
  code: string,
  map: SourceMapPayload,
  marker: string,
  source: (name: string) => string,
) {
  const lines = code.slice(0, code.indexOf(marker) - 1).split('\n')
  const entry = new SourceMap(map).findEntry(
    lines.length - 1,
    lines.at(-1)!.length,
  )
  if (!('originalSource' in entry)) {
    return undefined
  }
  return source(entry.originalSource)
}

/** Writes `files` into a new app directory inside the package. */
async function createApp(files: Record<string, string>) {
  // Keep the app inside the package so runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.source-maps-'))
  await mkdir(path.join(root, 'routes'))
  for (const [file, code] of Object.entries(files)) {
    await writeFile(path.join(root, file), code)
  }
  return root
}

function routerOptions(root: string) {
  return {
    target: 'react',
    routesDirectory: path.join(root, 'routes'),
    generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
    autoCodeSplitting: true,
    codeSplittingOptions: { addHmr: false },
  } as const
}

/** A client production build of `entry`, unminified, with source maps. */
function compilerConfig(root: string, entry: string) {
  return {
    context: root,
    mode: 'production',
    target: 'web',
    devtool: 'source-map',
    entry: `./${entry}`,
    output: { path: path.join(root, 'dist') },
    optimization: { minimize: false },
  } as const
}

interface Compiler {
  run: (
    callback: (
      error: Error | null,
      stats?: {
        hasErrors: () => boolean
        toString: (options: object) => string
      },
    ) => void,
  ) => void
  close: (callback: (error?: Error | null) => void) => void
}

/** Runs one build and settles once the compiler has closed. */
function runCompiler(compiler: Compiler) {
  return new Promise<void>((resolve, reject) => {
    compiler.run((error, stats) => {
      // The test removes the app afterwards: wait for the compiler to finish.
      compiler.close((closeError) => {
        if (error ?? closeError) {
          reject(error ?? closeError)
        } else if (stats?.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true })))
        } else {
          resolve()
        }
      })
    })
  })
}

const bundlers = [
  {
    name: 'webpack',
    // webpack parses no TypeScript: the router plugin is the only loader.
    extension: 'js',
    async build(root: string, entry: string) {
      const { tanstackRouter } = await import('../src/webpack')
      await runCompiler(
        webpack({
          ...compilerConfig(root, entry),
          // The test app is not part of the package's TypeScript project.
          resolve: { tsconfig: false },
          plugins: [tanstackRouter(routerOptions(root))],
        }),
      )
    },
  },
  {
    name: 'rspack',
    // As in Rsbuild: SWC compiles the router plugin's output.
    extension: 'tsx',
    async build(root: string, entry: string) {
      const { tanstackRouter } = await import('../src/rspack')
      await runCompiler(
        rspack({
          ...compilerConfig(root, entry),
          module: {
            rules: [
              {
                test: /\.tsx?$/,
                loader: 'builtin:swc-loader',
                options: {
                  jsc: { parser: { syntax: 'typescript', tsx: true } },
                },
                type: 'javascript/auto',
              },
            ],
          },
          plugins: [tanstackRouter(routerOptions(root))],
        }),
      )
    },
  },
] as const

describe.each(bundlers)('$name build', (bundler) => {
  test(
    'the maps of a split component, and of code it shares, name the route file',
    async () => {
      const route = routeSource({ types: bundler.extension === 'tsx' })
      const routeFile = `routes/index.${bundler.extension}`
      const entry = `entry.${bundler.extension}`
      const root = await createApp({
        [`routes/__root.${bundler.extension}`]: rootSource,
        [routeFile]: route,
        [entry]: `import { Route } from './${routeFile}'\nglobalThis.route = Route\n`,
      })
      try {
        await bundler.build(root, entry)
        const dist = path.join(root, 'dist')
        const chunks = new Map<string, string>()
        for (const file of await readdir(dist)) {
          if (file.endsWith('.js')) {
            chunks.set(file, await readFile(path.join(dist, file), 'utf8'))
          }
        }
        for (const marker of ['MARK_PAGE_THROW', 'MARK_SHARED_THROW']) {
          const [file, code] =
            [...chunks].find(([, chunk]) => chunk.includes(marker)) ?? []
          expect(file, `the chunk holding ${marker}`).toBeDefined()
          if (marker === 'MARK_PAGE_THROW') {
            expect(file, 'the component is split').not.toBe('main.js')
          }
          const map = JSON.parse(
            await readFile(path.join(dist, `${file}.map`), 'utf8'),
          ) as SourceMapPayload
          expect(
            originalSourceOf(code!, map, marker, (source) =>
              source.replace(/^webpack:\/\/[^/]*\/\.\//, ''),
            ),
            `${marker} in ${file}`,
          ).toBe(routeFile)
        }
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    timeout,
  )
})
