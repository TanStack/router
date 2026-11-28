/**
 * Registers Start's compiler on Rsbuild: the shared session,
 * one `pre` loader rule per Start environment (every JS/TS id, env and
 * derived alike), the late `post` pass over the JS output of other module
 * types (and of a Vue SFC's script block: `vue.ts`), the `sideEffects: false` rule for
 * the import-protection runtime, the host
 * plugin of each environment compiler, the generator session and the
 * client route tree transform.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_QUERY_RE,
  identify,
  normalizePath,
} from '@tanstack/router-utils/compiler'
import { EVALUATED_EDGE_QUERY } from '../import-protection/edge-modules'
import { ownFileRule } from '../import-protection/rules'
import { StartRsbuildCompilerSession } from './compiler-session'
import { createStartHostPlugin } from './host-plugin'
import { createRsbuildRouteGenerator } from './router-generator'
import { vueScriptBlockRule } from './vue'
import { COMPILER_LOADER_PATH, LATE_PASS_RE } from './late-pass'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import type { RouteSetEvidence } from './router-generator'
import type { TransformImportRule } from './compiler-session'
import type { ServerFnResolverModule } from './server-fn-resolver-rebuild'
import type { StartCompilerEnvironment } from '../compiler/session'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { TanStackStartRsbuildPluginCoreOptions } from './types'
import type { GetConfigFn } from '../types'
import type { RsbuildConfig, RsbuildPluginAPI, Rspack } from '@rsbuild/core'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

/** An import-protection edge module's virtual file (`rspackEdgeModuleIds`). */
const EDGE_MODULE_FILE_RE =
  /[\\/]import-protection[\\/][^\\/]+[\\/]edge\.[^\\/]+\.mjs$/
const assetLoaderPath = path.resolve(currentDir, 'asset-query-loader.js')

/** Dev: appended to the client's route tree module (see its transform). */
const acceptOwnUpdate = `
if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
`

/** JS/TS module paths (the query is not part of a rule's `test`). */
const JS_FILE_RE = /\.[cm]?[jt]sx?$/

interface RegisterStartCompilerOptions {
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartRsbuildPluginCoreOptions
  startPluginOpts: TanStackStartRsbuildInputConfig
  environments: Array<StartCompilerEnvironment>
  /** Writes a virtual module file of an environment (import-protection edge modules). */
  writeVirtualModule: (envName: string, file: string, content: string) => void
  /** The resolver virtual module content changed (after a `finishMake` replay). */
  onServerFnsChange: () => void
  /** The server environment's server-fn resolver module, rebuilt in its compiler's `finishMake` closure. */
  serverFnResolver: ServerFnResolverModule
  /** The server environment's Start manifest module (`manifest-rebuild.ts`). */
  manifestPath: () => string
  /** Whether a path is an app entry (import protection: a marked entry is its own violation). */
  isEntry: (path: string) => boolean
}

interface RegisteredStartCompiler {
  /** The session of the current compiler, once the first environment's Rspack config is built. */
  session: () => StartRsbuildCompilerSession | null
  resolverModule: () => string
}

