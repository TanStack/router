/**
 * Dev-server harness for tests of what a dev server serves after edits:
 * starts a real Vite dev server (JS API, unbundled dev) on a temporary app,
 * lets the test create, edit, rename and delete files, which Vite's own file
 * watcher (chokidar) reports, waits until the server has handled what the
 * watcher reported (plugin `watchChange` and `hotUpdate` hooks, HMR), and
 * then requests modules per environment and reports the HMR payloads sent to
 * each environment.
 *
 * Nothing replays file events: `write()` saves files atomically, as editors
 * do (`./save-file`: the watcher never sees a half-written file), the
 * watcher reports them, and `settle()` waits for the server, by events only:
 * - each file the test wrote is reported by the watcher (a test writes like
 *   a user, a moment after the last change the watcher reported: chokidar
 *   drops a second change of a file within that moment);
 * - each reported event is handled: Vite calls `hotUpdateEnvironments` at
 *   the end of its handling of a file event, or logs the error that stopped
 *   it (`AsyncLocalStorage` ties both to the event);
 * - files plugins wrote meanwhile (e.g. a generated route tree): the harness
 *   changes a barrier file, which the watcher reports after the writes made
 *   before it, once the server handled everything, and checks that every
 *   app file is as the watcher last saw it (when the server finished
 *   handling its event, or when chokidar dropped a change of it); until a
 *   round sees no new event.
 * The outcome is bounded, not counted: `settle()` ends once a round of
 * events brings no new one, and fails when the app's files still change at
 * `settleTimeout` (a plugin that keeps writing files on each event never
 * settles). How many events, rounds or hot updates an edit causes is the
 * plugins' business (coupling N21).
 *
 * Diagnostics: one channel (`./diagnostic-channel`) records, from the start
 * until `stop()`, what Vite's logger, `console.*` and direct writes to
 * `process.stdout`/`stderr` report (`diagnostics`); `logs` holds its
 * warnings and errors as text. A check that nothing is reported reads them
 * all (SPEC §5.7: a compiler may warn on any of them).
 *
 * In Vite's full-bundle dev (`bundledDev`), Rolldown's dev engine watches
 * the modules it bundled and Vite's watcher watches what plugins add to it:
 * `settle()` waits for each watcher that watches a written file, for the
 * plugins' `watchChange` hooks of each environment (Vite sends no hot update
 * there), and for the dev engine's output.
 *
 * Plugin-agnostic: the caller supplies the plugins and the directory the apps
 * stand in for (where their imports resolve: see `./app-directory`).
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { createServer, isRunnableDevEnvironment, mergeConfig } from 'vite'
import { servedDirectories } from './app-directory'
import { createApp } from './build-harness'
import { scopeMethods } from './console-hook'
import { openDiagnosticChannel } from './diagnostic-channel'
import { saveAppFile } from './save-file'
import { makeRunnerStrict } from './strict-runner'
import type { AppOptions } from './build-harness'
import type { ChannelDiagnostic, DiagnosticChannel } from './diagnostic-channel'
import type {
  DevEnvironment,
  FSWatcher,
  HotPayload,
  InlineConfig,
  LogErrorOptions,
  Logger,
  Plugin,
  PluginOption,
  ViteDevServer,
} from 'vite'

/** The part of Rolldown's dev engine (`bundledDev`) the harness uses. */
interface BundledDevEngine {
  ensureLatestBuildOutput: () => Promise<void>
  getBundleState: () => Promise<{ lastBuildErrored: boolean }>
}

export interface DevServerOptions extends AppOptions {
  /** Plugins of the dev server, or a function of the app root returning them. */
  plugins?:
    | Array<PluginOption>
    | ((app: { root: string }) => Array<PluginOption>)
  /** Vite configuration merged over the harness defaults. */
  config?: InlineConfig
  /** Serves over HTTP on a free port, for `fetch()`. Default `false`. */
  listen?: boolean
  /**
   * How long `settle()` waits for one step (the watcher reporting a file,
   * the server handling a file event), in milliseconds: only a guard against
   * an event that never comes. Default 20 000.
   */
  eventTimeout?: number
  /**
   * How long one `settle()` may take in all, in milliseconds: a bound on
   * the outcome, not a count of events (an app whose files keep changing,
   * e.g. a plugin rewriting a file on each event, fails at this deadline).
   * Default 60 000; a control test of that failure lowers it.
   */
  settleTimeout?: number
  /**
   * Serves the client environment in Vite's full-bundle dev mode
   * (`experimental.bundledDev`: Rolldown's dev engine bundles it) from
   * `entry` (relative to the app root), eagerly (no lazy chunks).
   * `clientBundle()` returns the output; the other environments are served
   * as usual. `settle()` covers files the dev engine or Vite's watcher
   * watches (see the module comment).
   */
  bundledDev?: { entry: string }
  /**
   * Serves the app to a real browser page (`./browser`) as `vite dev` does:
   * listens on a free port (`url`) with Vite's HMR WebSocket, dependencies
   * are pre-bundled by Vite's dependency optimizer (discovery on, cache in
   * the app directory), and `index.html` is served (`appType: 'spa'`).
   * Default `false`.
   */
  browser?: boolean
}

export interface HmrMessage {
  /** Environment the payload was sent to (`client`, `ssr`, ...). */
  environment: string
  /** `update`, `full-reload`, `prune`, `error` or `custom`. */
  type: HotPayload['type']
  /**
   * `update`: the URL of each module that accepts an update (the HMR
   * boundaries); `full-reload`: the reloaded path (`*` for every page).
   */
  paths: Array<string>
  payload: HotPayload
}

