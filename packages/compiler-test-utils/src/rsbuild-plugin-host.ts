/**
 * The Rsbuild counterpart of `./plugin-host`: the
 * Rsbuild plugins a user configures, given as they are, on an app written
 * to disk, driven through Rsbuild's public JavaScript API in process:
 * - a dev server (`createRsbuild` + `createDevServer`, Rspack in watch
 *   mode; `./rsbuild-dev-server`), whose edits settle on a bounded outcome;
 * - server code: an entry of a server environment loaded by Rsbuild's own
 *   `environments.<name>.loadBundle(entry)` (`loadServer`);
 * - client code: the page Rsbuild serves for the entry, in the shared
 *   Chromium page of `./browser` (`runClient`: a bundler bundles client
 *   modules, so the page is the unit, not a module URL);
 * - a production build (`rsbuild.build()`), with each environment's
 *   emitted JavaScript and the dangling-name evidence of its production
 *   client output (`recordParsedModules`);
 * - diagnostics: one merged channel per dev server and per build (every
 *   compile's errors and warnings, Rsbuild's logger, the console, the
 *   process streams).
 * Nothing of a compiler is assumed: no loader name, module id or hook
 * placement.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRsbuild, mergeRsbuildConfig } from '@rsbuild/core'
import { runInPage } from './browser'
import {
  createApp,
  parsedModules as emptyParsedModules,
  recordParsedModules,
} from './build-harness'
import { openDiagnosticChannel } from './diagnostic-channel'
import { createRsbuildDevServer, rsbuildLogger } from './rsbuild-dev-server'
import type { PageRun } from './browser'
import type { App, AppOptions, ParsedModules } from './build-harness'
import type { ChannelDiagnostic } from './diagnostic-channel'
import type { RsbuildDevServer } from './rsbuild-dev-server'
import type { RsbuildConfig, RsbuildPlugin, Rspack } from '@rsbuild/core'

export interface RsbuildPluginHostApp {
  root: string
  command: 'serve' | 'build'
}

export interface RsbuildPluginHostOptions extends AppOptions {
  /**
   * The Rsbuild plugins a user configures, as public entry points give
   * them, or a function of the app returning them (called once per dev
   * server and per build).
   */
  plugins:
    | Array<RsbuildPlugin>
    | ((app: RsbuildPluginHostApp) => Array<RsbuildPlugin>)
  /** Rsbuild configuration merged over the host's. */
  config?: RsbuildConfig
  /** Entry module relative to the app root (default `src/entry.ts`). */
  entry?: string
  /** Starts a dev server on the app (default `true`). */
  serve?: boolean
  /** Serves the entry's page to the shared browser page (`runClient`). */
  client?: boolean
}

export interface RsbuildHostBuildEnvironment {
  /** Absolute output directory. */
  distPath: string
  /** The scripts the environment emitted, by path relative to `distPath`. */
  files: Record<string, string>
}

export interface RsbuildHostBuild {
  environments: Record<string, RsbuildHostBuildEnvironment>
  /** Everything the build reported, on every channel. */
  diagnostics: Array<ChannelDiagnostic>
  /**
   * The dangling-name evidence of each production client (`web` target)
   * environment's output (`describeBuild`'s `parsedModules`).
   */
  parsedModules: Record<string, ParsedModules>
}

