/**
 * Rsbuild dev-server harness, the Rsbuild counterpart of dev-server.ts:
 * starts a real Rsbuild dev server (JS API, Rspack in watch mode, output
 * written to disk) on a temporary app, lets the test edit files, waits for
 * the rebuild the edit causes, and reads what each environment emitted.
 *
 * Unlike the Vite harness, file events come from Rspack's own file watcher:
 * `edit()` writes the files and waits for the compile that includes them
 * (`trackCompiles`). When plugins write files too (a generated route tree),
 * `write()` and `settle()` wait until the compiles are done with every
 * write, by events only (see `settle`). Both also wait until Rspack's
 * watcher is attached and has scanned the app's directories, as the start
 * does (`CompileTracker.watching`): a file removed before that is never
 * reported. `diagnostics` keeps the errors and warnings of every compile
 * since the server started.
 *
 * Plugin-agnostic: the caller supplies the Rsbuild plugins and the directory
 * the apps live in (where their imports resolve).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, utimes } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { createRsbuild, mergeRsbuildConfig } from '@rsbuild/core'
import { createApp } from './build-harness'
import { diagnosticsOf } from './diagnostics'
import { saveAppFile } from './save-file'
import type { AppOptions } from './build-harness'
import type { Diagnostic } from './diagnostics'
import type { AddressInfo, Socket } from 'node:net'
import type {
  RsbuildConfig,
  RsbuildInstance,
  RsbuildPlugin,
  RsbuildDevServer as RsbuildServer,
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
   * Hot module replacement (`dev.hmr`). With it, each compile after an edit
   * also emits hot-update chunks (`hotUpdates()`), which `outputs()` leaves
   * out. Rsbuild's default is on; see `defaultHmr` for the harness default.
   */
  hmr?: boolean
  /**
   * How long to wait for a compile, in milliseconds: only a guard against a
   * compile that never comes (default 20 000). The wait ends as soon as the
   * compile ends or fails.
   */
  compileTimeout?: number
  /**
   * Serves the app to a real browser page (`./browser`) as `rsbuild dev`
   * does: listens on a free port (`url`), serves the entry's HTML page
   * (Rsbuild's default template, which mounts nothing: the entry renders
   * into `<div id="root">`), with Rsbuild's HMR client and live reload (`hmr`
   * defaults to `true`). Default `false`.
   */
  browser?: boolean
}

/**
 * The harness default of `hmr`: off, unlike Rsbuild (on). With it on, the
 * emitted chunks carry Rsbuild's HMR client, which tests that evaluate the
 * output outside a browser cannot run (no WebSocket server to reach), and
 * tests that look for the chunk of a module find the runtime's changes
 * elsewhere (2026-10-18: 15 tests of router-plugin and start-plugin-core
 * fail with it on). Tests of hot updates set `hmr: true`.
 */
const defaultHmr = false

/** Hot-update chunks and manifests (`*.hot-update.js`, `.json`). */
const hotUpdate = /\.hot-update\.[^/]*$/

/**
 * Hot-update chunks (`*.hot-update.js`, or `.mjs` for ES module output, as
 * Start's client environment emits), not their manifests.
 */
const hotUpdateChunk = /\.hot-update\.[cm]?js$/

