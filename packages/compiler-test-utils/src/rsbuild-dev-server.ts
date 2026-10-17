/**
 * Rsbuild dev-server harness, the Rsbuild counterpart of dev-server.ts:
 * starts a real Rsbuild dev server (JS API, Rspack in watch mode, output
 * written to disk) on a temporary app, lets the test edit files, waits for
 * the rebuild the edit causes, and reads what each environment emitted.
 *
 * Unlike the Vite harness, file events come from Rspack's own file watcher:
 * `edit()` writes the files and waits for the next compile that starts after
 * the write.
 *
 * Plugin-agnostic: the caller supplies the Rsbuild plugins and the directory
 * the apps live in (where their imports resolve).
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRsbuild, mergeRsbuildConfig } from '@rsbuild/core'
import { createApp } from './build-harness'
import type { AppOptions } from './build-harness'
import type {
  RsbuildConfig,
  RsbuildInstance,
  RsbuildPlugin,
} from '@rsbuild/core'

export interface RsbuildDevServerOptions extends AppOptions {
  /** Rsbuild plugins, or a function of the app root returning them. */
  plugins?:
    | Array<RsbuildPlugin>
    | ((app: { root: string }) => Array<RsbuildPlugin>)
  /** Entry module relative to the app root (default `src/entry.ts`). */
  entry?: string
  /** Rsbuild configuration merged over the harness defaults. */
  config?: RsbuildConfig
  /** How long a compile may take, in milliseconds. Default 20 000. */
  compileTimeout?: number
}

export interface RsbuildDevServer {
  /** App root on disk. */
  root: string
  rsbuild: RsbuildInstance
  /**
   * Writes app files (relative to the app root; `null` deletes a file) and
   * waits for the compile Rspack's watcher starts for them.
   */
  edit: (files: Record<string, string | null>) => Promise<void>
  /**
   * JavaScript files an environment (default: the only one) emitted by the
   * last compile, by path relative to its output directory.
   */
  outputs: (environment?: string) => Promise<Record<string, string>>
  /** Modules (paths relative to the app root) the last compile built. */
  rebuilt: Array<string>
  /** Errors of the last compile. */
  errors: Array<string>
  /** Warnings of the last compile. */
  warnings: Array<string>
  /** Stops the dev server and removes the app directory. */
  close: () => Promise<void>
}

/**
 * Writes an app to a temporary directory in `options.dir` and starts an
 * Rsbuild dev server on it, without listening on a port; resolves after the
 * first compile. `close()`, which `registerCleanup` also receives, stops the
 * server and removes the directory.
 */
