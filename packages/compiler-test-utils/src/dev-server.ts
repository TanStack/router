/**
 * Dev-server harness for tests of what a dev server serves after edits:
 * starts a real Vite dev server (JS API, unbundled dev) on a temporary app,
 * lets the test create, edit, rename and delete files, replays the file
 * events the way Vite's watcher reports them and waits until the server has
 * handled them (plugin `watchChange` and `hotUpdate` hooks, HMR), and then
 * requests modules per environment and reports the HMR payloads sent to each
 * environment.
 *
 * File events are replayed deterministically instead of coming from a real
 * file watcher: `settle()` compares the app's files (contents and
 * modification times) with what it saw last, emits an `add`, `change` or
 * `unlink` event for each difference (including files plugins wrote while
 * handling earlier events, e.g. a generated route tree, even with the same
 * contents), waits for the server to handle each one, and repeats until the
 * files are stable. The order of the events and whether they are emitted one
 * at a time are options (`FileEventOptions`).
 *
 * Plugin-agnostic: the caller supplies the plugins and the directory the apps
 * live in (where their imports resolve).
 */
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  createServer,
  isRunnableDevEnvironment,
  mergeConfig,
  parseSync,
} from 'vite'
import { createApp } from './build-harness'
import { createModuleGraph } from './module-linker'
import type { AppOptions } from './build-harness'
import type { ModuleGraphOptions, ModuleStub } from './module-linker'
import type {
  DevEnvironment,
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
  triggerFullBuild: () => void
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
   * How long `settle()` waits for the server to handle one file event, in
   * milliseconds. Default 10 000.
   */
  eventTimeout?: number
  /**
   * Serves the client environment in Vite's full-bundle dev mode
   * (`experimental.bundledDev`: Rolldown's dev engine bundles it) from
   * `entry` (relative to the app root), eagerly (no lazy chunks).
   * `clientBundle()` returns the output; the other environments are served
   * as usual. `settle()` makes the dev engine rebuild the client bundle from
   * the edited files.
   */
  bundledDev?: { entry: string }
  /** How `settle()` reports file events by default (see `FileEventOptions`). */
  fileEvents?: FileEventOptions
  /**
   * Serves the app to a real browser page (`./browser`) as `vite dev` does:
   * listens on a free port (`url`) with Vite's HMR WebSocket, Vite's own
   * file watcher reports the app's file changes (`write()` them; `settle()`
   * and `edit()` are not available), dependencies are pre-bundled by Vite's
   * dependency optimizer (discovery on, cache in the app directory), and
   * `index.html` is served (`appType: 'spa'`). Default `false`.
   */
  browser?: boolean
}

/**
 * How `settle()` reports the file events of a round. A real watcher gives no
 * order guarantee: chokidar may report a rename as `add` then `unlink`, and
 * emits events while the server still handles earlier ones.
 */
export interface FileEventOptions {
  /**
   * `deletions-first` (default): deletions, then creations, then edits (a
   * rename is `unlink` then `add`). `creations-first`: creations, then
   * deletions, then edits (a rename is `add` then `unlink`).
   */
  order?: 'deletions-first' | 'creations-first'
  /**
   * Emits all the events of a round at once, then waits until the server has
   * handled each of them, instead of waiting for each event before emitting
   * the next one (default `false`).
   */
  batch?: boolean
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
  /** URL of the server (`listen` or `browser` only). */
  url: string | undefined
  /** Content of an app file (relative to the app root). */
  read: (relative: string) => Promise<string>
  /**
   * Writes app files (relative to the app root); `null` deletes a file. The
   * server only sees the changes on the next `settle()`.
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Moves an app file. The server sees it on the next `settle()`. */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Reports every change to the app's files since the last call to the
   * server as watcher events (by default deletions, then creations, then
   * edits, one at a time; see `FileEventOptions`) and waits until it has
   * handled each one, until no file changes anymore. A write that leaves a
   * file's contents as they were is an edit too. Returns the HMR payloads
   * sent meanwhile.
   */
  settle: (options?: FileEventOptions) => Promise<Array<HmrMessage>>
  /** `write(files)`, then `settle(options)`. */
  edit: (
    files: Record<string, string | null>,
    options?: FileEventOptions,
  ) => Promise<Array<HmrMessage>>
  /** File events `settle()` reported, in order (paths relative to the root). */
  events: Array<{ event: FileEvent; file: string }>
  /**
   * Transformed code of a module in an environment (default `client`), as
   * the environment serves it. `url` is a URL of the dev server, e.g.
   * `/src/a.ts`.
   */
  transform: (url: string, environment?: string) => Promise<string>
  /**
   * Transforms `url` and, like a browser loading it, every module it imports
   * statically, transitively. Returns their code by URL. Modules whose URL
   * matches `skip` (default: dependencies in `node_modules` and Vite's
   * client) are not loaded.
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
  /** Imports a module in a runnable environment (default `ssr`). */
  import: (url: string, environment?: string) => Promise<Record<string, any>>
  /**
   * `bundledDev` servers only: the latest client bundle (code of each chunk
   * by file name), once the dev engine has bundled the current files.
   * Rejects with the bundling error when bundling fails.
   */
  clientBundle: () => Promise<Record<string, string>>
  /** HMR payloads sent to every environment since the server started. */
  hmr: Array<HmrMessage>
  /** Warnings and errors logged by Vite and the plugins. */
  logs: Array<string>
  /** Closes the server and removes the app directory. */
  close: () => Promise<void>
}

