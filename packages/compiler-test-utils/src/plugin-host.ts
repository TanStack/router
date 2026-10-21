/**
 * The public in-process plugin host (SYNTHESIS recipes P1/P2/P3; RULES-AUDIT
 * R3, R23–R25): the plugins a user configures, given as they are (the
 * public plugin array of a `vite.config.ts`), on an app written to disk,
 * driven through real Vite. Nothing of a compiler is assumed: no hook
 * placement (no recorder before or after a plugin), no module id or query,
 * no route or module registration. What a test reads is what the host
 * hands a user:
 * - server code: a module of a server environment evaluated by that
 *   environment's own module runner (`importServer`); Vite resolves, loads
 *   and transforms every module by its resolved id, and a missing named
 *   import throws (`./strict-runner`);
 * - client code: the module as the dev server serves it to a browser,
 *   imported and run in a real Chromium page (`runClient`: the shared page
 *   of `./browser`, one per test process, so fast-tier client checks stay
 *   fast without Node stubs);
 * - served code (`transform`), for checks of what an environment serves;
 * - edits (`edit`): written to disk, reported by Vite's own watcher,
 *   settled on a bounded outcome (`./dev-server`);
 * - a production build (`build`): `vite build` as its CLI runs it
 *   (`createBuilder` + `buildApp`: every environment a plugin configures,
 *   else the client), with each environment's emitted chunks;
 * - diagnostics: one merged channel per dev server and per build
 *   (`./diagnostic-channel`).
 *
 * The dev server runs in middleware mode (no port) unless `client` is set:
 * then it listens, as `vite dev` does, for the page. The app's bare
 * imports resolve from `dir`, as for every harness of this package.
 *
 * The Rsbuild counterpart is `./rsbuild-plugin-host`.
 */
import path from 'node:path'
import { createBuilder, mergeConfig } from 'vite'
import { runInPage } from './browser'
import {
  createApp,
  describeBuild,
  parsedModules,
  recordViteModules,
} from './build-harness'
import { createDevServer } from './dev-server'
import { openDiagnosticChannel } from './diagnostic-channel'
import type { PageRun } from './browser'
import type {
  App,
  AppOptions,
  BuildMode,
  BuildResult,
  EmittedChunk,
  SourceMap,
} from './build-harness'
import type { DevServer, HmrMessage } from './dev-server'
import type { ChannelDiagnostic } from './diagnostic-channel'
import type { InlineConfig, Plugin, PluginOption } from 'vite'

/** What the plugins are created for: a dev server, or a build. */
export interface PluginHostApp {
  root: string
  command: 'serve' | 'build'
}

export interface PluginHostOptions extends AppOptions {
  /**
   * The plugins a user configures, as public entry points give them (e.g.
   * `[tanstackRouter({ ... }), react()]`), or a function of the app
   * returning them (called once per dev server and per build, as Vite
   * loads a config file once per command).
   */
  plugins: Array<PluginOption> | ((app: PluginHostApp) => Array<PluginOption>)
  /** Vite configuration merged over the host's, as a `vite.config` sets it. */
  config?: InlineConfig
  /**
   * Starts a dev server on the app (default `true`). A host for production
   * builds only sets `false`: building while a dev server watches the app
   * makes the watcher report the output.
   */
  serve?: boolean
  /**
   * Serves client modules to the shared browser page (`runClient`): the dev
   * server listens and pre-bundles dependencies, as `vite dev`, and an idle
   * HMR client stays connected for the host's lifetime, so that a full
   * reload sent between runs is not handed to the next run's page (see
   * `connectIdleHmrClient`). Default `false` (middleware mode).
   */
  client?: boolean
  /** See `DevServerOptions.settleTimeout`. */
  settleTimeout?: number
  /** See `DevServerOptions.eventTimeout`. */
  eventTimeout?: number
}

/** An emitted chunk of one environment of a build, with its code. */
export interface HostChunk extends EmittedChunk {
  code: string
  /** The chunk's source map, when the build emits one. */
  map?: SourceMap
  /** The modules the bundler put in the chunk, by resolved id. */
  moduleIds: Array<string>
}

export interface HostBuildEnvironment {
  /** Absolute output directory. */
  outDir: string
  chunks: Array<HostChunk>
}

export interface HostBuild {
  /** Each environment that was built, by name (`client`, `ssr`, ...). */
  environments: Record<string, HostBuildEnvironment>
  /** Everything the build reported, on every channel. */
  diagnostics: Array<ChannelDiagnostic>
  /**
   * The output of one environment as `describeBuild` describes it (chunk
   * placement, `run()` in Node or Chromium, and, for a production client
   * build, the dangling-name check).
   */
  describe: (
    environment: string,
    options?: { env?: 'client' | 'ssr'; entry?: string },
  ) => Promise<BuildResult>
}

