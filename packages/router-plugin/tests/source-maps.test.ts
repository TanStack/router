/**
 * Source maps of split routes point at the route file the user wrote: a throw
 * in a split component, or in code the route module and a split chunk share,
 * maps to its line in the route file, in real webpack and Rspack builds and
 * in Vite's dev server, and the map names the route file itself, not the
 * `?tsr-split` / `?tsr-shared` module id. Issues #3828 and #6667.
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
import { createServer } from 'vite'
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

/** The 1-based line of `marker` in `code`. */
function lineOf(code: string, marker: string) {
  return code.slice(0, code.indexOf(marker)).split('\n').length
}

/**
 * Where `code`'s source map sends the opening quote of the string `marker`:
 * the source as `source` gives it, and the 1-based line.
 */
function originalPositionOf(
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
  return {
    source: source(entry.originalSource),
    line: entry.originalLine + 1,
  }
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
    'a throw in a split component, and in code it shares, maps to its line in the route file',
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
            originalPositionOf(code!, map, marker, (source) =>
              source.replace(/^webpack:\/\/[^/]*\/\.\//, ''),
            ),
            `${marker} in ${file}`,
          ).toEqual({ source: routeFile, line: lineOf(route, marker) })
        }
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    timeout,
  )
})

function inlineSourceMap(code: string) {
  const data =
    /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(\S+)\s*$/.exec(
      code,
    )?.[1]
  expect(data, 'the module has an inline source map').toBeDefined()
  return JSON.parse(
    Buffer.from(data!, 'base64').toString('utf8'),
  ) as SourceMapPayload
}

/**
 * The route module served at `routeUrl` and every module derived from it
 * (imports of the route file's path with a query), by URL.
 */
async function routeModules(routeUrl: URL) {
  const modules = new Map<string, string>()
  const pending = [routeUrl.href]
  while (pending.length > 0) {
    const url = pending.pop()!
    if (modules.has(url)) {
      continue
    }
    const code = await (await fetch(url)).text()
    modules.set(url, code)
    for (const [, specifier] of code.matchAll(/["']([^"'\s]+)["']/g)) {
      const derived = new URL(specifier!, url)
      if (derived.pathname === routeUrl.pathname && derived.search) {
        pending.push(derived.href)
      }
    }
  }
  return modules
}

describe('vite dev', () => {
  test(
    'the modules of a split route map a throw to its line in the route file, which their maps name as their source',
    async () => {
      const route = routeSource({ types: true })
      const root = await createApp({
        'routes/__root.tsx': rootSource,
        'routes/index.tsx': route,
      })
      const { tanstackRouter } = await import('../src/vite')
      const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [tanstackRouter(routerOptions(root))],
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { port: 0, hmr: false, ws: false },
      })
      try {
        await server.listen()
        const routeUrl = new URL(
          '/routes/index.tsx',
          server.resolvedUrls!.local[0],
        )
        const modules = await routeModules(routeUrl)
        for (const marker of ['MARK_PAGE_THROW', 'MARK_SHARED_THROW']) {
          const [url, code] =
            [...modules].find(([, module]) => module.includes(marker)) ?? []
          expect(url, `the module holding ${marker}`).toBeDefined()
          if (marker === 'MARK_PAGE_THROW') {
            expect(url, 'the component is split').not.toBe(routeUrl.href)
          }
          expect(
            originalPositionOf(
              code!,
              inlineSourceMap(code!),
              marker,
              (source) => new URL(source, url).href,
            ),
            `${marker} in ${url}`,
          ).toEqual({ source: routeUrl.href, line: lineOf(route, marker) })
        }
      } finally {
        await server.close()
        await rm(root, { recursive: true, force: true })
      }
    },
    timeout,
  )
})