export interface RsbuildDevServer {
  /** App root on disk. */
  root: string
  rsbuild: RsbuildInstance
  /** URL of the server (`browser` only). */
  url: string | undefined
  /**
   * Writes app files (relative to the app root; `null` deletes a file) and
   * waits for the compile that includes them; rejects with the error of a
   * compile of them Rspack gave up on.
   */
  edit: (files: Record<string, string | null>) => Promise<void>
  /**
   * Writes app files (relative to the app root; `null` deletes a file)
   * without waiting: Rspack's watcher (and plugins' own watchers) report
   * them; `settle()` waits for the compiles.
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Moves an app file without waiting (see `write`). */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Waits until the compiles are done with every write so far, the test's
   * (`write()`) and the plugins' (e.g. a generated route tree), by the
   * compiles' own events: no compile runs or is pending (Rspack's watcher
   * reports a change with its `invalid` hook), the outputs of the last one
   * are recorded, every app file the last compile read is as it was when
   * that compile started (else Rspack's watcher compiles again), and every
   * file `write()` wrote since the last call is read by the last compile or
   * accepted by `accept` (e.g. a file a plugin reported it cannot handle,
   * which no compile reads). Rejects when more than 10 compiles start
   * meanwhile (a plugin rewriting a file on each compile), and with the error
   * of a compile Rspack gave up on. `timeout` (default `compileTimeout`) only
   * guards against compiles that never come.
   */
  settle: (options?: {
    accept?: (relative: string) => boolean
    timeout?: number
  }) => Promise<void>
  /**
   * JavaScript files an environment (default: the only one) emitted by the
   * last compile, by path relative to its output directory, without the
   * hot-update chunks.
   */
  outputs: (environment?: string) => Promise<Record<string, string>>
  /**
   * The hot-update chunks an environment (default: the only one) emitted by
   * the compiles since the last `edit()` began (`hmr` only; an edit may cause
   * more than one compile, e.g. when a plugin writes a file the watcher then
   * reports), by path relative to its output directory.
   */
  hotUpdates: (environment?: string) => Promise<Record<string, string>>
  /** Modules (paths relative to the app root) the last compile built. */
  rebuilt: Array<string>
  /** Errors of the last compile (`diagnostics` keeps every compile's). */
  errors: Array<string>
  /** Warnings of the last compile (`diagnostics` keeps every compile's). */
  warnings: Array<string>
  /**
   * The errors and warnings of every compile of every environment since the
   * server started, in the order the compiles ended, as diagnostics
   * (`./diagnostics`: `severity` `error` or `warning`). A compile's report
   * is never lost to a later compile: a dev server compiles again on its own
   * (a file a plugin wrote, a file the watcher finds outdated when it
   * attaches after a compile), and a plugin that reports a problem once
   * (Start's import protection, `log: 'once'`) does not repeat it. For the
   * reports since a point, mark it (`const since = server.diagnostics.length`)
   * and read `server.diagnostics.slice(since)` afterwards, as with the Vite
   * harness's `logs`. Read through `diagnosticsOf`/`expectDiagnostic`.
   */
  diagnostics: Array<Diagnostic>
  /**
   * Stops the dev server (and its watcher) but keeps the app directory, e.g.
   * to edit the app afterwards and observe that nothing reacts; `close()`
   * removes the directory later.
   */
  stop: () => Promise<void>
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
  const {
    plugins = [],
    config = {},
    entry = 'src/entry.ts',
    browser = false,
  } = options
  const compileTimeout = options.compileTimeout ?? 20_000
  const app = await createApp({
    ...options,
    prefix: options.prefix ?? '.rsbuild-dev-server-',
  })
  const root = app.root
  try {
    await predateAppFiles(root)
  } catch (error) {
    await app.dispose()
    throw error
  }

  const rebuilt: Array<string> = []
  const errors: Array<string> = []
  const warnings: Array<string> = []
  const diagnostics: Array<Diagnostic> = []
  const compiles = trackCompiles()

  /**
   * The environments' compilers compiling now. (Rspack restarts a compile a
   * change invalidated without ending it: no `done`.)
   */
  const compiling = new Set<object>()
  /** Compiles started, and ended. */
  let started = 0
  let ended = 0
  /** `ended` when Rsbuild last reported the end of a compile. */
  let recordedAt = 0
  /** Rspack's watcher reported a change no compile started for yet. */
  let invalidated = false
  /** The error of the last compile Rspack gave up on, for `settle()`. */
  let gaveUp: Error | undefined
  /**
   * The app files each compiler read in its last compile, with their state
   * when that compile started.
   */
  const lastInputs = new Map<object, Map<string, AppFile | undefined>>()
  /** The app files each compile saw when it started, by compiler. */
  const startState = new Map<object, Map<string, AppFile>>()
  /** Files `write()` wrote since the last `settle()` (absolute). */
  const written = new Set<string>()
  /** Wakes up `settle()` whenever a compile starts, ends or is pending. */
  let wake = () => {}
  let woken = new Promise<void>((resolve) => {
    wake = resolve
  })
  const notify = () => {
    wake()
    woken = new Promise<void>((resolve) => {
      wake = resolve
    })
  }
  /** Output directory of each environment. */
  const distPaths: Record<string, string> = {}
  /**
   * Hot-update chunks (code by file) of the compiles since the last edit,
   * by environment compiler. Read when each compile ends: a later compile
   * may remove them from the output directory.
   */
  const hotUpdateChunks = new Map<object, Record<string, string>>()
  /** The environment compiler of each environment name. */
  const compilerOf: Record<string, object> = {}
  const harnessPlugin: RsbuildPlugin = {
    name: 'rsbuild-dev-server-harness',
    setup(api) {
      api.onAfterCreateCompiler(({ compiler }) => {
        compiles.track(compiler)
        for (const environmentCompiler of 'compilers' in compiler
          ? compiler.compilers
          : [compiler]) {
          const name = 'rsbuild-dev-server-harness:settle'
          // Before the plugins' own `watchRun` taps: what they write then is
          // read by the next compile, not this one
          environmentCompiler.hooks.watchRun.tap({ name, stage: -1000 }, () => {
            compiling.add(environmentCompiler)
            started++
            invalidated = false
            startState.set(environmentCompiler, readAppFiles(root))
            notify()
          })
          environmentCompiler.hooks.invalid.tap(name, () => {
            invalidated = true
            notify()
          })
          environmentCompiler.hooks.done.tap(
            { name, stage: -100 },
            ({ compilation }) => {
              compiling.delete(environmentCompiler)
              ended++
              // Read here, while the compilation is still accessible: Rspack
              // drops it once the next compile starts (`onDevCompileDone`
              // then cannot read it).
              diagnostics.push(
                ...diagnosticsOf(compilation.errors, 'error'),
                ...diagnosticsOf(compilation.warnings, 'warning'),
              )
              const state = startState.get(environmentCompiler) ?? new Map()
              lastInputs.set(
                environmentCompiler,
                new Map(
                  [...compilation.fileDependencies]
                    .filter((file) => isAppFile(root, file))
                    .map((file) => [file, state.get(file)]),
                ),
              )
              notify()
            },
          )
          environmentCompiler.hooks.failed.tap(name, (cause) => {
            compiling.delete(environmentCompiler)
            ended++
            // Nothing to record
            recordedAt = ended
            gaveUp = new Error(
              `Rsbuild failed to compile the app: ${cause.message}`,
              { cause },
            )
            notify()
          })
          const chunks: Record<string, string> = {}
          hotUpdateChunks.set(environmentCompiler, chunks)
          // Before Rsbuild's own `done` taps, which report the end of the
          // compile (`onDevCompileDone`)
          environmentCompiler.hooks.done.tap(
            { name: 'rsbuild-dev-server-harness', stage: -100 },
            ({ compilation }) => {
              for (const asset of compilation.getAssets()) {
                if (hotUpdateChunk.test(asset.name)) {
                  chunks[asset.name] = asset.source.source().toString()
                }
              }
            },
          )
        }
      })
      api.onDevCompileDone(({ stats, environments }) => {
        for (const [name, environment] of Object.entries(environments)) {
          distPaths[name] = environment.distPath
        }
        const all = 'stats' in stats ? stats.stats : [stats]
        const names = Object.keys(environments)
        const compilers = [...hotUpdateChunks.keys()]
        const built: Array<string> = []
        const compileErrors: Array<string> = []
        const compileWarnings: Array<string> = []
        try {
          all.forEach((environmentStats, index) => {
            const { compilation } = environmentStats
            compilerOf[compilation.name ?? names[index]!] = compilers[index]!
            for (const module of compilation.builtModules) {
              const resource = (module as { resource?: string }).resource
              if (resource) {
                built.push(path.relative(root, resource))
              }
            }
            for (const error of compilation.errors) {
              compileErrors.push(error.message)
            }
            for (const warning of compilation.warnings) {
              compileWarnings.push(warning.message)
            }
          })
        } catch (error) {
          // Rspack dropped the compilation: the next compile, which an edit
          // made during this one started (e.g. a plugin wrote a file the
          // watcher reports), is running, and its end reports instead.
          if (/Unable to access compilation/.test(String(error))) {
            return
          }
          throw error
        }
        rebuilt.splice(0, rebuilt.length, ...built)
        errors.splice(0, errors.length, ...compileErrors)
        warnings.splice(0, warnings.length, ...compileWarnings)
        recordedAt = ended
        notify()
        compiles.done()
      })
    },
  }

  let rsbuild: RsbuildInstance
  let server: Awaited<ReturnType<RsbuildInstance['createDevServer']>>
  let url: string | undefined
  /** The HTTP server of a page (`browser` only). */
  let http: Awaited<ReturnType<typeof serve>> | undefined
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
          // Without a browser page, live reload would do nothing
          dev: {
            writeToDisk: true,
            hmr: options.hmr ?? (browser || defaultHmr),
            liveReload: browser,
          },
          server: {
            printUrls: false,
            // With a page, the harness serves Rsbuild's middlewares and
            // WebSocket from a server of its own (Rsbuild's custom server
            // API), which binds a port the system assigns. Rsbuild's own
            // `listen()` binds the port it found free when the dev server
            // was created, before the first compile: another process can
            // take it meanwhile (EADDRINUSE). Its HMR client connects to
            // the page's port. (`port: 0`: Rsbuild's port search, whose
            // result nothing binds, always finds one.)
            ...(browser && { middlewareMode: true, port: 0 }),
          },
          // Rsbuild's default source maps in development, as in an app
          output: { minify: false },
          tools: { htmlPlugin: browser },
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
    // Rspack attaches its watcher after the first compile; an edit before
    // the watcher scanned the app could lose a removal (`watching`).
    await compiles.watching(root, compileTimeout)
    if (browser) {
      http = await serve(server)
      url = http.url
    }
  } catch (error) {
    try {
      // e.g. the first compile timed out: stop watching the app
      await created?.close()
    } finally {
      await app.dispose()
    }
    throw error
  }

  let stopped: Promise<void> | undefined
  const stop = () => {
    stopped ??= (async () => {
      try {
        await server.close()
      } finally {
        await http?.close()
      }
    })()
    return stopped
  }
  let closed: Promise<void> | undefined
  const close = () => {
    closed ??= (async () => {
      try {
        await stop()
      } finally {
        await app.dispose()
      }
    })()
    return closed
  }
  options.registerCleanup?.(close)

  const distPathOf = (environment: string | undefined) => {
    const name = environment ?? Object.keys(distPaths)[0]!
    const distPath = distPaths[name]
    if (!distPath) {
      throw new Error(
        `no "${name}" environment (has ${Object.keys(distPaths).join(', ')})`,
      )
    }
    return distPath
  }

  const file = (relative: string) => path.join(root, relative)

  async function write(files: Record<string, string | null>) {
    gaveUp = undefined
    for (const [relative, code] of Object.entries(files)) {
      const absolute = file(relative)
      written.add(absolute)
      if (code === null) {
        await rm(absolute, { force: true })
      } else {
        await saveAppFile(root, absolute, code)
      }
    }
  }

  /** Why the compiles are not done with the writes yet, or `undefined`. */
  function unsettled(accept: (relative: string) => boolean) {
    if (gaveUp) {
      return undefined
    }
    if (compiling.size > 0 || invalidated || recordedAt !== ended) {
      return 'a compile runs or is pending'
    }
    const changed = [...lastInputs.values()].flatMap((inputs) =>
      [...inputs]
        .filter(([input, before]) => {
          const now = readAppFile(input)
          return now?.code !== before?.code || now?.mtimeMs !== before?.mtimeMs
        })
        .map(([input]) => input),
    )
    if (changed.length) {
      return `no compile read ${changed.map((input) => path.relative(root, input)).join(', ')} as it is now`
    }
    const unread = [...written].filter(
      (absolute) =>
        readAppFile(absolute) !== undefined &&
        ![...lastInputs.values()].some((inputs) => inputs.has(absolute)) &&
        !accept(path.relative(root, absolute).split(path.sep).join('/')),
    )
    if (unread.length) {
      return `no compile read ${unread.map((absolute) => path.relative(root, absolute)).join(', ')}`
    }
    return undefined
  }

  async function settle(
    options: { accept?: (relative: string) => boolean; timeout?: number } = {},
  ) {
    const accept = options.accept ?? (() => false)
    const timeout = options.timeout ?? compileTimeout
    const deadline = Date.now() + timeout
    const startedBefore = started
    for (;;) {
      const reason = unsettled(accept)
      if (gaveUp) {
        const error = gaveUp
        gaveUp = undefined
        throw error
      }
      if (reason === undefined) {
        await compiles.watching(root, timeout)
        written.clear()
        return
      }
      if (started - startedBefore > 10) {
        throw new Error(
          `the app keeps compiling: ${started - startedBefore} compiles since settle() began (${reason})`,
        )
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Rsbuild did not settle within ${timeout} ms: ${reason}`,
        )
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        woken,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 25)
        }),
      ])
      clearTimeout(timer)
    }
  }

  return {
    root,
    rsbuild,
    url,
    write,
    rename: async (from, to) => {
      gaveUp = undefined
      written.add(file(from))
      written.add(file(to))
      await mkdir(path.dirname(file(to)), { recursive: true })
      await rename(file(from), file(to))
    },
    settle,
    edit: (files) => {
      for (const chunks of hotUpdateChunks.values()) {
        for (const file of Object.keys(chunks)) {
          delete chunks[file]
        }
      }
      return compiles.edit(root, files, compileTimeout)
    },
    outputs: async (environment) => {
      const files = await readJavaScript(distPathOf(environment))
      return Object.fromEntries(
        Object.entries(files).filter(([file]) => !hotUpdate.test(file)),
      )
    },
    hotUpdates: (environment) => {
      distPathOf(environment)
      const compiler = compilerOf[environment ?? Object.keys(distPaths)[0]!]
      return Promise.resolve({
        ...(compiler && hotUpdateChunks.get(compiler)),
      })
    },
    rebuilt,
    errors,
    warnings,
    diagnostics,
    stop,
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
   * Waits until every compiler's watcher is attached and has scanned the
   * directories of the app files (under `root`) its last compile read or
   * looked for, so that a removal is reported. Rspack attaches its watcher
   * on the tick after a compile ends, and watchpack then scans the watched
   * directories: a file removed while that scan runs is never reported
   * (watchpack 2.5.2 `DirectoryWatcher.doScan`: a file the listing had but
   * the stat no longer finds is neither known nor missing afterwards;
   * FOLLOWUPS "UPSTREAM (W3-harness2)"). Ready when every compiler's
   * watcher is attached and, together, their watchpack
   * `getTimeInfoEntries()` have an entry (a time, or `null` once the scan
   * ended) for each of those paths: a compiler may watch for another
   * (Rspack's RSC coordinator makes the server compiler watch the client
   * compiler's files, whose own watcher ignores everything). `timeout` only
   * guards against a watcher that never attaches.
   */
  watching: (root: string, timeout: number) => Promise<void>
  /**
   * Writes files (relative to `root`; `null` deletes a file) and waits for
   * the compile that includes the edit (see `CompileTracker`), then for the
   * watcher (`watching`).
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
 * changed (each in a compile that started after its write),
 * and every other written file (e.g. a new module) was read or is
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
    /** Each edited file as it was before the edit (`undefined`: absent). */
    before: Map<string, AppFile | undefined>
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

  /** See `CompileTracker.watching`. */
  const watching = async (root: string, timeout: number) => {
    const deadline = Date.now() + timeout
    /** What every compiler's watcher knows, together. */
    const known = () => {
      const entries = new Set<string>()
      for (const compiler of compilers) {
        const attached = (compiler as { watching?: { watcher?: unknown } })
          .watching?.watcher
        const watcher = (
          compiler.watchFileSystem as
            | { watcher?: { getTimeInfoEntries: () => Map<string, unknown> } }
            | undefined
        )?.watcher
        if (!attached || !watcher) {
          return undefined
        }
        for (const file of watcher.getTimeInfoEntries().keys()) {
          entries.add(file)
        }
      }
      return entries
    }
    for (;;) {
      // Against the union of the watchers: one compiler may watch for
      // another (Rspack's RSC coordinator has the server compiler watch the
      // client compiler's files and ignores everything in the client's own
      // watcher).
      const entries = known()
      const ready =
        entries !== undefined &&
        compilers.every((compiler) => {
          const last = dependencies.get(compiler)
          return [...(last?.files ?? []), ...(last?.missing ?? [])]
            .filter((file) => isAppFile(root, file))
            .every((file) => entries.has(file))
        })
      if (ready) {
        return
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Rsbuild's file watcher did not finish scanning the app within ${timeout} ms`,
        )
      }
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  return {
    watching,
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
            // A compile counts toward an edited file only if it started
            // after the write: the file is no longer as it was before the
            // edit (contents or modification time; the compile reads its
            // files after `watchRun`, a plugin may rewrite the file then).
            // One that started before (for a change the watcher saw
            // earlier, e.g. on its first scan) does not compile the edit,
            // even if it names the file (DECISIONS 2026-10-20 "Rsbuild
            // first-edit harness fixes").
            const edited = (file: string) =>
              wait.before.has(file) &&
              !sameAppFile(wait.before.get(file), readAppFile(file))
            const pending = wait.pending.get(environmentCompiler)
            for (const file of changed) {
              if (edited(file)) {
                pending?.delete(file)
              }
            }
            if (
              wait.files.some(
                (file) =>
                  edited(file) &&
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
        before: new Map(files.map((file) => [file, readAppFile(file)])),
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
            await saveAppFile(root, file, code)
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
      await compiled
      await watching(root, timeout)
    },
  }
}

/**
 * Serves a dev server created in `middlewareMode` (its middlewares and HMR
 * WebSocket) over HTTP on a port the system assigns as the server binds it,
 * as Rsbuild documents for a custom server.
 */
async function serve(devServer: RsbuildServer) {
  const httpServer = createServer(devServer.middlewares)
  // Open connections (the page's WebSocket included) end with the server
  const sockets = new Set<Socket>()
  httpServer.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  devServer.connectWebSocket({ server: httpServer })
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', resolve)
  })
  const close = () =>
    new Promise<void>((resolve) => {
      for (const socket of sockets) {
        socket.destroy()
      }
      httpServer.close(() => resolve())
    })
  try {
    await devServer.afterListen()
  } catch (error) {
    await close()
    throw error
  }
  const { port } = httpServer.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}/`, close }
}

/** An app file as a compile may read it. */
interface AppFile {
  code: string
  mtimeMs: number
}

/** Directories of an app no compile reads from (output, dependencies). */
const nonAppDirectories = new Set(['node_modules', 'dist', '.git'])

/**
 * How long before the dev server starts its initial files were last
 * modified: more than watchpack's coarsest modification-time accuracy (2 s).
 */
export const initialFilesAge = 10_000

/**
 * Dates the app's initial files `initialFilesAge` back: a user starts the
 * dev server on files that are already on disk. Files written a moment
 * before the first compile fall within the accuracy watchpack allows for
 * their modification times, so its first scan reports them changed, and
 * Rspack starts a second compile by itself right after the first one
 * (DECISIONS 2026-10-20 "Rsbuild first-edit harness fixes"): a test's
 * first edit would then land during that compile.
 */
async function predateAppFiles(root: string) {
  const past = new Date(Date.now() - initialFilesAge)
  for (const file of readAppFiles(root).keys()) {
    await utimes(file, past, past)
  }
}

/** Whether `file` is an app file under `root` (not output or a dependency). */
function isAppFile(root: string, file: string) {
  const relative = path.relative(root, file)
  return (
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).some((part) => nonAppDirectories.has(part))
  )
}

function sameAppFile(a: AppFile | undefined, b: AppFile | undefined) {
  return a === undefined || b === undefined
    ? a === b
    : a.code === b.code && a.mtimeMs === b.mtimeMs
}

function readAppFile(file: string): AppFile | undefined {
  try {
    return {
      code: readFileSync(file, 'utf8'),
      mtimeMs: statSync(file).mtimeMs,
    }
  } catch {
    return undefined
  }
}

/** Every app file under `root`, by absolute path. */
function readAppFiles(root: string) {
  const files = new Map<string, AppFile>()
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!nonAppDirectories.has(entry.name)) {
          visit(full)
        }
      } else if (entry.isFile()) {
        const state = readAppFile(full)
        if (state) {
          files.set(full, state)
        }
      }
    }
  }
  visit(root)
  return files
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
