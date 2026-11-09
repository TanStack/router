/**
 * A production client build ships none of the code splitter's development
 * warnings, whatever the build process's `NODE_ENV` (Vitest sets it to
 * `test`, which behaves like a shell without it): the bundler's mode
 * decides, and webpack and Rspack build in production when `mode` is left
 * out. Such a warning would log in every visitor's console, with the
 * absolute path of the route file on the build machine.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { rspack } from '@rsbuild/core'
import webpack from 'webpack'
import { describe, expect, test, vi } from 'vitest'

const timeout = 60_000

/**
 * The exported component stays in the route module unless the code splitter
 * can split exports; the error component is split either way.
 */
const routeSource = `import { createFileRoute } from '@tanstack/react-router'

export function ExportedPage() {
  return 'MARK_EXPORTED_PAGE'
}

function ErrorPage() {
  return 'MARK_ERROR_PAGE'
}

export const Route = createFileRoute('/')({
  component: ExportedPage,
  errorComponent: ErrorPage,
})
`

const rootSource = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`

/** Writes `files` into a new app directory inside the package. */
async function createApp(files: Record<string, string>) {
  // Keep the app inside the package so runtime imports resolve.
  const root = await mkdtemp(path.join(__dirname, '.production-warnings-'))
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
  } as const
}

/** A client build of `entry` in `mode` (left out when undefined), unminified. */
function compilerConfig(
  root: string,
  entry: string,
  mode: 'production' | undefined,
) {
  return {
    context: root,
    ...(mode ? { mode } : {}),
    target: 'web',
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
    async build(root: string, entry: string, mode: 'production' | undefined) {
      const { tanstackRouter } = await import('../src/webpack')
      await runCompiler(
        webpack({
          ...compilerConfig(root, entry, mode),
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
    async build(root: string, entry: string, mode: 'production' | undefined) {
      const { tanstackRouter } = await import('../src/rspack')
      await runCompiler(
        rspack({
          ...compilerConfig(root, entry, mode),
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
  test.each([
    { label: "mode: 'production'", mode: 'production' },
    { label: 'mode left out', mode: undefined },
  ] as const)(
    'with $label, the client JS logs no warning about an exported component',
    async ({ mode }) => {
      const routeFile = `routes/index.${bundler.extension}`
      const entry = `entry.${bundler.extension}`
      const root = await createApp({
        [`routes/__root.${bundler.extension}`]: rootSource,
        [routeFile]: routeSource,
        [entry]: `import { Route } from './${routeFile}'\nglobalThis.route = Route\n`,
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await bundler.build(root, entry, mode)
        const warned = warn.mock.calls.some((args) =>
          args.some((arg) => String(arg).includes('ExportedPage')),
        )
        const dist = path.join(root, 'dist')
        const chunks = new Map<string, string>()
        for (const file of await readdir(dist)) {
          if (file.endsWith('.js')) {
            chunks.set(file, await readFile(path.join(dist, file), 'utf8'))
          }
        }
        expect(
          chunks.get('main.js'),
          'the error component is split',
        ).not.toContain('MARK_ERROR_PAGE')
        // An exported component kept in the route module is reported.
        const split = !chunks.get('main.js')!.includes('MARK_EXPORTED_PAGE')
        expect(split || warned, 'split, or reported by the build').toBe(true)
        // The app's directory name appears only in absolute paths.
        const linesNamingTheApp = [...chunks].flatMap(([file, code]) =>
          code
            .split('\n')
            .filter((line) => line.includes(path.basename(root)))
            .map((line) => `${file}: ${line.trim()}`),
        )
        expect(linesNamingTheApp).toEqual([])
      } finally {
        warn.mockRestore()
        await rm(root, { recursive: true, force: true })
      }
    },
    timeout,
  )
})
