/**
 * Rsbuild dev-server harness, the Rsbuild counterpart of dev-server.ts:
 * starts a real Rsbuild dev server (JS API, Rspack in watch mode, output
 * written to disk) on a temporary app, lets the test edit files, waits for
 * the rebuild the edit causes, and reads what each environment emitted.
 *
 * Unlike the Vite harness, file events come from Rspack's own file watcher:
 * `edit()` writes the files and waits for the compile that includes them
 * (`trackCompiles`).
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
  Rspack,
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
  /**
   * How long to wait for a compile, in milliseconds: only a guard against a
   * compile that never comes (default 20 000). The wait ends as soon as the
   * compile ends or fails.
   */
  compileTimeout?: number
}

export interface RsbuildDevServer {
  /** App root on disk. */
  root: string
  rsbuild: RsbuildInstance
  /**
   * Writes app files (relative to the app root; `null` deletes a file) and
   * waits for the compile that includes them; rejects with the error of a
   * compile of them Rspack gave up on.
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

  const rebuilt: Array<string> = []
  const errors: Array<string> = []
  const warnings: Array<string> = []
  const compiles = trackCompiles()
  /** Output directory of each environment. */
  const distPaths: Record<string, string> = {}
  const harnessPlugin: RsbuildPlugin = {
    name: 'rsbuild-dev-server-harness',
    setup(api) {
      api.onAfterCreateCompiler(({ compiler }) => {
        compiles.track(compiler)
      })
      api.onDevCompileDone(({ stats, environments }) => {
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
        compiles.done()
      })
    },
  }

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
          // Rsbuild's default source maps in development, as in an app
          output: { minify: false },
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
    await compiles.first(compileTimeout)
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
    edit: (files) => compiles.edit(root, files, compileTimeout),
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

export interface CompileTracker {
  /**
   * Follows the compiles of an Rspack compiler, or of each compiler of a
   * multi-compiler (one per Rsbuild environment).
   */
  track: (compiler: Rspack.Compiler | Rspack.MultiCompiler) => void
  /**
   * To call once the outputs of a compile of every compiler are recorded
   * (e.g. Rsbuild's `onDevCompileDone`): settles the waits it completes.
   */
  done: () => void
  /**
   * Waits for the first compile; rejects with the error of a compile Rspack
   * gave up on (a plugin hook threw), or after `timeout` ms.
   */
  first: (timeout: number) => Promise<void>
  /**
   * Writes files (relative to `root`; `null` deletes a file) and waits for
   * the compile that includes the edit (see `CompileTracker`).
   */
  edit: (
    root: string,
    files: Record<string, string | null>,
    timeout: number,
  ) => Promise<void>
}

/**
 * Follows the compiles of a watch mode Rspack build, to wait for the
 * compile that includes an edit, by what each compile reports changed
 * (`compiler.modifiedFiles` and `removedFiles`) rather than by when it
 * starts: the watcher may start the compile of an edit before the writes
 * finish, all the more on a loaded machine.
 *
 * The wait for an edit begins before the files are written. It ends at the
 * end of a compile once a compile reported an edited file (or a directory
 * of one) changed, every compiler that read an edited file reported it
 * changed, and every other written file (e.g. a new module) was read or is
 * looked for by no compile (which then failed to find it, before the
 * write). A compile Rspack gives up on (a plugin hook threw) fails the waits
 * for the edits it includes, with its error. `timeout` only guards against
 * a compile that never comes.
 */
export function trackCompiles(): CompileTracker {
  interface EditWait {
    files: Array<string>
    /** Edited files a compiler read and did not report changed yet. */
    pending: Map<Rspack.Compiler, Set<string>>
    /** Written files no compiler read. */
    unread: Array<string>
    written: boolean
    /** A compile reported an edited file (or a directory of one). */
    reached: boolean
    /** `started` when a compile last reported an edited file. */
    lastReport: number
    resolve: () => void
    reject: (error: Error) => void
  }
  const compilers: Array<Rspack.Compiler> = []
  /**
   * The dependencies of each compiler's last compile: the files it read,
   * and the paths it looked for and did not find.
   */
  const dependencies = new Map<
    Rspack.Compiler,
    { files: Set<string>; missing: Set<string> }
  >()
  const waits = new Set<EditWait>()
  /** Compiles started, by any compiler. */
  let started = 0
  /** `started` at the end of the last compile of every compiler. */
  let startedBeforeDone = 0
  let finished = 0
  let failure: Error | undefined
  const firstWaits = new Set<{
    resolve: () => void
    reject: (error: Error) => void
  }>()

  const touches = (changed: string, file: string) =>
    file === changed || file.startsWith(changed + path.sep)

  const isRead = (file: string) =>
    compilers.some((compiler) => dependencies.get(compiler)?.files.has(file))

  /** Whether a compile looked for the file, or a directory of it. */
  const isMissing = (file: string) =>
    compilers.some((compiler) =>
      [...(dependencies.get(compiler)?.missing ?? [])].some(
        (missing) => missing !== '/' && touches(missing, file),
      ),
    )

  const unreported = (wait: EditWait) => [
    ...new Set([...wait.pending.values()].flatMap((files) => [...files])),
  ]

  /** Written files a compile still has to read. */
  const unreadButNeeded = (wait: EditWait) =>
    wait.unread.filter((file) => !isRead(file) && isMissing(file))

  /**
   * Whether the compiles include the whole edit, and the last one that
   * reported part of it ended (no compiler compiles when `done()` is called).
   */
  const settled = (wait: EditWait) =>
    wait.written &&
    wait.reached &&
    unreported(wait).length === 0 &&
    unreadButNeeded(wait).length === 0 &&
    startedBeforeDone >= wait.lastReport

  const withTimeout = (
    timeout: number,
    message: () => string,
    register: (handlers: {
      resolve: () => void
      reject: (error: Error) => void
    }) => () => void,
  ) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        unregister()
        reject(new Error(message()))
      }, timeout)
      const unregister = register({
        resolve: () => {
          clearTimeout(timer)
          unregister()
          resolve()
        },
        reject: (error) => {
          clearTimeout(timer)
          unregister()
          reject(error)
        },
      })
    })

  return {
    track(compiler) {
      for (const environmentCompiler of 'compilers' in compiler
        ? compiler.compilers
        : [compiler]) {
        compilers.push(environmentCompiler)
        const name = 'compile-tracker'
        environmentCompiler.hooks.watchRun.tap(name, () => {
          started++
          const changed = [
            ...(environmentCompiler.modifiedFiles ?? []),
            ...(environmentCompiler.removedFiles ?? []),
          ]
          for (const wait of waits) {
            const pending = wait.pending.get(environmentCompiler)
            for (const file of changed) {
              pending?.delete(file)
            }
            if (
              wait.files.some((file) =>
                changed.some((changedPath) => touches(changedPath, file)),
              )
            ) {
              wait.reached = true
              wait.lastReport = started
            }
          }
        })
        // Before Rsbuild's own `done` taps, which announce the end of the
        // compile: the next edit may begin right then.
        environmentCompiler.hooks.done.tap({ name, stage: -100 }, (stats) => {
          const { compilation } = stats
          dependencies.set(environmentCompiler, {
            files: new Set(compilation.fileDependencies),
            missing: new Set(compilation.missingDependencies),
          })
        })
        environmentCompiler.hooks.failed.tap(name, (cause) => {
          const error = new Error(
            `Rsbuild failed to compile the app: ${cause.message}`,
            { cause },
          )
          if (finished === 0) {
            failure = error
            for (const wait of firstWaits) {
              wait.reject(error)
            }
          }
          for (const wait of waits) {
            if (wait.reached) {
              wait.reject(error)
            }
          }
        })
      }
    },
    done() {
      finished++
      startedBeforeDone = started
      for (const wait of firstWaits) {
        wait.resolve()
      }
      for (const wait of waits) {
        if (settled(wait)) {
          wait.resolve()
        }
      }
    },
    first(timeout) {
      if (finished > 0) {
        return Promise.resolve()
      }
      if (failure) {
        return Promise.reject(failure)
      }
      return withTimeout(
        timeout,
        () => `Rsbuild did not finish the first compile within ${timeout} ms`,
        (handlers) => {
          firstWaits.add(handlers)
          return () => firstWaits.delete(handlers)
        },
      )
    },
    async edit(root, edits, timeout) {
      const files = Object.keys(edits).map((file) => path.join(root, file))
      const startedBefore = started
      const wait: EditWait = {
        files,
        pending: new Map(
          compilers.map((compiler) => [
            compiler,
            new Set(
              files.filter((file) =>
                dependencies.get(compiler)?.files.has(file),
              ),
            ),
          ]),
        ),
        unread: Object.entries(edits)
          .filter(([, code]) => code !== null)
          .map(([file]) => path.join(root, file))
          .filter((file) => !isRead(file)),
        written: false,
        reached: false,
        lastReport: 0,
        resolve: () => {},
        reject: () => {},
      }
      // Listens before writing: the watcher may start the compile of the
      // edit before the writes finish.
      const compiled = withTimeout(
        timeout,
        () => {
          const missing = [...unreported(wait), ...unreadButNeeded(wait)]
          return `Rsbuild did not finish a compile of the edit of ${Object.keys(edits).join(', ')} within ${timeout} ms (${started - startedBefore} compiles started since the edit; no compile included ${
            missing.length
              ? missing.map((file) => path.relative(root, file)).join(', ')
              : 'an edited file'
          })`
        },
        (handlers) => {
          wait.resolve = handlers.resolve
          wait.reject = handlers.reject
          waits.add(wait)
          return () => waits.delete(wait)
        },
      )
      // A compile of the edit may fail while the writes finish
      compiled.catch(() => {})
      try {
        for (const [relative, code] of Object.entries(edits)) {
          const file = path.join(root, relative)
          if (code === null) {
            await rm(file, { force: true })
          } else {
            await mkdir(path.dirname(file), { recursive: true })
            await writeFile(file, code)
          }
        }
      } catch (error) {
        wait.reject(error as Error)
      }
      wait.written = true
      // The compile of the edit may have ended while the writes finished
      if (settled(wait)) {
        wait.resolve()
      }
      return compiled
    },
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
