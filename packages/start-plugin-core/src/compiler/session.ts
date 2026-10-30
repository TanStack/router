/**
 * The bundler-free part of a Start compile session (one dev server or
 * build), shared by Start's Vite and Rsbuild hosts: the raw facts, compiler
 * caches, import protection, server-fn registry and id allocator, and the
 * warning ledger; what one compile of a module is in an environment (its
 * planners, configuration and `EnvInfo`); what every compile is followed by
 * (registry record, import protection); one reporting policy. The hosts keep
 * the bundler wiring: hooks, module graph invalidation, witnesses, virtual
 * modules, and Rspack's `buildInfo` replay.
 */
import {
  RawFactsCache,
  WarningLedger,
  collectionSizes,
  compileModule,
  createCompilerCaches,
  digestOf,
  identify,
  registerCompilerStats,
  releaseEnvironment,
  reportCompileDiagnostics,
} from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routeRefreshMarkers,
  routerPlanner,
  routerPlannerConfigDigest,
  routerPlannerConfigFrom,
} from '@tanstack/router-plugin/planners'
import { START_ENV, startPlanners } from '../planners'
import { HYDRATE_PLANNER, createHydratePlanner } from '../planners/hydrate'
import { RSC_CSS } from '../planners/rsc-css'
import { FunctionIdAllocator } from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import { createImportProtection } from '../import-protection/session'
import { IMPORT_EDGES_PLANNER } from '../import-protection/violations'
import { namesStartSpecifier, startRecognizer } from './recognizer'
import {
  NODE_MODULES_RE,
  opaquePackageModule,
  startCompileScope,
} from './scope'
import { NO_LEAK_FACTS, unfollowedImports } from './escape-graph'
import type { ClientGraph, LeakFacts, ReExport } from './escape-graph'
import type {
  CompileOutcome,
  CompiledOutputLike,
  ImportProtection,
} from '../import-protection/session'
import type { EdgeModuleIds } from '../import-protection/edge-modules'
import type { HydratePlannerConfig } from '../planners/hydrate'
import type { ImportEdgesConfig } from '../planners/edges'
import type { RscCssConfig, StartEnvConfig, StartEnvFacts } from '../planners'
import type { ServerFnFact } from '../server-fns/registry'
import type { GenerateFunctionId } from '../server-fns/ids'
import type { ImportProtectionOptions } from '../schema'
import type { CompileStartFrameworkOptions, StartRscOptions } from '../types'
import type { Config as RouterConfig } from '@tanstack/router-plugin'
import type { RouterPlannerConfig } from '@tanstack/router-plugin/planners'
import type {
  CompileConfig,
  CompileOutput,
  CompilerCaches,
  DiagnosticSink,
  EnvInfo,
  HostServices,
  InputSourceMap,
  Planner,
  RouteRegistry,
} from '@tanstack/router-utils/compiler'

export interface StartCompilerEnvironment {
  name: string
  type: 'client' | 'server'
}

export interface StartCompilerSessionOptions {
  framework: CompileStartFrameworkOptions
  /** From the bundler's command or action, never `process.env.NODE_ENV`. */
  mode: 'dev' | 'build'
  root: string
  srcDirectory: string
  environments: Array<StartCompilerEnvironment>
  /**
   * The environment whose compiles provide the server functions
   * (`EnvInfo.isProvider`): Vite's provider environment (SSR, or RSC's
   * own), Rsbuild's server environment (both of its layers).
   */
  providerEnv: string
  /** RSC on: server components render, and provide the server functions, apart from SSR. */
  rsc: StartRscOptions | undefined
  /**
   * Where server components render: Rsbuild's Rspack layer of the server
   * environment; undefined on Vite, where they render in the provider
   * environment.
   */
  rscLayer?: string
  generateFunctionId: GenerateFunctionId | undefined
  /** The user's `router.codeSplittingOptions` (Start's rules apply over them). */
  codeSplittingOptions: RouterConfig['codeSplittingOptions']
  /** The bundler's hot API, for route HMR. */
  hmrStyle: 'vite' | 'webpack'
  importProtection: ImportProtectionOptions | undefined
  /** How the host names import-protection edge modules (default: Vite ids). */
  edgeModuleIds?: EdgeModuleIds
  /** Whether a path is an app entry (import protection: a marked entry is its own violation). */
  isEntry: (path: string) => boolean
  /** The route registry (the generator's `routesByFile`). */
  routes: RouteRegistry
  readFile: (file: string) => Promise<string | null>
  /** Reads a genuinely virtual module through environment `env`, which resolved it (a Vite plugin's `load`). */
  loadVirtual: (id: string, env: string) => Promise<string | null>
  /**
   * Vite: modules the summaries never read, whatever their text
   * (pre-bundled dependencies), besides Start's rule (`opaquePackageModule`).
   */
  opaque?: (path: string) => boolean
  /** The caches' label (`TSR_COMPILER_STATS`). */
  label: string
}

