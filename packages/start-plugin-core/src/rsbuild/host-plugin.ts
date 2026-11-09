/**
 * The Rspack plugin of one Start environment compiler: installs the loader
 * implementation on the compiler, the generator as a precondition of the
 * compilation (`beforeRun`/`watchRun`), the one invalidation operation of
 * the file events (`watchRun`, `make`), the `finishMake` replay of plan, server-fn and import-protection
 * `buildInfo` (persistent cache), the import-protection build reports
 * (`processAssets` witness) and dev reports (`finishModules`),
 * the custom server-fn id patching, and the client route tree rebuild when
 * its pruned routes change without the tree file changing.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  compilerCacheKey,
  emittedMapTexts,
  identify,
  initialChunkResources,
  invalidateFiles,
  locateDiagnostics,
  locatedError,
  normalizePath,
  rebuildModules,
  warnEagerExports,
  webpackImporters,
} from '@tanstack/router-utils/compiler'
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/violations'
import {
  readRspackWitness,
  rspackGraphView,
} from '../import-protection/witness'
import {
  LOCATED_DIAGNOSTICS,
  PLAN_BUILD_INFO_FIELD,
  SERVER_FN_BUILD_INFO_FIELD,
  canonicalResource,
} from './compiler-session'
import { LOADER_REGISTRY } from './loader-registry'
import type { LoaderImpl } from './compiler-loader'
import type {
  ServerFnBuildInfo,
  StartRsbuildCompilerSession,
} from './compiler-session'
import type { StartCompilerEnvironment } from '../compiler/session'
import type { RsbuildRouteGenerator } from './router-generator'
import type { ServerFnFact } from '../server-fns/registry'
import type { ImportGraphView } from '../import-protection/graph-trace'
import type {
  LocatedDiagnostic,
  PersistedPlan,
} from '@tanstack/router-utils/compiler'
import type {
  RsbuildPluginAPI,
  Rspack,
  rspack as rspackNamespaceType,
} from '@rsbuild/core'

type RspackNamespace = typeof rspackNamespaceType

interface StartHostPluginOptions {
  session: StartRsbuildCompilerSession
  environment: StartCompilerEnvironment
  rspack: RspackNamespace
  /** Writes a virtual module file of this environment (import-protection edge modules). */
  writeVirtualModule: (file: string, content: string) => void
  generator: RsbuildRouteGenerator
  /** The client route tree module (client environment only): rebuilt when its pruned routes change. */
  clientRouteTree?: { path: () => string; version: () => number }
  /** After the `finishMake` replay rebuilt the registry (the resolver virtual module is rewritten). */
  onServerFnsReplayed: () => void
  /**
   * Development: Rsbuild's `onDevCompileDone`, which tells the compilations
   * Rsbuild printed (`handOverWarnings`).
   */
  onDevCompileDone?: RsbuildPluginAPI['onDevCompileDone']
}

const PLUGIN_NAME = 'tanstack-start:compiler'

const require = createRequire(import.meta.url)

const COMPILER_PACKAGES = [
  '@tanstack/start-plugin-core',
  '@tanstack/router-plugin',
  '@tanstack/router-utils',
]

/** The compilation's graph view; a compilation Rspack dropped (a stale read after a rebuild) answers nothing. */
function guardedGraphView(compilation: Rspack.Compilation): ImportGraphView {
  const view = rspackGraphView(compilation as never, canonicalResource)
  return {
    importers(id) {
      try {
        return view.importers(id)
      } catch {
        return []
      }
    },
    isEntry(id) {
      try {
        return view.isEntry(id)
      } catch {
        return false
      }
    },
  }
}

interface ModuleLike {
  resource?: string
  buildInfo?: Record<string, unknown>
  layer?: string | null
  identifier: () => string
}

/** Adds the server fns a module's `buildInfo` records to a snapshot of the registry. */
function addServerFns(
  snapshot: Map<string, ReadonlyArray<ServerFnFact>>,
  info: Record<string, unknown>,
): void {
  const fns = info[SERVER_FN_BUILD_INFO_FIELD] as ServerFnBuildInfo | undefined
  if (fns?.version === 4) {
    snapshot.set(fns.canonicalId, fns.facts)
  }
}

