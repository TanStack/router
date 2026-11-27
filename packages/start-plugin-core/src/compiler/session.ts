/**
 * The bundler-free part of a Start compile session (one dev server or
 * build), shared by Start's Vite and Rsbuild hosts: the raw facts, compiler
 * caches, import protection, server-fn registry and id allocator, and the
 * warning ledger; what one compile of a module is in an environment (its
 * planners, configuration and `EnvInfo`); what every compile is followed by
 * (registry record, import protection); one reporting policy. The hosts keep
 * the bundler wiring: hooks, module graph invalidation, chunk-list readers, virtual
 * modules, and Rspack's `buildInfo` replay.
 */
import {
  RawFactsCache,
  SourceText,
  WarningLedger,
  collectionSizes,
  createCompilerCaches,
  digestOf,
  displayPath,
  fileModifiedAt,
  holdKey,
  identify,
  langFromId,
  liveKey,
  parseModule,
  pathOfId,
  registerCompilerStats,
  releaseEnvironment,
  reportCompileDiagnostics,
  settleModule,
} from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerConfigDigest,
  routerPlannerConfigFrom,
} from '@tanstack/router-plugin/planners'
import { START_ENV, startEnvPlanner, startPlanners } from '../planners'
import { HYDRATE_PLANNER, createHydratePlanner } from '../planners/hydrate'
import { RSC_CSS } from '../planners/rsc-css'
import {
  FunctionIdAllocator,
  callSpellings,
  calledIds,
  gateToken,
} from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import {
  createImportProtection,
  runReports,
} from '../import-protection/session'
import { normalizePath } from '../utils'
import { IMPORT_EDGES_PLANNER } from '../import-protection/violations'
import { namesStartSpecifier, startRecognizer } from './recognizer'
import { startCompileScope } from './scope'
import {
  PackageClasses,
  isStartPackage,
  namesStart,
  packageRootOf,
} from './package-class'
import { isVueSfc, vueReport } from './vue'
import { originalPositions } from './reprinted'
import type { ImportProtection, Judgement } from '../import-protection/session'
import type { SfcLocate } from './vue'
import type { EdgeModuleIds } from '../import-protection/edge-modules'
import type { HydratePlannerConfig } from '../planners/hydrate'
import type { ImportEdgesConfig } from '../planners/edges'
import type { RscCssConfig, StartEnvConfig } from '../planners'
import type { ServerFnFact } from '../server-fns/registry'
import type { GenerateFunctionId } from '../server-fns/ids'
import type { ImportProtectionOptions } from '../schema'
import type { CompileStartFrameworkOptions, StartRscOptions } from '../types'
import type { Config as RouterConfig } from '@tanstack/router-plugin'
import type { RouterPlannerConfig } from '@tanstack/router-plugin/planners'
import type {
  CompileConfig,
  CompileInput,
  CompileOutput,
  CompilerCaches,
  Diagnostic,
  DiagnosticPosition,
  DiagnosticSink,
  EnvInfo,
  HostServices,
  InputSourceMap,
  PersistedPlan,
  Planner,
  RouteRegistry,
} from '@tanstack/router-utils/compiler'

/**
 * A compile environment: what a Start plan belongs to. Vite: one per
 * configured environment. Rsbuild: one per compiler, and one per Rspack
 * layer of the server compiler whose modules compile apart (RSC's layer:
 * `rsc`).
 */
export interface StartCompilerEnvironment {
  /** The key of its state: plans, stale sets, import protection, registry snapshots, edge keys, configuration. */
  name: string
  type: 'client' | 'server'
  /**
   * The environment name reports and import protection's callbacks give
   * (`info.env`), when it is not `name` (an Rsbuild user layer: its
   * compiler's).
   */
  publicName?: string
  /**
   * Where the environment renders server components (RSC on): the
   * environment that renders their client references on the server, to
   * which the bundler brings the `'use client'` files they import (import
   * protection: `EdgeViolation.handoff`).
   */
  clientReferencesInto?: string
}

export interface StartCompilerSessionOptions {
  /**
   * The host decides the "does not declare Start" warning itself, from the
   * modules of each compilation (`usesStartInPackage` of each compile,
   * recorded with the module, then `packageUseWarning`): Rsbuild, whose
   * persistent cache restores modules without compiling them. Default: the
   * compile that recognises the use reports it.
   */
  packageUseAtSeal?: boolean
  /**
   * The host derives the server-function registry from the modules each of
   * its compilations holds, as its one writer (`ServerFnRegistry.replace`):
   * a compile registers nothing. Rsbuild, whose compilations keep, restore
   * and drop modules on their own schedule, and whose loader may serve a
   * module otherwise than it compiled (an import-protection mock). Default:
   * each compile replaces its module's snapshot.
   */
  serverFnsAtSettlement?: boolean
  framework: CompileStartFrameworkOptions
  /** From the bundler's command or action, never `process.env.NODE_ENV`. */
  mode: 'dev' | 'build'
  root: string
  srcDirectory: string
  /** The compile environments known when the session starts (a host adds others: `addEnvironment`). */
  environments: Array<StartCompilerEnvironment>
  /**
   * The compile environment whose compiles provide the server functions
   * (`EnvInfo.isProvider`): the SSR environment, or with RSC the one that
   * renders server components (Vite's provider environment, Rsbuild's
   * `rsc`).
   */
  providerEnv: string
  /** RSC on: server components render, and provide the server functions, apart from SSR (in `providerEnv`). */
  rsc: StartRscOptions | undefined
  generateFunctionId: GenerateFunctionId | undefined
  /** The user's `router.codeSplittingOptions` (Start's rules apply over them). */
  codeSplittingOptions: RouterConfig['codeSplittingOptions']
  /** The bundler's hot API, for route HMR. */
  hmrStyle: 'vite' | 'webpack'
  importProtection: ImportProtectionOptions | undefined
  /** How the host names import-protection edge modules (default: Vite ids). */
  edgeModuleIds?: EdgeModuleIds
  /** Whether the host settles import protection's verdicts from the compilation's graph (`CreateImportProtectionOptions.settles`). */
  settlesImportVerdicts?: boolean
  /** Whether a path is an app entry (import protection: a marked entry is its own violation). */
  isEntry: (path: string) => boolean
  /** The route registry (the generator's `routesByFile`). */
  routes: RouteRegistry
  readFile: (file: string) => Promise<string | null>
  /** Reads a genuinely virtual module through environment `env`, which resolved it (a Vite plugin's `load`). */
  loadVirtual: (id: string, env: string) => Promise<string | null>
  /**
   * Vite: modules the summaries never read, whatever their text
   * (pre-bundled dependencies).
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
  inputMap: () => InputSourceMap | null
  wantMap: boolean
  /** How the map's consumer counts lines (`CompileInput.lines`). */
  lines?: 'ecma' | 'lf'
}

