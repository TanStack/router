/**
 * The Rspack plugin of one Start compiler (an Rsbuild environment, with the
 * compile environments of its layers: `StartRsbuildCompilerSession.envOf`):
 * installs the loader implementation on the compiler, the generator as a precondition of a
 * watch compilation (`watchRun`) and of a production run (`run`: the session's
 * `beginRun`, whoever runs the compiler), the intake of the file events into
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
  invariantViolated,
  isRecordedDiagnostic,
  locateDiagnostics,
  locatedError,
  normalizePath,
  rebuildModules,
  rebuildModulesWhere,
  reportingFailure,
} from '@tanstack/router-utils/compiler'
import { NODE_MODULES_RE } from '../compiler/scope'
import { groundedGraph } from '../import-protection/graph-trace'
import {
  RSPACK_BUILD_INFO_KEY,
  dedupeKey,
} from '../import-protection/violations'
import {
  readRspackWitness,
  rspackNodeGraph,
} from '../import-protection/witness'
import { manifestFunctionsDiffering } from '../server-fns/resolver'
import {
  FOUND_WARNINGS_FIELD,
  LOCATED_DIAGNOSTICS,
  PLAN_BUILD_INFO_FIELD,
  SERVER_FN_BUILD_INFO_FIELD,
  canonicalResource,
  holdsDiagnostics,
  isJsAsset,
  resourcePath,
} from './compiler-session'
import { LOADER_REGISTRY } from './loader-registry'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import { serverFnResolverRebuild } from './server-fn-resolver-rebuild'
import type { ServerFnResolverModule } from './server-fn-resolver-rebuild'
import type { LoaderImpl } from './compiler-loader'
import type {
  EnvState,
  FoundWarning,
  ServerFnBuildInfo,
  StartRsbuildCompilerSession,
} from './compiler-session'
import type { StartCompilerEnvironment } from '../compiler/session'
import type { RsbuildRouteGenerator } from './router-generator'
import type { ServerFnFact } from '../server-fns/registry'
import type { RspackNodeGraph } from '../import-protection/witness'
import type { NodeGraph } from '../import-protection/graph-trace'
import type { EdgeViolation } from '../import-protection/violations'
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
  /** The client route tree module (client environment only): rebuilt when it is stale. */
  clientRouteTree?: {
    paths: () => ReadonlyArray<string>
    stale: () => boolean
    version: () => number
  }
  /** After the `finishMake` replay rebuilt the registry (the resolver virtual module is rewritten). */
  onServerFnsReplayed: () => void
  /** The server environment's server-fn resolver: rebuilt in the compilation's closure (`finishMake`). */
  serverFnResolver?: ServerFnResolverModule
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

/** A denied module's verdict a round of a compilation's closure builds (`close`), and what makes it so. */
interface Flip {
  round: number
  real: boolean
  why: string
}

/**
 * The flip rule of a compilation's closure (design-rsc-phase1-settlement.md
 * §2.4, amendment 2): whether a denied module may be built again with
 * `flip`'s verdict, after `before`, its own builds in the same closure. A
 * closure builds a module as its real module at most once; builds as its
 * mock are not counted (a module that left the compilation and came back
 * is a new module, with a new guess). Under deterministic builds the
 * settlement's real verdicts only grow (they rest on imports of modules
 * served as they are), so a module asked for as its real module a second
 * time has imports that differ between two builds of one source.
 */
function flipped(before: ReadonlyArray<Flip>, flip: Flip): boolean {
  return !flip.real || !before.some((f) => f.real)
}

/** What a closure that cannot settle says of its cause (`reportUnsettled`). */
const unsettledCause =
  'The imports of a module changed between two builds of the same source in one compilation: a loader whose output is not a function of its input, or a defect of TanStack Start (please report it at https://github.com/TanStack/router/issues with this message).'

