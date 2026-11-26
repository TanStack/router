/**
 * The Rspack plugin of one Start compiler (an Rsbuild environment, with the
 * compile environments of its layers: `StartRsbuildCompilerSession.envOf`):
 * installs the loader implementation on the compiler, the generator as a precondition of a
 * watch compilation (`watchRun`) and of a production run (`run`: the session's
 * `beginRun`, whoever runs the compiler), the intake of the file events into
 * the one invalidation operation (`watchRun`, `make`), the `finishMake`
 * drain of the environment's stale set and replay of plan, server-fn and import-protection
 * `buildInfo` (persistent cache), the import-protection build reports
 * (`processAssets`: the mocks in its chunks) and dev reports (`finishModules`),
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
  locateDiagnostics,
  locatedError,
  normalizePath,
  rebuildModulesWhere,
  reportingFailure,
} from '@tanstack/router-utils/compiler'
import { NODE_MODULES_RE } from '../compiler/scope'
import { dedupeKey } from '../import-protection/violations'
import {
  rspackHolds,
  rspackMocksInChunks,
  rspackNodeGraph,
} from '../import-protection/chunk-lists'
import { manifestFunctionsDiffering } from '../server-fns/resolver'
import {
  LOCATED_DIAGNOSTICS,
  canonicalResource,
  holdsRecord,
  isJsAsset,
  resourcePath,
} from './compiler-session'
import { LOADER_REGISTRY } from './loader-registry'
import { lateFileTypeCheck } from './late-pass'
import {
  FOUND_WARNINGS_PART,
  IMPORT_PROTECTION_PART,
  PLAN_PART,
  SERVER_FNS_PART,
  partOf,
} from './module-record'
import { RSBUILD_ENVIRONMENT_NAMES } from './planning'
import { serverFnResolverRebuild } from './server-fn-resolver-rebuild'
import { buildGenerated } from './generated-module'
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
import type { RspackNodeGraph } from '../import-protection/chunk-lists'
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
    /** The tree the generator has for the client (`tree`) and its module text, as the transform serves it. */
    module: () => Promise<{ tree: string; module: string }>
  }
  /** The server environment's Start manifest module (`manifest-rebuild.ts`). */
  manifestPath?: () => string
  /** After the `finishMake` replay rebuilt the registry (the resolver virtual module is rewritten). */
  onServerFnsReplayed: () => void
  /** The server environment's server-fn resolver: rebuilt in the compilation's closure (`finishMake`). */
  serverFnResolver?: ServerFnResolverModule
  /**
   * Development: Rsbuild's `onDevCompileDone`, which tells the compilations
   * Rsbuild printed: the warnings they carry count as reported (`printed`).
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

/** The resources of the modules in indexes of records (their keys: `<env>\0<resource>`). */
function resourcesOf(...indexes: Array<ReadonlySet<string>>): Set<string> {
  const resources = new Set<string>()
  for (const index of indexes) {
    for (const key of index) {
      resources.add(key.slice(key.indexOf('\0') + 1))
    }
  }
  return resources
}

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
  /** Whether a compilation of this build can have RSC client-reference connections (`rspackHolds`). */
  const clientReferences = session.start.opts.rsc !== undefined
  /** The key of the compile environment of a module (`envOf`), for the drain. */
  const envKeyOf = (module: unknown): string =>
    envOf(module as { resource?: string; layer?: string | null }).name
  /** The key of the compile environment of a module of a compilation (`envOf`), for the chunk and graph readers. */
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
      /** The late pass's file-type check of this compiler's compilations, and of each child compiler's. */
      const lateCheck = lateFileTypeCheck(session.start.opts.root)
      const childLateChecks = new WeakMap<
        object,
        ReturnType<typeof lateFileTypeCheck>
      >()
      /** A failed check's error, at its module (Rsbuild prints the module's file). */
      const lateFileTypeError = (failure: {
        message: string
        module: unknown
      }): Error => {
        const error = new WebpackError(failure.message) as Error & {
          module?: unknown
        }
        error.module = failure.module
        return error
      }
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
       * Development: the import-protection reports of this compiler's last
       * compilation, until Rsbuild printed it. Rsbuild prints the last
       * compilation of each environment once every environment is done, so
       * one a newer compilation replaced before that is never printed (a
       * cold start's client compile, when the generator writes the route
       * tree): the next compilation reports them again (`reportUnprinted`).
       * Compiler and package warnings need none of it: each compilation
       * decides them from its own modules (`reportWarnings`).
       */
      let unprinted: {
        compilation: Rspack.Compilation
        reports: Array<string>
      } | null = null
      /** Development: this compilation's import-protection reports. */
      let reports: Array<string> = []
      opts.onDevCompileDone?.(({ stats }) => {
        const printed = 'stats' in stats ? stats.stats : [stats]
        if (printed.some((one) => one.compilation === unprinted?.compilation)) {
          unprinted = null
        }
        session.printed(new Set(printed.map((one) => one.compilation)))
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

      // (before Rsbuild's own `done` tap, which formats the report once
      // every compiler is done)
      compiler.hooks.done.tap({ name: PLUGIN_NAME, stage: -1000 }, () => {
        session.finishWarnings(environment.name)
      })
      compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
        if (opts.onDevCompileDone) {
          unprinted = { compilation: stats.compilation, reports }
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

      // a child compiler's compilation (a worker plugin's): its modules
      // compiled as this compiler's, and their warnings go to this
      // compiler's compilation (`reportWarnings`)
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        if (compilation.compiler !== compiler) {
          compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
            if (own.persistsModules) {
              // a child's modules the persistent cache restored, with the
              // records of their latest compile (as the compiler's own:
              // `finishMake`). In every compilation, not the first only: a
              // dev server forgets the index of modules whose files its
              // compilation does not depend on (the session's `retain`),
              // which a child's are, and the cache gives the next child
              // compilation its modules without a compile
              for (const m of modules) {
                const module = m as unknown as ModuleLike
                const buildInfo = module.buildInfo
                if (module.resource && buildInfo && holdsRecord(buildInfo)) {
                  session.noteRestored(
                    envOf(module).name,
                    module.resource,
                    buildInfo,
                    true,
                  )
                }
              }
            }
            reportWarnings(compilation, modules as Iterable<ModuleLike>, true)
            // (a child's compilation reports to the compilation of this compiler)
            let check = childLateChecks.get(compilation.compiler)
            if (!check) {
              check = lateFileTypeCheck(session.start.opts.root)
              childLateChecks.set(compilation.compiler, check)
            }
            for (const failure of check(compilation, modules)) {
              ;(currentCompilation ?? compilation).errors.push(
                lateFileTypeError(failure),
              )
            }
          })
        }
      })
      compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
        // the modules Start generates for this compiler, whose loader records
        // what they are built from (`generated-module.ts`)
        for (const file of [
          ...(opts.clientRouteTree?.paths() ?? []),
          ...(opts.serverFnResolver ? [opts.serverFnResolver.path()] : []),
          ...(opts.manifestPath ? [opts.manifestPath()] : []),
        ]) {
          session.generated.add(file)
          session.generated.add(path.normalize(file))
        }
        compilation.errors.push(...failedBeforeCompilation.splice(0))
        currentCompilation = compilation
        // (until its end: `childRequests`)
        childRequests.set(compilation, new Map())
        for (const env of session.envsOf(environment.name)) {
          env.compiled.clear()
        }
        reports = []
        session.beginWarnings(environment.name, compilation)
        compilation.hooks.afterSeal.tap(PLUGIN_NAME, () => {
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
                    // importer its violations, an edge module the pending ones it stands for
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
                      const record = partOf(
                        module.buildInfo,
                        IMPORT_PROTECTION_PART,
                      )
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
                    const withMocks = envs.filter(({ ip }) => ip.hasMocks())
                    const live = rspackMocksInChunks(
                      compilation as never,
                      new Map(
                        withMocks.map(({ env, ip }) => [env.name, ip.mocks()]),
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
          compilation.hooks.finishModules.tap(PLUGIN_NAME, () =>
            reportUnprinted(compilation),
          )
        }
        // a module of a file type the late pass does not read that Rspack
        // parses as JavaScript and that uses Start (`late-pass.ts`)
        compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
          for (const failure of lateCheck(compilation, modules)) {
            compilation.errors.push(lateFileTypeError(failure))
          }
        })
        // the compiler's and the packages' warnings of the modules the
        // compilation holds, compiled now, kept or restored alike
        compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) =>
          reportWarnings(compilation, modules as Iterable<ModuleLike>, false),
        )
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
       * The warnings of `compilation`: for each module it holds
       * (`rspackHolds`: a module nothing reaches any more reports nothing),
       * the warnings its latest compile found (its record, whoever compiled
       * it: this compilation, an earlier one, another process), and the
       * "does not declare Start" warning of each package instance with a
       * module that recognised a Start use, decided against the package's
       * current manifest at the first of its modules by resource. The loader
       * emits no warning, so nothing of a kept module is reported twice.
       *
       * Each goes to the session as the compilation seals (`warn`): it is
       * added then, before the compilation emits, unless a current
       * compilation carries it or the dev session printed it. `child`: a
       * child compiler's compilation (a worker's), whose modules have
       * records of their own and which Rsbuild does not print: its warnings
       * are this compiler's compilation's, added to that one. Nothing is
       * added to the child, so what a worker plugin does with a child's
       * warnings (hands them over, as they are or reworded, or not) changes
       * nothing.
       */
      function reportWarnings(
        compilation: Rspack.Compilation,
        modules: Iterable<ModuleLike>,
        child: boolean,
      ): void {
        if (session.warned.size === 0 && session.packageUses.size === 0) {
          return
        }
        // (Rsbuild prints no child compilation: a child's warnings are its owner's)
        const target = child ? (currentCompilation ?? compilation) : compilation
        let holds: ReturnType<typeof rspackHolds> | undefined
        const held = (module: ModuleLike) =>
          (holds ??= rspackHolds(compilation as never, { clientReferences }))(
            module,
          )
        const push = (
          module: ModuleLike & { resource: string },
          warning: Omit<LocatedDiagnostic, 'severity'>,
        ): void => {
          const error = locatedError(
            WebpackError,
            module,
            { severity: 'warning', ...warning },
            LOCATED_DIAGNOSTICS,
          ) as Error & { file?: string }
          if (child) {
            // (the owner's compilation may not hold the module: Rsbuild
            // prints the warning's `file` then)
            error.file ??= resourcePath(module.resource)
          }
          target.warnings.push(error as never)
        }
        // (a child compiler's module has a record key of its own: `recordKey`)
        const mark = child ? '\0' : ''
        const uses: Array<ModuleLike & { resource: string }> = []
        const resources = resourcesOf(session.warned, session.packageUses)
        for (const module of modules) {
          if (!module.resource || !resources.has(mark + module.resource)) {
            continue
          }
          const one = module as ModuleLike & { resource: string }
          const key = `${envOf(one).name}\0${mark}${one.resource}`
          if (session.warned.has(key)) {
            const found = partOf(module.buildInfo, FOUND_WARNINGS_PART) as
              | Array<FoundWarning>
              | undefined
            if (found && held(module)) {
              const file = resourcePath(one.resource)
              for (const w of found) {
                session.warn(
                  environment.name,
                  `${file}\0${w.code ?? ''}\0${w.message}`,
                  () =>
                    push(one, {
                      message: w.message,
                      ...(w.line !== undefined && {
                        line: w.line,
                        column: w.column,
                      }),
                    }),
                )
              }
            }
          }
          if (
            session.packageUses.has(key) &&
            NODE_MODULES_RE.test(one.resource)
          ) {
            uses.push(one)
          }
        }
        uses.sort((a, b) =>
          a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0,
        )
        for (const module of uses) {
          // (asked last: the package's manifest decides first)
          let root: string | undefined
          const warning = session.start.packageUseWarning(
            resourcePath(module.resource),
            undefined,
            () => held(module),
            (packageRoot) => {
              root = packageRoot
              return true
            },
          )
          if (warning && root !== undefined) {
            const message = warning.message
            session.warn(environment.name, `\0package\0${root}`, () =>
              push(module, { message }),
            )
          }
        }
      }

      /**
       * The import-protection reports of the compilation before
       * `compilation`, which Rsbuild never printed (`unprinted`), reported
       * by `compilation` unless it reported them itself.
       */
      function reportUnprinted(compilation: Rspack.Compilation): void {
        for (const message of unprinted?.reports ?? []) {
          if (!reports.includes(message)) {
            reports.push(message)
            compilation.warnings.push(new WebpackError(message))
          }
        }
      }

      /**
       * The server functions of this compiler's compile environments, derived
       * from the modules `compilation` holds: the registry's one writer on
       * this host (`serverFnsAtSettlement`: a compile registers nothing), at
       * `finishMake` after the drain and again in the closure whenever a
       * round built modules. A module counts by its record (what its latest
       * compile declared as the module is served: a mock declares nothing),
       * whoever compiled it.
       *
       * Who asks for a function. A defining module declares its functions
       * when an entry reaches it by real imports. The server-function
       * resolver is Start's own module and imports the provider of every
       * function it lists: that import is no caller, so the walk does not
       * pass it (`stop`). A provider is admitted when something asks for
       * its file's functions: a defining module admitted here, a child
       * compilation, or another compiler's code that calls them (the
       * client's stubs: `clientReferenced`). What an admitted provider
       * imports is really imported (a handler calling another file's
       * function), so admitted providers ground further modules, until
       * nothing changes. A function whose last caller left is no longer
       * provided, though the resolver still imports its provider in this
       * compilation: the closure then builds the resolver without it.
       *
       * A provider module is what the resolver imports the wrappers from:
       * where the compilation holds one built, the functions it provides
       * are the file's (a provider that provides none withdraws them).
       *
       * Child compilations (a worker's) are observed as they are: their
       * modules compiled as this compiler's, their graphs are their own.
       */
      function deriveServerFns(compilation: Rspack.Compilation): void {
        const snapshots = new Map<
          EnvState,
          Map<string, ReadonlyArray<ServerFnFact>>
        >()
        for (const env of session.envsOf(environment.name)) {
          snapshots.set(env, new Map())
        }
        const snapshotOf = (env: EnvState) => {
          let snapshot = snapshots.get(env)
          if (!snapshot) {
            // (a user layer's environment, first seen here)
            snapshot = new Map()
            snapshots.set(env, snapshot)
          }
          return snapshot
        }
        const recordOf = (module: ModuleLike) => {
          const fns = partOf(module.buildInfo, SERVER_FNS_PART) as
            | ServerFnBuildInfo
            | undefined
          return fns?.version === 4 ? fns : null
        }
        /** The files something asks the functions of. */
        const asked = new Set<string>()
        const children = [...compilation.children]
        for (const child of children) {
          children.push(...child.children)
          for (const m of child.modules) {
            const module = m as unknown as ModuleLike
            const record = module.buildInfo && recordOf(module)
            if (record && record.facts.length > 0) {
              snapshotOf(envOf(module)).set(record.canonicalId, record.facts)
              asked.add(record.canonicalId)
            }
          }
        }
        if (session.fnModules.size > 0) {
          interface Candidate {
            module: ModuleLike
            env: EnvState
            record: ServerFnBuildInfo
          }
          const definers: Array<Candidate> = []
          const providers: Array<Candidate> = []
          const resolverPath = opts.serverFnResolver?.path()
          const resolvers = new Set<string>()
          // (by resource first: a module's environment is asked of the few
          // that can hold a record, not of every module of the compilation)
          const resources = resourcesOf(session.fnModules)
          for (const m of compilation.modules) {
            const module = m as unknown as ModuleLike
            if (!module.resource) {
              continue
            }
            if (module.resource === resolverPath) {
              resolvers.add(module.identifier())
              continue
            }
            const one = module as ModuleLike & { resource: string }
            if (
              !resources.has(one.resource) ||
              !session.fnModules.has(keyOf(one))
            ) {
              continue
            }
            const record = recordOf(module)
            if (!record) {
              continue
            }
            const kind = identify(canonicalResource(one.resource)).derived?.kind
            ;(kind === 'provider' || kind === 'handler'
              ? providers
              : definers
            ).push({ module, env: envOf(module), record })
          }
          const held = rspackHolds(compilation as never, { clientReferences })
          const admitted = new Set<Candidate>()
          // every module of a file records the file's functions (the file,
          // its split chunks): one of them admitted declares them for its
          // environment, the others are not walked
          const declared = new Set<string>()
          const declares = ({ env, record }: Candidate) =>
            `${env.name}\0${record.canonicalId}`
          if (resolvers.size === 0) {
            // (no resolver here: the client compiler, whose modules call)
            for (const candidate of [...definers, ...providers]) {
              if (
                !declared.has(declares(candidate)) &&
                held(candidate.module)
              ) {
                admitted.add(candidate)
                declared.add(declares(candidate))
              }
            }
          } else {
            for (const entry of session.start.registry.entries()) {
              if (entry.clientReferenced) {
                asked.add(entry.definingCanonicalId)
              }
            }
            const grounds = new Set<string>()
            for (let changed = true; changed; ) {
              changed = false
              const grounded = rspackHolds(compilation as never, {
                stop: resolvers,
                grounds,
                clientReferences,
              })
              for (const candidate of definers) {
                if (
                  !declared.has(declares(candidate)) &&
                  grounded(candidate.module)
                ) {
                  admitted.add(candidate)
                  declared.add(declares(candidate))
                  asked.add(candidate.record.canonicalId)
                  changed = true
                }
              }
              for (const candidate of providers) {
                if (
                  !admitted.has(candidate) &&
                  asked.has(candidate.record.canonicalId) &&
                  held(candidate.module)
                ) {
                  admitted.add(candidate)
                  grounds.add(candidate.module.identifier())
                  changed = true
                }
              }
            }
          }
          for (const candidate of definers) {
            if (admitted.has(candidate) && candidate.record.facts.length > 0) {
              snapshotOf(candidate.env).set(
                candidate.record.canonicalId,
                candidate.record.facts,
              )
            }
          }
          for (const { env, record } of providers.filter((p) =>
            admitted.has(p),
          )) {
            if (record.facts.length > 0) {
              snapshotOf(env).set(record.canonicalId, record.facts)
            } else {
              for (const snapshot of snapshots.values()) {
                snapshot.delete(record.canonicalId)
              }
            }
          }
        }
        for (const [env, snapshot] of snapshots) {
          session.start.registry.replace(env, snapshot)
        }
        derivedAt.set(compilation, session.loaderRuns)
      }

      /** The loader runs of the session when each compilation's registry was derived last (`close`). */
      const derivedAt = new WeakMap<Rspack.Compilation, number>()

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
        // whether modules were built since the registry was derived (the
        // replay did at stage -20). The last run follows what happened
        // since the first: a plugin built a module (again, or a new one),
        // this compiler's or, with RSC, the client compiler's it runs beside
        let built = last && derivedAt.get(compilation) !== session.loaderRuns
        for (;;) {
          const round = ++history.round
          if (!child && built) {
            deriveServerFns(compilation)
            built = false
          }
          // (what the child's requests stood for since its last round: its
          // `make`, the round's builds)
          if (child && childRequests.get(owner)?.has(compilation)) {
            await reportChildRequests(
              owner,
              compilation,
              (graph ??= nodeGraph(compilation)),
            )
          }
          const content = fnResolver?.pending(compilation) ?? null
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
            built = true
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
          built = true
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
       * §2.4). Carried by one current compilation, as every warning of
       * this host (the session's `warn`, rule 4): a compilation's last run
       * meets its first run's refusal again, with the same history, and a
       * report has it once.
       */
      function reportUnsettled(
        compilation: Rspack.Compilation,
        what: { file: string; cause: string },
        detail: string,
        message: string,
      ): void {
        session.warn(
          environment.name,
          `\0unsettled\0${what.file}\0${what.cause}`,
          () => {
            invariantViolated({
              effect:
                'import protection may serve a module as its mock or as it is',
              detail,
            })
            ;(session.start.opts.mode === 'dev'
              ? compilation.warnings
              : compilation.errors
            ).push(new WebpackError(message))
          },
        )
      }

      /** Custom server-fn ids: this environment's rank, patched before minification. */
      function patchFunctionIds(compilation: Rspack.Compilation): void {
        const { allocator, errors, warnings } = session.start.allocateIds(
          environment.type,
        )
        // (every environment allocates the same custom ids, and Rsbuild
        // prints each environment's errors and warnings: one current
        // compilation carries each, the session's `warn`)
        for (const error of errors) {
          session.warn(environment.name, `\0function-id\0${error}`, () =>
            compilation.errors.push(new WebpackError(error)),
          )
        }
        for (const warning of warnings) {
          session.warn(environment.name, `\0function-id\0${warning}`, () =>
            compilation.warnings.push(new WebpackError(warning)),
          )
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
      // of the tree module. The module of this compiler's compilation is built again when it
      // was built from another text than the transform serves now (`generated-module.ts`):
      // its routes changed and the tree file did not. A module the persistent cache restored
      // is judged by what it was built from, as one built now (a child compiler's module of
      // the tree, a worker's, is another module: the transform served it its own)
      if (opts.clientRouteTree && environment.type === 'client') {
        const tree = opts.clientRouteTree
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
                const ids = new Set(tree.paths())
                const current = await tree.module()
                const built = await buildGenerated(
                  compilation,
                  session.generatedTarget(
                    environment.name,
                    [...ids],
                    (resource) => ids.has(canonicalResource(resource)),
                  ),
                  current.module,
                )
                if (!built && evidence !== null) {
                  // (a module this process did not build serves this tree)
                  evidence.clientServed(current.tree)
                }
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
                  const records = !!buildInfo && holdsRecord(buildInfo)
                  if (
                    !records ||
                    !module.resource ||
                    compiledHere(module as ModuleLike & { resource: string })
                  ) {
                    continue
                  }
                  const env = envOf(module)
                  // (a compile in this process replaces them)
                  session.noteRestored(env.name, module.resource, buildInfo)
                  const plan = partOf(buildInfo, PLAN_PART) as
                    | PersistedPlan
                    | undefined
                  if (plan) {
                    restored.push({ plan, env })
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
                  const record = partOf(
                    module.buildInfo,
                    IMPORT_PROTECTION_PART,
                  )
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
                  const record = partOf(
                    module.buildInfo,
                    IMPORT_PROTECTION_PART,
                  )
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
              deriveServerFns(compilation)
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
        ? serverFnResolverRebuild(opts.serverFnResolver, (file) =>
            session.generatedTarget(
              environment.name,
              [file],
              (resource) => resource === file,
            ),
          )
        : null
      compiler.hooks.finishMake.tapPromise(
        { name: `${PLUGIN_NAME}:close`, stage: -10 },
        (compilation) =>
          reporting(
            compilation.errors,
            'Building the out-of-date modules again',
            async () => {
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