/** What `settleCore` settles: a compile input, of the main pass or the late one (`ScriptRequest.pass`). */
interface SettleInput extends StartCompileInput {
  /** The late pass: the JS output of a module that is no JS/TS (`.vue`, `.mdx`), compiled in place by start-env and import protection only. */
  late?: boolean
  /** The language of a late pass's code (default `jsx`): the module type the bundler parses it as. */
  lang?: CompileInput['lang']
}

/** One module handed to the session (`StartCompilerSession.transform`): a script, or an asset (no bytes yet). */
export type ModuleRequest = ScriptRequest | AssetRequest

/**
 * A script module: a JS/TS module of the bundler's main transform
 * (`pass: 'main'`), or the JavaScript another plugin made of a module that
 * is no JS/TS (`.vue`, `.mdx`: `pass: 'late'`), judged by `start-env` and
 * import protection only.
 */
export interface ScriptRequest {
  moduleType: 'js'
  pass: 'main' | 'late'
  /**
   * A child compilation's module (Rsbuild: a worker's), another module than
   * the compiler's of the same id: its own key in the committed-id set,
   * never a registry writer; the id's import protection record is retired
   * only when its last committed instance retires.
   */
  instance?: 'child'
  /** The bundler's id (path with query). */
  id: string
  code: string
  env: StartCompilerEnvironment
  inputMap: () => InputSourceMap | null
  wantMap: boolean
  /** How the map's consumer counts lines (`CompileInput.lines`). */
  lines?: 'ecma' | 'lf'
  /** The positions of a compile of another plugin's output, in the original file (a Vue SFC's script: `report`'s `inputMap`). */
  originalMap?: () => InputSourceMap | null
  /** A host that bundles only the Start packages it found (`report`'s `reach`), read for a compiled module only. */
  reach?: () => StartPackageReach | undefined
  /** The late pass: the language the bundler parses the code as (default `jsx`). */
  lang?: CompileInput['lang']
  /**
   * The module's type as the bundler types it, asked only of a module the
   * session admits (a host's read can cost): `asset` (Rspack's
   * `asset/source`: its text is the module's export) is judged as an asset,
   * never compiled; `other` (a type that is no script: `json`) is the
   * host's, left as it is. Default `js`.
   */
  typeOf?: () => 'js' | 'asset' | 'other'
  /** The id's identity when the host has it (`identify(id)`). */
  identity?: ReturnType<typeof identify>
  /**
   * The late pass: whether the bundler parses the code as it is (asked when
   * the compiler cannot): code neither parses is another plugin's input
   * (Markdown a later plugin compiles), not the compiler's.
   */
  bundlerParses?: () => boolean
}

/**
 * An asset id (`x.ts?raw`, `x.svg?url`, `?inline`, `?worker`, a file the
 * bundler loads as no script): never compiled, judged by import protection
 * alone (a denied file's text is served as its mock). The core holds its
 * key while it is judged (`holdKey`): an event of its file overtakes the
 * answer, which then commits and reports nothing; two loads with no event
 * between them both commit, in either order.
 */
export interface AssetRequest {
  moduleType: 'asset'
  id: string
  env: StartCompilerEnvironment
  instance?: 'child'
}

/** What the host serves for a module (`StartCompilerSession.transform`). */
export type ModuleOutcome =
  /** The module as it is (untouched, or not the compiler's). */
  | { kind: 'passthrough' }
  /** The compile's output; `unchanged`: its code is the input's (the upstream map stands). */
  | { kind: 'served'; output: CompileOutput; unchanged: boolean }
  /** The mock of a module that is its own violation, instead of the output (an asset's: no output). */
  | {
      kind: 'mock'
      output: CompileOutput | null
      code: string
      mockId: string
    }
  /**
   * The module fails, current or not: the compile's errors (the first is
   * the module's failure; a current answer commits nothing: the module's
   * record stays), or import protection's (dev `behavior: 'error'`; a
   * current answer commits its judged record).
   */
  | {
      kind: 'failed'
      output: CompileOutput | null
      errors: Array<ReportedDiagnostic>
      error: Error | null
    }

/** A diagnostic to report, with its positions (`StartDiagnosticSink`). */
export interface ReportedDiagnostic {
  d: Diagnostic
  at: DiagnosticPosition | undefined
  generated?: DiagnosticPosition
}

/** A warning to report once per run: `claim` takes it in the run's ledger (true: new). */
interface ReportedWarning extends ReportedDiagnostic {
  /** The module it is of, when not the compiled file (a bundle's source). */
  module?: string
  claim: () => boolean
}

/**
 * What a compile reports (`StartCompilerSession.diagnose`), decided and not
 * yet told: the errors, the package-use warnings and the compile's
 * warnings, each warning with its claim in the run's ledger.
 */
export interface Diagnosis {
  errors: Array<ReportedDiagnostic>
  packageWarnings: Array<ReportedWarning>
  warnings: Array<ReportedWarning>
}

/** What a host hands `transform` besides the module: where a committed answer's warnings go, and what follows a commit. */
export interface TransformHooks {
  /** Where a committed answer's warnings go, each claimed in the run's ledger; absent: a host that decides them itself (Rsbuild: at seal, from the records the sink writes). */
  warn?: NonNullable<StartDiagnosticSink['warn']>
  /** After a commit, before the caller gets its answer (Vite: the dev reporter's flush, `reloadMismatched`). */
  committed?: () => void | Promise<void>
  /**
   * Every answer's own record, current or not, in the turn of its commit
   * and before it: the host's instance-local store of what this run served
   * (Rsbuild: the module's `buildInfo`, which a held module and a warm
   * restart keep). `current`: whether the commit follows.
   */
  sink?: (
    outcome: ModuleOutcome,
    record: ModuleRecord,
    current: boolean,
  ) => void
}

/** What one answer served, as plain data (`TransformHooks.sink`). */
export interface ModuleRecord {
  /** The server functions the module declares as it is served (a mock: none). */
  fns: Array<ServerFnFact> | null
  /** Import protection's persistable record of the module (`ImportProtectionEnv.buildInfoOf`). */
  ip: { key: string; value: unknown } | null
  /** Every warning the compile found, unclaimed. */
  warnings: Array<ReportedDiagnostic>
  /** A Start use in a package (`usesStartInPackage`). */
  packageUse: boolean
  /** The plan's key and dependencies, for a cache that outlives the process. */
  plan: PersistedPlan | null
}

const NO_RECORD: ModuleRecord = {
  fns: null,
  ip: null,
  warnings: [],
  packageUse: false,
  plan: null,
}

const PASSTHROUGH: ModuleOutcome = { kind: 'passthrough' }

/** An answer of `transform`, and what its commit writes and tells. */
interface Answer {
  outcome: ModuleOutcome
  judgement: Judgement | null
  diagnosis: Diagnosis | null
}

const PASSED: Answer = {
  outcome: PASSTHROUGH,
  judgement: null,
  diagnosis: null,
}

