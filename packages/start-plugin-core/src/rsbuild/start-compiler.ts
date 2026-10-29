/**
 * Registers Start's compiler on Rsbuild: the shared session,
 * one `pre` loader rule per Start environment (every JS/TS id, env and
 * derived alike), the late `post` pass over the JS output of other module
 * types (import protection only), the `sideEffects: false` rules for
 * extracted-export outputs and the import-protection runtime, the host
 * plugin of each environment compiler, the generator session and the
 * client route tree transform.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StartRsbuildCompilerSession } from './compiler-session'
import { createStartHostPlugin } from './host-plugin'
import { createRsbuildRouteGenerator } from './router-generator'
import { RSBUILD_ENVIRONMENT_NAMES, RSBUILD_RSC_LAYERS } from './planning'
import type {
  StartRsbuildEnvironment,
  TransformImportRule,
} from './compiler-session'
import type { TanStackStartRsbuildInputConfig } from './schema'
import type { TanStackStartRsbuildPluginCoreOptions } from './types'
import type { GetConfigFn } from '../types'
import type { RsbuildPluginAPI, Rspack } from '@rsbuild/core'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const loaderPath = path.resolve(currentDir, 'compiler-loader.js')

/** JS/TS module paths (the query is not part of a rule's `test`). */
const JS_FILE_RE = /\.[cm]?[jt]sx?$/
/** Module types whose JavaScript output other loaders produce (the late import-protection pass). */
const LATE_PASS_RE = /\.(?:vue|svelte|mdx?|astro|marko)$/i

interface RegisterStartCompilerOptions {
  getConfig: GetConfigFn
  corePluginOpts: TanStackStartRsbuildPluginCoreOptions
  startPluginOpts: TanStackStartRsbuildInputConfig
  environments: Array<StartRsbuildEnvironment>
  /** Writes a virtual module file of an environment (import-protection edge modules). */
  writeVirtualModule: (envName: string, file: string, content: string) => void
  /** The resolver virtual module content changed (after a `finishMake` replay). */
  onServerFnsChange: () => void
  /** Whether a path is an app entry (import protection: a marked entry is its own violation). */
  isEntry: (path: string) => boolean
}

interface RegisteredStartCompiler {
  /** The session, once the first environment's Rspack config is built. */
  session: () => StartRsbuildCompilerSession | null
  resolverModule: () => string
}

export function registerStartCompiler(
  api: RsbuildPluginAPI,
  opts: RegisterStartCompilerOptions,
): RegisteredStartCompiler {
  const dev = api.context.action === 'dev'
  const rscEnabled = opts.corePluginOpts.rsc !== undefined
  let session: StartRsbuildCompilerSession | null = null

  const generator = createRsbuildRouteGenerator({
    getConfig: opts.getConfig,
    corePluginOpts: opts.corePluginOpts,
    startPluginOpts: opts.startPluginOpts,
    dev,
  })
  const ensureSession = (): StartRsbuildCompilerSession => {
    if (session) {
      return session
    }
    const { startConfig, resolvedStartConfig } = opts.getConfig()
    session = new StartRsbuildCompilerSession({
      framework: opts.corePluginOpts.framework,
      mode: dev ? 'dev' : 'build',
      root: resolvedStartConfig.root,
      srcDirectory: resolvedStartConfig.srcDirectory,
      environments: opts.environments,
      rsc: opts.corePluginOpts.rsc,
      rscLayer: rscEnabled ? RSBUILD_RSC_LAYERS.rsc : undefined,
      generateFunctionId: opts.startPluginOpts.serverFns?.generateFunctionId,
      codeSplittingOptions: startConfig.router.codeSplittingOptions,
      importProtection: startConfig.importProtection,
      routes: generator.routes,
      isEntry: opts.isEntry,
    })
    return session
  }

  // the client's route tree without its server-only routes (J2.15)
  api.transform(
    {
      test: (resource: string) =>
        path.normalize(resource) === generator.clientRouteTree.path(),
      environments: [RSBUILD_ENVIRONMENT_NAMES.client],
      order: 'pre',
    },
    () => generator.clientRouteTree.code(),
  )

  api.modifyRspackConfig((config, utils) => {
    const environment = opts.environments.find(
      (env) => env.name === utils.environment.name,
    )
    if (!environment) {
      return
    }
    const s = ensureSession()
    s.env(environment.name).transformImport = transformImportRules(
      utils.environment.config.source.transformImport,
    )
    const rules = (config.module.rules ??= [])
    const loaderRules: Array<Rspack.RuleSetRule> = [
      {
        test: JS_FILE_RE,
        enforce: 'pre',
        use: [
          { loader: loaderPath, options: { environment: environment.name } },
        ],
      },
      // extracted-export outputs of the route splitter are side-effect free (Rspack
      // matches the regex against the query with its leading `?`)
      {
        test: JS_FILE_RE,
        resourceQuery: /tsr-split=export~/,
        sideEffects: false,
      },
    ]
    if (s.start.ip) {
      loaderRules.push(
        {
          test: LATE_PASS_RE,
          enforce: 'post',
          use: [
            {
              loader: loaderPath,
              options: { environment: environment.name, pass: 'late' },
            },
          ],
        },
        // the import-protection runtime only; edge modules are analysed by the bundler
        {
          test: /[\\/]import-protection[\\/][^\\/]+[\\/]runtime\.mjs$/,
          sideEffects: false,
        },
        // an edge module is JavaScript whatever the importer's import attributes say of the
        // module it stands in for (`with { type: 'json' }` would make Rspack parse it as JSON)
        {
          test: /[\\/]import-protection[\\/][^\\/]+[\\/]edge\.[^\\/]+\.mjs$/,
          type: 'javascript/esm',
          // dev: Rspack builds an edge module only for an import its importer
          // kept after SWC, which confirms a pending violation
          use: dev
            ? [
                {
                  loader: loaderPath,
                  options: { environment: environment.name, pass: 'edge' },
                },
              ]
            : [],
        },
      )
    }
    rules.unshift(...loaderRules)
    config.plugins.push(
      createStartHostPlugin({
        session: s,
        environment,
        rspack: utils.rspack,
        writeVirtualModule: (file, content) =>
          opts.writeVirtualModule(environment.name, file, content),
        generator,
        clientRouteTree:
          environment.type === 'client' ? generator.clientRouteTree : undefined,
        onServerFnsReplayed: opts.onServerFnsChange,
      }),
    )
  })

  return {
    session: () => session,
    resolverModule: () => ensureSession().resolverModule(),
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