export type FileEvent = 'add' | 'change' | 'unlink'

export interface DevServer {
  /** App root on disk. */
  root: string
  /** The Vite dev server. */
  vite: ViteDevServer
  /** Absolute path of a file given relative to the app root. */
  file: (relative: string) => string
  /** URL of the server on 127.0.0.1 (`listen` or `browser` only). */
  url: string | undefined
  /** Content of an app file (relative to the app root). */
  read: (relative: string) => Promise<string>
  /**
   * Writes app files (relative to the app root); `null` deletes a file.
   * Vite's file watcher reports them; `settle()` waits until the server has
   * handled them.
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Moves an app file (the watcher reports it; see `write`). */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Waits until the watcher has reported every file written since the last
   * call (by the test or by plugins) and the server has handled each event
   * (see the module comment). Rejects with the error that stopped the
   * handling of an event. Returns the HMR payloads sent since the first
   * write since the last call (or since the call). Not
   * available with `server.hmr: false` (then nothing tells when Vite handled
   * an event, and the server runs without a watcher).
   */
  settle: () => Promise<Array<HmrMessage>>
  /** `write(files)`, then `settle()`. */
  edit: (files: Record<string, string | null>) => Promise<Array<HmrMessage>>
  /**
   * File events the watcher reported, in order (paths relative to the root;
   * the harness's own barrier file left out).
   */
  events: Array<{ event: FileEvent; file: string }>
  /**
   * Transformed code of a module in an environment (default `client`), as
   * the environment serves it. `url` is a URL of the dev server, e.g.
   * `/src/a.ts`.
   */
  transform: (url: string, environment?: string) => Promise<string>
  /**
   * Transforms `url` and every module it imports, transitively, as the
   * environment's module graph records them (Vite's import analysis of the
   * served code: static imports and re-exports, dynamic `import()` of a
   * literal specifier, `import.meta.glob`): every module a page loading
   * `url` can request from it, also the ones it loads lazily. Returns their
   * code by URL (the module graph's URL, without the HMR timestamp).
   * Modules whose URL matches `skip` (default: dependencies in
   * `node_modules` and Vite's client) are not loaded.
   */
  load: (
    url: string,
    options?: { environment?: string; skip?: RegExp },
  ) => Promise<Record<string, string>>
  /**
   * Waits until no environment has a module transform in flight, including
   * the ones Vite starts in the background: with its default
   * `server.preTransformRequests`, the client environment transforms the
   * static imports of each module it serves before anything requests them.
   * What those transforms log is in `logs` afterwards.
   */
  idle: () => Promise<void>
  /** Requests a URL over HTTP (`listen: true` only). */
  fetch: (url: string) => Promise<{ status: number; body: string }>
  /**
   * Imports a module in a runnable environment (default `ssr`) through
   * Vite's own module runner of that environment: Vite resolves, loads and
   * transforms every module by its resolved id, and a static import of a
   * name a module does not export throws in the app's modules, as in
   * Node.js and a build (`./strict-runner`).
   */
  import: (url: string, environment?: string) => Promise<Record<string, any>>
  /**
   * `bundledDev` servers only: the latest client bundle (code of each chunk
   * by file name), once the dev engine has bundled the current files.
   * Rejects with the bundling error when bundling fails.
   */
  clientBundle: () => Promise<Record<string, string>>
  /** HMR payloads sent to every environment since the server started. */
  hmr: Array<HmrMessage>
  /**
   * Warnings and errors reported on any channel since the server started,
   * as `warn: <text>` / `error: <text>`: Vite's logger, `console.warn`/
   * `console.error`, and direct writes to `process.stderr` (as `warn`).
   * For the reports since a point, mark it (`const since = logs.length`).
   */
  logs: Array<string>
  /**
   * Everything reported since the server started, on every channel, as
   * diagnostics (`./diagnostic-channel`; `info` included): read with
   * `expectDiagnostic`/`findDiagnostics`, and "nothing reported" with
   * `expectNoProblems`. Mark a point with `diagnostics.length`.
   */
  diagnostics: Array<ChannelDiagnostic>
  /**
   * Closes the server (and its watcher) but keeps the app directory, e.g. to
   * edit the app afterwards and observe that nothing reacts; `close()`
   * removes the directory later.
   */
  stop: () => Promise<void>
  /** Closes the server and removes the app directory. */
  close: () => Promise<void>
}

/**
 * Directories the harness does not expect the watcher to report: the ones
 * Vite's watcher ignores (`node_modules`, which holds the dependency
 * optimizer's cache, `.git`, `test-results`), and the harness's own.
 */
const unwatchedDirectories = new Set([
  'node_modules',
  '.git',
  'test-results',
  '.dev-server-harness',
])

/**
 * The harness's barrier files: a change of one, which the watcher reports
 * like any file change, follows every write made before it. Several, as the
 * watcher does not report a second change of a file within a moment of the
 * first (see `changeThrottled`).
 */
const barrierFiles = [0, 1, 2, 3].map(
  (index) => `.dev-server-harness/barrier-${index}`,
)

/** An app file as the harness reads it. */
interface AppFile {
  code: string
  mtimeMs: number
}