export function createStartHostPlugin(opts: StartHostPluginOptions): {
  apply: (compiler: Rspack.Compiler) => void
} {
  const { session, environment, rspack } = opts
  const own = session.compiler(environment.name)
  /**
   * The compile environment of each module of this compiler `envOf` was
   * asked about (a concatenated inner module's is not kept: its holder's
   * layer may decide it). A module's resource and layer never change and an
   * environment stays once known, while Rspack's `layer` getter calls into
   * the binding on every read, and the passes of a compilation read each
   * module's environment several times.
   */
  const moduleEnvs = new WeakMap<object, EnvState>()
  /** The compile environment of a module of this compiler (`envOfModule`; `holder`: of a concatenated inner module). */
  const envOf = (
    module: { resource?: string; layer?: string | null },
    holder: { layer?: string | null } = module,
  ): EnvState => {
    if (holder !== module) {
      return session.envOfModule(environment.name, module, holder)
    }
    let env = moduleEnvs.get(module)
    if (!env) {
      env = session.envOfModule(environment.name, module)
      moduleEnvs.set(module, env)
    }
    return env
  }
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
  /** A compile environment's import protection (`ipEnvOf`). */
  type IpEnv = NonNullable<ReturnType<typeof ipEnvOf>>
  /** The import protection of each compile environment of this compiler. */
  const ipEnvs = () => {
    const out: Array<{ env: EnvState; ip: IpEnv }> = []
    for (const env of session.envsOf(environment.name)) {
      const ip = ipEnvOf(env)
      if (ip) {
        out.push({ env, ip })
      }
    }
    return out
  }
  /**
   * The compilation's graph and its child compilations', of every compile
   * environment of this compiler (`rspackNodeGraph`: built on its first
   * read).
   */
  const nodeGraph = (compilation: Rspack.Compilation): RspackNodeGraph =>
    rspackNodeGraph(compilation as never, canonicalResource, envKeyOfModule)
  return {
    apply(compiler) {
      const { Compilation, WebpackError } = rspack
      /** A failed `watchRun` of ours, reported by the compilation it started. */
      const failedBeforeCompilation: Array<Error> = []
      /**
       * The import-protection requests each child compilation made
       * (`childCompilerViolations`) and not yet reported, by the compilation
       * of this compiler that runs the child (`ownerOf`), from its
       * `thisCompilation` to its end (`done`, `failed`), each child's by
       * violation (`dedupeKey`: a barrel's import of the denied file and its
       * re-export of the binding are two requests of one violation). Each is
       * reported once, into the errors of that compilation only
       * (`reportChildRequests`): by the child's closure (`close`), with the
       * trace in the child's graph (Rspack's module graph is not readable
       * while modules build, and an import the records hold may be one the
       * bundler dropped); for a child that ends without its closure (a tap of
       * its `finishMake` before ours failed), by the compilation's next
       * closure (before `hold` forgets the child's records), else by its end
       * (`reportEndedChildren`). A child the compilation runs after its end
       * (a `done` tap after ours) has its requests reported as it makes them.
       */
      const childRequests = new WeakMap<
        Rspack.Compilation,
        Map<
          Rspack.Compilation,
          Map<string, { ip: IpEnv; violation: EdgeViolation }>
        >
      >()
      /** The compilation of this compiler that runs `child` (a child compiler's compilation, at any depth). */
      const ownerOf = (child: Rspack.Compilation) => {
        let owner = child
        while (
          owner.compiler !== compiler &&
          owner.compiler.parentCompilation
        ) {
          owner = owner.compiler.parentCompilation
        }
        return owner
      }
      /**
       * Reports `requests` (a child's) as errors of `owner`, with the trace
       * in `graph` (null: the records' trace). `failing`: what a report
       * that fails (`onViolation` rejecting) is given, the next one made
       * still; without it the failure ends the reports.
       */
      const reportInto = async (
        owner: Rspack.Compilation,
        requests: Iterable<{ ip: IpEnv; violation: EdgeViolation }>,
        graph: NodeGraph | null,
        failing?: (error: unknown) => void,
      ) => {
        for (const { ip, violation } of requests) {
          let messages: Array<string>
          try {
            messages = await ip.childCompilerReports([violation], graph)
          } catch (error) {
            if (!failing) {
              throw error
            }
            failing(error)
            continue
          }
          for (const message of messages) {
            owner.errors.push(new WebpackError(message))
          }
        }
      }
      /** Reports what `child` requested and nothing reported yet (`childRequests`), as errors of `owner`. */
      const reportChildRequests = async (
        owner: Rspack.Compilation,
        child: Rspack.Compilation,
        graph: NodeGraph | null,
        failing?: (error: unknown) => void,
      ) => {
        const children = childRequests.get(owner)
        const requested = children?.get(child)
        if (requested) {
          children!.delete(child)
          await reportInto(owner, requested.values(), graph, failing)
        }
      }
      /**
       * Reports the requests of every child of `owner` with some left: with
       * the child's graph when Rspack can still read it, else the records'
       * trace. `ended`: the compilation's end, after which a child's
       * request is reported as it is made (`failing`: `reportInto`).
       */
      const reportEndedChildren = async (
        owner: Rspack.Compilation,
        ended: boolean,
        failing?: (error: unknown) => void,
      ) => {
        const children = childRequests.get(owner)
        for (;;) {
          const next = children?.keys().next()
          if (!next || next.done) {
            if (ended) {
              childRequests.delete(owner)
            }
            return
          }
          const child = next.value
          const graph = nodeGraph(child)
          let readable = true
          try {
            graph.holds({ env: environment.name, id: '' })
          } catch {
            // (a read throws once Rspack dropped the child's compilation)
            readable = false
          }
          await reportChildRequests(
            owner,
            child,
            readable ? graph : null,
            failing,
          )
        }
      }
      /**
       * The reports of the compilation that failed last (`failed`, a hook
       * that cannot wait): waited for before the compiler's next run begins
       * (`run`, `watchRun`) and before it closes (`shutdown`). A report
       * that fails (`onViolation` rejecting) is printed, and the others are
       * made: its build has failed already.
       */
      let failedReports: Promise<void> = Promise.resolve()
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
      // Development: the route-set reload's evidence (SPEC J3.10). The server
      // records the bytes of the tree and the route files its own loader is
      // handed in their first raw pass (a child compiler's, a query's or a
      // later pass's are other modules); the records of the client's tree
      // and the server's files count from their compiler's emit (a vetoed
      // emit serves the older output), and a compilation that fails fatally
      // drops them
      const evidence = opts.onDevCompileDone ? opts.generator.evidence : null
      const recordsSources =
        evidence !== null &&
        environment.name === RSBUILD_ENVIRONMENT_NAMES.server
      ;(compiler as unknown as Record<string, unknown>)[LOADER_REGISTRY] = ((
        ctx,
        source,
        inputMap,
        options,
      ) => {
        if (
          recordsSources &&
          ctx._compiler === compiler &&
          !options.pass &&
          !ctx.resourceQuery
        ) {
          evidence.built(
            environment.name,
            ctx.resourcePath,
            source,
            ctx.loaderIndex === ctx.loaders.length - 1,
          )
        }
        return session.compile(ctx, source, inputMap, options)
      }) satisfies LoaderImpl
      if (
        evidence !== null &&
        (recordsSources ||
          environment.name === RSBUILD_ENVIRONMENT_NAMES.client)
      ) {
        const client = environment.name === RSBUILD_ENVIRONMENT_NAMES.client
        compiler.hooks.afterEmit.tap(PLUGIN_NAME, () => {
          evidence.emitted(environment.name, client)
        })
        compiler.hooks.failed.tap(PLUGIN_NAME, () => {
          evidence.failed(environment.name, client)
        })
        // (before Rsbuild's own `done` tap, which ends with its dev-compile callback)
        compiler.hooks.done.tap(
          { name: PLUGIN_NAME, stage: -1000 },
          (stats) => {
            evidence.done(environment.name, stats.hasErrors())
          },
        )
      }

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
      // the layer is: `envOfKey`). Each run's import protection tells the session's
      // listener (`onEdgeModule`: a run may begin a new one, `beginRun`)
      if (session.start.ip) {
        session.onEdgeModule((file, load, ref) => {
          if (session.compilerOf(ref.env) === environment.name) {
            opts.writeVirtualModule(file, load.code)
          }
        })
        if (own.persistsModules) {
          compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory) => {
            factory.hooks.beforeResolve.tap(PLUGIN_NAME, (data) => {
              const ip = session.start.ip!
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
        // which Rsbuild prints: `childRequests`), and resolve to nothing. The
        // request is of the environment of the issuer's layer
        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, params) => {
          if (compilation.compiler === compiler) {
            return
          }
          params.normalModuleFactory.hooks.beforeResolve.tapPromise(
            PLUGIN_NAME,
            async (data) => {
              const ip = ipEnvOf(
                session.envOf(environment.name, data.contextInfo.issuerLayer),
              )
              const violations = ip?.childCompilerViolations(
                data.request,
                data.contextInfo.issuer,
              )
              if (!violations) {
                return undefined
              }
              const owner = ownerOf(compilation)
              const children = childRequests.get(owner)
              if (!children) {
                // (the compilation ended: nothing of it reports later. Rspack's
                // graph cannot be read while modules build: the records' trace)
                await reportInto(
                  owner,
                  violations.map((violation) => ({ ip: ip!, violation })),
                  null,
                )
                return false
              }
              let requested = children.get(compilation)
              if (!requested) {
                requested = new Map()
                children.set(compilation, requested)
              }
              for (const violation of violations) {
                const key = dedupeKey(violation)
                if (!requested.has(key)) {
                  requested.set(key, { ip: ip!, violation })
                }
              }
              return false
            },
          )
        })
        // (the children that ended after the compilation's last closure: in a
        // compilation that fails no error is reported, `onViolation` is told)
        compiler.hooks.done.tapPromise(PLUGIN_NAME, (stats) =>
          reportEndedChildren(stats.compilation, true),
        )
        compiler.hooks.failed.tap(PLUGIN_NAME, () => {
          // (the compilation that failed is the compiler's last)
          if (currentCompilation) {
            const print = (error: unknown) => {
              compiler
                .getInfrastructureLogger(PLUGIN_NAME)
                .error(
                  `[tanstack-start] Reporting an import-protection violation of a child compiler of a failed compilation failed:\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
                )
            }
            const reports = reportEndedChildren(
              currentCompilation,
              true,
              print,
            ).catch(print)
            // (and the ones of a failure before it, still made)
            const before = failedReports
            failedReports = before.then(() => reports)
          }
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

      // a production run (`build()`, or a program's `run()` of the compiler of
      // `createCompiler()`, maybe again), which generates the routes once for all its
      // compilers: after Rsbuild's own `run` tap (its `onBeforeBuild`)
      // (once the reports of the run that failed before it are made:
      // `failedReports`)
      compiler.hooks.run.tapPromise(
        { name: PLUGIN_NAME, stage: 1 },
        async () => {
          await failedReports
          await session.beginRun(environment.name, () => opts.generator.build())
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
            // (once the reports of the compilation that failed before it are
            // made: `failedReports`)
            await failedReports
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
        return failedReports
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
        // (until its end: `childRequests`)
        childRequests.set(compilation, new Map())
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
                  // (as the ledgers' verdicts make it: the settlement's)
                  const graph = session.start.ip!.servedGraph(
                    nodeGraph(compilation),
                  )
                  for (const { ip } of envs) {
                    ip.graph = graph
                    // importers that disagree (R147): an error of each compilation holding them
                    for (const message of ip.conflictReports(true)) {
                      compilation.errors.push(new WebpackError(message))
                    }
                  }
                  // a module's own verdict, final once the settlement ran (`finishMake`)
                  for (const { ip } of envs) {
                    await ip.reportSettled()
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
                    const graph = session.start.ip!.servedGraph(
                      nodeGraph(compilation),
                    )
                    for (const { env, ip } of envs) {
                      const resolve = session.resolvers.get(env.compiler.name)
                      const reports = await ip.surviving(
                        live.get(env.name) ?? [],
                        graph,
                        undefined,
                        undefined,
                        resolve &&
                          ((specifier, importer) =>
                            resolve(
                              path.dirname(identify(importer).path),
                              specifier,
                              undefined,
                            )),
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
        if (
          own.persistsModules &&
          (!opts.onDevCompileDone || !session.files.compiled(environment.name))
        ) {
          // a compilation on the persistent cache (development: a compiler's
          // first, the one that restores; the next hands over what Rsbuild
          // did not print): the modules it kept without compiling them report
          // the warnings their latest compile found (Rspack replays no loader
          // warning of a restored module)
          compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
            const kept = keptWarnings(
              compilation,
              modules as Iterable<ModuleLike>,
            )
            if (!opts.onDevCompileDone) {
              handedOver = kept
              return
            }
            handedOver = [...handedOver, ...kept]
            const reported = new Map(warned)
            for (const { module, warning } of kept) {
              const key = keyOf(module as ModuleLike & { resource: string })
              reported.set(key, [...(reported.get(key) ?? []), warning])
            }
            warned = reported
          })
        }
        // the "does not declare Start" warning, from the compilation's modules,
        // compiled or restored (decision 6): once per package and run
        compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
          if (session.packageUses.size > 0) {
            reportPackageUses(compilation, modules as Iterable<ModuleLike>)
          }
        })
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
            () => {
              session.start.publishClientOutput(
                compilation
                  .getAssets()
                  .filter((asset) => isJsAsset(asset.name))
                  .map((asset) => asset.source.source().toString()),
              )
            },
          )
        }
      })

      /**
       * A compilation's modules that it kept without compiling them, each
       * with the warnings their latest compile found (`FOUND_WARNINGS_FIELD`)
       * that the run's warning ledger lets through (a compiled module of
       * another environment may have reported one), for `reportHandedOver`.
       */
      function keptWarnings(
        compilation: Rspack.Compilation,
        modules: Iterable<ModuleLike>,
      ): Array<{ module: ModuleLike; warning: LocatedDiagnostic }> {
        const out: Array<{ module: ModuleLike; warning: LocatedDiagnostic }> =
          []
        const held = heldIn(compilation)
        for (const module of modules) {
          if (
            !module.resource ||
            compiledHere(module as ModuleLike & { resource: string })
          ) {
            continue
          }
          const found = module.buildInfo?.[FOUND_WARNINGS_FIELD] as
            | Array<FoundWarning>
            | undefined
          if (!found || !held(module as ModuleLike & { resource: string })) {
            continue
          }
          const file = resourcePath(module.resource)
          for (const w of found) {
            if (
              session.start.warnings.once(file, {
                ...(w.code !== undefined && { code: w.code }),
                message: w.message,
              })
            ) {
              out.push({
                module,
                warning: {
                  severity: 'warning',
                  message: w.message,
                  ...(w.line !== undefined && {
                    line: w.line,
                    column: w.column,
                  }),
                },
              })
            }
          }
        }
        return out
      }

      /**
       * The "does not declare Start" warning of each package instance whose
       * modules in `compilation` recognised a Start use at their latest
       * compile, in this process or restored from the persistent cache
       * (`packageUses`), decided against the package's current manifest
       * through the run's warning ledger (`packageUseWarning`), at the first of
       * its modules by resource.
       */
      function reportPackageUses(
        compilation: Rspack.Compilation,
        modules: Iterable<ModuleLike>,
      ): void {
        const uses: Array<ModuleLike & { resource: string }> = []
        for (const module of modules) {
          if (
            module.resource &&
            NODE_MODULES_RE.test(module.resource) &&
            session.packageUses.has(
              keyOf(module as ModuleLike & { resource: string }),
            )
          ) {
            uses.push(module as ModuleLike & { resource: string })
          }
        }
        uses.sort((a, b) =>
          a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0,
        )
        const held = heldIn(compilation)
        for (const module of uses) {
          const warning = session.start.packageUseWarning(
            resourcePath(module.resource),
            undefined,
            () => held(module),
          )
          if (warning) {
            compilation.warnings.push(
              locatedError(
                WebpackError,
                module,
                { severity: 'warning', message: warning.message },
                LOCATED_DIAGNOSTICS,
              ) as never,
            )
            // (development: the next compilation reports it if Rsbuild never
            // prints this one, as import protection's reports: `reportUnprinted`)
            if (opts.onDevCompileDone) {
              reports.push(warning.message)
            }
          }
        }
      }

      /**
       * Whether `compilation` holds a module: an entry, or reached from one
       * (`groundedGraph`, read backward from the module asked about). A
       * compilation keeps a module that a rebuild at its `finishMake` left
       * unreachable (a server fn's handler module, once the resolver no
       * longer lists the function), and the persistent cache restores it:
       * it is in no output, and reports nothing.
       */
      function heldIn(
        compilation: Rspack.Compilation,
      ): (module: ModuleLike & { resource: string }) => boolean {
        let grounded: ReturnType<typeof groundedGraph> | null = null
        return (module) => {
          const ip = session.start.ip
          grounded ??= groundedGraph(
            nodeGraph(compilation),
            () => false,
            (n, g) => ip?.handoffImporters(n, g) ?? [],
          )
          return grounded.supported({
            env: envOf(module).name,
            id: canonicalResource(module.resource),
          })
        }
      }

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
       * The history of each compilation's closure (`close`), shared by its
       * two runs: the verdicts each denied module was built with
       * (`flipped`), by environment and id, the resolver contents it built,
       * and its rounds. A child compilation has its own.
       */
      const histories = new WeakMap<
        Rspack.Compilation,
        {
          flips: Map<string, Array<Flip>>
          contents: Array<string>
          round: number
        }
      >()

      /**
       * The closure of a compilation (`finishMake`): this compiler's, or a
       * child compiler's (a worker plugin's, which runs this compiler's
       * `finishMake` taps on its own compilation, at any depth). Every
       * compilation settles the modules it builds: run at stage −10 (before
       * the RSC plugin's client handoff at stage 0) and again at the last
       * stage (`last`: a module a plugin adds after −10, a provide-shared
       * module's, is judged; once the last tap returns the compilation's
       * modules are final, Rspack refuses a rebuild later). Rounds until one
       * builds nothing. Each: the server-fn resolver built again when its
       * content changed since this compiler built it (a rebuild brings
       * providers and what they import: new denied modules, new edges
       * arriving at them); the records of what the compilation (and its
       * child compilations) no longer holds forgotten (`hold`: a module
       * that left asks for nothing); and the denied modules of the
       * compilation built otherwise than a fresh build of the source
       * serves them (`ImportProtection.ground`, over the environments the
       * graph has now; `settle`, by each module's own record) built again,
       * with a restored edge module whose `allowImport` answer differs. A
       * module built real brings its imports, so possibly server fns the
       * resolver must have (a build has no next compilation). A child's
       * closure reads its own graph (its entry, its imports: what a build
       * of the child alone gives) and builds its own modules: the resolver,
       * `hold` and the restored edge modules are the compiler's state, and
       * the drain takes the compiler's stale sets. No count bounds it: a
       * denied module is built as its real module at most once per
       * compilation (`flipped`), each resolver content once, each restored
       * edge module once; a round that builds only mocks brings no module
       * (a mock imports the mock runtime only), so the round after it
       * builds no mock. So rounds are at most 2 · (modules built real +
       * resolver contents + restored edge modules) + 4. What breaks that
       * ends the closure with an error (`reportUnsettled`).
       */
      async function close(
        compilation: Rspack.Compilation,
        last: boolean,
      ): Promise<void> {
        const child = compilation.compiler !== compiler
        let history = histories.get(compilation)
        if (!history) {
          history = { flips: new Map(), contents: [], round: 0 }
          histories.set(compilation, history)
        }
        const { flips, contents } = history
        let graph: RspackNodeGraph | null = null
        // a later compilation's first run: what it no longer holds asks for
        // nothing (the first one holds every module it restored or built;
        // the last run follows the first, which held)
        let unheld = !child && !last && session.files.compiled(environment.name)
        const owner = ownerOf(compilation)
        if (!child) {
          // (a child that ended without its closure: before `hold` forgets
          // its records)
          await reportEndedChildren(owner, false)
        }
        for (;;) {
          const round = ++history.round
          // (what the child's requests stood for since its last round: its
          // `make`, the round's builds)
          if (child && childRequests.get(owner)?.has(compilation)) {
            await reportChildRequests(
              owner,
              compilation,
              (graph ??= nodeGraph(compilation)),
            )
          }
          const content = child ? null : (fnResolver?.pending() ?? null)
          if (content !== null) {
            if (contents.includes(content)) {
              const differing =
                manifestFunctionsDiffering(
                  contents[contents.length - 1]!,
                  content,
                )
                  .map(
                    (f) =>
                      `${f.functionName} of ${path.relative(session.start.opts.root, resourcePath(f.provider))}`,
                  )
                  .join(', ') || 'none'
              reportUnsettled(
                compilation,
                { file: '', cause: `server function resolver: ${differing}` },
                `the server function resolver of this compilation went back to the functions it had in a round before (round ${round}; the functions that differ: ${differing})`,
                [
                  `[tanstack-start] The server function resolver could not settle in this compilation: in round ${round} it lists the functions it listed in a round before.`,
                  `  The functions that differ: ${differing}`,
                  unsettledCause,
                ].join('\n'),
              )
              return
            }
            contents.push(content)
            await fnResolver!.rebuild(compilation, content)
            graph = null
            unheld = true
          }
          // (a user layer's environment may be found while modules build)
          const envs = ipEnvs()
          const stale: Array<{ env: EnvState; id: string }> = []
          if (envs.length > 0) {
            const g = (graph ??= nodeGraph(compilation))
            if (unheld) {
              for (const { env, ip } of envs) {
                ip.hold((id) => g.holds({ env: env.name, id }))
              }
              unheld = false
            }
            if (!child) {
              // (a restored edge module is a module of the compilation: `replay`)
              for (const { env, ip } of envs) {
                for (const id of await ip.restoredMismatches()) {
                  stale.push({ env, id })
                }
              }
            }
            const grounding = await session.start.ip!.ground(
              envs.map(({ ip }) => ip),
              g,
              g.builds,
            )
            for (const { env, ip } of envs) {
              for (const { id, verdict } of ip.settle(grounding, g.served)) {
                const key = `${env.name}\0${id}`
                const before = flips.get(key) ?? []
                const flip = { round, ...verdict }
                if (!flipped(before, flip)) {
                  const file = path.relative(session.start.opts.root, id)
                  const first = before[0]!
                  reportUnsettled(
                    compilation,
                    { file: id, cause: `import protection: ${env.name}` },
                    `import protection's served state of ${id} (${env.name}) did not settle in one compilation`,
                    [
                      `[tanstack-start] Import protection could not settle ${file} (${ipEnvOf(env)!.publicName}) in this compilation.`,
                      `  served as ${first.real ? 'its mock' : 'it is'}`,
                      ...before.map(
                        (f) =>
                          `  round ${f.round}  built as ${f.real ? 'it is' : 'its mock'}  (${f.why})`,
                      ),
                      `  round ${flip.round}  would be built as ${flip.real ? 'it is' : 'its mock'}  (${flip.why})`,
                      unsettledCause,
                    ].join('\n'),
                  )
                  return
                }
                flips.set(key, [...before, flip])
                stale.push({ env, id })
              }
            }
          }
          if (stale.length === 0) {
            if (content === null) {
              return
            }
            continue
          }
          if (child) {
            const keys = new Set(stale.map((s) => `${s.env.name}\0${s.id}`))
            await rebuildModulesWhere(compilation, (m) => {
              const module = m as unknown as ModuleLike
              return (
                module.resource !== undefined &&
                keys.has(
                  `${envOf(module).name}\0${canonicalResource(module.resource)}`,
                )
              )
            })
          } else {
            for (const s of stale) {
              session.start.caches.stale.add(s.env.name, resourcePath(s.id))
            }
            await session.drain.rebuild(
              environment.name,
              compilation,
              resourcePath,
              envKeyOf,
            )
          }
          graph = null
          unheld = !child
        }
      }

      /**
       * Ends a compilation's closure that cannot settle (`close`): its
       * modules are served as the last round built them. A build fails
       * (it exits non-zero: the output holds a module served otherwise
       * than its source asks for; R116's warning only for dev servers); a
       * dev server warns, and the next edit starts a new closure. In our
       * test runs it throws (`invariantViolated`, R116). The one place that
       * decides it (DECISIONS 2026-11-20, design-rsc-phase1-settlement.md
       * §2.4). Once per `what` and run (the session's `WarningLedger`): a
       * compilation's last run meets its first run's refusal again, with
       * the same history.
       */
      function reportUnsettled(
        compilation: Rspack.Compilation,
        what: { file: string; cause: string },
        detail: string,
        message: string,
      ): void {
        if (
          !session.start.warnings.once(what.file, {
            code: 'unsettled',
            message: what.cause,
          })
        ) {
          return
        }
        invariantViolated({
          effect:
            'import protection may serve a module as its mock or as it is',
          detail,
        })
        ;(session.start.opts.mode === 'dev'
          ? compilation.warnings
          : compilation.errors
        ).push(new WebpackError(message))
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
                const ids = new Set(tree.paths())
                const builtHere = () =>
                  [...compilation.builtModules].some((m) => {
                    const { resource } = m as unknown as ModuleLike
                    return !!resource && ids.has(canonicalResource(resource))
                  })
                if (!tree.stale() && (builtAt === version || builtHere())) {
                  builtAt = version
                  return
                }
                await rebuildModules(compilation, ids, canonicalResource)
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
      // another session reported them), and the environment's server-fn snapshot. Only a compiler's first compilation restores modules (Rspack
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
                  const buildInfo = module.buildInfo
                  const plan = buildInfo?.[PLAN_BUILD_INFO_FIELD]
                  const records = !!buildInfo && holdsDiagnostics(buildInfo)
                  if (
                    (typeof plan !== 'string' && !records) ||
                    !module.resource ||
                    compiledHere(module as ModuleLike & { resource: string })
                  ) {
                    continue
                  }
                  const env = envOf(module)
                  if (records) {
                    // (a compile in this process replaces them)
                    session.noteRestored(env.name, module.resource, buildInfo)
                  }
                  if (typeof plan === 'string') {
                    restored.push({
                      plan: JSON.parse(plan) as PersistedPlan,
                      env,
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

      // each compilation's closure (`close`, a child compiler's too: it runs these taps
      // on its own compilation): after the replay and the registry's refresh (stage -20)
      // and before the RSC plugin's client handoff (stage 0: the native ServerPlugin
      // starts the client's make there and hands off once, and a module built real in
      // `rsc` can bring client references), then again at the last stage: what a
      // plugin added since is judged, and the resolver of an RSC server compiler is
      // built again from what the finished client build calls (what a build there
      // brings has no client references in that build: the nested-reach limit)
      const fnResolver = opts.serverFnResolver
        ? serverFnResolverRebuild(opts.serverFnResolver)
        : null
      compiler.hooks.finishMake.tapPromise(
        { name: `${PLUGIN_NAME}:close`, stage: -10 },
        (compilation) =>
          reporting(
            compilation.errors,
            'Building the out-of-date modules again',
            async () => {
              if (compilation.compiler !== compiler) {
                await fnResolver?.child(compilation)
              }
              await close(compilation, false)
            },
          ),
      )
      compiler.hooks.finishMake.tapPromise(
        { name: `${PLUGIN_NAME}:close-last`, stage: 0x7fffffff },
        (compilation) =>
          reporting(
            compilation.errors,
            'Building the out-of-date modules again',
            async () => {
              const missing =
                fnResolver && compilation.compiler === compiler
                  ? session.clientOutputMissing()
                  : null
              if (missing) {
                throw missing
              }
              await close(compilation, true)
            },
          ),
      )
    },
  }
}
