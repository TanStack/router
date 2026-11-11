/**
 * Rspack / webpack host of the router compiler: `apply`
 * installs the loader rule (every JS module outside `node_modules`: the
 * loader compiles route modules, env and derived ids, and passes the rest
 * through), the `sideEffects: false` rule for extracted-export outputs, the
 * one invalidation operation on `watchRun` and on registry changes, whose
 * stale set the compiler takes at `finishMake` (`StaleSetDrain`), and the
 * mode from the compiler's options (never `process.env.NODE_ENV`). HMR style
 * is always `'webpack'`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXTRACTED_EXPORT_QUERY_RE,
  StaleSetDrain,
  emittedMapTexts,
  identify,
  initialChunkResources,
  locateDiagnostics,
  normalizePath,
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
  createLoaderImpl,
} from './loader'
import type { LoaderImpl } from './loader'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type {
  EmittedMapsCompilerLike,
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
  /** The project root (`context`). */
  context: string
  options: {
    mode?: 'development' | 'production' | 'none'
    target?: unknown
    module: { rules: Array<unknown> }
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
        fn: (compilation: { compiler?: unknown }) => Promise<void>,
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

/** The parts of a module the stale-set drain uses. */
interface ModuleLike {
  identifier: () => string
  resource?: string
}

/** The parts of a compilation the host uses (webpack and Rspack). */
interface CompilationLike extends InitialChunksLike {
  hooks: {
    processAssets: { tap: (name: string, fn: () => void) => void }
    afterSeal: { tap: (name: string, fn: () => void) => void }
  }
  errors: Array<Error>
  warnings: Array<Error>
}

const PLUGIN_NAME = 'tanstack-router:compiler'

const JS_FILE_RE = /\.[cm]?[jt]sx?$/

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
          exclude: /[\\/]node_modules[\\/]/,
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
      const drain = new StaleSetDrain(session.caches)
      drain.register(envName, compiler)
      const unsubscribe = onRoutesChanged(
        routerPluginContext,
        (next, previous) => {
          Promise.all(
            changedRoutePaths(next, previous).map((file) =>
              session.invalidate(file, 'registry'),
            ),
          ).then(
            () => drain.registryChanged(),
            (error: unknown) => {
              console.error(
                `[tanstack-router] invalidating after a route change failed:`,
                error,
              )
            },
          )
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
      compiler.hooks.thisCompilation?.tap(PLUGIN_NAME, (compilation) => {
        // the loader's diagnostics at their positions: the bundlers keep
        // none of a loader's warning or error
        compilation.hooks.afterSeal.tap(PLUGIN_NAME, () =>
          locateDiagnostics(compilation, WebpackError, LOCATED_DIAGNOSTICS),
        )
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
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
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
      })
      // (child compilers take the parent's `finishMake` taps)
      compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
        if (compilation.compiler === compiler) {
          drain.building(
            envName,
            [...(compiler.modifiedFiles ?? [])].map(normalizePath),
          )
        }
      })
      compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, async (compilation) => {
        if (compilation.compiler === compiler) {
          await drain.rebuild(
            envName,
            compilation as RebuildCompilationLike<ModuleLike>,
            (resource) =>
              normalizePath(identify(webpackResourceId(resource)).path),
          )
        }
      })
      // what became stale after a compilation's drain (a registry change
      // published meanwhile, a compile overtaken) gets another one
      compiler.hooks.afterDone.tap(PLUGIN_NAME, () => {
        drain.wake()
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