/** One compile of a module (`StartCompilerSession.compile`). */
export interface StartCompileInput {
  /** The bundler's id (path with query). */
  id: string
  code: string
  env: StartCompilerEnvironment
  /** The module's Rspack layer, if any. */
  layer?: string
  inputMap: () => InputSourceMap | null
  wantMap: boolean
  /**
   * The late import-protection pass: the JS output of a module that is no
   * JS/TS (`.vue`, `.mdx`), judged by the `import-edges` planner alone.
   */
  late?: boolean
}

const NO_OUTCOME: CompileOutcome = { error: null }

export class StartCompilerSession {
  /** Import protection of the session (null: `enabled: false`). */
  readonly ip: ImportProtection | null
  /** Whether a module is compiled (`startCompileScope`). */
  readonly compiles: (path: string, code: string) => boolean
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  readonly registry = new ServerFnRegistry()
  /** The custom-id allocator (with a custom `generateFunctionId`). */
  readonly allocator: FunctionIdAllocator | null
  readonly warnings = new WarningLedger()
  private readonly routerConfigs = new Map<
    'client' | 'server',
    RouterPlannerConfig
  >()
  private readonly planners = new Map<string, Array<Planner>>()
  private readonly configs = new Map<string, CompileConfig>()
  /**
   * What each client compile recorded for the check of its environment's
   * graph (`checkClientGraph`), by environment and canonical id: one entry
   * per module the Start planners compiled there.
   */
  private readonly leakFacts = new Map<string, Map<string, LeakFacts>>()

  constructor(readonly opts: StartCompilerSessionOptions) {
    this.allocator = opts.generateFunctionId
      ? new FunctionIdAllocator(opts.generateFunctionId)
      : null
    this.ip = createImportProtection({
      options: opts.importProtection,
      root: opts.root,
      srcDirectory: opts.srcDirectory,
      mode: opts.mode,
      ids: opts.edgeModuleIds,
      readFile: opts.readFile,
      isEntry: opts.isEntry,
    })
    for (const env of opts.environments) {
      this.ip?.env(env.name, env.type)
    }
    this.compiles = startCompileScope(this.ip)
    const packageModule = opaquePackageModule(this.ip)
    this.rawFacts = new RawFactsCache({
      readFile: opts.readFile,
      loadVirtual: opts.loadVirtual,
      recognizer: startRecognizer(),
      // every analysis of the session agrees on the marker specifiers
      markerSpecifiers: this.ip?.markerSpecifiers,
      opaque: (path, text) =>
        (opts.opaque?.(path) ?? false) || packageModule(path, text),
    })
    this.caches = createCompilerCaches(this.rawFacts, opts.label)
    registerCompilerStats(`${opts.label}:session`, this, (o) =>
      collectionSizes(
        {
          registry: o.registry,
          warnings: o.warnings,
          ip: o.ip,
          routes: o.opts.routes,
        },
        4,
      ),
    )
  }

  /**
   * Whether a compile renders server components (RSC on): the router
   * planner does not run there (its route modules are the providers' twins
   * of the SSR ones and stay unsplit, so the router's lazy wrapper, a React
   * hook in development, never resolves against the react-server build of
   * React), and the `rsc-css` planner does.
   */
  private rendersServerComponents(
    env: string,
    layer: string | undefined,
  ): boolean {
    return (
      this.opts.rsc !== undefined &&
      (this.opts.rscLayer !== undefined
        ? layer === this.opts.rscLayer
        : env === this.opts.providerEnv)
    )
  }