/** An Rsbuild build that failed: its error, with what it reported. */
export class RsbuildHostBuildError extends Error {
  constructor(
    readonly cause: unknown,
    readonly diagnostics: Array<ChannelDiagnostic>,
  ) {
    super(
      `rsbuild build failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
    this.name = 'RsbuildHostBuildError'
  }
}

export interface RsbuildPluginHost {
  root: string
  file: (relative: string) => string
  /** The dev server (`serve` hosts). */
  dev: RsbuildDevServer
  /** Everything the dev server reported since it started, on every channel. */
  diagnostics: Array<ChannelDiagnostic>
  /**
   * Loads an entry (`source.entry` name, default `index`) of a server
   * environment through Rsbuild's `loadBundle` (its own runner, fresh after
   * each compile). An ES module bundle needs Node's
   * `--experimental-vm-modules` in the test process (Vitest `execArgv`);
   * a CommonJS one (`output.module: false`) runs as is.
   */
  loadServer: <T = Record<string, any>>(
    environment: string,
    entryName?: string,
  ) => Promise<T>
  /**
   * Loads the page Rsbuild serves for the entry in the shared Chromium
   * page and runs `script` (an async function body; its JSON value is the
   * result). Needs `client: true`.
   */
  runClient: <T = unknown>(script?: string) => Promise<PageRun<T>>
  /** `RsbuildDevServer.edit`. */
  edit: RsbuildDevServer['edit']
  /** Runs `rsbuild build` on the app. */
  build: () => Promise<RsbuildHostBuild>
  close: () => Promise<void>
}

/** Writes an app and hosts `plugins` on it (see the module comment). */
export async function createRsbuildPluginHost(
  options: RsbuildPluginHostOptions,
): Promise<RsbuildPluginHost> {
  const {
    plugins,
    config = {},
    entry = 'src/entry.ts',
    serve = true,
    client = false,
  } = options
  const pluginsFor = (
    command: RsbuildPluginHostApp['command'],
    root: string,
  ) => (typeof plugins === 'function' ? plugins({ root, command }) : plugins)
  const prefix = options.prefix ?? '.rsbuild-plugin-host-'

  let server: RsbuildDevServer | undefined
  let app: App | undefined
  if (serve) {
    server = await createRsbuildDevServer({
      ...options,
      prefix,
      entry,
      plugins: ({ root }) => pluginsFor('serve', root),
      config,
      browser: client,
    })
  } else {
    app = await createApp({ ...options, prefix })
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
      await server?.close()
    } finally {
      await app?.dispose()
    }
  }

  const host: RsbuildPluginHost = {
    root,
    file: (relative) => path.join(root, relative),
    get dev() {
      return devServer()
    },
    get diagnostics() {
      return devServer().diagnostics
    },
    loadServer: (environment, entryName = 'index') => {
      const environments = devServer().devServer.environments
      const target = environments[environment]
      if (!target) {
        return Promise.reject(
          new Error(
            `no "${environment}" environment (has ${Object.keys(environments).join(', ')})`,
          ),
        )
      }
      return target.loadBundle(entryName)
    },
    runClient: (script) => {
      if (!client) {
        return Promise.reject(
          new Error('runClient() needs a host created with `client: true`'),
        )
      }
      return runInPage({ pageUrl: devServer().url!, script })
    },
    edit: (files, editOptions) => devServer().edit(files, editOptions),
    build: async () => {
      const channel = openDiagnosticChannel()
      channel.claim(root)
      return channel.run(async () => {
        const environments: Record<string, RsbuildHostBuildEnvironment> = {}
        const evidence: Record<string, ParsedModules> = {}
        /** Each environment's output directory and emitted scripts. */
        const emitted: Record<
          string,
          { distPath: string; files: Array<string> }
        > = {}
        const recorder: RsbuildPlugin = {
          name: 'rsbuild-plugin-host:build',
          setup(api) {
            api.onAfterCreateCompiler(({ compiler }) => {
              for (const child of 'compilers' in compiler
                ? compiler.compilers
                : [compiler]) {
                channel.scopeRspack(child)
                // Before Rsbuild's logger prints its summary of the compile
                // (`reportLogged`)
                child.hooks.done.tap(
                  { name: 'rsbuild-plugin-host:build', stage: -100 },
                  ({ compilation }) => channel.reportCompilation(compilation),
                )
              }
            })
            api.modifyRspackConfig((rspackConfig, { environment }) => {
              if (environment.config.output.target === 'web') {
                const parsed = emptyParsedModules()
                evidence[environment.name] = parsed
                rspackConfig.plugins.push(
                  recordParsedModules(
                    parsed,
                  ) as unknown as Rspack.RspackPluginInstance,
                )
              }
            })
            api.onAfterBuild(({ stats, environments: built }) => {
              const all = stats && 'stats' in stats ? stats.stats : [stats]
              const names = Object.keys(built)
              all.forEach((environmentStats, index) => {
                if (!environmentStats) {
                  return
                }
                const name = environmentStats.compilation.name ?? names[index]!
                const { assets = [] } = environmentStats.toJson({
                  all: false,
                  assets: true,
                })
                emitted[name] = {
                  distPath: built[name]!.distPath,
                  files: assets
                    .map((asset) => asset.name)
                    .filter((file) => /\.[cm]?js$/.test(file)),
                }
              })
            })
          },
        }
        let built: { close: () => Promise<void> } | undefined
        try {
          const rsbuild = await createRsbuild({
            cwd: root,
            rsbuildConfig: mergeRsbuildConfig(
              {
                root,
                mode: 'production',
                logLevel: 'silent',
                customLogger: rsbuildLogger(channel),
                source: { entry: { index: `./${entry}` } },
                plugins: [...pluginsFor('build', root), recorder],
              },
              config,
            ),
          })
          built = await rsbuild.build()
          for (const [name, { distPath, files }] of Object.entries(emitted)) {
            const code: Record<string, string> = {}
            for (const file of files) {
              code[file] = await readFile(path.join(distPath, file), 'utf8')
            }
            environments[name] = { distPath, files: code }
          }
        } catch (error) {
          channel.close()
          throw new RsbuildHostBuildError(error, [...channel.diagnostics])
        } finally {
          await built?.close()
        }
        channel.close()
        return {
          environments,
          diagnostics: [...channel.diagnostics],
          parsedModules: evidence,
        }
      })
    },
    close,
  }
  options.registerCleanup?.(close)
  return host
}