/** A file event the watcher reported, and how the server handled it. */
interface ReportedEvent {
  /** Order of the report. */
  seq: number
  event: FileEvent
  /** Absolute path. */
  file: string
  /** The watcher that reported it (a restart replaces the watcher). */
  watcher: FSWatcher
  barrier: boolean
  handled: boolean
  /** The `watchChange` hooks of each environment running for it. */
  watchChanges: Array<Promise<unknown>>
}

/**
 * Writes an app (`createApp`: it stands in for `options.dir`) and starts a Vite
 * dev server on it with its file watcher, and resolves once the watcher
 * watches the app. `close()`, which `registerCleanup` also receives, closes
 * the server and removes the directory.
 */
export async function createDevServer(
  options: DevServerOptions,
): Promise<DevServer> {
  const channel = openDiagnosticChannel()
  try {
    return await channel.run(() => startServer(options, channel))
  } catch (error) {
    channel.close()
    throw error
  }
}

async function startServer(
  options: DevServerOptions,
  channel: DiagnosticChannel,
): Promise<DevServer> {
  const { plugins = [], config = {}, bundledDev, browser = false } = options
  const listen = options.listen ?? browser
  const eventTimeout = options.eventTimeout ?? 20_000
  const settleTimeout = options.settleTimeout ?? 60_000
  // Vite handles file events with HMR only: without it, nothing tells when
  // the server has handled one, so the server runs without a watcher. In
  // full-bundle dev, Vite's watcher watches only what plugins add to it, and
  // Rolldown's dev engine watches the modules it bundled.
  const watching = !bundledDev && config.server?.hmr !== false
  const devEngineWatching = !!bundledDev && config.server?.hmr !== false
  const app = await createApp({
    ...options,
    prefix: options.prefix ?? '.dev-server-',
    files: {
      ...options.files,
      ...(watching &&
        Object.fromEntries(barrierFiles.map((file) => [file, '0']))),
    },
  })
  const root = app.root
  channel.claim(root)
  const file = (relative: string) => path.join(root, relative)
  const logs: Array<string> = []
  /** Every channel the server's work may report on (see the module comment). */
  channel.onDiagnostic((diagnostic) => {
    // Vite's logger writes its own lines (below)
    if (diagnostic.source !== 'vite' && diagnostic.severity !== 'info') {
      logs.push(
        `${diagnostic.severity === 'warning' ? 'warn' : 'error'}: ${diagnostic.text}`,
      )
      notify()
    }
  })
  const hmr: Array<HmrMessage> = []
  const events: Array<{ event: FileEvent; file: string }> = []

  /** Every file event the watcher reported, in order. */
  const reported: Array<ReportedEvent> = []
  /** The file event whose handling runs in the current async context. */
  const handling = new AsyncLocalStorage<ReportedEvent>()
  /** Errors that stopped the handling of an event, for the next `settle()`. */
  const failures: Array<Error> = []
  /**
   * Each app file (relative path) as the watcher last saw it: its contents,
   * and the modification time of the stats chokidar took (it reports a
   * later write of the file when its modification time changed), updated
   * when the server finished handling the file's event (writes during the
   * handling are served) and when chokidar drops a change. A file that
   * differs from it is owed an event: the harness waits for that event,
   * never takes a timestamp for one.
   */
  const known = new Map<string, AppFile>()
  /**
   * Files written by `write()` whose event the watcher has to report: the
   * event must come after `seq`.
   */
  const expected: Array<{ file: string; seq: number; devEngineSeq: number }> =
    []
  const expect = (absolute: string) =>
    expected.push({
      file: absolute,
      seq: reported.length,
      devEngineSeq: devEngineReports.length,
    })
  let barrierCount = 0

  /** Wakes up the waits whenever something they wait for may have happened. */
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

  const handled = (event: ReportedEvent, error?: unknown) => {
    if (!event.handled) {
      event.handled = true
      // The server has seen the file as it is now: writes of it while the
      // server handled its event (before Vite invalidated its modules) are
      // served, whether or not the watcher reports them again.
      if (!event.barrier && event.event !== 'unlink') {
        see(event.event, event.file, undefined)
      }
      if (error !== undefined) {
        failures.push(
          error instanceof Error
            ? error
            : new Error(`dev server error: ${String(error)}`),
        )
      }
      notify()
    }
  }

  const record =
    (level: string) => (logged: string, logOptions?: LogErrorOptions) => {
      // Vite logs the errors of its file event handlers as Error objects
      const message: unknown = logged
      const text = stripAnsi(
        message instanceof Error
          ? (message.stack ?? message.message)
          : String(message),
      )
      logs.push(`${level}: ${text}`)
      channel.report(
        level === 'error' ? (logOptions?.error ?? message) : message,
        level === 'error' ? 'error' : 'warning',
        'vite',
      )
      // An error that stopped the handling of a file event
      const event = handling.getStore()
      if (level === 'error' && event) {
        handled(
          event,
          message instanceof Error
            ? message
            : new Error(`dev server error: ${text}`, {
                cause: logOptions?.error,
              }),
        )
      }
      notify()
    }
  const warned = new Set<string>()
  const logger: Logger = {
    // e.g. "server restarted."
    info: (message) => {
      channel.report(message, 'info', 'vite')
      notify()
    },
    warn: record('warn'),
    warnOnce: (message) => {
      if (!warned.has(message)) {
        warned.add(message)
        record('warn')(message)
      }
    },
    error: record('error'),
    clearScreen: () => {},
    hasErrorLogged: () => false,
    hasWarned: false,
  }

  /** Code of each chunk of the latest client bundle (`bundledDev`). */
  let clientOutput: Record<string, string> = {}
  /** The modules of the latest client bundle (`bundledDev`). */
  const bundledModules = new Set<string>()
  /** Files the dev engine's watcher reported (`bundledDev`), in order. */
  const devEngineReports: Array<string> = []
  const clientBundlePlugin: Plugin = {
    name: 'dev-server-harness:client-bundle',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_outputOptions, bundle) {
      clientOutput = {}
      bundledModules.clear()
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          clientOutput[output.fileName] = output.code
          for (const id of output.moduleIds) {
            bundledModules.add(id)
          }
        }
      }
    },
    watchChange(id, { event }) {
      devEngineReports.push(path.resolve(id))
      events.push({
        event:
          event === 'create' ? 'add' : event === 'delete' ? 'unlink' : 'change',
        file: relativeOf(path.resolve(id)),
      })
      notify()
    },
  }
  const bundledDevConfig: InlineConfig = bundledDev
    ? {
        experimental: { bundledDev: true },
        build: {
          rolldownOptions: { experimental: { devMode: { lazy: false } } },
        },
        environments: {
          client: {
            build: {
              rolldownOptions: { input: path.join(root, bundledDev.entry) },
            },
          },
        },
      }
    : {}

  const relativeOf = (absolute: string) =>
    path.relative(root, absolute).split(path.sep).join('/')

  /**
   * The files a watcher reported a change of a moment ago: chokidar drops
   * another change of one of them until the moment passed (its private
   * per-file throttle, `_throttled`).
   */
  const changeThrottled = (watcher: FSWatcher = vite.watcher) => {
    const throttled = (watcher as unknown as { _throttled?: unknown })
      ._throttled
    if (!(throttled instanceof Map)) {
      throw new Error(
        "the harness waits on chokidar's per-file change throttle (`_throttled`), which this version of Vite's watcher does not have",
      )
    }
    const changes = throttled.get('change') as Map<string, unknown> | undefined
    return [...(changes?.keys() ?? [])] as Array<string>
  }

  /**
   * Records an app file as the watcher saw it (reported, or dropped): its
   * contents now, and the modification time of the stats the watcher took.
   */
  const see = (name: string, absolute: string, stats: unknown) => {
    const relative = relativeOf(absolute)
    if (name === 'unlink') {
      known.delete(relative)
      return
    }
    try {
      known.set(relative, {
        code: readFileSync(absolute, 'utf8'),
        mtimeMs:
          (stats as { mtimeMs?: number } | undefined)?.mtimeMs ??
          statSync(absolute).mtimeMs,
      })
    } catch {
      // Removed meanwhile: the watcher reports that next
      known.delete(relative)
    }
  }

  const followed = new WeakSet<object>()
  /** Records what `hot` sends (`hmr`), once per channel. */
  const recordSends = (name: string, hot: { send: (...args: any) => void }) => {
    if (followed.has(hot.send)) {
      return
    }
    const send = hot.send.bind(hot) as (...args: Array<unknown>) => void
    const recordingSend = (...args: Array<unknown>) => {
      hmr.push(hmrMessage(name, args))
      send(...args)
    }
    followed.add(recordingSend)
    hot.send = recordingSend
  }
  /**
   * Follows a server (the first one, and the one each restart creates):
   * the file events its watcher reports, and the HMR payloads it sends.
   */
  const follow = (server: ViteDevServer) => {
    const watcher = server.watcher
    if ((watching || devEngineWatching) && !followed.has(watcher)) {
      followed.add(watcher)
      const emit = watcher.emit.bind(watcher) as (
        name: string,
        ...args: Array<unknown>
      ) => boolean
      ;(watcher as { emit: typeof emit }).emit = (name, ...args) => {
        if (name !== 'add' && name !== 'change' && name !== 'unlink') {
          return emit(name, ...args)
        }
        const absolute = path.resolve(root, String(args[0]))
        const relative = path.relative(root, absolute).split(path.sep).join('/')
        const event: ReportedEvent = {
          seq: reported.length,
          event: name,
          file: absolute,
          watcher,
          barrier: barrierFiles.includes(relative),
          handled: false,
          watchChanges: [],
        }
        reported.push(event)
        if (!event.barrier) {
          events.push({ event: name, file: relative })
        }
        if (!event.barrier) {
          see(name, absolute, args[1])
        }
        notify()
        // Vite's listeners start handling the event in this context
        const result = handling.run(event, () => emit(name, ...args))
        if (devEngineWatching) {
          // In full-bundle dev, Vite's handling of a file event ends with
          // the plugins' `watchChange` hooks of each environment (and the
          // invalidation of the file's modules right after): it sends no
          // hot update.
          void Promise.allSettled(event.watchChanges).then(() => {
            setImmediate(() => handled(event))
          })
        }
        return result
      }
      // chokidar drops a change of a file within a moment of the last one
      // it reported (`_throttled`, see `changeThrottled`): the watcher saw
      // that write too, and will not report it.
      const internals = watcher as unknown as {
        _emit: (name: string, file: string, ...rest: Array<unknown>) => unknown
      }
      const internalEmit = internals._emit.bind(watcher)
      internals._emit = (name, changed, ...rest) => {
        if (name === 'change') {
          const absolute = path.resolve(root, changed)
          if (
            changeThrottled(watcher).includes(absolute) &&
            !barrierFiles.includes(relativeOf(absolute))
          ) {
            see(name, absolute, rest[0])
            notify()
          }
        }
        return internalEmit(name, changed, ...rest)
      }
    }
    for (const [name, environment] of Object.entries(server.environments)) {
      const container = environment.pluginContainer
      if (!followed.has(container.watchChange)) {
        const watchChange = container.watchChange.bind(container)
        const followedWatchChange: typeof watchChange = (...args) => {
          const running = watchChange(...args)
          handling.getStore()?.watchChanges.push(running)
          return running
        }
        followed.add(followedWatchChange)
        container.watchChange = followedWatchChange
      }
      recordSends(name, environment.hot)
    }
    // The server's WebSocket channel too, where it is not the client
    // environment's (a plugin may send its reload there)
    recordSends('client', server.ws)
  }
  const followPlugin: Plugin = {
    name: 'dev-server-harness:follow',
    configureServer: (server) => {
      follow(server)
    },
  }

  let vite: ViteDevServer
  try {
    vite = await createServer(
      mergeConfig(
        {
          ...bundledDevConfig,
          root,
          configFile: false,
          envDir: false,
          publicDir: false,
          appType: browser ? 'spa' : 'custom',
          clearScreen: false,
          customLogger: logger,
          // The app's own dependency cache: never the `node_modules/.vite`
          // of the packages its imports resolve to (`./app-directory`)
          cacheDir: path.join(root, 'node_modules/.vite'),
          // Dependencies are served as they are, so that a first request
          // never waits for the dependency optimizer or triggers a reload.
          // A browser page needs them pre-bundled (CommonJS dependencies).
          ...(!browser && { optimizeDeps: { noDiscovery: true, include: [] } }),
          server: {
            middlewareMode: !listen,
            // What Vite serves for an app in `dir` (`./app-directory`)
            fs: { allow: await servedDirectories(root) },
            // One address, as the harness's other servers (Rsbuild, static,
            // preview): Vite's default `localhost` names `::1` and
            // `127.0.0.1` while the server listens on only the first. A
            // client in this process (the idle HMR client, `fetch()`) then
            // goes through Node's address-family selection, which gives the
            // first address 500 ms on the event loop's clock: a loop blocked
            // past that (other tests' synchronous work under load) abandons
            // the connection the kernel made, and the other address refuses
            // it (FINAL-PASS #56; FOLLOWUPS "UPSTREAM (final pass F-E-a)").
            ...(listen && { host: '127.0.0.1' }),
            // Vite's default `preTransformRequests` stays on, as in an app:
            // the client environment transforms the static imports of each
            // module it serves in the background, before the browser
            // requests them.
            // Without a page, no HMR WebSocket (and no port to share).
            ...(!browser && { ws: false as const }),
            // A page's console stays the page's (`./browser` records it):
            // Vite's default forwards it to the server's log when it detects
            // a coding agent running it, which would make `logs` depend on
            // who runs the tests.
            forwardConsole: false,
            ...(!watching && !devEngineWatching && { watch: null }),
            // Called at the end of Vite's handling of each file event
            hotUpdateEnvironments: async (
              server: ViteDevServer,
              update: (environment: DevEnvironment) => Promise<void>,
            ) => {
              try {
                await Promise.all(
                  Object.values(server.environments).map(update),
                )
              } finally {
                const event = handling.getStore()
                if (event) {
                  handled(event)
                }
              }
            },
          },
          plugins: [
            ...(typeof plugins === 'function' ? plugins({ root }) : plugins),
            ...(bundledDev ? [clientBundlePlugin] : []),
            followPlugin,
          ],
        } satisfies InlineConfig,
        config,
      ),
    )
  } catch (error) {
    channel.close()
    await app.dispose()
    throw error
  }

  /**
   * Workaround (FOLLOWUPS "UPSTREAM (W5-ip)"): in full-bundle dev, Vite
   * ends its initial build with a `getBundleState()` call that nothing
   * awaits (`waitForInitialBuildFinish()`). Closing the server while it is in
   * flight makes Rolldown reject it, and Vite leaves the rejection unhandled
   * ("Failed to get bundle state"). So `close()` first waits, one turn at a
   * time, for the flag Vite sets once that call chain has ended. The flag is
   * internal: Vite has no public API for it (vitejs/vite#22991). Remove this
   * wait once Vite handles the `waitForInitialBuildFinish()` rejection.
   */
  const initialBuildFinished = async () => {
    const internals = (
      vite.environments.client as
        | {
            bundledDev?: {
              _devEngine?: unknown
              initialBuildCompleted?: unknown
            }
          }
        | undefined
    )?.bundledDev
    // No dev engine: the initial build never started
    if (!internals?._devEngine) {
      return
    }
    if (typeof internals.initialBuildCompleted !== 'boolean') {
      throw new Error(
        "the harness waits on Vite's full-bundle `initialBuildCompleted` before closing, which this version of Vite does not have",
      )
    }
    const deadline = Date.now() + eventTimeout
    while (!internals.initialBuildCompleted) {
      if (Date.now() > deadline) {
        throw new Error(
          `Vite's full-bundle dev did not finish its initial build within ${eventTimeout} ms`,
        )
      }
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  let stopped: Promise<void> | undefined
  const stop = () => {
    stopped ??= (async () => {
      try {
        if (bundledDev) {
          await initialBuildFinished()
        }
      } finally {
        try {
          await closeViteServer(vite, eventTimeout)
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

  /**
   * Waits until `check` holds, checking again whenever something happened
   * (a reported or handled event, a log), and at least every 25 ms (e.g. for
   * a restart). `describe` says what did not happen within `eventTimeout`.
   */
  async function until(
    check: () => boolean | Promise<boolean>,
    describe: () => string | Promise<string>,
  ) {
    const deadline = Date.now() + eventTimeout
    while (!(await check())) {
      if (stopped) {
        throw new Error('the dev server was closed')
      }
      if (Date.now() > deadline) {
        throw new Error(`${await describe()} within ${eventTimeout} ms`)
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

  /**
   * Events whose handling has not ended. Those of a watcher a restart
   * replaced are abandoned with the server that handled them.
   */
  const unhandled = () =>
    reported.filter((event) => !event.handled && event.watcher === vite.watcher)

  const waitForHandling = () =>
    until(
      () => unhandled().length === 0,
      () =>
        `the dev server did not handle ${unhandled()
          .map((event) => `"${event.event} ${relativeOf(event.file)}"`)
          .join(', ')}`,
    )

  const barrierPaths = barrierFiles.map((relative) => path.join(root, relative))

  /**
   * Waits until the watcher would report a change of any app file: a user's
   * edits come a moment after the changes the last one caused (e.g. a route
   * tree a plugin wrote), which the watcher would otherwise drop.
   */
  const userPace = () =>
    until(
      () =>
        changeThrottled().every((throttled) =>
          barrierPaths.includes(throttled),
        ),
      () =>
        `the file watcher still drops changes of ${changeThrottled().join(', ')}`,
    )

  /** Waits until the current watcher watches the app (its initial scan). */
  const watcherReady = () =>
    until(
      () =>
        (vite.watcher as unknown as { _readyEmitted?: boolean })
          ._readyEmitted === true,
      () => 'the file watcher did not finish its initial scan',
    )

  /** The app files the watcher reports, with their contents. */
  async function appFiles() {
    const files = new Map<string, AppFile>()
    const visit = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!unwatchedDirectories.has(entry.name)) {
            await visit(full)
          }
        } else if (entry.isFile()) {
          try {
            const { mtimeMs } = await stat(full)
            files.set(relativeOf(full), {
              code: await readFile(full, 'utf8'),
              mtimeMs,
            })
          } catch {
            // Removed while reading
          }
        }
      }
    }
    await visit(root)
    return files
  }

  /** App files whose current state the watcher has not reported yet. */
  async function unreportedFiles() {
    const current = await appFiles()
    return [
      ...[...current.entries()]
        .filter(([relative, { code, mtimeMs }]) => {
          const reported = known.get(relative)
          return reported?.code !== code || reported.mtimeMs !== mtimeMs
        })
        .map(([relative]) => relative),
      ...[...known.keys()].filter((relative) => !current.has(relative)),
    ]
  }

  /** Waits for the event of each file `write()` wrote, and its handling. */
  const waitForExpected = async () => {
    const missing = () =>
      expected.filter(
        ({ file: absolute, seq }) =>
          !reported.some(
            (event) => event.file === absolute && event.seq >= seq,
          ),
      )
    await until(
      () => missing().length === 0,
      () =>
        `the file watcher did not report the write of ${missing()
          .map(({ file: absolute }) => relativeOf(absolute))
          .join(', ')}`,
    )
    expected.length = 0
  }

  /**
   * Changes a barrier file and waits until the server handled its event and
   * everything reported before.
   */
  async function barrier() {
    await watcherReady()
    let barrierFile: string | undefined
    await until(
      () => {
        const throttled = changeThrottled()
        barrierFile = barrierPaths.find(
          (barrierPath) => !throttled.includes(barrierPath),
        )
        return barrierFile !== undefined
      },
      () => 'no barrier file the watcher reports a change of',
    )
    const seq = reported.length
    await writeFile(barrierFile!, String(++barrierCount))
    await until(
      () =>
        reported.some(
          (event) => event.file === barrierFile && event.seq >= seq,
        ),
      () => 'the file watcher did not report the barrier file',
    )
    await waitForHandling()
  }

  const throwFailure = () => {
    const failure = failures.shift()
    if (failure) {
      failures.length = 0
      throw failure
    }
  }

  /**
   * `bundledDev`: waits until the dev engine's watcher reported each file
   * `write()` wrote that the last bundle includes (it watches only those),
   * and until the dev engine bundled the current files.
   */
  async function settleBundle() {
    const from = writtenFrom ?? hmr.length
    writtenFrom = undefined
    /** Whether Vite's watcher watches a file (plugins may make it watch). */
    const watched = (absolute: string) =>
      path.dirname(absolute) in vite.watcher.getWatched()
    const missing = () =>
      expected.filter(
        ({ file: absolute, seq, devEngineSeq }) =>
          (bundledModules.has(absolute) &&
            !devEngineReports.slice(devEngineSeq).includes(absolute)) ||
          (watched(absolute) &&
            !reported.some(
              (event) => event.file === absolute && event.seq >= seq,
            )),
      )
    await until(
      () => missing().length === 0,
      () =>
        `the watchers did not report ${missing()
          .map(({ file: absolute }) => relativeOf(absolute))
          .join(', ')}`,
    )
    expected.length = 0
    await waitForHandling()
    throwFailure()
    await devEngine().ensureLatestBuildOutput()
    return hmr.slice(from)
  }

  async function settle() {
    if (devEngineWatching) {
      return settleBundle()
    }
    if (!watching) {
      throw new Error(
        'settle() and edit() need the file watcher and HMR, which a server with `server.hmr: false` runs without',
      )
    }
    const from = writtenFrom ?? hmr.length
    writtenFrom = undefined
    const settleDeadline = Date.now() + settleTimeout
    for (;;) {
      await waitForExpected()
      await waitForHandling()
      throwFailure()
      const before = events.length
      await barrier()
      // Files written before the barrier whose events come after it
      let pending: Array<string> = []
      await until(
        async () => {
          pending = await unreportedFiles()
          return pending.length === 0
        },
        () => `the file watcher did not report ${pending.join(', ')}`,
      )
      await waitForHandling()
      throwFailure()
      if (events.length === before) {
        break
      }
      if (Date.now() > settleDeadline) {
        throw new Error(
          `the app's files keep changing ${settleTimeout} ms after settle() began: ${[
            ...new Set(events.slice(before).map((event) => event.file)),
          ].join(', ')}`,
        )
      }
    }
    return hmr.slice(from)
  }

  /**
   * `hmr.length` when the first write since the last `settle()` began: the
   * server may handle (and send the payloads of) a write before `settle()`
   * is called.
   */
  let writtenFrom: number | undefined

  async function write(files: Record<string, string | null>) {
    if (watching || devEngineWatching) {
      await userPace()
    }
    writtenFrom ??= hmr.length
    for (const [relative, code] of Object.entries(files)) {
      const absolute = file(relative)
      const exists = await lstat(absolute).then(
        () => true,
        () => false,
      )
      if (code === null) {
        if (exists) {
          expect(absolute)
          await rm(absolute, { force: true })
        }
        continue
      }
      expect(absolute)
      await saveAppFile(root, absolute, code)
    }
  }

  function environment(name: string) {
    const found = vite.environments[name]
    if (!found) {
      throw new Error(
        `no "${name}" environment (has ${Object.keys(vite.environments).join(', ')})`,
      )
    }
    return found
  }

  /**
   * The transforms each environment has in flight. Vite has no public API
   * for them: `waitForRequestsIdle()` only covers the first requests.
   */
  const pendingTransforms = () =>
    Object.values(vite.environments).flatMap((environment) => [
      ...((
        environment as unknown as {
          _pendingRequests?: Map<string, { request: Promise<unknown> }>
        }
      )._pendingRequests?.values() ?? []),
    ])

  async function idle() {
    const deadline = Date.now() + eventTimeout
    // Quiet for two turns of the event loop: a transform that ends may
    // start the pre-transforms of its imports right after.
    for (let quiet = 0; quiet < 2; ) {
      await new Promise((resolve) => setImmediate(resolve))
      const pending = pendingTransforms()
      if (!pending.length) {
        quiet++
        continue
      }
      quiet = 0
      const left = deadline - Date.now()
      if (left <= 0) {
        throw new Error(
          `the dev server still had ${pending.length} transforms in flight after ${eventTimeout} ms`,
        )
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        Promise.allSettled(pending.map(({ request }) => request)),
        new Promise((resolve) => {
          timer = setTimeout(resolve, left)
        }),
      ])
      clearTimeout(timer)
    }
  }

  async function transform(url: string, environmentName = 'client') {
    const result = await environment(environmentName).transformRequest(url)
    if (!result) {
      throw new Error(`${environmentName}: no module at ${url}`)
    }
    return result.code
  }

  /**
   * Rolldown's dev engine, which bundles the client (`bundledDev`). Vite has
   * no public API to await the bundled output (vitejs/vite#22991).
   */
  const devEngine = () => {
    const client = vite.environments.client as
      | { bundledDev?: { devEngine: BundledDevEngine } }
      | undefined
    if (!client?.bundledDev) {
      throw new Error('the client is only bundled with `bundledDev`')
    }
    return client.bundledDev.devEngine
  }

  try {
    // Every runnable environment's runner checks named imports, also when
    // a plugin (e.g. a framework's dev middleware) imports through it
    for (const environment of Object.values(vite.environments)) {
      if (isRunnableDevEnvironment(environment)) {
        makeRunnerStrict(environment.runner, root)
      }
    }
    if (listen) {
      // Vite's default port (`strictPort` off): the server binds a port
      // itself, trying the next one while a port is in use, and `url` reads
      // the port it bound. (`listen(0)` would make Vite 8 probe a free port,
      // close it and bind it after: another process can take it meanwhile,
      // and the server fails with "Port … is already in use".)
      await vite.listen()
    }
    if (watching) {
      await watcherReady()
      for (const [relative, code] of await appFiles()) {
        known.set(relative, code)
      }
    }
  } catch (error) {
    await close()
    throw error
  }

  return scopeMethods(channel.run, {
    root,
    vite,
    file,
    url: vite.resolvedUrls?.local[0],
    read: (relative) => readFile(file(relative), 'utf8'),
    write,
    rename: async (from, to) => {
      if (watching || devEngineWatching) {
        await userPace()
      }
      writtenFrom ??= hmr.length
      const target = file(to)
      expect(file(from))
      expect(target)
      await mkdir(path.dirname(target), { recursive: true })
      await rename(file(from), target)
    },
    settle,
    edit: async (files) => {
      await write(files)
      return settle()
    },
    events,
    transform,
    load: async (url, loadOptions = {}) => {
      const environmentName = loadOptions.environment ?? 'client'
      const skip = loadOptions.skip ?? defaultLoadSkip
      const loaded: Record<string, string> = {}
      const queue = [url]
      while (queue.length) {
        const next = queue.shift()!
        if (next in loaded || skip.test(next)) {
          continue
        }
        loaded[next] = await transform(next, environmentName)
        // The modules it imports, as the environment's own module graph
        // records them for the code it just served (statically or lazily,
        // `import.meta.glob` included): Vite's import analysis, not a parse
        // of the served code here.
        const node =
          await environment(environmentName).moduleGraph.getModuleByUrl(next)
        for (const imported of node?.importedModules ?? []) {
          queue.push(imported.url)
        }
      }
      return loaded
    },
    idle,
    fetch: async (url) => {
      const base = vite.resolvedUrls?.local[0]
      if (!base) {
        throw new Error('fetch() needs a server started with `listen: true`')
      }
      const response = await fetch(new URL(url, base))
      return { status: response.status, body: await response.text() }
    },
    import: (url, environmentName = 'ssr') => {
      const runnable = environment(environmentName)
      if (!isRunnableDevEnvironment(runnable)) {
        throw new Error(`the "${environmentName}" environment is not runnable`)
      }
      return makeRunnerStrict(runnable.runner, root).import(url)
    },
    clientBundle: async () => {
      const engine = devEngine()
      await engine.ensureLatestBuildOutput()
      if ((await engine.getBundleState()).lastBuildErrored) {
        throw new Error(
          `the client bundle failed:\n${logs.filter((log) => log.startsWith('error:')).join('\n')}`,
        )
      }
      return { ...clientOutput }
    },
    hmr,
    logs,
    diagnostics: channel.diagnostics,
    stop,
    close,
  })
}

/** Dependencies and the HMR clients, which no test inspects. */
const defaultLoadSkip = /\/node_modules\/|^\/@(vite|react-refresh)\b/

function hmrMessage(environment: string, args: Array<unknown>): HmrMessage {
  const payload: HotPayload =
    typeof args[0] === 'string'
      ? { type: 'custom', event: args[0], data: args[1] }
      : (args[0] as HotPayload)
  let paths: Array<string> = []
  if (payload.type === 'update') {
    paths = [...new Set(payload.updates.map((update) => update.path))]
  } else if (payload.type === 'full-reload') {
    paths = [payload.path ?? '*']
  } else if (payload.type === 'prune') {
    paths = payload.paths
  }
  return { environment, type: payload.type, paths, payload }
}

function stripAnsi(text: string) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

/** One line per HMR message (`client: update /a.ts, /b.ts`), for assertions. */
export function describeHmr(messages: Array<HmrMessage>): Array<string> {
  return messages.map((message) =>
    `${message.environment}: ${message.type} ${message.paths.join(', ')}`.trimEnd(),
  )
}

/**
 * Closes a Vite dev server once its dependency optimizer has nothing in
 * flight, so that nothing writes into the app after `close()` resolved
 * (authorized wait, FINAL-PASS #34; RULINGS "Vite's dependency optimizer:
 * close wait").
 *
 * Vite 8.3.4's optimizer does not await all of its own work on close: a
 * cancelled run's Rolldown build keeps writing its `deps_temp_*` directory
 * (`runOptimizeDeps().cancel()` only sets a flag the build reads before it
 * writes), the run a scan starts as `close()` awaits that scan is never
 * cancelled, and a commit removes the previous cache directory (renamed
 * `deps_temp_*`) without awaiting it. Removing the app then fails (`ENOTEMPTY`), or the build fails
 * to write into the removed app (an unhandled "Error during dependency
 * optimization"). So before `close()` this waits, per environment, for the
 * optimizer's initialization and scan (`depsOptimizer.initState`,
 * `scanProcessing`: Vite's own state, public in its types) and until no
 * `deps*_temp_*` directory is left in the cache directory: Vite creates one
 * before each run starts writing and renames or removes it once the run is
 * committed or cancelled, and the previous cache directory it removes after
 * a commit carries that name too. A run Vite has not started by then never
 * starts: `close()` clears its timer. Remove the wait once Vite awaits its
 * optimizer's work on close (draft: validation/UPSTREAM/vite-optimizer-after-close.md).
 */
export async function closeViteServer(
  server: ViteDevServer,
  timeout = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeout
  const cacheDir = server.config.cacheDir
  const busy = async () => {
    const optimizers = Object.values(server.environments).flatMap(
      (environment) =>
        environment.depsOptimizer ? [environment.depsOptimizer] : [],
    )
    await Promise.all(optimizers.map((optimizer) => optimizer.scanProcessing))
    if (
      optimizers.some((optimizer) => optimizer.initState === 'initializing')
    ) {
      return 'initializing'
    }
    let entries: Array<string> = []
    try {
      entries = readdirSync(cacheDir)
    } catch {
      // No cache directory: nothing was optimized
    }
    return entries.find((name) => /^deps.*_temp_/.test(name))
  }
  try {
    for (let pending = await busy(); pending; pending = await busy()) {
      if (Date.now() > deadline) {
        throw new Error(
          `Vite's dependency optimizer was still busy (${pending} in ${cacheDir}) ${timeout} ms after the dev server was asked to close`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  } finally {
    await server.close()
  }
}
