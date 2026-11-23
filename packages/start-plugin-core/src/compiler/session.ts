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
  SourceText,
  WarningLedger,
  collectionSizes,
  compileModule,
  createCompilerCaches,
  digestOf,
  displayPath,
  fileModifiedAt,
  identify,
  langFromId,
  parseModule,
  registerCompilerStats,
  releaseEnvironment,
  reportCompileDiagnostics,
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
import { createImportProtection } from '../import-protection/session'
import { normalizePath } from '../utils'
import { IMPORT_EDGES_PLANNER } from '../import-protection/violations'
import { namesStartSpecifier, startRecognizer } from './recognizer'
import { opaquePackageModule, startCompileScope } from './scope'
import {
  PackageClasses,
  isStartPackage,
  namesStart,
  packageRootOf,
} from './package-class'
import { isVueSfc, vueReport } from './vue'
import { originalPositions } from './reprinted'
import type {
  CompileOutcome,
  CompiledOutputLike,
  ImportProtection,
} from '../import-protection/session'
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
  inputMap: () => InputSourceMap | null
  wantMap: boolean
  /** How the map's consumer counts lines (`CompileInput.lines`). */
  lines?: 'ecma' | 'lf'
  /**
   * The late import-protection pass: the JS output of a module that is no
   * JS/TS (`.vue`, `.mdx`), judged by the `import-edges` planner alone.
   */
  late?: boolean
  /**
   * The language of a late pass's code (default `jsx`): the module type the
   * bundler parses it as (a plugin's `moduleType: 'ts'`).
   */
  lang?: CompileInput['lang']
}