/** Directories `settle()` never reports changes in. */
const ignoredDirectories = new Set(['node_modules', '.git', 'dist'])

/**
 * Writes an app to a temporary directory in `options.dir` and starts a Vite
 * dev server on it, without a file watcher (see `settle()`). `close()`, which
 * `registerCleanup` also receives, closes the server and removes the
 * directory.
 */
export async function createDevServer(
  options: DevServerOptions,
): Promise<DevServer> {
  const { plugins = [], config = {}, bundledDev, browser = false } = options
  const listen = options.listen ?? browser
  const eventTimeout = options.eventTimeout ?? 10_000
  const app = await createApp({
    ...options,
    prefix: options.prefix ?? '.dev-server-',
  })
  const root = app.root
  const logs: Array<string> = []
  const hmr: Array<HmrMessage> = []
  const events: Array<{ event: FileEvent; file: string }> = []
  let pendingEvent:
    | {
        resolve: () => void
        reject: (error: Error) => void
      }
    | undefined

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
      if (level === 'error' && pendingEvent) {
        pendingEvent.reject(
          message instanceof Error
            ? message
            : new Error(`dev server error: ${text}`, {
                cause: logOptions?.error,
              }),
        )
      }
    }
  const warned = new Set<string>()
  const logger: Logger = {
    info: () => {},
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
  const clientBundlePlugin: Plugin = {
    name: 'dev-server-harness:client-bundle',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_outputOptions, bundle) {
      clientOutput = {}
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          clientOutput[output.fileName] = output.code
        }
      }
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
          // Dependencies are served as they are, so that a first request
          // never waits for the dependency optimizer or triggers a reload.
          // A browser page needs them pre-bundled (CommonJS dependencies).
          ...(browser
            ? { cacheDir: path.join(root, 'node_modules/.vite') }
            : { optimizeDeps: { noDiscovery: true, include: [] } }),
          server: {
            middlewareMode: !listen,
            // Vite's default `preTransformRequests` stays on, as in an app:
            // the client environment transforms the static imports of each
            // module it serves in the background, before the browser
            // requests them.
            // `settle()` reports file events instead of a watcher, unless a
            // browser page runs the app.
            ...(!browser && { ws: false as const, watch: null }),
            hotUpdateEnvironments: async (
              server: ViteDevServer,
              update: (environment: DevEnvironment) => Promise<void>,
            ) => {
              await Promise.all(Object.values(server.environments).map(update))
              pendingEvent?.resolve()
            },
          },
          plugins: [
            ...(typeof plugins === 'function' ? plugins({ root }) : plugins),
            ...(bundledDev ? [clientBundlePlugin] : []),
          ],
        } satisfies InlineConfig,
        config,
      ),
    )
  } catch (error) {
    await app.dispose()
    throw error
  }

  /**
   * Records the HMR payloads of the current environments (again after a
   * server restart, which replaces them).
   */
  const recording = new WeakSet<object>()
  let recordedEnvironments: ViteDevServer['environments'] | undefined
  /** The plugins' `watchChange` hooks running for the current file event. */
  const watchChanges: Array<Promise<unknown>> = []
  const recordHmr = () => {
    recordedEnvironments = vite.environments
    for (const [name, environment] of Object.entries(vite.environments)) {
      const container = environment.pluginContainer
      if (!recording.has(container.watchChange)) {
        const watchChange = container.watchChange.bind(container)
        const recordingWatchChange: typeof watchChange = (...args) => {
          const running = watchChange(...args)
          watchChanges.push(running)
          return running
        }
        recording.add(recordingWatchChange)
        container.watchChange = recordingWatchChange
      }
      const hot = environment.hot
      if (recording.has(hot.send)) {
        continue
      }
      const send = hot.send.bind(hot) as (...args: Array<unknown>) => void
      const recordingSend = (...args: Array<unknown>) => {
        hmr.push(hmrMessage(name, args))
        send(...args)
      }
      recording.add(recordingSend)
      hot.send = recordingSend as typeof hot.send
    }
  }
  recordHmr()

  let closed: Promise<void> | undefined
  const close = () => {
    closed ??= (async () => {
      try {
        await vite.close()
      } finally {
        await app.dispose()
      }
    })()
    return closed
  }
  options.registerCleanup?.(close)

  if (listen) {
    await vite.listen(0)
  }

  const file = (relative: string) => path.join(root, relative)
  let snapshot = await readFiles(root)

  /**
   * Emits watcher events, all at once, and waits until the server has
   * handled each of them.
   */
  async function report(batch: Array<{ event: FileEvent; file: string }>) {
    events.push(...batch)
    recordHmr()
    const described = batch
      .map(({ event, file: relative }) => `"${event} ${relative}"`)
      .join(', ')
    if (bundledDev) {
      // Vite's full-bundle mode sends no hot updates: the server has handled
      // the event once the plugins' `watchChange` hooks have, and Vite has
      // invalidated the file's modules right after.
      watchChanges.length = 0
      for (const { event, file: relative } of batch) {
        vite.watcher.emit(event, file(relative))
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(watchChanges),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    `the dev server did not handle ${described} within ${eventTimeout} ms`,
                  ),
                ),
              eventTimeout,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
      await new Promise((resolve) => setImmediate(resolve))
      return
    }
    let unhandled = batch.length
    const handled = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              `the dev server did not handle ${described} within ${eventTimeout} ms`,
            ),
          ),
        eventTimeout,
      )
      // A server restart (e.g. a plugin restarting the server on a config
      // file edit) abandons the HMR handling of the event: done once the
      // restarted server's environments exist.
      const restart = setInterval(() => {
        if (vite.environments !== recordedEnvironments) {
          recordHmr()
          finish()
        }
      }, 20)
      const finish = (error?: Error) => {
        clearTimeout(timer)
        clearInterval(restart)
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
      // Vite updates the environments once per event
      pendingEvent = {
        resolve: () => {
          unhandled--
          if (unhandled === 0) {
            finish()
          }
        },
        reject: finish,
      }
    })
    try {
      for (const { event, file: relative } of batch) {
        vite.watcher.emit(event, file(relative))
      }
      await handled
      // The payloads are sent right after the last environment updates
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      pendingEvent = undefined
    }
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

  async function settle(eventOptions: FileEventOptions = {}) {
    if (browser) {
      throw new Error(
        "settle() and edit() replay file events: with `browser`, Vite's own watcher reports them",
      )
    }
    const order =
      eventOptions.order ?? options.fileEvents?.order ?? 'deletions-first'
    const batch = eventOptions.batch ?? options.fileEvents?.batch ?? false
    const from = hmr.length
    for (let round = 0; ; round++) {
      const current = await readFiles(root)
      const removed = [...snapshot.keys()].filter((key) => !current.has(key))
      const added = [...current.keys()].filter((key) => !snapshot.has(key))
      const changed = [...current.keys()].filter(
        (key) => snapshot.has(key) && snapshot.get(key) !== current.get(key),
      )
      snapshot = current
      if (!removed.length && !added.length && !changed.length) {
        break
      }
      // The dev engine watches no files: it bundles the edited files anew.
      if (bundledDev) {
        devEngine().triggerFullBuild()
      }
      if (round === 20) {
        throw new Error(
          `the app's files keep changing after 20 rounds of file events: ${[...removed, ...added, ...changed].join(', ')}`,
        )
      }
      const deletions = removed.map((relative) => ({
        event: 'unlink' as const,
        file: relative,
      }))
      const creations = added.map((relative) => ({
        event: 'add' as const,
        file: relative,
      }))
      const roundEvents = [
        ...(order === 'creations-first'
          ? [...creations, ...deletions]
          : [...deletions, ...creations]),
        ...changed.map((relative) => ({
          event: 'change' as const,
          file: relative,
        })),
      ]
      if (batch) {
        await report(roundEvents)
      } else {
        for (const item of roundEvents) {
          await report([item])
        }
      }
    }
    return hmr.slice(from)
  }

  async function write(files: Record<string, string | null>) {
    for (const [relative, code] of Object.entries(files)) {
      if (code === null) {
        await rm(file(relative), { force: true })
      } else {
        await mkdir(path.dirname(file(relative)), { recursive: true })
        await writeFile(file(relative), code)
      }
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

  return {
    root,
    vite,
    file,
    url: vite.resolvedUrls?.local[0],
    read: (relative) => readFile(file(relative), 'utf8'),
    write,
    rename: async (from, to) => {
      await mkdir(path.dirname(file(to)), { recursive: true })
      await rename(file(from), file(to))
    },
    settle,
    edit: async (files, eventOptions) => {
      await write(files)
      return settle(eventOptions)
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
        const code = await transform(next, environmentName)
        loaded[next] = code
        queue.push(...staticImportUrls(code, next))
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
      return runnable.runner.import(url)
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
    close,
  }
}

/** Dependencies and the HMR clients, which no test inspects. */
const defaultLoadSkip = /\/node_modules\/|^\/@(vite|react-refresh)\b/

/**
 * URLs a transformed module imports statically (client: `import`/`export
 * from` declarations; SSR: `__vite_ssr_import__()` calls), without the HMR
 * timestamp query.
 */
function staticImportUrls(code: string, url: string): Array<string> {
  const urls: Array<string> = []
  const { module } = parseSync(
    url.replace(/[?#].*$/, '') || 'module.js',
    code,
    {
      lang: 'js',
      sourceType: 'module',
    },
  )
  for (const declaration of module.staticImports) {
    urls.push(declaration.moduleRequest.value)
  }
  for (const declaration of module.staticExports) {
    for (const entry of declaration.entries) {
      if (entry.moduleRequest) {
        urls.push(entry.moduleRequest.value)
      }
    }
  }
  for (const match of code.matchAll(/\b__vite_ssr_import__\(\s*"([^"]+)"/g)) {
    urls.push(match[1]!)
  }
  return urls.map(withoutTimestamp)
}

/** A served URL without the HMR timestamp query Vite adds after an edit. */
function withoutTimestamp(url: string) {
  return url.replace(/([?&])t=\d+(&|$)/, (_, before, after) =>
    after ? before : '',
  )
}

/** `/@vite/client` as the modules a test evaluates use it. */
const viteClientStub = {
  createHotContext: () => ({
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  }),
}

/**
 * Evaluates a module as a browser loading it from the dev server would:
 * `server.load(url)` transforms it and every module it imports statically
 * (in an environment that serves ES modules, default `client`), and these
 * are linked as real ES modules (`./module-linker`), so live bindings, cycles
 * and module state behave like in the browser. Dynamic imports of served
 * URLs are transformed when they run. Imports of modules `load()` skips
 * (`skip`; by default dependencies and Vite's client) link to `stubs` by the
 * URL the served code imports, to `fallbackStub`, or fail to link; Vite's
 * client (`/@vite/client`) is stubbed with an inert hot context. Returns the
 * module's namespace.
 */
export async function evaluateServed(
  server: Pick<DevServer, 'load' | 'transform'>,
  url: string,
  options: {
    environment?: string
    skip?: RegExp
    stubs?: Record<string, ModuleStub>
    fallbackStub?: ModuleGraphOptions['fallbackStub']
  } = {},
): Promise<Record<string, any>> {
  const environment = options.environment ?? 'client'
  const skip = options.skip ?? defaultLoadSkip
  const served = await server.load(url, { environment, skip })
  const graph = createModuleGraph({
    modules: served,
    stubs: { '/@vite/client': viteClientStub, ...options.stubs },
    resolve: (specifier) => {
      const imported = withoutTimestamp(specifier)
      return skip.test(imported) ? undefined : imported
    },
    load: (id) => server.transform(id, environment),
    // Served code is already JavaScript
    transform: (code) => code,
    fallbackStub: options.fallbackStub,
  })
  return graph.import(url)
}

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

/**
 * Each app file by path relative to the root: its contents and its
 * modification time. A watcher reports a write that leaves the contents as
 * they were as a change too (chokidar compares the modification time). The
 * kernel updates modification times once per clock tick (a few ms): a
 * rewrite in the tick of the last snapshot goes unseen.
 */
async function readFiles(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(full)
        }
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const { mtimeNs } = await stat(full, { bigint: true })
          files.set(
            path.relative(root, full).split(path.sep).join('/'),
            `${mtimeNs}\n${await readFile(full, 'utf8')}`,
          )
        } catch {
          // Removed while reading, or a dangling link
        }
      }
    }
  }
  await visit(root)
  return files
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
