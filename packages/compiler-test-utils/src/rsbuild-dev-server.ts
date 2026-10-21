/**
 * Rsbuild dev-server harness, the Rsbuild counterpart of dev-server.ts:
 * starts a real Rsbuild dev server (JS API, Rspack in watch mode, output
 * written to disk) on a temporary app, lets the test edit files, waits for
 * the rebuild the edit causes, and reads what each environment emitted.
 *
 * Unlike the Vite harness, file events come from Rspack's own file watcher
 * (or a plugin's, which invalidates the compiler): `edit()` writes the
 * files and waits for the bounded outcome of the edit (`trackCompiles`): a
 * compile that started after the last write ended, and nothing compiles or
 * is pending, within an overall timeout. Which files a compile reads, and
 * how many compiles an edit takes, are the plugins' business (coupling
 * N21): a plugin may watch an original source itself and hand Rspack a
 * virtual module. When plugins write files too (a generated route tree),
 * `write()` and `settle()` wait the same way. Both also wait until Rspack's
 * watcher is attached and has scanned the app's directories, as the start
 * does (`CompileTracker.watching`: the authorised initial-scan adapter): a
 * file removed before that is never reported.
 *
 * Diagnostics: one channel (`./diagnostic-channel`) records, from the start
 * until `stop()`, every compile's errors and warnings and what `console.*`
 * and direct writes to `process.stdout`/`stderr` report (`diagnostics`).
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
import { scopeMethods } from './console-hook'
import { openDiagnosticChannel } from './diagnostic-channel'
import { saveAppFile } from './save-file'
import type { AppOptions } from './build-harness'
import type { ChannelDiagnostic, DiagnosticChannel } from './diagnostic-channel'
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
   * waits for the edit's outcome: a compile that started after the last
   * write ended and nothing compiles or is pending (`compileTimeout` bounds
   * it); rejects with the error of a compile of them Rspack gave up on.
   * `accept` takes the files the caller expects no compile for (a file
   * nothing reads): when it takes them all, the wait ends once they are
   * written.
   */
  edit: (
    files: Record<string, string | null>,
    options?: { accept?: (relative: string) => boolean },
  ) => Promise<void>
  /**
   * Writes app files (relative to the app root; `null` deletes a file)
   * without waiting: Rspack's watcher (and plugins' own watchers) report
   * them; `settle()` waits for the compiles.
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Moves an app file without waiting (see `write`). */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Waits for the outcome of every write so far, the test's (`write()`) and
   * the plugins' (e.g. a generated route tree), by the compiles' own
   * events: a compile started after the last `write()` (unless `accept`
   * takes every file written since the last call: a file nothing reads),
   * no compile runs or is pending (Rspack's watcher, or a plugin, reports a
   * change with the `invalid` hook), the outputs of the last one are
   * recorded, and every app file the last compile read is as it was when
   * that compile started (else Rspack's watcher compiles again). Bounded by
   * `timeout` in all (default `compileTimeout`), not by a count of compiles:
   * an app that keeps compiling (a plugin rewriting a file on each compile)
   * fails there. Rejects with the error of a compile Rspack gave up on.
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
   * Everything reported since the server started, on every channel, in
   * order (`./diagnostic-channel`): the errors and warnings of every compile
   * of every environment (source `bundler`, read when each compile ends),
   * and `console.*` and direct writes to `process.stdout`/`stderr` (a
   * plugin may report through the console instead of the compilation,
   * SPEC §5.7). A compile's report is never lost to a later compile: a dev
   * server compiles again on its own, and a plugin that reports a problem
   * once (Start's import protection, `log: 'once'`) does not repeat it. For
   * the reports since a point, mark it (`const since =
   * server.diagnostics.length`) and read `server.diagnostics.slice(since)`
   * afterwards. Read through `expectDiagnostic`; "nothing reported" through
   * `expectNoProblems`.
   */
  diagnostics: Array<ChannelDiagnostic>
  /**
   * The Rsbuild dev server (`createDevServer()` of the public API), e.g.
   * for `environments.<name>.loadBundle(entry)` (server code).
   */
  devServer: RsbuildServer
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
  const channel = openDiagnosticChannel()
  try {
    return await channel.run(() => startServer(options, channel))
  } catch (error) {
    channel.close()
    throw error
  }
}

async function startServer(
  options: RsbuildDevServerOptions,
  channel: DiagnosticChannel,
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
  /** Every channel the server's work may report on (see the module comment). */
  const diagnostics = channel.diagnostics
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
  /**
   * Files `write()` wrote since the last `settle()` (absolute): each one as
   * it was before the write, and the first compile (`started`) that began
   * once the file held the write (it reads the file after it began).
   */
  const written = new Map<
    string,
    { before: AppFile | undefined; seenBy?: number }
  >()
  /** Records the write of `absolute`, before writing it. */
  const willWrite = (absolute: string) => {
    if (!written.has(absolute)) {
      written.set(absolute, { before: readAppFile(absolute) })
    } else {
      written.get(absolute)!.seenBy = undefined
    }
  }
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
          channel.scopeRspack(environmentCompiler)
          const name = 'rsbuild-dev-server-harness:settle'
          // Before the plugins' own `watchRun` taps: what they write then is
          // read by the next compile, not this one
          environmentCompiler.hooks.watchRun.tap({ name, stage: -1000 }, () => {
            compiling.add(environmentCompiler)
            started++
            invalidated = false
            startState.set(environmentCompiler, readAppFiles(root))
            // This compile reads what the written files hold now
            for (const [absolute, state] of written) {
              if (
                state.seenBy === undefined &&
                !sameAppFile(state.before, readAppFile(absolute))
              ) {
                state.seenBy = started
              }
            }
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
              channel.reportCompilation(compilation)
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
          logLevel: 'warn',
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
      channel.close()
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
        try {
          await http?.close()
        } finally {
          channel.close()
        }
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
  options.registerCleanup?.(() => channel.run(close))

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
      willWrite(absolute)
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
    const owed = [...written].filter(
      ([absolute, state]) =>
        state.seenBy === undefined &&
        !sameAppFile(state.before, readAppFile(absolute)) &&
        !accept(path.relative(root, absolute).split(path.sep).join('/')),
    )
    if (owed.length > 0) {
      return `no compile started after the write of ${owed.map(([absolute]) => path.relative(root, absolute)).join(', ')}`
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
    return undefined
  }

  async function settle(
    options: { accept?: (relative: string) => boolean; timeout?: number } = {},
  ) {
    const accept = options.accept ?? (() => false)
    const timeout = options.timeout ?? compileTimeout
    const deadline = Date.now() + timeout
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

  return scopeMethods(channel.run, {
    root,
    rsbuild,
    url,
    write,
    rename: async (from, to) => {
      gaveUp = undefined
      willWrite(file(from))
      willWrite(file(to))
      await mkdir(path.dirname(file(to)), { recursive: true })
      await rename(file(from), file(to))
    },
    settle,
    edit: (files, editOptions = {}) => {
      for (const chunks of hotUpdateChunks.values()) {
        for (const file of Object.keys(chunks)) {
          delete chunks[file]
        }
      }
      return compiles.edit(root, files, compileTimeout, editOptions.accept)
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
    devServer: server,
    stop,
    close,
  })
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
   * the edit's outcome (see `trackCompiles`), then for the watcher
   * (`watching`). `accept` takes the files no compile is expected for.
   */
  edit: (
    root: string,
    files: Record<string, string | null>,
    timeout: number,
    accept?: (relative: string) => boolean,
  ) => Promise<void>
}

/**
 * Follows the compiles of a watch mode Rspack build, to wait for the
 * outcome of an edit, bounded by a timeout (coupling N21): the edit is
 * applied once a compile that started after the last write ended and every
 * compile that started meanwhile ended (`done()`). Which compiler reads the
 * edited files, what a compile reports changed, and how many compiles an
 * edit takes are not assumed: a plugin may watch an original source itself
 * and invalidate the compiler. A compile that started before the writes
 * ended does not count: Rspack's watcher compiles again for a file written
 * after a compile started. A compile Rspack gives up on (a plugin hook
 * threw) after the writes fails the wait, with its error. `timeout` bounds
 * the whole wait.
 */
export function trackCompiles(): CompileTracker {
  interface EditWait {
    files: Array<string>
    /** The writes ended. */
    written: boolean
    /**
     * The files a compile is owed for (`accept` takes the others), each as
     * it was before the edit, and the first compile (`started`) that began
     * once the file held the edit: it reads the edit (a compile reads its
     * files after `watchRun`).
     */
    owed: Map<string, { before: AppFile | undefined; seenBy?: number }>
    resolve: () => void
    reject: (error: Error) => void
  }
  const compilers: Array<Rspack.Compiler> = []
  /**
   * The dependencies of each compiler's last compile: the files it read,
   * and the paths it looked for and did not find (for `watching`, the
   * initial-scan adapter).
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

  /** Compilers whose watcher reported a change no compile began for. */
  const invalid = new Set<Rspack.Compiler>()

  /** The last compile that read part of the edit, if every owed file was. */
  const lastReader = (wait: EditWait) => {
    let last = 0
    for (const { seenBy } of wait.owed.values()) {
      if (seenBy === undefined) {
        return undefined
      }
      last = Math.max(last, seenBy)
    }
    return last
  }

  /** Whether the edit's outcome is in (see `trackCompiles`). */
  const settled = (wait: EditWait) => {
    const last = lastReader(wait)
    return (
      wait.written &&
      last !== undefined &&
      startedBeforeDone >= last &&
      startedBeforeDone === started &&
      invalid.size === 0
    )
  }

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
          invalid.delete(environmentCompiler)
          for (const wait of waits) {
            for (const [file, state] of wait.owed) {
              if (
                state.seenBy === undefined &&
                !sameAppFile(state.before, readAppFile(file))
              ) {
                state.seenBy = started
              }
            }
          }
        })
        environmentCompiler.hooks.invalid.tap(name, () => {
          invalid.add(environmentCompiler)
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
            // A compile of the edit (it read part of it)
            if (
              [...wait.owed.values()].some(({ seenBy }) => seenBy !== undefined)
            ) {
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
    async edit(root, edits, timeout, accept = () => false) {
      const files = Object.keys(edits).map((file) => path.join(root, file))
      const startedBefore = started
      const wait: EditWait = {
        files,
        written: false,
        owed: new Map(
          Object.keys(edits)
            .filter((relative) => !accept(relative.split(path.sep).join('/')))
            .map((relative) => {
              const file = path.join(root, relative)
              return [file, { before: readAppFile(file) }]
            }),
        ),
        resolve: () => {},
        reject: () => {},
      }
      // Listens before writing: a compile may fail while the writes finish
      const compiled = withTimeout(
        timeout,
        () =>
          `Rsbuild did not finish a compile of the edit of ${Object.keys(edits).join(', ')} within ${timeout} ms (${started - startedBefore} compiles started since the edit began, ${
            !wait.written
              ? 'the writes did not finish'
              : lastReader(wait) !== undefined
                ? 'the compiles of the edit did not end'
                : `none read ${[...wait.owed]
                    .filter(([, { seenBy }]) => seenBy === undefined)
                    .map(([file]) => path.relative(root, file))
                    .join(', ')} as edited`
          })`,
        (handlers) => {
          wait.resolve = handlers.resolve
          wait.reject = handlers.reject
          waits.add(wait)
          return () => waits.delete(wait)
        },
      )
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