/** A build that failed: its error, with what it reported meanwhile. */
export class HostBuildError extends Error {
  constructor(
    readonly cause: unknown,
    readonly diagnostics: Array<ChannelDiagnostic>,
  ) {
    super(
      `vite build failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
    this.name = 'HostBuildError'
  }
}

export interface PluginHost {
  /** App root on disk. */
  root: string
  /** Absolute path of an app file. */
  file: (relative: string) => string
  /** The dev server (`serve` hosts). */
  dev: DevServer
  /**
   * Imports a module (a URL of the dev server, e.g. `/src/server.ts`, or an
   * app path) in a server environment (default `ssr`) through its module
   * runner.
   */
  importServer: (
    url: string,
    environment?: string,
  ) => Promise<Record<string, any>>
  /** The code an environment (default `client`) serves for a URL. */
  transform: (url: string, environment?: string) => Promise<string>
  /**
   * Imports a client module as the browser loads it from the dev server,
   * in the shared Chromium page, and runs `script` (an async function body
   * with the module's namespace as `module`; its JSON value is the result).
   * Needs `client: true`.
   */
  runClient: <T = unknown>(url: string, script?: string) => Promise<PageRun<T>>
  /**
   * Writes app files (`null` deletes one) and waits for the dev server's
   * bounded outcome (`DevServer.edit`).
   */
  edit: (files: Record<string, string | null>) => Promise<Array<HmrMessage>>
  /**
   * Everything the dev server reported since it started, on every channel
   * (`serve` hosts). Mark a point with `diagnostics.length`.
   */
  diagnostics: Array<ChannelDiagnostic>
  /** Runs `vite build` on the app (see the module comment). */
  build: (options?: {
    mode?: BuildMode
    config?: InlineConfig
  }) => Promise<HostBuild>
  /** Closes the dev server and removes the app. */
  close: () => Promise<void>
}

/** The page the host serves for `runClient`. */
export const hostPagePath = '/__plugin-host__/page.html'

const hostPageHtml = `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body><div id="root"></div></body>
</html>
`

/**
 * Serves `hostPagePath`: an empty document that the plugins transform as
 * they transform any page of the app (`transformIndexHtml`: Vite's client,
 * a framework's refresh preamble), for client modules to run in.
 */
function hostPagePlugin(): Plugin {
  return {
    name: 'plugin-host:page',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== hostPagePath) {
          next()
          return
        }
        try {
          const html = await server.transformIndexHtml(
            hostPagePath,
            hostPageHtml,
          )
          response.setHeader('Content-Type', 'text/html')
          response.end(html)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

/**
 * Connects an idle HMR client to a listening Vite dev server (as a second
 * tab of the app would be) and resolves once Vite greeted it; the returned
 * function disconnects it. Vite keeps a full reload (or an error) sent while
 * no client is connected and hands it to the next client that connects:
 * with `runClient` that is the page of the next run, which would then reload
 * under the run. With this client connected for the host's lifetime, what
 * the server sends while no page runs reaches it, and it ignores it.
 */
async function connectIdleHmrClient(server: DevServer): Promise<() => void> {
  const url = new URL(server.url!)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', server.vite.config.webSocketToken)
  const socket = new WebSocket(url, 'vite-hmr')
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('message', (event) => {
        if (JSON.parse(String(event.data)).type === 'connected') {
          resolve()
        }
      })
      socket.addEventListener('error', () =>
        reject(new Error(`no HMR connection to ${server.url}`)),
      )
      socket.addEventListener('close', () =>
        reject(new Error(`the HMR connection to ${server.url} closed`)),
      )
    })
  } catch (error) {
    socket.close()
    throw error
  }
  return () => socket.close()
}

/**
 * Records each environment's emitted chunks (code, imports, modules, source
 * map) as the bundle is written: an observer of the final output only.
 */
function outputRecorder(outputs: Record<string, HostBuildEnvironment>): Plugin {
  return {
    name: 'plugin-host:output',
    // Code as it is written, after every plugin's own hooks
    writeBundle: {
      order: 'post',
      handler(outputOptions, bundle) {
        const name = this.environment.name
        const outDir = path.resolve(
          this.environment.config.root,
          outputOptions.dir ?? this.environment.config.build.outDir,
        )
        const environment = (outputs[name] ??= { outDir, chunks: [] })
        for (const item of Object.values(bundle)) {
          if (item.type === 'chunk') {
            environment.chunks.push({
              fileName: item.fileName,
              isEntry: item.isEntry,
              imports: item.imports,
              dynamicImports: item.dynamicImports,
              code: item.code,
              moduleIds: item.moduleIds,
              ...(item.map && {
                map: JSON.parse(item.map.toString()) as SourceMap,
              }),
            })
          }
        }
      },
    },
  }
}

/**
 * Writes an app (`files`, in `dir`) and hosts `plugins` on it: starts the
 * dev server (unless `serve: false`) and resolves once it watches the app.
 * `close()`, which `registerCleanup` also receives, closes it and removes
 * the app.
 */
export async function createPluginHost(
  options: PluginHostOptions,
): Promise<PluginHost> {
  const { plugins, config = {}, client = false, serve = true } = options
  const pluginsFor = (command: PluginHostApp['command'], root: string) =>
    typeof plugins === 'function' ? plugins({ root, command }) : plugins
  const prefix = options.prefix ?? '.plugin-host-'

  let server: DevServer | undefined
  let app: App | undefined
  if (serve) {
    server = await createDevServer({
      ...options,
      prefix,
      plugins: ({ root }) => [
        ...pluginsFor('serve', root),
        ...(client ? [hostPagePlugin()] : []),
      ],
      config,
      browser: client,
      settleTimeout: options.settleTimeout,
      eventTimeout: options.eventTimeout,
    })
  } else {
    app = await createApp({ ...options, prefix })
  }
  let disconnectIdle: (() => void) | undefined
  if (server && client) {
    try {
      disconnectIdle = await connectIdleHmrClient(server)
    } catch (error) {
      await server.close()
      throw error
    }
  }
  const root = server?.root ?? app!.root
  const devServer = () => {
    if (!server) {
      throw new Error('this plugin host serves nothing (`serve: false`)')
    }
    return server
  }
  const close = async () => {
    try {
      disconnectIdle?.()
      await server?.close()
    } finally {
      await app?.dispose()
    }
  }

  const host: PluginHost = {
    root,
    file: (relative) => path.join(root, relative),
    get dev() {
      return devServer()
    },
    get diagnostics() {
      return devServer().diagnostics
    },
    importServer: (url, environment = 'ssr') =>
      devServer().import(url, environment),
    transform: (url, environment = 'client') =>
      devServer().transform(url, environment),
    runClient: (url, script) => {
      if (!client) {
        return Promise.reject(
          new Error('runClient() needs a host created with `client: true`'),
        )
      }
      const base = devServer().url!
      return runInPage({
        pageUrl: new URL(hostPagePath, base).href,
        moduleUrl: new URL(url, base).href,
        script,
      })
    },
    edit: (files) => devServer().edit(files),
    build: async (buildOptions = {}) => {
      const buildRoot = root
      const mode = buildOptions.mode ?? 'production'
      const outputs: Record<string, HostBuildEnvironment> = {}
      const clientModules = parsedModules()
      const channel = openDiagnosticChannel()
      channel.claim(buildRoot)
      return channel.run(async () => {
        try {
          const builder = await createBuilder(
            mergeConfig(
              mergeConfig(
                {
                  root: buildRoot,
                  configFile: false,
                  envDir: false,
                  publicDir: false,
                  mode,
                  clearScreen: false,
                  customLogger: channel.viteLogger(),
                  plugins: [
                    ...pluginsFor('build', buildRoot),
                    outputRecorder(outputs),
                    // The evidence of the client's dangling-name check
                    recordViteModules(clientModules, { environment: 'client' }),
                  ],
                } satisfies InlineConfig,
                config,
              ),
              buildOptions.config ?? {},
            ),
            // As the CLI: every environment when a plugin configures the app
            // builder, else the client
            null,
          )
          await builder.buildApp()
        } catch (error) {
          channel.close()
          throw new HostBuildError(error, [...channel.diagnostics])
        }
        channel.close()
        const diagnostics = [...channel.diagnostics]
        return {
          environments: outputs,
          diagnostics,
          describe: async (name, describeOptions = {}) => {
            const environment = outputs[name]
            if (!environment) {
              throw new Error(
                `no "${name}" environment was built (built: ${Object.keys(outputs).join(', ') || 'none'})`,
              )
            }
            const env =
              describeOptions.env ?? (name === 'client' ? 'client' : 'ssr')
            // An app's own entry: the one emitted entry, unless named
            const chunks = environment.chunks.filter(
              (chunk) =>
                describeOptions.entry === undefined ||
                !chunk.isEntry ||
                chunk.fileName === describeOptions.entry,
            )
            return describeBuild({
              bundler: 'vite',
              env,
              mode,
              minify: true,
              root: buildRoot,
              outDir: environment.outDir,
              chunks: chunks.map(
                ({ fileName, isEntry, imports, dynamicImports }) => ({
                  fileName,
                  isEntry,
                  imports,
                  dynamicImports,
                }),
              ),
              sourcemap: chunks.some((chunk) => chunk.map !== undefined),
              ...(name === 'client' && { parsedModules: clientModules }),
              warnings: diagnostics
                .filter((diagnostic) => diagnostic.severity === 'warning')
                .map((diagnostic) => diagnostic.text),
              consoleMessages: [],
              duration: 0,
              dispose: async () => {},
            })
          },
        }
      })
    },
    close,
  }
  options.registerCleanup?.(close)
  return host
}
