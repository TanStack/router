/**
 * Rspack / webpack host of the router compiler (DESIGN §4.2): `apply`
 * installs the loader rule for route modules (env and derived ids), the
 * `sideEffects: false` rule for extracted-export outputs, the one
 * invalidation operation on `watchRun`, and the mode from the compiler's
 * options (never `process.env.NODE_ENV`). HMR style is always `'webpack'`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from '../core/config'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '../core/router-plugin-context'
import { RouterCompiler, normalizePath } from './session'
import { LOADER_REGISTRY, createLoaderImpl } from './loader'
import type { LoaderImpl } from './loader'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'

export type WebpackPluginOptions = Partial<Config> | (() => Partial<Config>)

/** The parts of a webpack / Rspack compiler the host uses. */
export interface CompilerLike {
  name?: string
  context?: string
  options: {
    mode?: 'development' | 'production' | 'none'
    target?: unknown
    module: { rules: Array<unknown> }
  }
  hooks: {
    beforeRun: { tap: (name: string, fn: () => void) => void }
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
 * The router compiler as a webpack / Rspack plugin (route splitting and
 * route HMR in `development` mode on client compilers).
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
        hmrStyle: 'webpack',
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
      registry.set(
        instance,
        createLoaderImpl(session, { name: envName, type: envType }),
      )
      const isRouteFile = (resource: string) =>
        JS_FILE_RE.test(resource) &&
        session.routeEntry(normalizePath(resource)) !== null
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
      const unsubscribe = onRoutesChanged(
        routerPluginContext,
        (next, previous) => {
          for (const file of changedRoutePaths(next, previous)) {
            void session.invalidate(file, 'registry')
          }
        },
      )
      compiler.hooks.beforeRun.tap(PLUGIN_NAME, () => {
        session.warnings.reset()
      })
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