  /** The router planner's configuration of an environment type (Start's rules over the user's options). */
  private routerConfig(type: 'client' | 'server'): RouterPlannerConfig {
    let cfg = this.routerConfigs.get(type)
    if (!cfg) {
      cfg = routerPlannerConfigFrom(this.opts.codeSplittingOptions, {
        framework: this.opts.framework,
        envType: type,
        mode: this.opts.mode,
        hmrStyle: this.opts.hmrStyle,
        start: true,
      })
      this.routerConfigs.set(type, cfg)
    }
    return cfg
  }

  envInfo(env: StartCompilerEnvironment, layer?: string): EnvInfo {
    return {
      name: env.name,
      type: env.type,
      isProvider: env.name === this.opts.providerEnv,
      mode: this.opts.mode,
      ...(layer ? { layer } : {}),
    }
  }

  private plannersFor(
    env: StartCompilerEnvironment,
    rsc: boolean,
  ): Array<Planner> {
    const key = `${env.name}\u0000${rsc ? 'rsc' : ''}`
    let planners = this.planners.get(key)
    if (!planners) {
      planners = startPlanners({
        hydrate: createHydratePlanner(),
        rscCss: rsc,
        router: rsc ? null : routerPlanner(),
        importEdges: this.ip?.planner ?? null,
      })
      this.planners.set(key, planners)
    }
    return planners
  }

  private configFor(
    env: StartCompilerEnvironment,
    rsc: boolean,
    layer: string | undefined,
  ): CompileConfig {
    const key = `${env.name}\u0000${layer ?? ''}`
    let config = this.configs.get(key)
    if (!config) {
      const { opts } = this
      const idMode: StartEnvConfig['idMode'] =
        opts.mode === 'dev' ? 'dev' : this.allocator ? 'placeholder' : 'default'
      const startEnv: StartEnvConfig = {
        framework: opts.framework,
        root: opts.root,
        providerSeparate: opts.rsc !== undefined,
        idMode,
        providerDirective: opts.rsc?.providerDirective,
      }
      const router = rsc ? null : this.routerConfig(env.type)
      const hydrate: HydratePlannerConfig = {
        root: opts.root,
        refreshMarkers: routeRefreshMarkers(router),
      }
      const rscCss: RscCssConfig | undefined =
        rsc && opts.rsc
          ? { loadCssExpression: opts.rsc.loadCssExpression }
          : undefined
      config = {
        configKey: digestOf({
          framework: opts.framework,
          root: opts.root,
          idMode,
          rsc: opts.rsc ?? null,
          env: env.name,
          layer: layer ?? null,
          router: router && routerPlannerConfigDigest(router),
          ip: this.ip?.config.configKey ?? null,
        }),
        perPlanner: {
          [IMPORT_EDGES_PLANNER]: env.type satisfies ImportEdgesConfig,
          [START_ENV]: startEnv,
          [HYDRATE_PLANNER]: hydrate,
          [RSC_CSS]: rscCss,
          [ROUTER_PLANNER]: router,
        } as Record<string, unknown>,
      }
      this.configs.set(key, config)
    }
    return config
  }

  /** Host services of the session over a host's resolver. */
  host(
    resolve: HostServices['resolve'],
    services?: HostServices['services'],
  ): HostServices {
    return {
      resolve,
      rawFacts: this.rawFacts,
      routes: this.opts.routes,
      ...(services && { services }),
    }
  }

  /**
   * Compiles one id (env or derived) of a module of an environment; the
   * server functions the compile reports (none included) replace the
   * module's in the registry (a late pass reports none of its own).
   */
  async compile(
    input: StartCompileInput,
    host: HostServices,
  ): Promise<CompileOutput | null> {
    const { env, layer, late } = input
    const rsc = this.rendersServerComponents(env.name, layer)
    const config = this.configFor(env, rsc, layer)
    const out = await compileModule(
      {
        id: input.id,
        code: input.code,
        env: this.envInfo(env, layer),
        planners: late ? [this.ip!.planner] : this.plannersFor(env, rsc),
        config: late
          ? {
              configKey: lateConfigKey(config.configKey),
              perPlanner: { [IMPORT_EDGES_PLANNER]: env.type },
            }
          : config,
        inputMap: input.inputMap,
        wantMap: input.wantMap,
        ...(late ? { lang: 'jsx' as const } : {}),
      },
      host,
      this.caches,
    )
    if (!late) {
      const identity = identify(input.id)
      this.registry.set(env, identity.canonicalId, out && serverFnFactsOf(out))
      if (env.type === 'client' && identity.derived === null) {
        this.leakFactsIn(env.name).set(
          identity.canonicalId,
          out
            ? leakFactsOf(out, NODE_MODULES_RE.test(identity.path))
            : NO_LEAK_FACTS,
        )
      }
    }
    return out
  }