export class StartCompilerSession {
  /** Import protection of the session (null: `enabled: false`). */
  readonly ip: ImportProtection | null
  /** Whether a module is compiled (`startCompileScope`). */
  readonly compiles: (path: string, code: string) => boolean
  /** The class of a module by its owning package (`PackageClasses`). */
  readonly classes: PackageClasses
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  readonly registry = new ServerFnRegistry()
  /** The custom-id allocator (with a custom `generateFunctionId`). */
  readonly allocator: FunctionIdAllocator | null
  readonly warnings = new WarningLedger()
  /** Rsbuild: the last production client build's publication (`publishClientOutput`); null before the run's first. */
  private published: ClientPublication | null = null
  /**
   * The modules with a committed record: by file, each module as
   * `${env}\0${id}` (the bundler's id: a derived output is a module of its
   * own; a child instance apart), written by the commit of a current answer
   * only. A module no longer admitted is left to the bundler without asking
   * the core only when it has none. (A host keeps its own index of what its
   * per-module store holds: Rsbuild's `recorded`, of `buildInfo`.)
   */
  private readonly committed = new Map<string, Set<string>>()
  private readonly routerConfigs = new Map<
    'client' | 'server',
    RouterPlannerConfig
  >()
  private readonly planners = new Map<string, Array<Planner>>()
  private readonly configs = new Map<string, CompileConfig>()

  constructor(readonly opts: StartCompilerSessionOptions) {
    this.allocator = opts.generateFunctionId
      ? new FunctionIdAllocator(opts.generateFunctionId)
      : null
    this.classes = new PackageClasses({
      framework: opts.framework,
      srcDirectory: opts.srcDirectory,
    })
    this.ip = createImportProtection({
      options: opts.importProtection,
      root: opts.root,
      srcDirectory: opts.srcDirectory,
      mode: opts.mode,
      ids: opts.edgeModuleIds,
      settles: opts.settlesImportVerdicts,
      isEntry: opts.isEntry,
      framework: opts.framework,
      rsc: opts.rsc !== undefined,
    })
    for (const env of opts.environments) {
      this.addEnvironment(env)
    }
    this.compiles = startCompileScope(
      this.ip,
      (path) => opts.routes.lookup(path) !== null,
    )
    this.rawFacts = new RawFactsCache({
      readFile: opts.readFile,
      modifiedAt: fileModifiedAt,
      loadVirtual: opts.loadVirtual,
      recognizer: startRecognizer(),
      jsx: opts.framework,
      // every analysis of the session agrees on the marker specifiers
      markerSpecifiers: this.ip?.markerSpecifiers,
      // every other module an import resolution reaches gets a summary,
      // whatever its package or text (main reads them on demand)
      opaque: opts.opaque,
    })
    // a removed file's server functions and import protection's records go
    // where the core applies the removal (a removal of a file that reads
    // back is a change and keeps them)
    this.caches = createCompilerCaches(this.rawFacts, opts.label, {
      removed: (path) => this.forget(path),
    })
    registerCompilerStats(
      `${opts.label}:session`,
      this,
      StartCompilerSession.readStats,
    )
  }

  /** A compile environment the host found (an Rsbuild layer's): its import protection's state. */
  addEnvironment(env: StartCompilerEnvironment): void {
    this.ip?.addEnvironment(
      env.name,
      env.type,
      env.publicName,
      env.clientReferencesInto,
    )
    this.ip?.env(env.name)
  }

  private static readStats(o: StartCompilerSession) {
    return collectionSizes(
      {
        registry: o.registry,
        warnings: o.warnings,
        ip: o.ip,
        routes: o.opts.routes,
      },
      4,
    )
  }

