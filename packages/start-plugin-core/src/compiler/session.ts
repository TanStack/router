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
  calledIds,
  callSpellings,
  gateToken,
} from '../server-fns/ids'
import { ServerFnRegistry } from '../server-fns/registry'
import { createImportProtection } from '../import-protection/session'
import { IMPORT_EDGES_PLANNER } from '../import-protection/violations'
import { namesStartSpecifier, startRecognizer } from './recognizer'
import { opaquePackageModule, startCompileScope } from './scope'
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
    this.ip = createImportProtection({
      options: opts.importProtection,
      root: opts.root,
      srcDirectory: opts.srcDirectory,
      mode: opts.mode,
      ids: opts.edgeModuleIds,
      settles: opts.settlesImportVerdicts,
      readFile: opts.readFile,
      isEntry: opts.isEntry,
      framework: opts.framework,
      rsc: opts.rsc !== undefined,
    })
    for (const env of opts.environments) {
      this.addEnvironment(env)
    }
    this.compiles = startCompileScope(this.ip)
    const packageModule = opaquePackageModule(this.ip)
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
        hydrate: createHydratePlanner(),
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
        startEnvPlanner({ late: true }),
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
        ...(late ? { lang: 'jsx' as const, inPlace: true } : {}),
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
  ): void {
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
   * publication until the next client build or run (`forgetClientOutput`).
   */
  publishClientOutput(codes: ReadonlyArray<string>): ClientPublication {
    this.published = Object.freeze({ callable: this.clientCallableIds(codes) })
    return this.published
  }

  /** The last client build's publication of the run (null: none yet). */
  clientPublication(): ClientPublication | null {
    return this.published
  }

  /** A new production run: no client build published yet. */
  forgetClientOutput(): void {
    this.published = null
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
  return {
    error: report((d, at, generated) => sink.error(d, at, generated)),
    warn: report((d, at, generated) => sink.warn(d, at, generated)),
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
