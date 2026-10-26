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
import { getConfig } from '../core/config'
import {
  changedRoutePaths,
  onRoutesChanged,
} from '../core/router-plugin-context'
import { RouterCompiler, normalizePath, resourceId } from './session'
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
  webpack?: { WebpackError?: new (message: string) => Error }
  hooks: {
    thisCompilation?: {
      tap: (name: string, fn: (compilation: CompilationLike) => void) => void
    }
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

/** The parts of a compilation the eager-export check reads (webpack and Rspack). */
export interface CompilationLike {
  hooks: { processAssets: { tap: (name: string, fn: () => void) => void } }
  chunks: Iterable<{ canBeInitial: () => boolean }>
  chunkGraph: {
    getChunkModules: (chunk: unknown) => Array<ModuleLike>
  }
  warnings: Array<Error>
}

interface ModuleLike {
  resource?: string
  /** Inner modules of a concatenated module. */
  modules?: Array<ModuleLike>
  identifier?: () => string
}

const PLUGIN_NAME = 'tanstack-router:compiler'
const EXTRACTED_EXPORT_RE = /[?&]tsr-split=export~([^&#]+)/

/**
 * Warns once per (route file, export) when an extracted-export output
 * (page code the splitter moved out of the route module) ends up in an
 * initial chunk: a module loaded with the entry imports it through the
 * route file, so it is eager whatever the splitter did (J2.8: the user
 * is told, the build goes on).
 */
export function warnEagerExports(
  compilation: CompilationLike,
  makeError: (message: string) => Error,
): void {
  const seen = new Set<string>()
  for (const chunk of compilation.chunks) {
    if (!chunk.canBeInitial()) {
      continue
    }
    const modules: Array<ModuleLike> = []
    for (const m of compilation.chunkGraph.getChunkModules(chunk)) {
      modules.push(m, ...(m.modules ?? []))
    }
    for (const m of modules) {
      const id = resourceId(m.resource ?? m.identifier?.() ?? '')
      const match = EXTRACTED_EXPORT_RE.exec(id)
      if (!match) {
        continue
      }
      const file = normalizePath(id.slice(0, id.indexOf('?')))
      const name = decodeURIComponent(match[1]!)
      const key = `${file}\0${name}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      compilation.warnings.push(
        makeError(
          `[tanstack-router] The export \`${name}\` of "${file}" loads with the entry chunk, not with the route's split code: a module of the entry imports it through the route file. Move it to its own module, or declare "sideEffects": false in package.json so the bundler can bypass the route file.`,
        ),
      )
    }
  }
}
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
            warnEagerExports(compilation, (m) => new WebpackError(m))
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
