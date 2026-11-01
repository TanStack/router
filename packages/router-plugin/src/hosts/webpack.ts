/**
 * Rspack / webpack host of the router compiler: `apply`
 * installs the loader rule for route modules (env and derived ids), the
 * `sideEffects: false` rule for extracted-export outputs, the one
 * invalidation operation on `watchRun`, and the mode from the compiler's
 * options (never `process.env.NODE_ENV`). HMR style is always `'webpack'`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  emittedMapTexts,
  initialChunkResources,
  invalidateFiles,
  normalizePath,
  pathsOf,
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
import { LOADER_REGISTRY, createLoaderImpl } from './loader'
import type { LoaderImpl } from './loader'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type {
  EmittedMapsCompilerLike,
  InitialChunksLike,
  WatchingCompilerLike,
} from '@tanstack/router-utils/compiler'

export type WebpackPluginOptions = Partial<Config> | (() => Partial<Config>)

/** The parts of a webpack / Rspack compiler the host uses. */
export interface CompilerLike extends WatchingCompilerLike {
  name?: string
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
    done: { tap: (name: string, fn: () => void) => void }
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
  }
}

/** The parts of a compilation the eager-export check reads (webpack and Rspack). */
interface CompilationLike extends InitialChunksLike {
  hooks: { processAssets: { tap: (name: string, fn: () => void) => void } }
  warnings: Array<Error>
}

const PLUGIN_NAME = 'tanstack-router:compiler'

const JS_FILE_RE = /\.[cm]?[jt]sx?$/

let loaderPath: string | null = null

/** The static loader file of this package (`loader/index.cjs`), found from the package root. */
export function routerLoaderPath(): string {
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
    const candidate = path.join(dir, 'package.json')
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          name?: string
        }
        if (pkg.name === '@tanstack/router-plugin') {
          loaderPath = path.join(dir, 'loader', 'index.cjs')
          return loaderPath
        }
      } catch {
        // keep looking
      }
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
      const mode = compiler.options.mode === 'production' ? 'build' : 'dev'
      const session = new RouterCompiler({
        context: routerPluginContext,
        config: userConfig,
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
      compiler.options.module.rules.unshift(
        {
          test: isRouteFile,
          enforce: 'pre',
          use: [{ loader: routerLoaderPath(), options: { instance } }],
        },
        {
          test: JS_FILE_RE,
          resourceQuery: /tsr-split=export~/,
          sideEffects: false,
        },
      )
      // a registry change: the one invalidation operation evicts the plans
      // of the route files whose entry changed; the bundler sees no file
      // event for them, so it is told they changed and builds them again
      // (rules re-matched: a file that was no route is one now). Before the
      // first compilation finished nothing is stale (the registry's first
      // publication lists every route; the modules are built with it).
      let compiled = false
      compiler.hooks.done.tap(PLUGIN_NAME, () => {
        compiled = true
      })
      const unsubscribe = onRoutesChanged(
        routerPluginContext,
        (next, previous) => {
          for (const file of changedRoutePaths(next, previous)) {
            void session
              .invalidate(file, 'registry')
              .then((res) => {
                if (compiled) {
                  invalidateFiles(compiler, [
                    file,
                    ...pathsOf([...res.evicted, ...res.dependents], envName),
                  ])
                }
              })
              .catch((error: unknown) => {
                console.error(
                  `[tanstack-router] invalidating ${file} after a route change failed:`,
                  error,
                )
              })
          }
        },
      )
      compiler.hooks.beforeRun.tap(PLUGIN_NAME, () => {
        // one warning per file per run (J2.19): the session's ledger is
        // shared by every environment's compiler; the client's run starts it
        if (envType === 'client') {
          session.warnings.reset()
        }
      })
      if (envType === 'client' && mode === 'build') {
        const WebpackError = compiler.webpack?.WebpackError ?? Error
        compiler.hooks.thisCompilation?.tap(PLUGIN_NAME, (compilation) => {
          compilation.hooks.processAssets.tap(PLUGIN_NAME, () => {
            // an extracted-export output an initial chunk holds is eager
            // whatever the splitter did: say so (J2.8)
            warnEagerExports(
              initialChunkResources(compilation).map(webpackResourceId),
              'webpack',
              session.warnings,
              (m) => compilation.warnings.push(new WebpackError(m)),
              webpackImporters(compilation as never, webpackResourceId),
            )
          })
        })
      }
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        const changed = [...(c.modifiedFiles ?? []).values()].map(
          (f) => [f, 'change'] as const,
        )
        const removed = [...(c.removedFiles ?? []).values()].map(
          (f) => [f, 'unlink'] as const,
        )
        for (const [file, kind] of [...changed, ...removed]) {
          await session.invalidate(normalizePath(file), kind)
        }
      })
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        unsubscribe()
      })
    },
  }
}