  private leakFactsIn(env: string): Map<string, LeakFacts> {
    let facts = this.leakFacts.get(env)
    if (!facts) {
      facts = new Map()
      this.leakFacts.set(env, facts)
    }
    return facts
  }

  /** Replaces a client environment's records (Rsbuild: replayed from the modules' `buildInfo`, persistent cache included). */
  replaceLeakFacts(env: string, facts: Map<string, LeakFacts>): void {
    this.leakFacts.set(env, facts)
  }

  /**
   * The check of a client environment's module graph (`escape-graph.ts`):
   * the messages of the importers of a module exporting a builder that the
   * compiler did not follow. `modules`: the graph's module ids.
   */
  checkClientGraph(
    env: string,
    graph: Pick<ClientGraph, 'importers' | 'resolve'>,
    modules: Iterable<string>,
  ): Promise<Array<string>> {
    const facts = this.leakFactsIn(env)
    /** Directory → the name of the package it belongs to (null: none). */
    const packages = new Map<string, Promise<string | null>>()
    const packageOf = (dir: string): Promise<string | null> => {
      let name = packages.get(dir)
      if (!name) {
        name = this.opts.readFile(`${dir}/package.json`).then((text) => {
          const parent = dir.slice(0, dir.lastIndexOf('/'))
          if (text !== null) {
            try {
              const pkg = JSON.parse(text) as { name?: unknown }
              if (typeof pkg.name === 'string') {
                return pkg.name
              }
            } catch {
              // (not a package manifest)
            }
          }
          return parent.length > 0 && parent !== dir ? packageOf(parent) : null
        })
        packages.set(dir, name)
      }
      return name
    }
    const known = startRecognizer().factories
    return unfollowedImports(
      {
        ...graph,
        facts: (id) => {
          const identity = identify(id)
          const f = facts.get(identity.canonicalId)
          // a derived module of a compiled module (a split chunk) exports none of its builders
          return f && identity.derived !== null ? NO_LEAK_FACTS : f
        },
        reexports: async (id) => {
          const summary = (
            await this.rawFacts.get(identify(id).canonicalId, env)
          ).summary
          const out: Array<ReExport> = []
          for (const [name, fact] of Object.entries(summary?.exports ?? {})) {
            if (fact.kind === 'reExport') {
              out.push({ specifier: fact.specifier, name, from: fact.fromName })
            } else if (fact.kind === 'namespace') {
              out.push({ specifier: fact.specifier, name, from: null })
            }
          }
          for (const specifier of summary?.stars ?? []) {
            out.push({ specifier, name: null, from: null })
          }
          return out
        },
        isStartPackage: async (id) => {
          const path = identify(id).path
          const slash = path.lastIndexOf('/')
          if (slash <= 0) {
            return false
          }
          const name = await packageOf(path.slice(0, slash))
          return name !== null && Object.hasOwn(known, name)
        },
        read: (id) => this.opts.readFile(identify(id).path),
        name: (id) => relativeName(this.opts.root, identify(id).path),
      },
      modules,
    )
  }

  /**
   * Whether a plan's configuration key (one an earlier process persisted)
   * is this session's for a module of `env` and `layer`, of the main
   * compile or of the late pass.
   */
  configured(
    configKey: string,
    env: StartCompilerEnvironment,
    layer: string | undefined,
  ): boolean {
    const own = this.configFor(
      env,
      this.rendersServerComponents(env.name, layer),
      layer,
    ).configKey
    return configKey === own || configKey === lateConfigKey(own)
  }

  /**
   * After every compile of an id (fresh or cached): import protection
   * registers its edges and, in dev, reports its violations: an
   * `error`-behaviour one fails the module (the host serves no output). A
   * module that is its own violation is served as its mock (`mock`). A
   * promise only when violations are decided now (`log: 'always'`, a
   * module's own violation in Vite's dev server).
   */
  afterCompile(
    env: StartCompilerEnvironment,
    id: string,
    out: CompiledOutputLike,
  ): CompileOutcome | Promise<CompileOutcome> {
    return this.ip?.env(env.name, env.type).afterCompile(id, out) ?? NO_OUTCOME
  }