export function registerStartCompiler(
  api: RsbuildPluginAPI,
  opts: RegisterStartCompilerOptions,
): RegisteredStartCompiler {
  const dev = api.context.action === 'dev'
  /**
   * The session of the compiler being configured, or of the last one
   * created: one per Rspack compiler of this Rsbuild instance (a `build()`,
   * a dev server, a `createCompiler()`; `build()` again configures a new
   * compiler), whose environments' configs it is built into. What a
   * compiler compiled and learned dies with it, and a production run of a
   * compiler that ran before starts it over (`beginRun`).
   */
  let session: StartRsbuildCompilerSession | null = null
  /** Whether the compiler of `session` was created: the next configs are another compiler's. */
  let created = false
  api.onAfterCreateCompiler(() => {
    created = true
  })

  const generator = createRsbuildRouteGenerator({
    getConfig: opts.getConfig,
    corePluginOpts: opts.corePluginOpts,
    startPluginOpts: opts.startPluginOpts,
  })
  const configuredSession = (): StartRsbuildCompilerSession => {
    if (session && !created) {
      return session
    }
    created = false
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    session = new StartRsbuildCompilerSession({
      framework: opts.corePluginOpts.framework,
      mode: dev ? 'dev' : 'build',
      root: resolvedStartConfig.root,
      srcDirectory: resolvedStartConfig.srcDirectory,
      environments: opts.environments,
      rsc: opts.corePluginOpts.rsc,
      generateFunctionId: opts.startPluginOpts.serverFns?.generateFunctionId,
      codeSplittingOptions: startConfig.router.codeSplittingOptions,
      importProtection: startConfig.importProtection,
      routes: generator.routes,
      isEntry: opts.isEntry,
    })
    return session
  }

  // the client's route tree without its server-only routes (J2.15); it
  // depends on the files of the routes it left out, which no client module
  // imports (an edit that makes one a page compiles the client again)
  api.transform(
    {
      test: (resource: string) =>
        generator.clientRouteTree.paths().includes(normalizePath(resource)),
      environments: [RSBUILD_ENVIRONMENT_NAMES.client],
      order: 'pre',
    },
    async ({ addDependency }) => {
      const tree = await generator.clientRouteTree.code()
      for (const file of tree.dependencies) {
        addDependency(file)
      }
      if (dev) {
        generator.evidence.clientServed(tree.code)
      }
      // (the same text as `clientTreeModule`: the host compares the module
      // built with it)
      // Dev: the tree module accepts its own hot update, which changes
      // nothing in the page (its router keeps the tree it hydrated with):
      // Rsbuild's client does not reload for an update nothing accepted,
      // at the client's compile, and Start's reload is the one reload, once
      // the server serves the change too (`reloadOnRouteSetChange`). The
      // evidence is of the tree's own text
      return clientTreeModule(tree.code)
    },
  )
  /** The client's route tree module, as the transform serves it. */
  function clientTreeModule(code: string): string {
    return dev ? `${code}${acceptOwnUpdate}` : code
  }

  if (dev) {
    reloadOnRouteSetChange(api, generator.evidence, {
      rsc: opts.corePluginOpts.rsc !== undefined,
    })
  }

  api.modifyRspackConfig((config, utils) => {
    const environment = opts.environments.find(
      (env) => env.name === utils.environment.name,
    )
    if (!environment) {
      return
    }
    const s = configuredSession()
    s.compiler(environment.name).transformImport = transformImportRules(
      utils.environment.config.source.transformImport,
    )
    const rules = (config.module.rules ??= [])
    const loaderRules: Array<Rspack.RuleSetRule> = [
      {
        test: JS_FILE_RE,
        enforce: 'pre',
        use: [
          {
            loader: COMPILER_LOADER_PATH,
            options: { environment: environment.name },
          },
        ],
      },
    ]
    // the late pass (import protection and start-env)
    const lateUse = {
      loader: COMPILER_LOADER_PATH,
      options: { environment: environment.name, pass: 'late' },
    }
    loaderRules.push(
      { test: LATE_PASS_RE, enforce: 'post', use: [lateUse] },
      // Vue SFC script blocks under vue-loader's inline match resource
      vueScriptBlockRule(lateUse),
    )
    if (s.start.ip) {
      loaderRules.push(
        // the import-protection runtime only; edge modules are analysed by the bundler
        {
          test: /[\\/]import-protection[\\/][^\\/]+[\\/]runtime\.mjs$/,
          sideEffects: false,
        },
        // an edge module is JavaScript whatever the importer's import attributes say of the
        // module it stands in for (`with { type: 'json' }` would make Rspack parse it as JSON)
        {
          test: EDGE_MODULE_FILE_RE,
          type: 'javascript/esm',
          // Rspack builds an edge module only for an import its importer kept
          // after SWC: `allowImport` decides, and a pending violation is confirmed
          use:
            dev || s.start.ip.config.allowImport
              ? [
                  {
                    loader: COMPILER_LOADER_PATH,
                    options: { environment: environment.name, pass: 'edge' },
                  },
                ]
              : [],
        },
      )
    }
    rules.unshift(...loaderRules)
    const { ip } = s.start
    if (ip && environment.type === 'client') {
      // an asset no compile reads gets its verdict first; only one that can be
      // denied meets the loader. Last in the list: a rule's index is part of
      // every module id it matches
      const resource = (file: string) =>
        identify(file).lang !== null ||
        (!file.startsWith('data:') &&
          ownFileRule(ip.config, 'client', file) !== null)
      const use = [
        {
          loader: assetLoaderPath,
          options: { environment: environment.name, pass: 'asset' },
        },
      ]
      rules.push(
        { resourceQuery: ASSET_QUERY_RE, resource, enforce: 'pre', use },
        // `new URL('./x.txt', import.meta.url)`
        {
          dependency: 'url',
          exclude: JS_FILE_RE,
          resource,
          enforce: 'pre',
          use,
        },
      )
    }
    if (ip) {
      // an evaluated mock keeps its importers evaluated under the app's
      // `sideEffects: false` (D-c). Last too: no other rule's index moves
      rules.push({
        test: EDGE_MODULE_FILE_RE,
        resourceQuery: EVALUATED_EDGE_QUERY,
        sideEffects: true,
      })
    }
    config.plugins.push(
      createStartHostPlugin({
        session: s,
        environment,
        rspack: utils.rspack,
        writeVirtualModule: (file, content) =>
          opts.writeVirtualModule(environment.name, file, content),
        generator,
        clientRouteTree:
          environment.type === 'client'
            ? {
                paths: generator.clientRouteTree.paths,
                module: async () => {
                  const { code } = await generator.clientRouteTree.code()
                  return { tree: code, module: clientTreeModule(code) }
                },
              }
            : undefined,
        manifestPath:
          environment.name === RSBUILD_ENVIRONMENT_NAMES.server
            ? opts.manifestPath
            : undefined,
        onServerFnsReplayed: opts.onServerFnsChange,
        serverFnResolver:
          environment.name === RSBUILD_ENVIRONMENT_NAMES.server
            ? opts.serverFnResolver
            : undefined,
        onDevCompileDone: dev ? api.onDevCompileDone : undefined,
        fillMapTexts:
          environment.type === 'client' ||
          utils.environment.config.dev.writeToDisk !== false,
      }),
    )
  })

  return {
    session: () => session,
    resolverModule: () => (session ?? configuredSession()).resolverModule(),
  }
}