/**
 * Whether Rspack's native `file` is a `package.json`: its edit re-resolves
 * what it may redirect, asked once Rspack's resolver forgot the old file
 * (at `make`). Native separators: Windows paths have backslashes.
 */
export function isPackageManifest(file: string): boolean {
  return normalizePath(file).endsWith('/package.json')
}

export function createStartHostPlugin(opts: StartHostPluginOptions): {
  apply: (compiler: Rspack.Compiler) => void
} {
  const { session, environment, rspack } = opts
  const env = session.env(environment.name)
  /**
   * This environment's import protection, looked up when a hook runs (not
   * held by the hooks): the session releases it once the environment's
   * build is finished.
   */
  const ipEnvOf = () =>
    session.start.ip?.env(environment.name, environment.type) ?? null
  return {
    apply(compiler) {
      const { Compilation, WebpackError } = rspack
      // A persistent cache holds this compiler's outputs and restores them
      // without compiling (Rsbuild's `buildCache` keys on the app's
      // `package.json`, config and tsconfig; `tools.rspack` may set its own).
      const persistent = compiler.options.cache
      if (typeof persistent === 'object' && persistent.type === 'persistent') {
        const key = compilerCacheKey(
          COMPILER_PACKAGES.map((name) =>
            require.resolve(`${name}/package.json`),
          ),
        )
        persistent.version = `${persistent.version ?? ''}-${key}`
      }
      ;(compiler as unknown as Record<string, unknown>)[LOADER_REGISTRY] = ((
        ctx,
        source,
        inputMap,
        options,
      ) => session.compile(ctx, source, inputMap, options)) satisfies LoaderImpl

      // the session reads files through the compiler's input file system (virtual modules included)
      const inputFs = compiler.inputFileSystem
      if (inputFs) {
        session.inputFileSystems.set(
          environment.name,
          (file) =>
            new Promise((resolve) => {
              try {
                inputFs.readFile(file, (error, data) => {
                  resolve(
                    error || data == null
                      ? null
                      : Buffer.isBuffer(data)
                        ? data.toString('utf8')
                        : String(data),
                  )
                })
              } catch {
                resolve(null)
              }
            }),
        )
      }
      // a loader's `getResolve()` resolver, without the resolve context that
      // records what it looks at as dependencies of the module compiling. Got
      // (`esm`: the resolver of the imports it analyses, with their `exports` conditions)
      // at the first resolution, in a compilation: one got before the
      // compiler's first compilation keeps a file system cache that no
      // compilation clears (Rspack 2.2: a created file is never seen)
      let resolver: ReturnType<typeof compiler.resolverFactory.get> | undefined
      session.resolvers.set(
        environment.name,
        (dir, request) =>
          new Promise((resolve) => {
            try {
              resolver ??= compiler.resolverFactory.get('normal', {
                dependencyType: 'esm',
              })
              resolver.resolve({}, dir, request, {}, (error, result) => {
                resolve(
                  !error && typeof result === 'string'
                    ? canonicalResource(result)
                    : null,
                )
              })
            } catch {
              resolve(null)
            }
          }),
      )
      /**
       * The changed files of the compilation this compiler is starting, open
       * during its `watchRun`. Rspack's `Watching` hands the compiler its own
       * set (`this.compiler.modifiedFiles = this.#collectedChangedFiles`), calls
       * `watchRun`, then `compiler.compile()`, whose `#build` reads the set
       * (`instance.rebuild(Array.from(this.modifiedFiles || []), …)`):
       * packages/rspack/src/Watching.ts L310/316/347 and Compiler.ts
       * L790/800/845 at v2.1.1, L313/327/359 and L798/808/857 at v2.2.9,
       * L326/340/372 and L805/815/864 at v2.3.0. Typed `ReadonlySet`: no
       * official way for a plugin to add changed files exists (a stale
       * dependent added here is built by this compilation, not a second one).
       */
      let starting: Set<string> | null = null
      session.rebuilders.set(environment.name, (paths) => {
        if (!starting) {
          invalidateFiles(compiler, paths)
          return
        }
        for (const file of paths) {
          starting.add(path.normalize(file))
        }
      })

      // import-protection edge modules are virtual files of this environment, written when
      // they are defined (the importer's compile); an importer
      // restored from the persistent cache in a new process requests a module nothing
      // defined: the request carries its content, which defines it before it resolves
      if (session.start.ip) {
        const ip = session.start.ip
        ip.onEdgeModule((file, load, ref) => {
          if (ref.env === environment.name) {
            opts.writeVirtualModule(file, load.code)
          }
        })
        compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory) => {
          factory.hooks.beforeResolve.tap(PLUGIN_NAME, (data) => {
            ip.define(data.request)
          })
        })
      }

      const cache = compiler.options.cache
      env.persistsModules = typeof cache === 'object' && cache.type !== 'memory'
      env.recordMapText = emittedMapTexts(
        compiler,
        session.start.opts.mode,
        session.start.compiles,
      )

      /** The files of the last compilation (a modified file outside them is a created one: an `add`, which re-resolves
       * imports that failed to resolve before). */
      let knownFiles: ReadonlySet<string> | null = null
      /**
       * The directories the last compilation watched (`contextDependencies`:
       * Tailwind CSS adds the ones it scans): Rspack reports such a directory
       * as modified when anything below it changes, which creates no file of
       * its name. A created file a resolution may take is reported itself (a
       * missing dependency).
       */
      let knownDirectories: ReadonlySet<string> = new Set()
      let currentCompilation: Rspack.Compilation | null = null
      let reporterInstalled = false
      /**
       * Development: what this environment's last compilation reported,
       * until Rsbuild printed it: the modules it compiled (their warnings are
       * in their `buildInfo`) and its import-protection reports. Rsbuild
       * prints the last compilation of each environment once every
       * environment is done, so one a newer compilation replaced before that
       * is never printed (a cold start's client compile, when the generator
       * writes the route tree), and Rspack reports a module's warnings only
       * in the compilation that built it: the next compilation reports them
       * (`handOverWarnings`).
       */
      let unprinted: {
        compilation: Rspack.Compilation
        compiled: Set<string>
        reports: Array<string>
      } | null = null
      /** Development: this compilation's import-protection reports, and the modules it reports for the one before. */
      let reports: Array<string> = []
      let handed: Array<string> = []
      opts.onDevCompileDone?.(({ stats }) => {
        const printed = 'stats' in stats ? stats.stats : [stats]
        if (printed.some((one) => one.compilation === unprinted?.compilation)) {
          unprinted = null
        }
      })
      let clientTreeBuiltAt = -1

      compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
        // one warning per file per run (J2.19): the session's ledger is
        // shared by every environment's compiler; the client's run starts it
        if (environment.type === 'client') {
          session.start.warnings.reset()
        }
        await opts.generator.beforeRun()
      })

      const isKnown = (file: string) => !knownFiles || knownFiles.has(file)
      // edits and removals of files the last compilation read, invalidated before this
      // compilation starts: the modules of their stale dependents are built with them (a
      // file's facts need no resolver, and a resolution that found a removed file is stale)
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        const modified = [...(c.modifiedFiles ?? [])]
        const removed = [...(c.removedFiles ?? [])]
        ipEnvOf()?.beginBuild()
        starting = (c.modifiedFiles as Set<string> | undefined) ?? null
        try {
          await session.invalidateFileEvents([
            ...modified
              .filter((file) => isKnown(file) && !isPackageManifest(file))
              .map((file) => ({ file, kind: 'change' as const })),
            ...removed.map((file) => ({ file, kind: 'unlink' as const })),
          ])
        } finally {
          starting = null
        }
        await opts.generator.watchRun(modified, removed)
      })
      // created files, invalidated once Rspack's resolver forgot what it found in the last
      // compilation (at `make`, before the modules build; a new file may take resolutions):
      // the modules of their stale dependents are built by the next compilation
      compiler.hooks.make.tapPromise(PLUGIN_NAME, async (compilation) => {
        if (compilation.compiler !== compiler) {
          return
        }
        // Rspack reports no event for a file created while nothing depended on it (a
        // target deleted and recreated between edits): missing-file facts are read again
        session.forgetMisses()
        await session.invalidateFileEvents(
          [...(compiler.modifiedFiles ?? [])]
            .filter(
              (file) =>
                (!isKnown(file) && !knownDirectories.has(file)) ||
                isPackageManifest(file),
            )
            .map((file) => ({
              file,
              kind: isPackageManifest(file)
                ? ('change' as const)
                : ('add' as const),
            })),
        )
      })
      // a registry change (the generator published new route ids): Rspack sees
      // no file event for the files concerned, so it is told they changed and
      // builds them again. Before the first compilation finished nothing is
      // stale (the first publication lists every route; the modules are
      // built with it).
      opts.generator.onRoutesChanged((files) => {
        void session
          .registryChanged(files)
          .then((paths) => {
            if (session.compiledOnce) {
              invalidateFiles(compiler, paths)
            }
          })
          .catch((error: unknown) => {
            console.error(
              `[tanstack-start] invalidating after a route change failed:`,
              error,
            )
          })
      })

      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void opts.generator.close()
      })

      compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
        if (opts.onDevCompileDone) {
          unprinted = {
            compilation: stats.compilation,
            compiled: new Set([...env.compiled, ...handed]),
            reports,
          }
        }
        session.compiledOnce = true
        const deps = stats.compilation.fileDependencies
        knownFiles = new Set<string>(deps as Iterable<string>)
        knownDirectories = new Set<string>(
          stats.compilation.contextDependencies as Iterable<string>,
        )
        if (session.start.opts.mode === 'dev') {
          session.retain(environment.name, knownFiles)
        } else if (!compiler.watchMode) {
          // a production build's end: nothing compiles in this environment any more
          session.release(environment.name)
        }
      })

      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        currentCompilation = compilation
        env.compiled.clear()
        reports = []
        handed = []
        compilation.hooks.afterSeal.tap(PLUGIN_NAME, () =>
          locateDiagnostics(compilation, WebpackError, LOCATED_DIAGNOSTICS),
        )
        if (compiler.watchMode) {
          // Rspack watches the files the plans of the compilation's modules read (no
          // module depends on them: whether a change makes a module stale is the
          // invalidation's to decide), a file no output imports any more included
          compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
            const paths = new Set<string>()
            for (const m of modules) {
              const resource = (m as unknown as ModuleLike).resource
              if (resource) {
                paths.add(identify(canonicalResource(resource)).path)
              }
            }
            for (const file of session.dependencyFiles(
              environment.name,
              paths,
            )) {
              compilation.fileDependencies.add(path.normalize(file))
            }
          })
        }
        if (
          session.start.opts.mode === 'build' &&
          environment.type === 'client'
        ) {
          // an extracted-export output an initial chunk holds is eager
          // whatever the splitter did: say so once per file and export (J2.8)
          compilation.hooks.processAssets.tap(PLUGIN_NAME, () => {
            warnEagerExports(
              initialChunkResources(compilation as never).map(
                canonicalResource,
              ),
              'webpack',
              session.start.warnings,
              (m) => compilation.warnings.push(new WebpackError(m)),
              webpackImporters(compilation as never, canonicalResource),
              {
                root: session.start.opts.root,
                routeTree: opts.generator.clientRouteTree.path(),
              },
            )
          })
        }
        const ipEnv = ipEnvOf()
        if (ipEnv) {
          // Rspack's module graph is not readable while modules build (a loader asking for a
          // trace would abort the process): no graph until `finishModules`, when the
          // compilation's complete graph replaces it (traces built before use the edge index)
          ipEnv.graph = null
          if (session.start.opts.mode === 'dev') {
            if (!reporterInstalled) {
              reporterInstalled = true
              // no timers: `finishModules` is the completion event
              ipEnv.useDevReporter(
                {
                  warn: (message) => {
                    reports.push(message)
                    currentCompilation?.warnings.push(new WebpackError(message))
                  },
                },
                { setTimer: () => null, clearTimer: () => {} },
              )
            }
            compilation.hooks.finishModules.tapPromise(
              PLUGIN_NAME,
              async (modules) => {
                ipEnv.graph = guardedGraphView(compilation)
                if (session.start.ip!.config.log === 'always') {
                  // modules this compilation kept without compiling them report again: an
                  // importer its violations, an edge module the pending ones it witnesses
                  for (const m of modules) {
                    const module = m as unknown as ModuleLike
                    if (!module.resource || env.compiled.has(module.resource)) {
                      continue
                    }
                    const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
                    if (record) {
                      await ipEnv.reportAgain(record)
                    } else {
                      await ipEnv.confirm(module.resource)
                    }
                  }
                }
                ipEnv.reporter?.flush(true)
              },
            )
          } else {
            compilation.hooks.processAssets.tapPromise(
              {
                name: PLUGIN_NAME,
                stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
              },
              async () => {
                const buildEnv = ipEnvOf()!
                const lookup = buildEnv.witness()
                const live = readRspackWitness(compilation as never, (res) =>
                  lookup(canonicalResource(res)),
                )
                const reports = await buildEnv.surviving(
                  live,
                  guardedGraphView(compilation),
                )
                for (const report of reports) {
                  ;(report.severity === 'error'
                    ? compilation.errors
                    : compilation.warnings
                  ).push(new WebpackError(report.message))
                }
              },
            )
          }
        }
        if (opts.onDevCompileDone) {
          // after import protection's dev reports (`flush`)
          compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) =>
            handOverWarnings(compilation, modules),
          )
        }
        if (session.start.allocator && session.start.opts.mode === 'build') {
          compilation.hooks.processAssets.tap(
            {
              name: PLUGIN_NAME,
              stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
            },
            () => patchFunctionIds(compilation),
          )
        }
      })

      /**
       * The warnings of the compilation before `compilation`, which Rsbuild
       * never printed (`unprinted`), reported by `compilation`: its
       * import-protection reports that `compilation` did not report again,
       * and the warnings of the modules it compiled that `compilation` kept
       * without compiling them (a module compiled again reported for itself).
       */
      function handOverWarnings(
        compilation: Rspack.Compilation,
        modules: Iterable<unknown>,
      ): void {
        const from = unprinted
        if (!from) {
          return
        }
        for (const message of from.reports) {
          if (!reports.includes(message)) {
            reports.push(message)
            compilation.warnings.push(new WebpackError(message))
          }
        }
        for (const m of modules) {
          const module = m as ModuleLike
          if (
            !module.resource ||
            !from.compiled.has(module.resource) ||
            env.compiled.has(module.resource)
          ) {
            continue
          }
          handed.push(module.resource)
          const records = module.buildInfo?.[LOCATED_DIAGNOSTICS.field] as
            | Array<LocatedDiagnostic>
            | undefined
          for (const d of records ?? []) {
            if (d.severity === 'warning') {
              compilation.warnings.push(
                locatedError(WebpackError, module, d, LOCATED_DIAGNOSTICS),
              )
            }
          }
        }
      }

      /** Custom server-fn ids: this environment's rank, patched before minification. */
      function patchFunctionIds(compilation: Rspack.Compilation): void {
        const { allocator, errors, warnings } = session.start.allocateIds(
          environment.type,
        )
        // once per run: every environment allocates the same custom ids, and
        // Rsbuild prints each environment's errors and warnings
        const once = (code: string, message: string) =>
          session.start.warnings.once('', { code, message })
        for (const error of errors) {
          if (once('function-id:error', error)) {
            compilation.errors.push(new WebpackError(error))
          }
        }
        for (const warning of warnings) {
          if (once('function-id:warning', warning)) {
            compilation.warnings.push(new WebpackError(warning))
          }
        }
        for (const asset of compilation.getAssets()) {
          if (!/\.[cm]?js$/.test(asset.name)) {
            continue
          }
          const code = asset.source.source().toString()
          if (!code.includes('__TSS_FN_ID_')) {
            continue
          }
          const patched = allocator.patch(code)
          if (patched.missing.length > 0) {
            compilation.errors.push(
              new WebpackError(
                `Server function ids could not be resolved in ${asset.name}: ${patched.missing.join(', ')}`,
              ),
            )
          }
          const source = new rspack.sources.ReplaceSource(asset.source)
          for (const edit of patched.edits) {
            source.replace(edit.start, edit.end - 1, edit.text)
          }
          compilation.updateAsset(asset.name, source)
        }
      }

      // the client route tree without its server-only routes: served by the host's transform
      // of the tree module; when its routes change without the file, the module is rebuilt
      if (opts.clientRouteTree && environment.type === 'client') {
        const tree = opts.clientRouteTree
        compiler.hooks.finishMake.tapPromise(
          { name: `${PLUGIN_NAME}:route-tree`, stage: -30 },
          async (compilation) => {
            if (compilation.compiler !== compiler) {
              return
            }
            const version = tree.version()
            if (version === clientTreeBuiltAt) {
              return
            }
            await rebuildModules(
              compilation,
              new Set([normalizePath(tree.path())]),
              canonicalResource,
            )
            clientTreeBuiltAt = version
          },
        )
      }

      // the replay of this compilation's modules (built now or restored from the persistent
      // cache): the plans of restored modules, the environment's server-fn snapshot and the
      // import-protection records. A restored module whose plan read facts that changed since
      // (or no plan of this configuration) is built again first. So is, with `allowImport`, a
      // restored edge module or a module that is its own violation: another session's answer
      // chose their state, and the build asks once per import anyway; and, in dev, a module
      // restored with violations or an edge module restored with pending ones: another
      // session reported them. Edge modules first: an answer brings the module it allows. Only
      // a compiler's first compilation restores modules (Rspack loads the cache's module graph
      // in a build, never in a rebuild)
      compiler.hooks.finishMake.tapPromise(
        { name: `${PLUGIN_NAME}:replay`, stage: -20 },
        async (compilation) => {
          if (compilation.compiler !== compiler) {
            return
          }
          if (!knownFiles && env.persistsModules) {
            const restored: Array<{
              plan: PersistedPlan
              layer: string | undefined
            }> = []
            for (const m of compilation.modules) {
              const module = m as unknown as ModuleLike
              const plan = module.buildInfo?.[PLAN_BUILD_INFO_FIELD]
              if (
                typeof plan === 'string' &&
                module.resource &&
                !env.compiled.has(module.resource)
              ) {
                restored.push({
                  plan: JSON.parse(plan) as PersistedPlan,
                  layer: module.layer ?? undefined,
                })
              }
            }
            const stale = await session.restorePlans(environment.name, restored)
            if (stale.size > 0) {
              await rebuildModules(
                compilation,
                stale,
                (r) => identify(canonicalResource(r)).path,
              )
            }
          }
          const ipEnv = ipEnvOf()
          // a compiler's first compilation judges what it restored: its modules'
          // import-protection records are replayed first, the modules to judge
          // again are rebuilt before the server-fn snapshot
          const judgesRestored = ipEnv !== null && !knownFiles
          if (judgesRestored) {
            const unjudged = new Set<string>()
            for (const m of compilation.modules) {
              const module = m as unknown as ModuleLike
              const ip = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
              if (
                ip &&
                module.resource &&
                !env.compiled.has(module.resource) &&
                ipEnv.unjudged(canonicalResource(module.resource), ip)
              ) {
                unjudged.add(module.resource)
              }
            }
            for (const m of compilation.modules) {
              const module = m as unknown as ModuleLike
              const ip = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
              if (ip && module.resource) {
                ipEnv.replay(canonicalResource(module.resource), ip)
              }
            }
            const unconfirmed = new Set<string>()
            for (const m of compilation.modules) {
              const resource = (m as unknown as ModuleLike).resource
              if (
                resource &&
                ipEnv.unconfirmed(resource, env.compiled.has(resource))
              ) {
                unconfirmed.add(resource)
              }
            }
            if (unconfirmed.size > 0) {
              await rebuildModules(compilation, unconfirmed, (r) => r)
            }
            if (unjudged.size > 0) {
              await rebuildModules(compilation, unjudged, (r) => r)
            }
          }
          // one read of each module's `buildInfo`: the server-fn snapshot and,
          // but in a first compilation (replayed above), the records
          const snapshot = new Map<string, ReadonlyArray<ServerFnFact>>()
          for (const m of compilation.modules) {
            const module = m as unknown as ModuleLike
            const info = module.buildInfo
            if (!info) {
              continue
            }
            const ip = info[RSPACK_BUILD_INFO_KEY]
            if (ipEnv && !judgesRestored && ip && module.resource) {
              ipEnv.replay(canonicalResource(module.resource), ip)
            }
            addServerFns(snapshot, info)
          }
          // the modules of child compilers (a worker's, a service worker's:
          // compiled as this environment's, done during `make`) call the
          // server fns they define too
          const children = [...compilation.children]
          for (const child of children) {
            children.push(...child.children)
            for (const m of child.modules) {
              const info = (m as unknown as ModuleLike).buildInfo
              if (info) {
                addServerFns(snapshot, info)
              }
            }
          }
          session.start.registry.replace(env, snapshot)
          opts.onServerFnsReplayed()
        },
      )
    },
  }
}
