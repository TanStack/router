/**
 * Rspack / webpack host of the router compiler: `apply`
 * installs the loader rule (every JS module outside `node_modules`: the
 * loader compiles route modules, env and derived ids, and passes the rest
 * through), the `sideEffects: false` rule for extracted-export outputs, the
 * one invalidation operation on `watchRun` and on registry changes, whose
 * stale set the compiler takes at `finishMake` (`StaleSetDrain`), the plans
 * of the route modules a persistent cache restores (checked at the first
 * `finishMake`), and the mode from the compiler's options (never
 * `process.env.NODE_ENV`). HMR style is always `'webpack'`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXTRACTED_EXPORT_QUERY_RE,
  StaleSetDrain,
  displayPath,
  emittedMapTexts,
  identify,
  initialChunkResources,
  locateDiagnostics,
  normalizePath,
  pathsOf,
  reportingFailure,
  restorePlans,
  warnEagerExports,
  webpackImporters,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'
import { getConfig } from '../core/config'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '../core/router-plugin-context'
import { RouterCompiler } from './session'
import {
  LOADER_REGISTRY,
  LOCATED_DIAGNOSTICS,
  PLAN_BUILD_INFO_FIELD,
  createLoaderImpl,
} from './loader'
import type { LoaderImpl, PersistedModules } from './loader'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type {
  EmittedMapsCompilerLike,
  PersistedPlan,
  IdleCompilerLike,
  InitialChunksLike,
  RebuildCompilationLike,
} from '@tanstack/router-utils/compiler'

type WebpackPluginOptions = Partial<Config> | (() => Partial<Config>)

/** The parts of a webpack / Rspack compiler the host uses. */
export interface CompilerLike extends IdleCompilerLike {
  name?: string
  /** In watch mode: the files changed since the last compilation, as one starts. */
  modifiedFiles?: ReadonlySet<string>
  watchMode?: boolean
  /** The project root (`context`). */
  context: string
  options: {
    mode?: 'development' | 'production' | 'none'
    target?: unknown
    module: { rules: Array<unknown> }
    cache?: unknown
  }
  webpack?: { WebpackError?: new (message: string) => Error }
  hooks: {
    thisCompilation?: {
      tap: (name: string, fn: (compilation: CompilationLike) => void) => void
    }
    beforeRun: { tap: (name: string, fn: () => void) => void }
    make: {
      tap: (
        name: string,
        fn: (compilation: { compiler?: unknown }) => void,
      ) => void
    }
    finishMake: {
      tapPromise: (
        name: string,
        fn: (compilation: {
          compiler?: unknown
          errors: Array<Error>
          modules: Iterable<ModuleLike>
        }) => Promise<void>,
      ) => void
    }
    afterDone: { tap: (name: string, fn: () => void) => void }
    watchRun: {
      tapPromise: (
        name: string,
        fn: (compiler: {
          modifiedFiles?: ReadonlySet<string>
          removedFiles?: ReadonlySet<string>
        }) => Promise<void>,
      ) => void
    }
    watchClose: { tap: (name: string, fn: () => void) => void }
    shutdown: { tapPromise: (name: string, fn: () => Promise<void>) => void }
  }
}

/** The parts of a module the stale-set drain and the plan restore use. */
interface ModuleLike {
  identifier: () => string
  resource?: string
  buildInfo?: Record<string, unknown>
}

/** The parts of a compilation the host uses (webpack and Rspack). */
interface CompilationLike extends InitialChunksLike {
  hooks: {
    processAssets: { tap: (name: string, fn: () => void) => void }
    afterSeal: { tap: (name: string, fn: () => void) => void }
    finishModules: {
      tap: (name: string, fn: (modules: Iterable<ModuleLike>) => void) => void
    }
  }
  errors: Array<Error>
  warnings: Array<Error>
}

const PLUGIN_NAME = 'tanstack-router:compiler'

const JS_FILE_RE = /\.[cm]?[jt]sx?$/
/** The files the loader rule leaves out: the loader never runs on a dependency's modules. */
const DEPENDENCY_RE = /[\\/]node_modules[\\/]/

let loaderPath: string | null = null

/** The static loader file of this package (`loader/index.cjs`), found from the package root. */
function routerLoaderPath(): string {
  if (loaderPath) {
    return loaderPath
  }
  // The package builds to ESM and CJS from this source: the CJS bundle has
  // `__filename` and no `import.meta`, the ESM bundle the reverse.
  const here =
    typeof __filename === 'string'
      ? __filename
      : // @ts-ignore TS1470 in the CJS declaration build
        fileURLToPath(import.meta.url)
  let dir = path.dirname(here)
  for (;;) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      ) as {
        name?: string
      }
      if (pkg.name === '@tanstack/router-plugin') {
        loaderPath = path.join(dir, 'loader', 'index.cjs')
        return loaderPath
      }
    } catch {
      // no package.json here, or not a readable one: keep looking
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        '@tanstack/router-plugin: cannot locate the package root for its loader',
      )
    }
    dir = parent
  }
}