export async function createRsbuildDevServer(
  options: RsbuildDevServerOptions,
): Promise<RsbuildDevServer> {
  const { plugins = [], config = {}, entry = 'src/entry.ts' } = options
  const compileTimeout = options.compileTimeout ?? 20_000
  const app = await createApp({
    ...options,
    prefix: options.prefix ?? '.rsbuild-dev-server-',
  })
  const root = app.root

  let compiles = 0
  const rebuilt: Array<string> = []
  const errors: Array<string> = []
  const warnings: Array<string> = []
  const waiters: Array<{
    after: number
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  /** Compiles start and finish in order: `compiles` counts the started ones. */
  let finished = 0
  /**
   * The error of the last compile Rspack gave up on (a plugin hook threw or
   * rejected), which never finishes: waits for it fail with this error.
   */
  let failure: { after: number; error: Error } | undefined
  /** Output directory of each environment. */
  const distPaths: Record<string, string> = {}
  const harnessPlugin: RsbuildPlugin = {
    name: 'rsbuild-dev-server-harness',
    setup(api) {
      api.onBeforeDevCompile(() => {
        compiles++
      })
      api.onAfterCreateCompiler(({ compiler }) => {
        const compilers =
          'compilers' in compiler ? compiler.compilers : [compiler]
        for (const environmentCompiler of compilers) {
          environmentCompiler.hooks.failed.tap(
            'rsbuild-dev-server-harness',
            (cause) => {
              const error = new Error(
                `Rsbuild failed to compile the app: ${cause.message}`,
                { cause },
              )
              failure = { after: compiles - 1, error }
              for (const waiter of [...waiters]) {
                if (compiles > waiter.after) {
                  waiters.splice(waiters.indexOf(waiter), 1)
                  waiter.reject(error)
                }
              }
            },
          )
        }
      })
      api.onDevCompileDone(({ stats, environments }) => {
        finished = compiles
        for (const [name, environment] of Object.entries(environments)) {
          distPaths[name] = environment.distPath
        }
        const all = 'stats' in stats ? stats.stats : [stats]
        rebuilt.length = 0
        errors.length = 0
        warnings.length = 0
        for (const environmentStats of all) {
          const { compilation } = environmentStats
          for (const module of compilation.builtModules) {
            const resource = (module as { resource?: string }).resource
            if (resource) {
              rebuilt.push(path.relative(root, resource))
            }
          }
          for (const error of compilation.errors) {
            errors.push(error.message)
          }
          for (const warning of compilation.warnings) {
            warnings.push(warning.message)
          }
        }
        for (const waiter of [...waiters]) {
          if (finished > waiter.after) {
            waiters.splice(waiters.indexOf(waiter), 1)
            waiter.resolve()
          }
        }
      })
    },
  }

  /** Waits until a compile that started after `after` compiles finished. */
  const compiled = (after: number, what: string) =>
    new Promise<void>((resolve, reject) => {
      if (finished > after) {
        resolve()
        return
      }
      if (failure && failure.after >= after) {
        reject(failure.error)
        return
      }
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1)
        reject(
          new Error(
            `Rsbuild did not compile ${what} within ${compileTimeout} ms`,
          ),
        )
      }, compileTimeout)
      const waiter = {
        after,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject: (error: Error) => {
          clearTimeout(timer)
          reject(error)
        },
      }
      waiters.push(waiter)
    })

  let rsbuild: RsbuildInstance
  let server: Awaited<ReturnType<RsbuildInstance['createDevServer']>>
  /** The dev server once created, closed if its first compile fails. */
  let created: typeof server | undefined
  try {
    rsbuild = await createRsbuild({
      cwd: root,
      rsbuildConfig: mergeRsbuildConfig(
        {
          root,
          mode: 'development',
          logLevel: 'silent',
          source: { entry: { index: `./${entry}` } },
          dev: { writeToDisk: true, hmr: false, liveReload: false },
          server: { printUrls: false },
          output: { sourceMap: false, minify: false },
          tools: { htmlPlugin: false },
          performance: { chunkSplit: { strategy: 'all-in-one' } },
          plugins: [
            ...(typeof plugins === 'function' ? plugins({ root }) : plugins),
            harnessPlugin,
          ],
        },
        config,
      ),
    })
    server = await rsbuild.createDevServer()
    created = server
    await compiled(0, 'the app')
  } catch (error) {
    try {
      // e.g. the first compile timed out: stop watching the app
      await created?.close()
    } finally {
      await app.dispose()
    }
    throw error
  }

  let closed: Promise<void> | undefined
  const close = () => {
    closed ??= (async () => {
      try {
        await server.close()
      } finally {
        await app.dispose()
      }
    })()
    return closed
  }
  options.registerCleanup?.(close)

  return {
    root,
    rsbuild,
    edit: async (files) => {
      for (const [relative, code] of Object.entries(files)) {
        const file = path.join(root, relative)
        if (code === null) {
          await rm(file, { force: true })
        } else {
          await mkdir(path.dirname(file), { recursive: true })
          await writeFile(file, code)
        }
      }
      await compiled(compiles, Object.keys(files).join(', '))
    },
    outputs: async (environment) => {
      const name = environment ?? Object.keys(distPaths)[0]!
      const distPath = distPaths[name]
      if (!distPath) {
        throw new Error(
          `no "${name}" environment (has ${Object.keys(distPaths).join(', ')})`,
        )
      }
      return readJavaScript(distPath)
    },
    rebuilt,
    errors,
    warnings,
    close,
  }
}

async function readJavaScript(directory: string) {
  const files: Record<string, string> = {}
  const visit = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(full)
      } else if (/\.[cm]?js$/.test(entry.name)) {
        files[path.relative(directory, full)] = await readFile(full, 'utf8')
      }
    }
  }
  await visit(directory)
  return files
}
