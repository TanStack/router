/**
 * The Rspack plugin of one Start compiler (an Rsbuild environment, with the
 * compile environments of its layers: `StartRsbuildCompilerSession.envOf`):
 * installs the loader implementation on the compiler, the generator as a precondition of a
 * watch compilation (`watchRun`) and of a run Rsbuild dispatched no
 * `onBeforeBuild` for (`run`: `createCompiler().run()`), the intake of the file events into
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
  invariantDiagnostic,
  invariantViolated,
  isRecordedDiagnostic,
  langFromId,
  locateDiagnostics,
  locatedError,
  normalizePath,
  pathOfId,
  rebuildModules,
  rebuildModulesWhere,
  reportingFailure,
} from '@tanstack/router-utils/compiler'
import { RSPACK_BUILD_INFO_KEY } from '../import-protection/violations'
import { heldIn, outputKey } from '../import-protection/session'
import {
  readRspackWitness,
  rspackFilesIn,
  rspackGraphView,
} from '../import-protection/witness'
import {
  LOCATED_DIAGNOSTICS,
  PLAN_BUILD_INFO_FIELD,
  SERVER_FN_BUILD_INFO_FIELD,
  canonicalResource,
  isJsAsset,
  resourcePath,
} from './compiler-session'
import { LOADER_REGISTRY } from './loader-registry'
import type { LoaderImpl } from './compiler-loader'
import type {
  EnvState,
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
  /** Whether a run generates in the compiler's `run`: Rsbuild dispatched no `onBeforeBuild` (`createCompiler().run()`). */
  generatesInRun: () => boolean
  /** The client route tree module (client environment only): rebuilt when it is stale. */
  clientRouteTree?: {
    path: () => string
    stale: () => boolean
    version: () => number
  }
  /** After the `finishMake` replay rebuilt the registry (the resolver virtual module is rewritten). */
  onServerFnsReplayed: () => void
  /**
   * Development: Rsbuild's `onDevCompileDone`, which tells the compilations
   * Rsbuild printed (`handOverWarnings`).
   */
  onDevCompileDone?: RsbuildPluginAPI['onDevCompileDone']
  /**
   * Development: whether the map files this environment emits get the text
   * of the files they name (`emittedMapTexts`): something reads them. A
   * server environment's maps are read only from disk (Rsbuild runs its
   * bundles from memory, and Node never registers their maps, also with
   * `--enable-source-maps`): only when Rsbuild writes them there
   * (`dev.writeToDisk`), for a debugger.
   */
  fillMapTexts: boolean
}

const PLUGIN_NAME = 'tanstack-start:compiler'

const require = createRequire(import.meta.url)

const COMPILER_PACKAGES = [
  '@tanstack/start-plugin-core',
  '@tanstack/router-plugin',
  '@tanstack/router-utils',
]

interface ModuleLike {
  resource?: string
  buildInfo?: Record<string, unknown>
  layer?: string | null
  identifier: () => string
}

/**
 * Development: the warnings a compilation reports for the one before it,
 * which Rsbuild never printed (`before`: what that one reported, by module:
 * `keyOf`, its compile environment and resource). Rspack before 2.3.3
 * reports a module's warnings only in the compilation that built it (2.3.3
 * reports a kept module's again, which `reportHandedOver` drops), and the
 * session reports a warning once per dev session (the warning ledger), so a
 * module the compilation kept, or built again, reports none of them: each
 * recorded warning of one of its modules that it does not report itself
 * (`built`: it built the module) is handed over. Also returns what the
 * compilation reports, by module (its built modules' warnings and the handed
 * ones), for the compilation after it.
 */
