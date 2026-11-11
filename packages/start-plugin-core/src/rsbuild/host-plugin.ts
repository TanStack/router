/**
 * The Rspack plugin of one Start environment compiler: installs the loader
 * implementation on the compiler, the generator as a precondition of the
 * compilation (`beforeRun`/`watchRun`), the intake of the file events into
 * the one invalidation operation (`watchRun`, `make`), the `finishMake`
 * drain of the environment's stale set and replay of plan, server-fn and import-protection
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

/**
 * Development: the warnings a compilation reports for the one before it,
 * which Rsbuild never printed (`before`: what that one reported, by
 * resource). Rspack reports a module's warnings only in the compilation that
 * built it, and the session reports a warning once per dev session (the
 * warning ledger), so a module the compilation kept, or built again, reports
 * none of them: each recorded warning of one of its modules that it does not
 * report itself (`built`: it built the module) is handed over. Also returns
 * what the compilation reports, by resource (its built modules' warnings and
 * the handed ones), for the compilation after it.
 */
export function handOverWarnings(
  before: ReadonlyMap<string, ReadonlyArray<LocatedDiagnostic>> | null,
  modules: Iterable<ModuleLike>,
  built: (resource: string) => boolean,
): {
  handed: Array<{ module: ModuleLike; warning: LocatedDiagnostic }>
  reported: Map<string, Array<LocatedDiagnostic>>
} {
  const handed: Array<{ module: ModuleLike; warning: LocatedDiagnostic }> = []
  const reported = new Map<string, Array<LocatedDiagnostic>>()
  for (const module of modules) {
    const resource = module.resource
    if (!resource) {
      continue
    }
    const own = built(resource)
      ? (
          (module.buildInfo?.[LOCATED_DIAGNOSTICS.field] ??
            []) as Array<LocatedDiagnostic>
        ).filter((d) => d.severity === 'warning')
      : []
    const missing = (before?.get(resource) ?? []).filter(
      (d) =>
        !own.some(
          (o) =>
            o.message === d.message &&
            o.line === d.line &&
            o.column === d.column,
        ),
    )
    for (const warning of missing) {
      handed.push({ module, warning })
    }
    if (own.length > 0 || missing.length > 0) {
      reported.set(resource, [...own, ...missing])
    }
  }
  return { handed, reported }
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
      // compilation clears (Rspack 2.2: a created file is never seen). A
      // layer's rule options make its child (`withOptions`: one per options
      // object, as Rspack merges a rule's `resolve` over the compiler's)
      let resolver: ReturnType<typeof compiler.resolverFactory.get> | undefined
      session.resolvers.set(
        environment.name,
        (dir, request, options) =>
          new Promise((resolve) => {
            try {
              resolver ??= compiler.resolverFactory.get('normal', {
                dependencyType: 'esm',
              })
              const resolving = options
                ? resolver.withOptions(options)
                : resolver
              resolving.resolve({}, dir, request, {}, (error, result) => {
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
      session.drain.register(environment.name, compiler)

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
        // a child compiler of this one (a worker or service-worker plugin's) takes
        // these taps but not the virtual files: its requests of them fail the build
        // with the violations they stand for (in this environment's compilation,
        // which Rsbuild prints), and resolve to nothing
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, params) => {
          if (compilation.compiler === compiler) {
            return
          }
          params.normalModuleFactory.hooks.beforeResolve.tapPromise(
            PLUGIN_NAME,
            async (data) => {
              const reports = await ipEnvOf()?.childCompilerRequest(
                data.request,
                data.contextInfo.issuer,
              )
              if (!reports) {
                return undefined
              }
              const target = currentCompilation ?? compilation
              for (const message of reports) {
                target.errors.push(new WebpackError(message))
              }
              return false
            },
          )
        })
      }

      const cache = compiler.options.cache
      env.persistsModules = typeof cache === 'object' && cache.type !== 'memory'
      env.recordMapText = emittedMapTexts(
        compiler,
        session.start.opts.mode,
        session.start.compiles,
      )

      let currentCompilation: Rspack.Compilation | null = null
      let reporterInstalled = false
      /**
       * Development: what this environment's last compilation reported,
       * until Rsbuild printed it: its modules' warnings and its
       * import-protection reports. Rsbuild
       * prints the last compilation of each environment once every
       * environment is done, so one a newer compilation replaced before that
       * is never printed (a cold start's client compile, when the generator
       * writes the route tree), and Rspack reports a module's warnings only
       * in the compilation that built it: the next compilation reports them
       * (`handOverWarnings`).
       */
      let unprinted: {
        compilation: Rspack.Compilation
        warnings: ReadonlyMap<string, ReadonlyArray<LocatedDiagnostic>>
        reports: Array<string>
      } | null = null
      /** Development: this compilation's import-protection reports, and its modules' warnings (theirs and the ones it reports for the one before), by resource. */
      let reports: Array<string> = []
      let warned: ReadonlyMap<
        string,
        ReadonlyArray<LocatedDiagnostic>
      > = new Map()
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

      /** A modified file's event (`CompilationFiles.eventOf`): edited, created, or a watched directory. */
      const eventOf = (file: string) =>
        session.files.eventOf(environment.name, file)
      // edits and removals of files the last compilation read, invalidated before this
      // compilation starts (a file's facts need no resolver, and a resolution that found a
      // removed file is stale): the modules of their stale dependents are built at its
      // `finishMake`
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async (c) => {
        if (
          environment.type === 'client' &&
          session.start.opts.mode === 'build'
        ) {
          // `build --watch`: each rebuild is a run (Rspack's `Watching` calls
          // no `beforeRun`); the client compiles first
          session.start.warnings.reset()
        }
        const modified = [...(c.modifiedFiles ?? [])]
        const removed = [...(c.removedFiles ?? [])]
        if (modified.length > 0 || removed.length > 0) {
          session.drain.caused(environment.name)
        }
        ipEnvOf()?.beginBuild()
        await session.invalidateFileEvents([
          ...modified
            .filter(
              (file) => eventOf(file) === 'change' && !isPackageManifest(file),
            )
            .map((file) => ({ file, kind: 'change' as const })),
          ...removed.map((file) => ({ file, kind: 'unlink' as const })),
        ])
        await opts.generator.watchRun(modified, removed)
      })
      // created files, invalidated once Rspack's resolver forgot what it found in the last
      // compilation (at `make`, before the modules build; a new file may take resolutions):
      // the modules of their stale dependents are built at this compilation's `finishMake`
      compiler.hooks.make.tapPromise(PLUGIN_NAME, async (compilation) => {
        if (compilation.compiler !== compiler) {
          return
        }
        // Rspack reports no event for a file created while nothing depended on it (a
        // target deleted and recreated between edits): missing-file facts are read again
        session.forgetMisses()
        const modified = [...(compiler.modifiedFiles ?? [])]
        await session.invalidateFileEvents(
          modified
            .filter(
              (file) => eventOf(file) === 'add' || isPackageManifest(file),
            )
            .map((file) => ({
              file,
              kind: isPackageManifest(file)
                ? ('change' as const)
                : ('add' as const),
            })),
        )
        session.drain.building(environment.name, modified.map(normalizePath))
      })
      // a registry change (the generator published new route ids): its files
      // are stale in each environment (the session listens once for all
      // compilers)
      const unsubscribeRoutes = session.listenToRoutes(opts.generator)

      // (the context outlives the compiler: a second `build()` of the
      // Rsbuild instance creates another one)
      compiler.hooks.shutdown.tapPromise(PLUGIN_NAME, () => {
        unsubscribeRoutes()
        return Promise.resolve()
      })
      compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
        void opts.generator.close()
      })

      compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
        if (opts.onDevCompileDone) {
          unprinted = {
            compilation: stats.compilation,
            warnings: warned,
            reports,
          }
        }
        const changed = session.files.record(
          environment.name,
          stats.compilation.fileDependencies as Iterable<string>,
          stats.compilation.contextDependencies as Iterable<string>,
        )
        if (session.start.opts.mode === 'dev') {
          if (changed) {
            session.retain(environment.name)
          }
        } else if (!compiler.watchMode) {
          // a production build's end: nothing compiles in this environment any more
          session.release(environment.name)
        }
      })

      // what became stale after this compilation's drain (another environment's event, a
      // registry change, a compile overtaken) is built by another one; once the compiler is
      // idle (in `done` Rspack has not marked it so: a compilation asked for there would
      // start inside it)
      compiler.hooks.afterDone.tap(PLUGIN_NAME, () => {
        session.drain.wake()
      })

      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        currentCompilation = compilation
        env.compiled.clear()
        reports = []
        warned = new Map()
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
            reportUnprinted(compilation, modules as Iterable<ModuleLike>),
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
       * and its modules' warnings `compilation` does not report itself
       * (`handOverWarnings`).
       */
      function reportUnprinted(
        compilation: Rspack.Compilation,
        modules: Iterable<ModuleLike>,
      ): void {
        const from = unprinted
        for (const message of from?.reports ?? []) {
          if (!reports.includes(message)) {
            reports.push(message)
            compilation.warnings.push(new WebpackError(message))
          }
        }
        const { handed, reported } = handOverWarnings(
          from?.warnings ?? null,
          modules,
          (resource) => env.compiled.has(resource),
        )
        for (const { module, warning } of handed) {
          compilation.warnings.push(
            locatedError(WebpackError, module, warning, LOCATED_DIAGNOSTICS),
          )
        }
        warned = reported
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

      // the drain and the replay of this compilation's modules (built now or restored from
      // the persistent cache): the plans of restored modules, then the modules of the
      // environment's stale set built again (a restored module whose plan read facts that
      // changed since, or no plan of this configuration, is in it; so are the dependents an
      // invalidation found stale), then the environment's server-fn snapshot and the
      // import-protection records. So is built again, with `allowImport`, a
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
          if (
            !session.files.compiled(environment.name) &&
            env.persistsModules
          ) {
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
            await session.restorePlans(environment.name, restored)
          }
          await session.drain.rebuild(
            environment.name,
            compilation,
            (r) => identify(canonicalResource(r)).path,
          )
          const ipEnv = ipEnvOf()
          // a compiler's first compilation judges what it restored: its modules'
          // import-protection records are replayed first, the modules to judge
          // again are rebuilt before the server-fn snapshot
          const judgesRestored =
            ipEnv !== null && !session.files.compiled(environment.name)
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
            // a module compiled as its own violation before the edges of a
            // restored exempt importer were replayed gets the real module
            for (const resource of env.persistsModules ? env.compiled : []) {
              if (ipEnv.selfAllowedNow(canonicalResource(resource))) {
                unjudged.add(resource)
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