  /** Import protection's verdict on an id with an asset query, for `afterCompile`; null when it is not denied (`ImportProtectionEnv.assetOutput`). */
  async assetOutput(
    env: StartCompilerEnvironment,
    id: string,
  ): Promise<CompiledOutputLike | null> {
    return (
      this.ip
        ?.env(env.name, env.type)
        .assetOutput(id, (path) => this.rawFacts.marker(path, env.name)) ?? null
    )
  }

  /** Forgets what the session holds of a deleted file (by path): its server functions and import protection's records. */
  forget(path: string): void {
    this.registry.forget(path)
    this.ip?.forget(path)
    for (const facts of this.leakFacts.values()) {
      for (const id of facts.keys()) {
        if (id.split('?')[0] === path) {
          facts.delete(id)
        }
      }
    }
  }

  /**
   * Reports a compile's diagnostics (`reportCompileDiagnostics`). A module
   * the compiler cannot parse is left as it is when it names no Start
   * package: the bundler's own parser reports a syntax error at the user's
   * position, and a script no ESM parse accepts (a CommonJS dependency with
   * a top-level `return`) is nothing the compiler touches (J4.16, SPEC
   * §5.15). One that names a Start package may define server code (a
   * handler, a server-only route option): the client build fails naming the
   * file (never shipped untransformed, J4.12); a server build warns.
   */
  report(
    out: CompileOutput,
    file: string,
    code: string,
    envType: 'client' | 'server',
    sink: DiagnosticSink,
  ): void {
    reportCompileDiagnostics(
      out.diagnostics,
      file,
      code,
      this.warnings,
      sink,
      (d) =>
        namesStartSpecifier(code)
          ? {
              severity: envType === 'client' ? 'error' : 'warning',
              message: `[tanstack-start] The compiler cannot parse "${file}", which uses a TanStack Start or Router API, so it cannot compile its server code: ${d.message}`,
              range: d.range,
              by: 'parse',
              code: 'parse',
            }
          : null,
    )
  }

  /** The id allocator with an environment's rank allocated (a custom generator): a client build's client-referenced functions first, the rest after. */
  allocateIds(envType: 'client' | 'server'): FunctionIdAllocator {
    const allocator = this.allocator!
    const entries = this.registry.entries()
    allocator.allocate(
      envType === 'client'
        ? entries.filter((e) => e.clientReferenced)
        : entries,
    )
    return allocator
  }

  /**
   * After the last pass of an environment's production build: releases its
   * plans and its import protection. What the environments share (raw
   * facts, registry, id allocator, warnings) stays.
   */
  release(envName: string): void {
    releaseEnvironment(this.caches, envName)
    this.ip?.release(envName)
    this.leakFacts.delete(envName)
  }
}

/** The configuration key of the late pass (import protection over a non-JS module's JS) of a configuration. */
const lateConfigKey = (configKey: string) => `late\u0000${configKey}`

/**
 * What a client compile records for the graph check: start-env's facts and
 * the module's `import()` / `require()` specifiers. A dependency's exports
 * are not followed (a Start library's modules, like Start's own, are each
 * their own; see `startCompileScope`).
 */
export function leakFactsOf(out: CompileOutput, dependency = false): LeakFacts {
  const facts = out.facts.planners[START_ENV] as StartEnvFacts | undefined
  return {
    leakProneExports: (!dependency && facts?.leakProneExports) || [],
    escapingNamespaces: facts?.escapingNamespaces ?? [],
    dynamicImports: out.edges.flatMap((e) =>
      e.form === 'dynamic' || e.form === 'require' ? [e.specifier] : [],
    ),
  }
}

function relativeName(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

/** The server functions a compile defines (start-env's facts), if any. */
export function serverFnFactsOf(
  out: CompileOutput,
): Array<ServerFnFact> | null {
  const facts = out.facts.planners[START_ENV] as StartEnvFacts | undefined
  return facts && facts.serverFns.length > 0 ? facts.serverFns : null
}