  /**
   * Whether a compile renders server components (RSC on, the provider
   * environment): the router planner does not run there (its route modules
   * are the providers' twins of the SSR ones and stay unsplit, so the
   * router's lazy wrapper, a React hook in development, never resolves
   * against the react-server build of React), and the `rsc-css` planner
   * does. With RSC off the SSR environment provides and keeps the router
   * planner.
   */
  private rendersServerComponents(env: string): boolean {
    return this.opts.rsc !== undefined && env === this.opts.providerEnv
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

  private envInfo(env: StartCompilerEnvironment): EnvInfo {
    return {
      name: env.name,
      type: env.type,
      isProvider: env.name === this.opts.providerEnv,
      mode: this.opts.mode,
    }
  }

  private plannersFor(env: StartCompilerEnvironment): Array<Planner> {
    let planners = this.planners.get(env.name)
    if (!planners) {
      const rsc = this.rendersServerComponents(env.name)
      planners = startPlanners({
        classes: this.classes,
        hydrate: createHydratePlanner(this.classes),
        rscCss: rsc,
        router: rsc ? null : routerPlanner(),
        importEdges: this.ip?.planner ?? null,
      })
      this.planners.set(env.name, planners)
    }
    return planners
  }

  /** The planners of a late pass: import protection's and start-env's (in place: no derived module of a file that is no JavaScript). */
  private latePlanners(): Array<Planner> {
    const key = '\u0000late'
    let planners = this.planners.get(key)
    if (!planners) {
      planners = [
        startEnvPlanner({
          late: true,
          classes: this.classes,
        }),
        ...(this.ip ? [this.ip.planner] : []),
      ]
      this.planners.set(key, planners)
    }
    return planners
  }

  private configFor(env: StartCompilerEnvironment): CompileConfig {
    let config = this.configs.get(env.name)
    if (!config) {
      const { opts } = this
      const rsc = this.rendersServerComponents(env.name)
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
      const hydrate: HydratePlannerConfig = { root: opts.root }
      const rscCss: RscCssConfig | undefined =
        rsc && opts.rsc
          ? { loadCssExpression: opts.rsc.loadCssExpression }
          : undefined
      config = {
        configKey: digestOf({
          // 2: plans of compile environments (an Rspack layer's is its own,
          // no `layer` field); 3: import protection's judged edges in the
          // plan's facts (the edge index reads them at each compile): every
          // key persisted before is another's
          model: 3,
          framework: opts.framework,
          root: opts.root,
          idMode,
          rsc: opts.rsc ?? null,
          env: env.name,
          router: router && routerPlannerConfigDigest(router),
          ip: this.ip?.config.configKey ?? null,
        }),
        perPlanner: {
          [IMPORT_EDGES_PLANNER]: {
            type: env.type,
            clientReferences: rsc,
          } satisfies ImportEdgesConfig,
          [START_ENV]: startEnv,
          [HYDRATE_PLANNER]: hydrate,
          [RSC_CSS]: rscCss,
          [ROUTER_PLANNER]: router ?? undefined,
        },
      }
      this.configs.set(env.name, config)
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
      root: this.opts.root,
      tag: '[tanstack-start]',
      routes: this.opts.routes,
      modifiedAt: fileModifiedAt,
      ...(services && { services }),
    }
  }

  /** `settleModule` of one id with the session's planners and configuration, writing nothing of the session's. */
  private settleCore<T>(
    input: SettleInput,
    host: HostServices,
    use: (settled: {
      output: CompileOutput | null
      current: () => boolean
    }) => T | Promise<T>,
  ): Promise<T> {
    const { env, late } = input
    const config = this.configFor(env)
    return settleModule(
      {
        id: input.id,
        code: input.code,
        env: this.envInfo(env),
        planners: late ? this.latePlanners() : this.plannersFor(env),
        config: late
          ? {
              configKey: lateConfigKey(config.configKey),
              perPlanner: {
                [IMPORT_EDGES_PLANNER]: config.perPlanner[IMPORT_EDGES_PLANNER],
                [START_ENV]: {
                  // (`configFor` sets it)
                  ...config.perPlanner[START_ENV]!,
                  late: true,
                } satisfies StartEnvConfig,
              },
            }
          : config,
        inputMap: input.inputMap,
        wantMap: input.wantMap,
        lines: input.lines,
        ...(late ? { lang: input.lang ?? 'jsx', inPlace: true } : {}),
      },
      host,
      this.caches,
      (settlement) =>
        use({
          output: settlement.kind === 'compiled' ? settlement.output : null,
          current: settlement.current,
        }),
    )
  }

  /**
   * One module of the bundler's main transform, settled in the core and
   * judged: admitted (`compiles`) → settled → diagnosed (pure) → judged by
   * import protection → its edge modules defined (every answer: its code
   * names them) → the outcome; then, for a current answer only (no newer
   * answer of the module exists: `settleModule`'s `current()`, read in the
   * commit's turn), the commit: the registry, import protection's importer
   * record, the committed-id set, then the warnings (claimed in the run's
   * ledger), import protection's reports (each while the answer is still
   * current) and `hooks.committed`; a compile error commits nothing. The caller
   * always gets its own answer. A module not admitted is left to the
   * bundler without asking the core unless the session committed a record
   * of it or the core holds its key: then the core settles it (a request
   * in flight is overtaken) and its commit retires the record. `host`: the
   * host services, made for a module the session takes.
   */
  async transform(
    req: ModuleRequest,
    host: () => HostServices,
    hooks: TransformHooks,
  ): Promise<{ outcome: ModuleOutcome; committed: boolean }> {
    if (req.moduleType === 'asset') {
      return this.transformAsset(req, hooks)
    }
    const identity = req.identity ?? identify(req.id)
    // (a module id's path as the core keys a file: the host's ids are
    // normalized already)
    const file = pathOfId(req.id)
    const key = committedKey(req.env.name, req.id, req.instance)
    const late = req.pass === 'late'
    // (the late pass also takes every module of a package that declares
    // Start, as before D-30: its modules hand Start values on under any
    // name, and late modules are few)
    const admits =
      this.compiles(identity.path, req.code) ||
      (late && this.classes.startPackage(identity.path))
    // (the bundler's type of the module, for an admitted one only)
    const type = admits ? (req.typeOf?.() ?? 'js') : 'js'
    if (type === 'asset') {
      return this.transformAsset(
        {
          moduleType: 'asset',
          id: req.id,
          env: req.env,
          ...(req.instance && { instance: req.instance }),
        },
        hooks,
      )
    }
    const admitted = admits && type === 'js'
    if (
      !admitted &&
      !this.committed.get(file)?.has(key) &&
      !liveKey(this.caches, {
        env: req.env.name,
        canonicalId: identity.canonicalId,
        configKey: late
          ? lateConfigKey(this.configFor(req.env).configKey)
          : this.configFor(req.env).configKey,
      })
    ) {
      hooks.sink?.(PASSTHROUGH, NO_RECORD, true)
      return { outcome: PASSTHROUGH, committed: false }
    }
    const input = { ...req, late }
    return this.settleCore(input, host(), async ({ output, current }) => {
      let answer =
        admitted && output ? this.answer(req, identity, output) : PASSED
      if (answer instanceof Promise) {
        answer = await answer
      }
      const { outcome, diagnosis, judgement } = answer
      const isCurrent = current()
      if (hooks.sink) {
        hooks.sink(outcome, this.recordOf(req, identity, answer), isCurrent)
      }
      if (!isCurrent) {
        return { outcome, committed: false }
      }
      if (outcome.kind === 'failed' && outcome.errors.length > 0) {
        // a compile error: the module's record stays as its last commit
        // left it (the bundler keeps no output of this answer)
        return { outcome, committed: false }
      }
      this.commit(req, identity, file, key, answer)
      if (diagnosis && hooks.warn) {
        for (const w of diagnosis.packageWarnings) {
          if (w.claim()) {
            hooks.warn(w.d, w.at, w.generated, w.module)
          }
        }
        for (const w of diagnosis.warnings) {
          if (w.claim()) {
            hooks.warn(w.d, w.at, w.generated, w.module)
          }
        }
      }
      if (judgement && judgement.reports.length > 0) {
        await runReports(judgement.reports, current)
      }
      const committed = hooks.committed?.()
      if (committed) {
        await committed
      }
      return { outcome, committed: true }
    })
  }

  /** An answer's own record (`TransformHooks.sink`). */
  private recordOf(
    req: ScriptRequest,
    identity: ReturnType<typeof identify>,
    answer: Answer,
  ): ModuleRecord {
    const { outcome, judgement, diagnosis } = answer
    const output = outcome.kind === 'passthrough' ? null : outcome.output
    return {
      fns: outcome.kind === 'served' && output ? serverFnFactsOf(output) : null,
      ip: judgement
        ? (this.ip?.env(req.env.name).buildInfoOf(judgement.record) ?? null)
        : null,
      warnings: diagnosis?.warnings ?? [],
      packageUse: output
        ? this.usesStartInPackage(output, identity.path)
        : false,
      plan: output?.persisted ?? null,
    }
  }

  /** Keeps the committed-id set's modules of `envs` whose file `keep` keeps (a compilation that no longer depends on a file). */
  retainCommitted(
    envs: ReadonlySet<string>,
    keep: (path: string) => boolean,
  ): void {
    for (const [file, keys] of this.committed) {
      if (keep(file)) {
        continue
      }
      for (const key of keys) {
        if (envs.has(key.slice(0, key.indexOf('\u0000')))) {
          keys.delete(key)
        }
      }
      if (keys.size === 0) {
        this.committed.delete(file)
      }
    }
  }

  private dropCommitted(file: string, key: string): void {
    const keys = this.committed.get(file)
    if (keys?.delete(key) && keys.size === 0) {
      this.committed.delete(file)
    }
  }

  private addCommitted(file: string, key: string): void {
    let keys = this.committed.get(file)
    if (!keys) {
      keys = new Set()
      this.committed.set(file, keys)
    }
    keys.add(key)
  }

  /**
   * `transform` of an asset id: import protection's verdict on it
   * (`ImportProtectionEnv.assetOutput`: a denied file's text is its mock),
   * judged while the core holds its key (`holdKey`), committed (or the
   * record retired, when nothing denies it) and reported only while no event
   * of its file overtook it; the committed-id set follows (a host keeps the
   * asset's own record: Rsbuild's `buildInfo`). Nothing writes the
   * registry.
   */
  private async transformAsset(
    req: AssetRequest,
    hooks: TransformHooks,
  ): Promise<{ outcome: ModuleOutcome; committed: boolean }> {
    const ipEnv = this.ip?.env(req.env.name)
    if (!ipEnv) {
      hooks.sink?.(PASSTHROUGH, NO_RECORD, true)
      return { outcome: PASSTHROUGH, committed: false }
    }
    const key = {
      env: req.env.name,
      canonicalId: identify(req.id).canonicalId,
      configKey: ASSET_CONFIG_KEY,
    }
    return holdKey(this.caches, key, async (current) => {
      const out = await ipEnv.assetOutput(req.id, (path) =>
        this.rawFacts.marker(path, req.env.name),
      )
      let judgement = out && ipEnv.judge(req.id, out)
      if (judgement instanceof Promise) {
        judgement = await judgement
      }
      if (judgement) {
        ipEnv.defineEdges(judgement.edgeModules)
      }
      const outcome: ModuleOutcome = judgement?.error
        ? { kind: 'failed', output: null, errors: [], error: judgement.error }
        : judgement?.mock
          ? {
              kind: 'mock',
              output: null,
              code: judgement.mock.code,
              mockId: judgement.mock.id,
            }
          : PASSTHROUGH
      const isCurrent = current()
      hooks.sink?.(
        outcome,
        judgement && outcome.kind !== 'passthrough'
          ? { ...NO_RECORD, ip: ipEnv.buildInfoOf(judgement.record) }
          : NO_RECORD,
        isCurrent,
      )
      if (!isCurrent) {
        return { outcome, committed: false }
      }
      const file = pathOfId(req.id)
      const own = committedKey(req.env.name, req.id, req.instance)
      if (outcome.kind !== 'passthrough') {
        ipEnv.commit(req.id, judgement!.record)
        this.addCommitted(file, own)
      } else {
        this.dropCommitted(file, own)
        // (the id's record goes with its last committed instance)
        const other = committedKey(
          req.env.name,
          req.id,
          req.instance === 'child' ? undefined : 'child',
        )
        if (!this.committed.get(file)?.has(other)) {
          ipEnv.retire(req.id)
        }
      }
      if (judgement && judgement.reports.length > 0) {
        await runReports(judgement.reports, current)
      }
      const committed = hooks.committed?.()
      if (committed) {
        await committed
      }
      return { outcome, committed: true }
    })
  }

  /**
   * `transform`'s answer on a compiled module: diagnosed, judged, its edge
   * modules defined (a promise only when import protection asks something
   * now). The late pass's code that neither the compiler nor the bundler
   * parses is another plugin's input: passed through.
   */
  private answer(
    req: ScriptRequest,
    identity: ReturnType<typeof identify>,
    output: CompileOutput,
  ): Answer | Promise<Answer> {
    const late = req.pass === 'late'
    if (
      late &&
      output.diagnostics.some((d) => d.by === 'parse') &&
      !(req.bundlerParses?.() ?? true)
    ) {
      return PASSED
    }
    const diagnosis = this.diagnose(
      output,
      identity.path,
      req.code,
      req.env.type,
      req.originalMap,
      req.reach?.(),
      late ? (req.lang ?? 'jsx') : undefined,
    )
    if (diagnosis.errors.length > 0) {
      return {
        outcome: {
          kind: 'failed',
          output,
          errors: diagnosis.errors,
          error: null,
        },
        judgement: null,
        diagnosis,
      }
    }
    const ipEnv = this.ip?.env(req.env.name)
    if (!ipEnv) {
      return this.judged(identity, req.code, output, null, diagnosis)
    }
    const judged = ipEnv.judge(req.id, output)
    const define = (judgement: Judgement) => {
      ipEnv.defineEdges(judgement.edgeModules)
      return this.judged(identity, req.code, output, judgement, diagnosis)
    }
    return judged instanceof Promise ? judged.then(define) : define(judged)
  }

  /** The outcome of a judged answer (`answer`). */
  private judged(
    identity: ReturnType<typeof identify>,
    code: string,
    output: CompileOutput,
    judgement: Judgement | null,
    diagnosis: Diagnosis,
  ): Answer {
    let outcome: ModuleOutcome
    if (judgement?.error) {
      outcome = { kind: 'failed', output, errors: [], error: judgement.error }
    } else if (judgement?.mock) {
      outcome = {
        kind: 'mock',
        output,
        code: judgement.mock.code,
        mockId: judgement.mock.id,
      }
    } else {
      outcome = {
        kind: 'served',
        output,
        unchanged: identity.derived === null && output.code === code,
      }
    }
    return { outcome, judgement, diagnosis }
  }

  /**
   * A current answer's writes (`transform`): served, mock, or failed by
   * import protection (its judged record: the importer's edges hold), the
   * module's server functions (each output's own, as it compiled: a mock's
   * too), import protection's record, and the module enters the
   * committed-id set; passthrough retires both and it leaves the set. Only
   * the env module and a provider output (`provider`, `handler`: what it
   * provides) write the registry; a split, shared or hydrate output never
   * does. (A compile error commits nothing: `transform`.)
   */
  private commit(
    req: ScriptRequest,
    identity: ReturnType<typeof identify>,
    file: string,
    key: string,
    { outcome, judgement }: Answer,
  ): void {
    const kept = outcome.kind !== 'passthrough'
    const derived = identity.derived?.kind
    if (
      !this.opts.serverFnsAtSettlement &&
      req.instance !== 'child' &&
      (derived === undefined || derived === 'provider' || derived === 'handler')
    ) {
      this.registry.set(
        req.env,
        identity.canonicalId,
        kept && outcome.output ? serverFnFactsOf(outcome.output) : null,
      )
    }
    const ipEnv = this.ip?.env(req.env.name)
    if (kept) {
      if (judgement) {
        ipEnv!.commit(req.id, judgement.record)
      }
      this.addCommitted(file, key)
      return
    }
    const keys = this.committed.get(file)
    keys?.delete(key)
    // (the id's import protection record goes with its last committed
    // instance: a child's passthrough leaves the compiler's)
    const other = committedKey(
      req.env.name,
      req.id,
      req.instance === 'child' ? undefined : 'child',
    )
    if (!keys?.has(other)) {
      ipEnv?.retire(req.id)
    }
    if (keys?.size === 0) {
      this.committed.delete(file)
    }
  }

  /**
   * Compiles one id (env or derived) of a module of an environment outside
   * any host's module (Vite's RSC handler reach, a prebuild scan): the
   * server functions a current answer reports (none included) replace the
   * module's in the registry. Its output, null when untouched.
   */
  compile(
    input: StartCompileInput,
    host: HostServices,
  ): Promise<CompileOutput | null> {
    return this.settleCore(input, host, ({ output, current }) => {
      if (current() && !this.opts.serverFnsAtSettlement) {
        this.registry.set(
          input.env,
          identify(input.id).canonicalId,
          output && serverFnFactsOf(output),
        )
      }
      return output
    })
  }

  /**
   * Whether a plan's configuration key (one an earlier process persisted)
   * is this session's for a module of `env`, of the main compile or of the
   * late pass.
   */
  configured(configKey: string, env: StartCompilerEnvironment): boolean {
    const own = this.configFor(env).configKey
    return configKey === own || configKey === lateConfigKey(own)
  }

  /** Forgets what the session holds of a deleted file (by path): its server functions and import protection's records. */
  forget(path: string): void {
    this.registry.forget(path)
    this.ip?.forget(path)
    this.committed.delete(path)
  }

  /**
   * What a compile reports, decided and told to no one (no warning claimed
   * in the run's ledger: each carries its claim; the host tells them,
   * `transform`, or records them, Rsbuild's seal). A module the compiler
   * cannot parse may define server code (a handler, a server-only route
   * option), through a Start package or a builder of the app's own
   * (`import { base } from './lib/base'`), and the bundler's parser may
   * accept what the compiler's rejects (a TypeScript grammar error SWC lets
   * through, ES module syntax in a `.cts` file): the client build fails
   * naming the file and the position (never shipped untransformed, J4.12).
   * A CommonJS script (a dependency with a top-level `return`) and a file
   * that is no JS/TS are nothing the compiler touches and are left as they
   * are (J4.16, SPEC §5.15). A server build warns when the module names a
   * Start package. `inputMap`: the input map of a compile of another
   * plugin's output (the late pass; a Vue SFC's script): each position is
   * in the original file (none where the map covers none; a Vue SFC's
   * refusals of generated code are moved there: `vue.ts`), with the
   * position in `code` beside it; an installed package's diagnostic is
   * named by its package after its position is read.
   */
  diagnose(
    out: CompileOutput,
    file: string,
    code: string,
    envType: 'client' | 'server',
    inputMap?: () => InputSourceMap | null,
    reach?: StartPackageReach,
    /** The language the code is in when the file's name says none (the late pass: `.mdx`, `.vue`). */
    lang?: CompileInput['lang'],
  ): Diagnosis {
    const diagnosis: Diagnosis = {
      errors: [],
      packageWarnings: [],
      warnings: [],
    }
    // the module each offset of `code` is from: the file, or a bundle's
    // source (`StartPackageReach.original`)
    const original = reach?.original
    const moduleAt = (offset: number) =>
      original ? original(offset) : normalizePath(file.split('?')[0]!)
    // (a host that restores modules decides it from them all: `packageUseAtSeal`)
    const uses = out.facts.planners[START_ENV]?.uses
    if (!this.opts.packageUseAtSeal && uses) {
      // once per module the uses are in (`packageUseWarning`: once per package)
      for (const module of new Set(uses.map(moduleAt))) {
        // (the package's root, claimed once the warning is told)
        let root = ''
        const warning =
          module !== null &&
          packageRootOf(module) !== null &&
          this.packageUseWarning(module, reach, undefined, (r) => {
            root = r
            return true
          })
        if (warning) {
          const claimed = root
          diagnosis.packageWarnings.push({
            d: warning,
            at: undefined,
            module,
            claim: () =>
              this.warnings.once(claimed, {
                code: 'start-package',
                message: claimed,
              }),
          })
        }
      }
    }
    if (out.diagnostics.length === 0) {
      return diagnosis
    }
    const collect: StartDiagnosticSink = {
      error: (d, at, generated) => {
        diagnosis.errors.push({ d, at, generated })
      },
      warn: (d, at, generated) => {
        diagnosis.warnings.push({
          d,
          at,
          generated,
          claim: () => this.warnings.once(file, d),
        })
      },
    }
    let commonJsScript: boolean | undefined
    // positions in the original file (`originalPositions`, none in another)
    const positions = inputMap && originalPositions(file, code, inputMap)
    const locate: SfcLocate | undefined =
      positions &&
      ((offset) => {
        const at = positions.at(offset)
        return at && at.file === file ? at : null
      })
    const vue =
      inputMap && locate && isVueSfc(file)
        ? vueReport(out, file, inputMap, locate)
        : null
    // an installed package's module, or a bundle (whose diagnostic is of
    // the module its offset is from: installed code, unless that is the
    // user's source; unknown, it stays installed)
    const ownerOf = (d: Diagnostic) => {
      const module =
        d.range !== undefined ? moduleAt(d.range.start) : original ? null : file
      return {
        installed: module === null || this.isInstalled(module),
        name: this.packageNameOf(module),
      }
    }
    const installed =
      original !== undefined || this.isInstalled(file) ? ownerOf : null
    // (the position first: `originalSink` finds a moved diagnostic by the
    // diagnostic itself, which `installedSink` rewords)
    const named =
      installed === null ? collect : installedSink(collect, installed)
    reportCompileDiagnostics(
      vue?.diagnostics ?? out.diagnostics,
      file,
      code,
      // (each warning is claimed when it is told: `ReportedWarning.claim`)
      UNCLAIMED,
      locate ? originalSink(named, code, locate, vue?.moved) : named,
      (d) => {
        if (namesStartSpecifier(code)) {
          return {
            severity: envType === 'client' ? 'error' : 'warning',
            message: `[tanstack-start] The compiler cannot parse ${displayPath(file, this.opts.root)}, which uses a TanStack Start or Router API, so it cannot compile its server code: ${d.message}`,
            range: d.range,
            by: 'parse',
            code: 'parse',
          }
        }
        if (
          envType === 'client' &&
          !(commonJsScript ??= leftToTheBundler(code, file, lang))
        ) {
          return {
            severity: 'error',
            message: `[tanstack-start] The compiler cannot parse ${displayPath(file, this.opts.root)}, so it cannot remove server code from it for the client: ${d.message}`,
            range: d.range,
            by: 'parse',
            code: 'parse',
          }
        }
        return null
      },
    )
    return diagnosis
  }

  /** Whether `file` is a module of an installed package (`node_modules`). */
  private isInstalled(file: string): boolean {
    const cls = this.classes.classOf(file)
    return cls === 'package' || cls === 'start-package'
  }

  /**
   * The name of the installed package that owns `module`, by its manifest;
   * null for the app's and workspace modules, an unknown module, and a
   * directory without a named manifest.
   */
  private packageNameOf(module: string | null): string | null {
    if (module === null || !this.isInstalled(module)) {
      return null
    }
    const root = packageRootOf(normalizePath(module.split('?')[0]!))
    const name = root && this.classes.manifest(`${root}/package.json`)?.['name']
    return typeof name === 'string' ? name : null
  }

  /**
   * Whether a compile recognised a Start primitive in a package's module (a
   * module of `node_modules`): the input of `packageUseWarning`, which a host
   * that restores modules without compiling them records with the module.
   */
  usesStartInPackage(out: CompileOutput, file: string): boolean {
    return (
      out.facts.planners[START_ENV]?.uses !== undefined &&
      packageRootOf(normalizePath(file.split('?')[0]!)) !== null
    )
  }

  /**
   * The warning of a package module whose compile recognised a Start use
   * (`usesStartInPackage`), in a package Start does not read as one, once
   * per package instance and run (the warning ledger), or null: (i) its
   * manifest does not declare Start (`declaresStart`): its modules are not
   * read like the app's (a namespace's escape, the late pass), and Vite
   * pre-bundles it in development, where a value it forwards under another
   * name is not followed; (ii) a host that bundles
   * only the packages it found (`reach`, Vite) did not find it: the app
   * does not list it, or reaches it through an installed package that does
   * not declare Start, which the server keeps external. Nothing for Start's
   * own packages, or a manifest that names Start in `peerDependenciesMeta`
   * only (an optional integration the package chose not to declare).
   * `held`: whether the build holds the module (asked last; Rsbuild's seal
   * pass, whose compilation may keep a module nothing reaches any more).
   * `claim`: the once-per-package rule of a host with a ledger of its own
   * (Rsbuild's, committed when a compilation is printed), given the package
   * root; default: the run's warning ledger.
   */
  packageUseWarning(
    file: string,
    reach?: StartPackageReach,
    held?: () => boolean,
    claim?: (root: string) => boolean,
  ): Diagnostic | null {
    const cls = this.classes.classOf(file)
    if (cls !== 'package' && (cls !== 'start-package' || !reach)) {
      return null
    }
    // (a module's path: an id's query cut off)
    const root = packageRootOf(normalizePath(file.split('?')[0]!))!
    const manifest = this.classes.manifest(`${root}/package.json`)
    if (
      isStartPackage(manifest?.['name']) ||
      (cls === 'package' &&
        namesStart(manifest, 'peerDependenciesMeta', this.opts.framework)) ||
      (cls === 'start-package' && reach!.roots.has(root)) ||
      (held && !held())
    ) {
      return null
    }
    if (
      claim
        ? !claim(root)
        : !this.warnings.once(root, { code: 'start-package', message: root })
    ) {
      return null
    }
    const key = root.slice(root.lastIndexOf('/node_modules/') + 14)
    return {
      severity: 'warning',
      message:
        cls === 'package'
          ? undeclaredPackageMessage(this.opts, root, file)
          : unreachedPackageMessage(this.opts, root, key, file),
      by: START_ENV,
      code: 'start-package',
    }
  }

  /**
   * The id allocator with an environment's rank allocated (a custom
   * generator): a client build's client-referenced functions first, the
   * rest after. `errors`: the rank's custom ids that are not a URL path
   * segment (the host fails the build with them); `warnings`: the
   * deprecated custom ids this call allocated (the host reports them).
   */
  allocateIds(envType: 'client' | 'server'): {
    allocator: FunctionIdAllocator
    errors: Array<string>
    warnings: Array<string>
  } {
    const allocator = this.allocator!
    const entries = this.registry.entries()
    const { errors, warnings } = allocator.allocate(
      envType === 'client'
        ? entries.filter((e) => e.clientReferenced)
        : entries,
    )
    return { allocator, errors, warnings }
  }

  /**
   * Rsbuild: a production client build emitted `codes` (its JS assets or
   * chunks, minified, with final ids): what it calls, held as the run's
   * publication until the next client build (a run has a session of its
   * own). Vite's client-build record holds its own (`clientCallable`).
   */
  publishClientOutput(codes: ReadonlyArray<string>): ClientPublication {
    this.published = Object.freeze({ callable: this.clientCallable(codes) })
    return this.published
  }

  /** The last client build's publication of the run (null: none yet). */
  clientPublication(): ClientPublication | null {
    return this.published
  }

  /**
   * The HTTP-callable server fns of a production build (J4.2, R182): the
   * client-referenced entries whose stub survives in the client build's
   * emitted code (`codes`, tree-shaken and minified). A client compile
   * stubs every server fn of a module the client imports; the bundler drops
   * each stub no client code calls, and a server fn the client never calls
   * stays callable by server code only. A stub is seen by a spelling only a
   * compile produces: its default id (a digest), or with a custom generator
   * its gate token (`gateToken`; a custom id is any text, e.g. a label of
   * the app). By the id the registry holds (a custom id's placeholder).
   */
  clientCallable(codes: ReadonlyArray<string>): Set<string> {
    const gated = this.allocator !== null
    const fns: Array<{ id: string; spelling: string; name: string }> = []
    for (const e of this.registry.entries()) {
      if (e.clientReferenced) {
        fns.push({
          id: e.id,
          spelling: gated ? gateToken(e) : e.id,
          name: `${e.name} of ${e.rootRel}`,
        })
      }
    }
    return calledIds(codes, callSpellings(fns))
  }

  /**
   * After the last pass of an environment's production build: releases its
   * plans and its import protection. What the environments share (raw
   * facts, registry, id allocator, warnings) stays.
   */
  release(envName: string): void {
    releaseEnvironment(this.caches, envName)
    this.ip?.release(envName)
    for (const [file, keys] of this.committed) {
      for (const key of keys) {
        if (key.startsWith(`${envName}\u0000`)) {
          keys.delete(key)
        }
      }
      if (keys.size === 0) {
        this.committed.delete(file)
      }
    }
  }
}

/**
 * What a production client build's emitted code calls (J4.2, R182): the
 * registry ids of the server fns whose client call survives in it, the
 * HTTP-callable ones. One value per client build; a later build publishes
 * another.
 */
export interface ClientPublication {
  readonly callable: ReadonlySet<string>
}

/**
 * A sink of what `StartCompilerSession.report` reports: `generated`, a
 * compile of another plugin's output, is the position in that output (a
 * host whose bundler maps positions itself reports that one).
 */
/**
 * What a host that bundles only the packages it found knows of them
 * (Vite's crawl, `crawlStartPackages`): the directories of the package
 * instances, as the bundler names their modules. (A build's graph does
 * not know a module's importers when it compiles it, so the parent that
 * brings a package Start did not find is not named.)
 */
export interface StartPackageReach {
  roots: ReadonlySet<string>
  /**
   * Present when the compiled file bundles installed modules (Vite's
   * dependency optimizer): the module an offset of its code is from (its
   * map's source), null where the map names none. The package warning is
   * then of the modules the Start uses are in, and the file is installed
   * code wherever it is kept.
   */
  original?: (offset: number) => string | null
}

function undeclaredPackageMessage(
  opts: StartCompilerSessionOptions,
  root: string,
  file: string,
): string {
  const start = `@tanstack/${opts.framework}-start`
  // (a host with modules the summaries never read pre-bundles this package
  // in development: Vite's optimizer)
  const partly = opts.opaque
    ? "Vite's dependency optimizer pre-bundles it in development, where a Start value one of its modules hands to another under a new name is not followed"
    : 'a namespace of it passed to code Start cannot follow is not checked'
  return `[tanstack-start] ${displayPath(file, opts.root)} uses TanStack Start, but its package (${displayPath(root, opts.root)}/package.json) does not declare it. Start bundles and reads a package that lists ${start} in peerDependencies (or dependencies) like the app's; it reads this one's modules only in part: ${partly}, so the server code of the app's functions built on it can ship to the client. Ask the package to declare ${start} as a peer dependency.`
}

function unreachedPackageMessage(
  opts: StartCompilerSessionOptions,
  root: string,
  key: string,
  file: string,
): string {
  return `[tanstack-start] ${displayPath(file, opts.root)} uses TanStack Start, and its package (${displayPath(root, opts.root)}) declares it, but Start did not find ${key} among the app's dependencies (from the app's package.json, through workspace packages and packages that declare Start). Vite keeps it external on the server and pre-bundles it in development, so its Start APIs are not compiled there. List ${key} in the app's dependencies; if the app reaches it through an installed package that does not declare Start, add that package to ssr.noExternal and optimizeDeps.exclude (listing ${key} alone does not change how Vite loads that package).`
}

/**
 * The warnings whose only remedy is an edit of the module they point at,
 * with no server code reaching the client: advice for the module's author
 * (`installedSink`). A warning that server code stays in client code (an
 * unread or unrecognised route option) is the app's to know wherever it is.
 */
const MODULE_AUTHOR_ADVICE: ReadonlySet<string> = new Set([
  'start-server-param',
  'rsc-css-opaque-argument',
  // (a server compile's: the client's is an error)
  'parse',
  'exported-not-split',
  'split-this',
])

/**
 * `sink` for installed code (a package's module, a bundle of them): the
 * app's author cannot edit it, so advice for its author
 * (`MODULE_AUTHOR_ADVICE`) is not reported where a diagnostic's module
 * (`ownerOf`) is installed or unknown, and an error names that module's
 * package (when known: its fix is the package's), but for an internal
 * compiler error (`by: 'core'`), which is ours to fix.
 */
function installedSink(
  sink: StartDiagnosticSink,
  ownerOf: (d: Diagnostic) => { installed: boolean; name: string | null },
): StartDiagnosticSink {
  const kept = (
    report: StartDiagnosticSink['warn'],
  ): StartDiagnosticSink['warn'] =>
    report &&
    ((d, at, generated) => {
      if (
        d.code === undefined ||
        !MODULE_AUTHOR_ADVICE.has(d.code) ||
        !ownerOf(d).installed
      ) {
        report(d, at, generated)
      }
    })
  return {
    error: (d, at, generated) => {
      const name = d.by === 'core' ? null : ownerOf(d).name
      sink.error(
        name === null
          ? d
          : {
              ...d,
              message: `${d.message} This code is in the installed package \`${name}\`: update it, or report this to its maintainers.`,
            },
        at,
        generated,
      )
    },
    warn: kept(sink.warn),
    found: kept(sink.found),
  }
}

export interface StartDiagnosticSink {
  error: (
    d: Diagnostic,
    at: DiagnosticPosition | undefined,
    generated?: DiagnosticPosition,
  ) => void
  /** Absent for a host that decides its builds' warnings itself, from `found` (`DiagnosticSink.warn`). */
  warn?: (
    d: Diagnostic,
    at: DiagnosticPosition | undefined,
    generated?: DiagnosticPosition,
    /** The module the warning is of, when not the compiled file (a bundle's source). */
    module?: string,
  ) => void
  /** Every warning the compile found, before the once-per-run rule (`DiagnosticSink.found`). */
  found?: (
    d: Diagnostic,
    at: DiagnosticPosition | undefined,
    generated?: DiagnosticPosition,
  ) => void
}

/**
 * `sink` with each position of a compile of another plugin's output in the
 * original file (`locate`, none where it gives none); `moved`: the offsets
 * of diagnostics reported elsewhere than their range.
 */
function originalSink(
  sink: StartDiagnosticSink,
  code: string,
  locate: SfcLocate,
  moved: Map<Diagnostic, number> | undefined,
): DiagnosticSink {
  let source: SourceText | null = null
  const report =
    (to: StartDiagnosticSink['error']) =>
    (d: Diagnostic, at: DiagnosticPosition | undefined) => {
      const offset = moved?.get(d) ?? d.range?.start
      if (offset === undefined) {
        return to(d, at)
      }
      const original = locate(offset)
      if (original === null) {
        return to(d, undefined)
      }
      let generated = at
      if (moved?.has(d)) {
        source ??= new SourceText(code)
        const { line, column } = source.locate(offset)
        generated = { line: line + 1, column }
      }
      to(d, { line: original.line, column: original.column - 1 }, generated)
    }
  const found = sink.found
  const warn = sink.warn
  return {
    error: report((d, at, generated) => sink.error(d, at, generated)),
    ...(warn && {
      warn: report((d, at, generated) => warn(d, at, generated)),
    }),
    ...(found && {
      found: report((d, at, generated) => found(d, at, generated)),
    }),
  }
}

/**
 * Whether a module the compiler cannot parse is none of its business: a file
 * that is no JS/TS (an asset, or the text of a `.md` the late pass sees
 * before a loader turns it into JS), or a CommonJS script (no ES module
 * syntax). `codeLang`: the language of code whose file's name says none
 * (the late pass's JavaScript of a `.mdx`, which the bundler parses).
 */
function leftToTheBundler(
  code: string,
  file: string,
  codeLang?: CompileInput['lang'],
): boolean {
  const lang = langFromId(file) ?? codeLang ?? null
  return (
    lang === null ||
    parseModule(code, { lang, sourceType: 'commonjs', semantic: false }).ok
  )
}

/** A module's key in the committed-id set: its environment and id, a child instance apart. */
function committedKey(env: string, id: string, instance?: 'child'): string {
  return `${env}\u0000${instance === 'child' ? '\u0000' : ''}${id}`
}

/** The configuration key of an asset id's held key (`transformAsset`): no compile's. */
const ASSET_CONFIG_KEY = 'asset'

/** A ledger that claims nothing (`diagnose`: a warning is claimed when it is told). */
const UNCLAIMED = { once: () => true }

/** The configuration key of the late pass (import protection and start-env over a non-JS module's JS) of a configuration. */
const lateConfigKey = (configKey: string) => `late\u0000${configKey}`

/** The server functions a compile defines (start-env's facts), if any. */
export function serverFnFactsOf(
  out: CompileOutput,
): Array<ServerFnFact> | null {
  const facts = out.facts.planners[START_ENV]
  return facts && facts.serverFns.length > 0 ? facts.serverFns : null
}