let instances = 0

function targetsServer(target: unknown): boolean {
  const list = Array.isArray(target) ? target : [target]
  return list.some(
    (t) => typeof t === 'string' && /^(node|async-node|electron-main)/.test(t),
  )
}

/**
 * The router compiler as a webpack / Rspack plugin (route splitting; route
 * HMR on client compilers in every mode but `production`).
 */
export function createRouterCompilerWebpackPlugin(
  options: WebpackPluginOptions | undefined,
  routerPluginContext: RouterPluginContext,
  bundler: 'rspack' | 'webpack',
): { apply: (compiler: CompilerLike) => void } {
  return {
    apply(compiler) {
      const userConfig = (
        typeof options === 'function'
          ? options()
          : getConfig(options ?? {}, process.cwd())
      ) as Config
      // (read before webpack and Rspack fill in their defaults: a
      // configuration without `mode` builds for production)
      const mode =
        (compiler.options.mode ?? 'production') === 'production'
          ? 'build'
          : 'dev'
      const session = new RouterCompiler({
        context: routerPluginContext,
        config: userConfig,
        root: compiler.context,
        bundler,
        mode,
      })
      const envType: 'client' | 'server' = targetsServer(
        compiler.options.target,
      )
        ? 'server'
        : 'client'
      const envName = compiler.name ?? envType
      if (!session.appliesTo(envType)) {
        return
      }
      const instance = `${bundler}-${++instances}`
      const registry = ((compiler as unknown as Record<string, unknown>)[
        LOADER_REGISTRY
      ] ??= new Map<string, LoaderImpl>()) as Map<string, LoaderImpl>
      const isRouteFile = (resource: string) =>
        JS_FILE_RE.test(resource) &&
        session.routeEntry(normalizePath(resource)) !== null
      // the bundler's cache outlives the process: route modules carry their
      // plan, which the first compilation checks for the modules restored
      const cache = compiler.options.cache as { type?: string } | undefined
      const persisted: PersistedModules | null =
        typeof cache === 'object' && cache.type !== 'memory'
          ? { compiled: new Set() }
          : null
      registry.set(
        instance,
        createLoaderImpl(
          session,
          { name: envName, type: envType },
          emittedMapTexts(
            compiler as unknown as EmittedMapsCompilerLike,
            mode,
            isRouteFile,
          ),
          persisted,
        ),
      )
      // the rule reads no mutable state: a module stays one module when its
      // file becomes a route or stops being one (the loader decides), so a
      // registry change rebuilds it in place (`StaleSetDrain`; Rspack never
      // calls a `rebuildModule` callback of a module whose rules match
      // otherwise)
      compiler.options.module.rules.unshift(
        {
          test: JS_FILE_RE,
          exclude: DEPENDENCY_RE,
          enforce: 'pre',
          use: [{ loader: routerLoaderPath(), options: { instance } }],
        },
        {
          test: JS_FILE_RE,
          resourceQuery: EXTRACTED_EXPORT_QUERY_RE,
          sideEffects: false,
        },
      )
      // the modules of the environment's stale set (the dependents of its
      // file events, the route files whose registry entry changed: the
      // bundler sees no file event for them) are built again in the
      // compilation that takes it
      const drain = new StaleSetDrain(session.caches, {
        tag: '[tanstack-router]',
        root: compiler.context,
      })
      drain.register(envName, compiler)
      const unsubscribe = onRoutesChanged(
        routerPluginContext,
        (next, previous) => {
          Promise.all(
            changedRoutePaths(next, previous).map((file) =>
              session.invalidate(file, 'registry'),
            ),
          )
            .catch((error: unknown) => {
              console.error(
                `[tanstack-router] invalidating after a route change failed:`,
                error,
              )
            })
            // (what the change made stale before a failure gets its compilation)
            .then(() => drain.registryChanged())
        },
      )
      compiler.hooks.beforeRun.tap(PLUGIN_NAME, () => {
        // one warning per file per run (J2.19): the session's ledger is
        // shared by every environment's compiler; the client's run starts it
        if (envType === 'client') {
          session.warnings.reset()
        }
      })
      const WebpackError = compiler.webpack?.WebpackError ?? Error
      /** A failed `watchRun` of ours, reported by the compilation it started (`reportingFailure`). */
      const failedBeforeCompilation: Array<Error> = []
      const failure = (what: string) => ({ tag: '[tanstack-router]', what })
      compiler.hooks.thisCompilation?.tap(PLUGIN_NAME, (compilation) => {
        compilation.errors.push(...failedBeforeCompilation.splice(0))
        persisted?.compiled.clear()
        // the loader's diagnostics at their positions: the bundlers keep
        // none of a loader's warning or error
        compilation.hooks.afterSeal.tap(PLUGIN_NAME, () =>
          locateDiagnostics(compilation, WebpackError, LOCATED_DIAGNOSTICS),
        )
        // a route file the loader rule leaves out is not split: say so once
        // per file (a routes package resolved without following symlinks,
        // a `physical()` mount of an installed package)
        compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
          for (const m of modules) {
            const resource = m.resource
            if (!resource || !DEPENDENCY_RE.test(resource)) {
              continue
            }
            const file = normalizePath(
              identify(webpackResourceId(resource)).path,
            )
            if (!isRouteFile(file)) {
              continue
            }
            const shown = displayPath(file, compiler.context)
            const message = `[tanstack-router] ${shown} is not code-split: it is a route file under node_modules, and the router plugin does not compile files there on webpack and Rspack. Keep route files outside node_modules to have them split.`
            if (session.warnings.once(file, { message })) {
              compilation.warnings.push(new WebpackError(message))
            }
          }
        })
        if (envType === 'client' && mode === 'build') {
          compilation.hooks.processAssets.tap(PLUGIN_NAME, () => {
            // an extracted-export output an initial chunk holds is eager
            // whatever the splitter did: say so (J2.8)
            warnEagerExports(
              initialChunkResources(compilation).map(webpackResourceId),
              'webpack',
              session.warnings,
              (m) => compilation.warnings.push(new WebpackError(m)),
              webpackImporters(compilation as never, webpackResourceId),
              {
                root: compiler.context,
                routeTree: userConfig.generatedRouteTree,
              },
            )
          })
        }
      })
      // edits and removals, invalidated before the compilation starts (all
      // at once: calls for one path queue in the core)
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, (c) =>
        reportingFailure(
          compiler,
          failedBeforeCompilation,
          failure('Finding the routes the changed files affect'),
          async () => {
            const changed = [...(c.modifiedFiles ?? [])].map(
              (f) => [f, 'change'] as const,
            )
            const removed = [...(c.removedFiles ?? [])].map(
              (f) => [f, 'unlink'] as const,
            )
            if (changed.length > 0 || removed.length > 0) {
              drain.caused(envName)
            }
            await Promise.all(
              [...changed, ...removed].map(([file, kind]) =>
                session.invalidate(normalizePath(file), kind),
              ),
            )
          },
        ),
      )
      // (child compilers take the parent's `finishMake` taps)
      compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
        if (compilation.compiler === compiler) {
          drain.building(
            envName,
            [...(compiler.modifiedFiles ?? [])].map(normalizePath),
          )
        }
      })
      // a compiler's first compilation restores the modules of an earlier
      // process from the bundler's cache (built under the route list of
      // then): their plans are checked, a stale one's modules are built
      // again with the others of the set, and the environment has plans the
      // registry's changes reach from then on
      let restoring = persisted !== null
      compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, async (compilation) => {
        if (compilation.compiler === compiler) {
          await reportingFailure(
            compiler,
            compilation.errors,
            failure('Building the out-of-date route modules again'),
            async () => {
              if (restoring) {
                restoring = false
                await restoreRoutePlans(compilation.modules)
              }
              await drain.rebuild(
                envName,
                compilation as unknown as RebuildCompilationLike<ModuleLike>,
                (resource) =>
                  normalizePath(identify(webpackResourceId(resource)).path),
              )
            },
          )
        }
      })
      const restoreRoutePlans = async (modules: Iterable<ModuleLike>) => {
        const plans = new Map<string, PersistedPlan>()
        for (const m of modules) {
          const plan = m.buildInfo?.[PLAN_BUILD_INFO_FIELD]
          if (
            typeof plan === 'string' &&
            m.resource &&
            !persisted!.compiled.has(m.resource)
          ) {
            plans.set(plan, JSON.parse(plan) as PersistedPlan)
          }
        }
        const stale = await restorePlans(
          session.caches,
          plans.values(),
          session.host,
        )
        for (const file of pathsOf(stale, envName)) {
          session.caches.stale.add(envName, file)
        }
      }
      // what became stale after a compilation's drain (a registry change
      // published meanwhile, a compile overtaken) gets another one
      compiler.hooks.afterDone.tap(PLUGIN_NAME, () => {
        drain.compiled(envName)
      })
      // the session lives as long as the compiler: until it shuts down
      // (`compiler.close()`, after a one-shot `run()` too) or stops watching
      // (a dev middleware closes its watching, not the compiler); the
      // context outlives both (the separate plugins share the module's)
      compiler.hooks.shutdown.tapPromise(PLUGIN_NAME, () => {
        unsubscribe()
        return Promise.resolve()
      })
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        unsubscribe()
      })
    },
  }
}