/** The array form of `source.transformImport` (a function form is applied to no imports). */
function transformImportRules(value: unknown): Array<TransformImportRule> {
  const list = typeof value === 'function' ? value([]) : value
  if (!Array.isArray(list)) {
    return []
  }
  return list.filter(
    (rule): rule is TransformImportRule =>
      !!rule &&
      typeof rule === 'object' &&
      typeof rule.libraryName === 'string',
  )
}

/** The app's own `dev.liveReload` for the client environment (its own, else the top level's). */
function clientLiveReload(
  config: RsbuildConfig,
): NonNullable<RsbuildConfig['dev']>['liveReload'] {
  return (
    config.environments?.[RSBUILD_ENVIRONMENT_NAMES.client]?.dev?.liveReload ??
    config.dev?.liveReload
  )
}

/**
 * Development: reloads the open tabs once the client's route tree changed
 * (a route added, deleted or renamed, a page turned into a server handler
 * or back, a lazy file added; SPEC J3.10, as Start on Vite does), when the
 * client and the server serve what the generator has: the last finished
 * compilations of both have no errors, the client emitted the current
 * client tree, and the server emitted a tree module and route files built
 * from the generator's bytes, where it has two readings of them
 * (`RouteSetEvidence`). Every other dev compile of an unchanged route set
 * reloads nothing. The tabs took the new tree as a hot update that changes
 * nothing (the tree module accepts its own update); they hear the reload
 * through Rsbuild's dev client, which applies the app's `dev.liveReload`
 * itself (with RSC, through the RSC client's channel, when the app's own
 * config leaves live reload on). With the client's HMR off and no RSC,
 * Rsbuild's client reloads the tab at every client compile, and nothing is
 * sent.
 */
function reloadOnRouteSetChange(
  api: RsbuildPluginAPI,
  evidence: RouteSetEvidence,
  opts: { rsc: boolean },
) {
  const client = RSBUILD_ENVIRONMENT_NAMES.client
  const server = RSBUILD_ENVIRONMENT_NAMES.server
  let send: (() => void) | undefined
  /** The client tree the tabs were last told to load (none yet: undefined). */
  let sent: string | undefined
  /** A client compile served since then had another tree (and the tabs took it as a hot update). */
  let other = false
  api.onBeforeStartDevServer(({ server: devServer, environments }) => {
    if (!opts.rsc) {
      if (environments[client]?.config.dev.hmr === false) {
        // (Rsbuild's client reloads at every client compile already)
        return
      }
      const hot = devServer.environments[client]?.hot
      send = hot
        ? () => hot.send('full-reload')
        : () => devServer.sockWrite('full-reload')
    } else if (clientLiveReload(api.getRsbuildConfig('original')) !== false) {
      // With RSC, Start turns Rsbuild's live reload off (its client then
      // drops a reload): the RSC client's own channel, unless the app's own
      // config turned live reload off (for the client environment, or for
      // all)
      send = () => {
        devServer.sockWrite('custom', { event: 'tanstack-start:routes' })
      }
    }
  })
  api.onCloseDevServer(() => {
    send = undefined
    sent = undefined
    other = false
    evidence.reset()
  })
  api.onAfterEnvironmentCompile(({ stats, environment }) => {
    if (environment.name !== client || !stats || stats.hasErrors()) {
      return
    }
    const built = evidence.clientTree()
    if (sent !== undefined && built !== undefined && built !== sent) {
      other = true
    }
  })
  // (Rsbuild's callback is only the trigger: nothing below reads its stats,
  // and nothing is awaited after the current tree)
  api.onAfterDevCompile(async () => {
    let current: string
    try {
      current = await evidence.current()
    } catch {
      // (no route tree generated yet)
      return
    }
    if (!evidence.clean(client) || !evidence.clean(server)) {
      return
    }
    const built = evidence.clientTree()
    if (built === undefined || built !== current) {
      return
    }
    if (!evidence.serverAgrees(server)) {
      return
    }
    if (sent !== undefined && (built !== sent || other)) {
      send?.()
    }
    sent = built
    other = false
  })
}