export function handOverWarnings(
  before: ReadonlyMap<string, ReadonlyArray<LocatedDiagnostic>> | null,
  modules: Iterable<ModuleLike>,
  keyOf: (module: ModuleLike & { resource: string }) => string,
  built: (module: ModuleLike & { resource: string }) => boolean,
): {
  handed: Array<{ module: ModuleLike; warning: LocatedDiagnostic }>
  reported: Map<string, Array<LocatedDiagnostic>>
} {
  const handed: Array<{ module: ModuleLike; warning: LocatedDiagnostic }> = []
  const reported = new Map<string, Array<LocatedDiagnostic>>()
  for (const module of modules) {
    if (!module.resource) {
      continue
    }
    const one = module as ModuleLike & { resource: string }
    const key = keyOf(one)
    const own = built(one)
      ? (
          (module.buildInfo?.[LOCATED_DIAGNOSTICS.field] ??
            []) as Array<LocatedDiagnostic>
        ).filter((d) => d.severity === 'warning')
      : []
    const missing = (before?.get(key) ?? []).filter(
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
      reported.set(key, [...own, ...missing])
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
  const own = session.compiler(environment.name)
  /** The compile environment of a module of this compiler (`envOfModule`; `holder`: of a concatenated inner module). */
  const envOf = (
    module: { resource?: string; layer?: string | null },
    holder?: { layer?: string | null },
  ): EnvState => session.envOfModule(environment.name, module, holder)
  /** The key of the compile environment of a module (`envOf`), for the drain. */
  const envKeyOf = (module: unknown): string =>
    envOf(module as { resource?: string; layer?: string | null }).name
  /** The key of the compile environment of a module of a compilation (`envOf`), for the witness and graph readers. */
  const envKeyOfModule = (module: object, holder: object): string =>
    envOf(module as ModuleLike, holder as ModuleLike).name
  /** The key of a module of this compiler: its environment and resource. */
  const keyOf = (module: ModuleLike & { resource: string }) =>
    `${envOf(module).name}\0${module.resource}`
  /** Whether the loader compiled a module in this compilation. */
  const compiledHere = (module: ModuleLike & { resource: string }) =>
    envOf(module).compiled.has(module.resource)
  /**
   * A compile environment's import protection, looked up when a hook runs
   * (not held by the hooks): the session releases it once the compiler's
   * build is finished.
   */
  const ipEnvOf = (env: EnvState) => session.start.ip?.env(env.name) ?? null
  /** The import protection of each compile environment of this compiler. */
  const ipEnvs = () => {
    const out: Array<{
      env: EnvState
      ip: NonNullable<ReturnType<typeof ipEnvOf>>
    }> = []
    for (const env of session.envsOf(environment.name)) {
      const ip = ipEnvOf(env)
      if (ip) {
        out.push({ env, ip })
      }
    }
    return out
  }
  /**
   * The compilation's graph view of a compile environment, by canonical
   * resource, with its client-reference handoff (`clientReferencesFrom`):
   * the files of both environments whose raw facts read `'use client'`.
   */
  const graphView = async (
    compilation: Rspack.Compilation,
    env: EnvState,
  ): Promise<ImportGraphView> => {
    const from = session.clientReferencesFrom(env.name)
    const clientReferences = new Set<string>()
    if (from !== undefined) {
      for (const id of rspackFilesIn(
        compilation as never,
        canonicalResource,
        envKeyOfModule,
        [env.name, from],
      )) {
        if (
          langFromId(pathOfId(id)) !== null &&
          (await session.start.rawFacts.get(id, from)).targetFacts.useClient
        ) {
          clientReferences.add(id)
        }
      }
    }
    return rspackGraphView(compilation as never, canonicalResource, {
      env: env.name,
      envOf: envKeyOfModule,
      ...(from !== undefined && { handoff: { from, clientReferences } }),
    })
  }
  return {
    apply(compiler) {
      const { Compilation, WebpackError } = rspack
      /** A failed `watchRun` of ours, reported by the compilation it started. */
      const failedBeforeCompilation: Array<Error> = []
      /** Runs a hook of ours whose failure goes to `errors` (`reportingFailure`: in watch mode it never rejects). */
      const reporting = (
        errors: Array<Error>,
        what: string,
        work: () => Promise<void>,
      ) =>
        reportingFailure(
          compiler,
          errors,
          { tag: '[tanstack-start]', what },
          work,
        )
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
      session.registerCompiler(environment.name, compiler)

      const cache = compiler.options.cache
      own.persistsModules = typeof cache === 'object' && cache.type !== 'memory'

      // import-protection edge modules are virtual files of the compiler of their
      // environment, written when they are defined (the importer's compile). With a
      // persistent cache, an importer restored in a new process requests a module nothing
      // defined: the request carries its content, which defines it before it resolves, in
      // the environment its id names (a user layer's is found here, before any module of
      // the layer is: `envOfKey`)
      if (session.start.ip) {
        const ip = session.start.ip
        ip.onEdgeModule((file, load, ref) => {
          if (session.compilerOf(ref.env) === environment.name) {
            opts.writeVirtualModule(file, load.code)
          }
        })
        if (own.persistsModules) {
          compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory) => {
            factory.hooks.beforeResolve.tap(PLUGIN_NAME, (data) => {
              const ref = ip.ids.parse(data.request)
              if (ref) {
                session.envOfKey(ref.env)
                ip.define(data.request)
              }
            })
          })
        }
        // a child compiler of this one (a worker or service-worker plugin's) takes
        // these taps but not the virtual files: its requests of them fail the build
        // with the violations they stand for (in this compiler's compilation,
        // which Rsbuild prints), and resolve to nothing. The request is of the
        // environment of the issuer's layer
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, params) => {
          if (compilation.compiler === compiler) {
            return
          }
          params.normalModuleFactory.hooks.beforeResolve.tapPromise(
            PLUGIN_NAME,
            async (data) => {
              const issuerEnv = envOf({ layer: data.contextInfo.issuerLayer })
              const reports = await ipEnvOf(issuerEnv)?.childCompilerRequest(
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

      own.recordMapText = emittedMapTexts(
        compiler,
        session.start.opts.mode,
        session.start.compiles,
        opts.fillMapTexts,
      )

      let currentCompilation: Rspack.Compilation | null = null
      /** Development: the compile environments whose reports this compiler prints. */
      const reporters = new Set<string>()
      /** Development: reports a compile environment's import protection through this compiler's compilations (no timers: `finishModules` is the completion event). */
      const installReporter = (env: EnvState) => {
        const ip = ipEnvOf(env)
        if (!ip || reporters.has(env.name)) {
          return
        }
        reporters.add(env.name)
        ip.useDevReporter(
          {
            warn: (message) => {
              reports.push(message)
              currentCompilation?.warnings.push(new WebpackError(message))
            },
          },
          { setTimer: () => null, clearTimer: () => {} },
        )
      }
      if (session.start.opts.mode === 'dev') {
        // (a user layer's environment, found while the compilation builds)
        session.onEnvironment(environment.name, installReporter)
      }
      /**
       * Development: what this environment's last compilation reported,
       * until Rsbuild printed it: its modules' warnings and its
       * import-protection reports. Rsbuild
       * prints the last compilation of each environment once every
       * environment is done, so one a newer compilation replaced before that
       * is never printed (a cold start's client compile, when the generator
       * writes the route tree), and Rspack before 2.3.3 reports a module's
       * warnings only in the compilation that built it: the next compilation
       * reports them (`handOverWarnings`).
       */
      let unprinted: {
        compilation: Rspack.Compilation
        warnings: ReadonlyMap<string, ReadonlyArray<LocatedDiagnostic>>
        reports: Array<string>
      } | null = null
      /** Development: this compilation's import-protection reports, and its modules' warnings (theirs and the ones it reports for the one before), by module (`keyOf`). */
      let reports: Array<string> = []
      let warned: ReadonlyMap<
        string,
        ReadonlyArray<LocatedDiagnostic>
      > = new Map()
      /** Development: the warnings this compilation reports for the one before it (`reportHandedOver`). */
      let handedOver: ReturnType<typeof handOverWarnings>['handed'] = []
      opts.onDevCompileDone?.(({ stats }) => {
        const printed = 'stats' in stats ? stats.stats : [stats]
        if (printed.some((one) => one.compilation === unprinted?.compilation)) {
          unprinted = null
        }
      })

      compiler.hooks.beforeRun.tap(PLUGIN_NAME, () => {
        // one warning per file per run (J2.19): the session's ledger is
        // shared by every environment's compiler; the client's run starts it
        if (environment.type === 'client') {
          session.start.warnings.reset()
        }
      })
      // a production build's generation: `onBeforeBuild` (`start-compiler.ts`), which
      // Rsbuild's own `run` tap awaits; a run without it generates here, after that tap
      compiler.hooks.run.tapPromise(
        { name: PLUGIN_NAME, stage: 1 },
        async () => {
          if (opts.generatesInRun()) {
            await opts.generator.build()
          }
        },
      )

      /** A modified file's event (`CompilationFiles.eventOf`): edited, created, or a watched directory. */
      const eventOf = (file: string) =>
        session.files.eventOf(environment.name, file)
      // edits and removals of files the last compilation read, invalidated before this
      // compilation starts (a file's facts need no resolver, and a resolution that found a
      // removed file is stale): the modules of their stale dependents are built at its
      // `finishMake`
      compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, (c) =>
        reporting(
          failedBeforeCompilation,
          'Finding the modules the changed files affect',
          async () => {
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
            for (const { ip } of ipEnvs()) {
              ip.beginBuild()
            }
            await session.invalidateFileEvents([
              ...modified
                .filter(
                  (file) =>
                    eventOf(file) === 'change' && !isPackageManifest(file),
                )
                .map((file) => ({ file, kind: 'change' as const })),
              ...removed.map((file) => ({ file, kind: 'unlink' as const })),
            ])
            await opts.generator.watchRun(modified, removed)
          },
        ),
      )
      // created files, invalidated once Rspack's resolver forgot what it found in the last
      // compilation (at `make`, before the modules build; a new file may take resolutions):
      // the modules of their stale dependents are built at this compilation's `finishMake`
      compiler.hooks.make.tapPromise(PLUGIN_NAME, (compilation) =>
        reporting(
          compilation.errors,
          'Finding the modules the created files affect',
          async () => {
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
            session.drain.building(
              environment.name,
              modified.map(normalizePath),
            )
          },
        ),
      )
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
        session.drain.compiled(environment.name)
      })

      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        compilation.errors.push(...failedBeforeCompilation.splice(0))
        currentCompilation = compilation
        for (const env of session.envsOf(environment.name)) {
          env.compiled.clear()
        }
        reports = []
        warned = new Map()
        handedOver = []
        compilation.hooks.afterSeal.tap(PLUGIN_NAME, () => {
          reportHandedOver(compilation)
          locateDiagnostics(compilation, WebpackError, LOCATED_DIAGNOSTICS)
        })
        if (compiler.watchMode) {
          // Rspack watches the files the plans of the compilation's modules read (no
          // module depends on them: whether a change makes a module stale is the
          // invalidation's to decide), a file no output imports any more included
          compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
            // each environment's module paths
            const paths = new Map<string, Set<string>>()
            for (const m of modules) {
              const module = m as unknown as ModuleLike
              if (module.resource) {
                const env = envOf(module).name
                let own = paths.get(env)
                if (!own) {
                  own = new Set()
                  paths.set(env, own)
                }
                own.add(resourcePath(module.resource))
              }
            }
            for (const file of session.dependencyFiles(paths)) {
              compilation.fileDependencies.add(path.normalize(file))
            }
          })
        }
        if (session.start.ip) {
          // Rspack's module graph is not readable while modules build (a loader asking for a
          // trace would abort the process): no graph until `finishModules`, when the
          // compilation's complete graph replaces it (traces built before use the edge index).
          // Rspack drops the previous compilation as it creates this one, and a read of it
          // would throw: no later read (an `onViolation` reading `info.trace` late) reaches it
          for (const { ip } of ipEnvs()) {
            ip.graph = null
          }
          if (session.start.opts.mode === 'dev') {
            for (const env of session.envsOf(environment.name)) {
              installReporter(env)
            }
            compilation.hooks.finishModules.tapPromise(PLUGIN_NAME, (modules) =>
              reporting(
                compilation.errors,
                'Checking import protection',
                async () => {
                  const envs = ipEnvs()
                  for (const { env, ip } of envs) {
                    ip.graph = await graphView(compilation, env)
                    // importers that disagree (R147): an error of each compilation holding them
                    for (const message of ip.conflictReports(true)) {
                      compilation.errors.push(new WebpackError(message))
                    }
                  }
                  if (session.start.ip!.config.log === 'always') {
                    // modules this compilation kept without compiling them report again: an
                    // importer its violations, an edge module the pending ones it witnesses
                    for (const m of modules) {
                      const module = m as unknown as ModuleLike
                      if (
                        !module.resource ||
                        compiledHere(
                          module as ModuleLike & { resource: string },
                        )
                      ) {
                        continue
                      }
                      const ip = ipEnvOf(envOf(module))!
                      const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
                      if (record) {
                        await ip.reportAgain(record)
                      } else {
                        await ip.confirm(module.resource)
                      }
                    }
                  }
                  for (const { ip } of envs) {
                    ip.reporter?.flush(true)
                  }
                },
              ),
            )
          } else {
            compilation.hooks.processAssets.tapPromise(
              {
                name: PLUGIN_NAME,
                stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
              },
              () =>
                reporting(
                  compilation.errors,
                  'Checking import protection',
                  async () => {
                    const envs = ipEnvs()
                    const live = readRspackWitness(
                      compilation as never,
                      new Map(
                        envs.map(({ env, ip }) => [env.name, ip.witness()]),
                      ),
                      envKeyOfModule,
                      canonicalResource,
                    )
                    for (const { env, ip } of envs) {
                      const reports = await ip.surviving(
                        live.get(env.name) ?? [],
                        await graphView(compilation, env),
                      )
                      for (const report of reports) {
                        ;(report.severity === 'error'
                          ? compilation.errors
                          : compilation.warnings
                        ).push(new WebpackError(report.message))
                      }
                    }
                  },
                ),
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
        if (
          environment.type === 'client' &&
          session.start.opts.mode === 'build'
        ) {
          // the HTTP-callable server fns (R182): those the client's emitted
          // code calls, once tree-shaken, minified and its ids patched
          compilation.hooks.processAssets.tap(
            {
              name: PLUGIN_NAME,
              stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
            },
            () =>
              session.publishClientOutput(
                compilation
                  .getAssets()
                  .filter((asset) => isJsAsset(asset.name))
                  .map((asset) => asset.source.source().toString()),
              ),
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
          keyOf,
          compiledHere,
        )
        handedOver = handed
        warned = reported
      }

      /**
       * What `compilation` reports of its modules' recorded warnings: those of
       * the modules it built and the ones handed over to it
       * (`handOverWarnings`), once per file per run (J2.19). Rspack 2.3.3
       * reports a kept module's warnings again in every compilation, as
       * webpack does (before: only in the one that built it), when sealing:
       * those are dropped here, after the seal.
       */
      function reportHandedOver(compilation: Rspack.Compilation): void {
        const list = compilation.warnings
        for (let i = list.length - 1; i >= 0; i--) {
          const module = (list[i] as { module?: ModuleLike | null }).module
          if (
            module?.resource &&
            isRecordedDiagnostic(list[i], 'warning', LOCATED_DIAGNOSTICS) &&
            // judged by the module's own compile environment (a file in both
            // RSC layers is two modules)
            !compiledHere(module as ModuleLike & { resource: string })
          ) {
            list.splice(i, 1)
          }
        }
        for (const { module, warning } of handedOver) {
          list.push(
            locatedError(WebpackError, module, warning, LOCATED_DIAGNOSTICS),
          )
        }
      }

      /**
       * Builds again, through each environment's stale set, the modules of
       * the compilation whose served state (import protection's ledger of
       * their environment) differs from what the environment's importers now
       * ask for (design 4: an exempt importer compiled or restored after the
       * denied file, an exempt import gone, a restored module's `allowImport`
       * answer), until none differs. A module built real brings its own
       * imports, which may ask for another one. A module flipped twice is an
       * internal error (R116: thrown in our test runs, a warning otherwise).
       */
      async function serveAsDemanded(
        envs: ReturnType<typeof ipEnvs>,
        compilation: Rspack.Compilation,
      ): Promise<void> {
        const flipped = new Set<string>()
        for (;;) {
          // (each environment's mismatches, of the modules it holds: one the compilation
          // no longer holds is judged when it comes back)
          const stale: Array<{ env: string; path: string }> = []
          let held: Map<string, Set<string>> | null = null
          for (const { env, ip } of envs) {
            const ids = await ip.mismatches()
            if (ids.length === 0) {
              continue
            }
            if (!held) {
              held = new Map()
              for (const m of compilation.modules) {
                const module = m as unknown as ModuleLike
                if (module.resource) {
                  const key = envOf(module).name
                  let paths = held.get(key)
                  if (!paths) {
                    paths = new Set()
                    held.set(key, paths)
                  }
                  paths.add(resourcePath(module.resource))
                }
              }
            }
            for (const p of ids.map(resourcePath)) {
              if (held.get(env.name)?.has(p)) {
                stale.push({ env: env.name, path: p })
              }
            }
          }
          if (stale.length === 0) {
            return
          }
          const again = stale.find((s) =>
            flipped.has(`${s.env}\0${s.path}`),
          )?.path
          if (again !== undefined) {
            const v = invariantViolated({
              effect: 'import protection may serve it as its mock or as it is',
              detail: `import protection's served state of ${again} did not settle in one compilation`,
            })
            const file = path.relative(session.start.opts.root, again)
            compilation.warnings.push(
              new WebpackError(
                invariantDiagnostic('[tanstack-start] ', file, v).message,
              ),
            )
            return
          }
          for (const s of stale) {
            flipped.add(`${s.env}\0${s.path}`)
            session.start.caches.stale.add(s.env, s.path)
          }
          await session.drain.rebuild(
            environment.name,
            compilation,
            resourcePath,
            envKeyOf,
          )
        }
      }

      /** The resources of a compilation's modules and of its child compilers' (built as this compiler's), of one compile environment. */
      function* compilationResources(
        compilation: Rspack.Compilation,
        env: EnvState,
      ): Generator<string> {
        const compilations = [compilation]
        for (const c of compilations) {
          compilations.push(...c.children)
          for (const m of c.modules) {
            const module = m as unknown as ModuleLike
            if (module.resource && envOf(module) === env) {
              yield module.resource
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
          if (!isJsAsset(asset.name)) {
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
      // of the tree module; when its routes changed since it served the module (the file
      // did not), or it served none (a module restored from the persistent cache), the
      // module is rebuilt. A child compiler (a worker) runs the transform too: what it
      // served is not this compiler's module, so the tree is fresh here once this
      // compiler built its module at the current route set
      if (opts.clientRouteTree && environment.type === 'client') {
        const tree = opts.clientRouteTree
        /** The route set's version this compiler's tree module has (none known: -1). */
        let builtAt = -1
        compiler.hooks.finishMake.tapPromise(
          { name: `${PLUGIN_NAME}:route-tree`, stage: -30 },
          (compilation) =>
            reporting(
              compilation.errors,
              'Building the client route tree again',
              async () => {
                if (compilation.compiler !== compiler) {
                  return
                }
                const version = tree.version()
                const id = normalizePath(tree.path())
                const builtHere = () =>
                  [...compilation.builtModules].some((m) => {
                    const { resource } = m as unknown as ModuleLike
                    return !!resource && canonicalResource(resource) === id
                  })
                if (!tree.stale() && (builtAt === version || builtHere())) {
                  builtAt = version
                  return
                }
                await rebuildModules(
                  compilation,
                  new Set([id]),
                  canonicalResource,
                )
                builtAt = version
              },
            ),
        )
      }

      // the drain and the replay of this compilation's modules (built now or restored from
      // the persistent cache): the plans of restored modules, then the modules of the
      // environment's stale set built again (a restored module whose plan read facts that
      // changed since, or no plan of this configuration, is in it; so are the dependents an
      // invalidation found stale), then the import-protection records of restored modules
      // (a module restored with a record of another version is built again, and so, in dev,
      // is one restored with violations or an edge module restored with pending ones:
      // another session reported them), the modules served otherwise
      // than their importers now ask for built again (`serveAsDemanded`), and the environment's
      // server-fn snapshot. Only a compiler's first compilation restores modules (Rspack
      // loads the cache's module graph in a build, never in a rebuild)
      compiler.hooks.finishMake.tapPromise(
        { name: `${PLUGIN_NAME}:replay`, stage: -20 },
        (compilation) =>
          reporting(
            compilation.errors,
            'Building the out-of-date modules again',
            async () => {
              if (compilation.compiler !== compiler) {
                return
              }
              if (
                !session.files.compiled(environment.name) &&
                own.persistsModules
              ) {
                const restored: Array<{ plan: PersistedPlan; env: EnvState }> =
                  []
                for (const m of compilation.modules) {
                  const module = m as unknown as ModuleLike
                  const plan = module.buildInfo?.[PLAN_BUILD_INFO_FIELD]
                  if (
                    typeof plan === 'string' &&
                    module.resource &&
                    !compiledHere(module as ModuleLike & { resource: string })
                  ) {
                    restored.push({
                      plan: JSON.parse(plan) as PersistedPlan,
                      env: envOf(module),
                    })
                  }
                }
                await session.restorePlans(restored)
              }
              await session.drain.rebuild(
                environment.name,
                compilation,
                resourcePath,
                envKeyOf,
              )
              const envs = ipEnvs()
              // a compiler's first compilation on a persistent cache judges what it
              // restored: its modules' import-protection records are replayed first (each in
              // its environment), the modules to judge again are rebuilt before the server-fn
              // snapshot. A module compiled in this process wrote its own records
              const judgesRestored =
                envs.length > 0 &&
                own.persistsModules &&
                !session.files.compiled(environment.name)
              if (judgesRestored) {
                /** The modules to build again, by `keyOf` (one environment's module of a file, not every one). */
                const unjudged = new Set<string>()
                const unconfirmed = new Set<string>()
                const modules = [...compilation.modules].flatMap((m) => {
                  const module = m as unknown as ModuleLike
                  return module.resource
                    ? [module as ModuleLike & { resource: string }]
                    : []
                })
                for (const module of modules) {
                  const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
                  if (
                    record &&
                    !compiledHere(module) &&
                    ipEnvOf(envOf(module))!.unjudged(
                      canonicalResource(module.resource),
                      record,
                    )
                  ) {
                    unjudged.add(keyOf(module))
                  }
                }
                for (const module of modules) {
                  const record = module.buildInfo?.[RSPACK_BUILD_INFO_KEY]
                  if (record) {
                    ipEnvOf(envOf(module))!.replay(
                      canonicalResource(module.resource),
                      record,
                    )
                  }
                }
                for (const module of modules) {
                  if (ipEnvOf(envOf(module))!.unconfirmed(module.resource)) {
                    unconfirmed.add(keyOf(module))
                  }
                }
                for (const set of [unconfirmed, unjudged]) {
                  if (set.size > 0) {
                    await rebuildModulesWhere(compilation, (m) => {
                      const module = m as unknown as ModuleLike
                      return (
                        module.resource !== undefined &&
                        set.has(
                          keyOf(module as ModuleLike & { resource: string }),
                        )
                      )
                    })
                  }
                }
              }
              for (const { env, ip } of envs) {
                if (session.files.compiled(environment.name)) {
                  // a later compilation: what it no longer holds asks for nothing (the first
                  // one holds every module it restored or built)
                  ip.hold(
                    heldIn(compilationResources(compilation, env), (r) =>
                      outputKey(canonicalResource(r)),
                    ),
                  )
                }
              }
              if (envs.length > 0) {
                await serveAsDemanded(envs, compilation)
              }
              // the server-fn snapshot of each environment, from each module's `buildInfo`;
              // the modules of child compilers (a worker's, a service worker's: compiled as
              // this compiler's, done during `make`) call the server fns they define too
              const snapshots = new Map<
                EnvState,
                Map<string, ReadonlyArray<ServerFnFact>>
              >()
              for (const env of session.envsOf(environment.name)) {
                snapshots.set(env, new Map())
              }
              const compilations = [compilation]
              for (const c of compilations) {
                compilations.push(...c.children)
                for (const m of c.modules) {
                  const module = m as unknown as ModuleLike
                  if (module.buildInfo) {
                    let snapshot = snapshots.get(envOf(module))
                    if (!snapshot) {
                      // (a user layer's environment, first seen here)
                      snapshot = new Map()
                      snapshots.set(envOf(module), snapshot)
                    }
                    addServerFns(snapshot, module.buildInfo)
                  }
                }
              }
              for (const [env, snapshot] of snapshots) {
                session.start.registry.replace(env, snapshot)
              }
              opts.onServerFnsReplayed()
            },
          ),
      )
    },
  }
}