const NO_OUTCOME: CompileOutcome = { error: null }

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
  /** The last production client build's publication (`publishClientOutput`); null before the run's first. */
  private published: ClientPublication | null = null
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
      classes: this.classes,
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
    const packageModule = opaquePackageModule(this.ip, (path) =>
      this.classes.startPackage(path),
    )
    this.rawFacts = new RawFactsCache({
      readFile: opts.readFile,
      modifiedAt: fileModifiedAt,
      loadVirtual: opts.loadVirtual,
      recognizer: startRecognizer(),
      // every analysis of the session agrees on the marker specifiers
      markerSpecifiers: this.ip?.markerSpecifiers,
      opaque: (path, text) =>
        (opts.opaque?.(path) ?? false) || packageModule(path, text),
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

  /**
   * Compiles one id (env or derived) of a module of an environment; the
   * server functions the compile reports (none included) replace the
   * module's in the registry, unless a newer text of the module arrived
   * meanwhile (`superseded`): its compile registers that text's.
   */
  async compile(
    input: StartCompileInput,
    host: HostServices,
  ): Promise<CompileOutput | null> {
    const { env, late } = input
    const config = this.configFor(env)
    const out = await compileModule(
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
    )
    if (!out?.superseded) {
      this.registry.set(
        env,
        identify(input.id).canonicalId,
        out && serverFnFactsOf(out),
      )
    }
    return out
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
    return this.ip?.env(env.name).afterCompile(id, out) ?? NO_OUTCOME
  }

  /** Import protection's verdict on an id with an asset query, for `afterCompile`; null when it is not denied (`ImportProtectionEnv.assetOutput`). */
  async assetOutput(
    env: StartCompilerEnvironment,
    id: string,
  ): Promise<CompiledOutputLike | null> {
    return (
      this.ip
        ?.env(env.name)
        .assetOutput(id, (path) => this.rawFacts.marker(path, env.name)) ?? null
    )
  }

  /** Forgets what the session holds of a deleted file (by path): its server functions and import protection's records. */
  forget(path: string): void {
    this.registry.forget(path)
    this.ip?.forget(path)
  }

  /**
   * Reports a compile's diagnostics (`reportCompileDiagnostics`). A module
   * the compiler cannot parse may define server code (a handler, a
   * server-only route option), through a Start package or a builder of the
   * app's own (`import { base } from './lib/base'`), and the bundler's parser
   * may accept what the compiler's rejects (a TypeScript grammar error SWC
   * lets through, ES module syntax in a `.cts` file): the client build fails
   * naming the file and the position (never shipped untransformed, J4.12).
   * A CommonJS script (a dependency with a top-level `return`) and a file
   * that is no JS/TS are nothing the compiler touches and are left as they
   * are (J4.16, SPEC §5.15). A server build warns when the module names a
   * Start package.
   * `inputMap`: the input map of a compile of another plugin's output (the
   * late pass; a Vue SFC's script): each position is reported in the
   * original file (none where the map covers none; a Vue SFC's refusals of
   * generated code are moved there: `vue.ts`), and the sink also gets the
   * position in `code`.
   */
  report(
    out: CompileOutput,
    file: string,
    code: string,
    envType: 'client' | 'server',
    sink: StartDiagnosticSink,
    inputMap?: () => InputSourceMap | null,
    reach?: StartPackageReach,
  ): void {
    // (a host that restores modules decides it from them all: `packageUseAtSeal`)
    if (!this.opts.packageUseAtSeal && this.usesStartInPackage(out, file)) {
      const warning = this.packageUseWarning(file, reach)
      if (warning) {
        sink.warn(warning, undefined)
      }
    }
    if (out.diagnostics.length === 0) {
      return
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
    reportCompileDiagnostics(
      vue?.diagnostics ?? out.diagnostics,
      file,
      code,
      this.warnings,
      locate ? originalSink(sink, code, locate, vue?.moved) : sink,
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
          !(commonJsScript ??= leftToTheBundler(code, file))
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
  }

  /**
   * Whether a compile recognised a Start primitive in a package's module (a
   * module of `node_modules`): the input of `packageUseWarning`, which a host
   * that restores modules without compiling them records with the module.
   */
  usesStartInPackage(out: CompileOutput, file: string): boolean {
    return (
      out.facts.planners[START_ENV]?.recognises === true &&
      packageRootOf(normalizePath(file.split('?')[0]!)) !== null
    )
  }

  /**
   * The warning of a package module whose compile recognised a Start use
   * (`usesStartInPackage`), in a package Start does not read as one, once
   * per package instance and run (the warning ledger), or null: (i) its
   * manifest does not declare Start (`declaresStart`): a Start value it
   * forwards under another name is not followed; (ii) a host that bundles
   * only the packages it found (`reach`, Vite) did not find it: the app
   * does not list it, or reaches it through an installed package that does
   * not declare Start, which the server keeps external. Nothing for Start's
   * own packages, or a manifest that names Start in `peerDependenciesMeta`
   * only (an optional integration the package chose not to declare).
   * `held`: whether the build holds the module (asked last; Rsbuild's seal
   * pass, whose compilation may keep a module nothing reaches any more).
   */
  packageUseWarning(
    file: string,
    reach?: StartPackageReach,
    held?: () => boolean,
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
    if (!this.warnings.once(root, { code: 'start-package', message: root })) {
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
   * A production client build emitted `codes` (its JS assets or chunks,
   * minified, with final ids): what it calls, held as the run's
   * publication until the next client build (a run has a session of its
   * own).
   */
  publishClientOutput(codes: ReadonlyArray<string>): ClientPublication {
    this.published = Object.freeze({ callable: this.clientCallableIds(codes) })
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
  private clientCallableIds(codes: ReadonlyArray<string>): Set<string> {
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
}

function undeclaredPackageMessage(
  opts: StartCompilerSessionOptions,
  root: string,
  file: string,
): string {
  const start = `@tanstack/${opts.framework}-start`
  return `[tanstack-start] ${displayPath(file, opts.root)} uses TanStack Start, but its package (${displayPath(root, opts.root)}/package.json) does not declare it. Start reads the modules of a package that lists ${start} in peerDependencies (or dependencies) on demand; it does not read this one's, so a Start value one of its modules hands to another under a new name is not followed, and the server code of the app's functions built on it can ship to the client. Ask the package to declare ${start} as a peer dependency.`
}

function unreachedPackageMessage(
  opts: StartCompilerSessionOptions,
  root: string,
  key: string,
  file: string,
): string {
  return `[tanstack-start] ${displayPath(file, opts.root)} uses TanStack Start, and its package (${displayPath(root, opts.root)}) declares it, but Start did not find ${key} among the app's dependencies (from the app's package.json, through workspace packages and packages that declare Start). Vite keeps it external on the server and pre-bundles it in development, so its Start APIs are not compiled there. List ${key} in the app's dependencies; if the app reaches it through an installed package that does not declare Start, add that package to ssr.noExternal and optimizeDeps.exclude (listing ${key} alone does not change how Vite loads that package).`
}

export interface StartDiagnosticSink {
  error: (
    d: Diagnostic,
    at: DiagnosticPosition | undefined,
    generated?: DiagnosticPosition,
  ) => void
  warn: (
    d: Diagnostic,
    at: DiagnosticPosition | undefined,
    generated?: DiagnosticPosition,
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
  return {
    error: report((d, at, generated) => sink.error(d, at, generated)),
    warn: report((d, at, generated) => sink.warn(d, at, generated)),
    ...(found && {
      found: report((d, at, generated) => found(d, at, generated)),
    }),
  }
}

/**
 * Whether a module the compiler cannot parse is none of its business: a file
 * that is no JS/TS (an asset, or the text of a `.md` the late pass sees
 * before a loader turns it into JS), or a CommonJS script (no ES module
 * syntax).
 */
function leftToTheBundler(code: string, file: string): boolean {
  const lang = langFromId(file)
  return (
    lang === null ||
    parseModule(code, { lang, sourceType: 'commonjs', semantic: false }).ok
  )
}

/** The configuration key of the late pass (import protection and start-env over a non-JS module's JS) of a configuration. */
const lateConfigKey = (configKey: string) => `late\u0000${configKey}`

/** The server functions a compile defines (start-env's facts), if any. */
export function serverFnFactsOf(
  out: CompileOutput,
): Array<ServerFnFact> | null {
  const facts = out.facts.planners[START_ENV]
  return facts && facts.serverFns.length > 0 ? facts.serverFns : null
}
