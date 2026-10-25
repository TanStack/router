/**
 * The router compiler session of a host (DESIGN §4): the compiler caches,
 * the host services the core needs, the planner configuration, the warning
 * ledger (once per file per run) and the route registry view. One session
 * per plugin instance; the registry and the ledger are shared through the
 * `RouterPluginContext` so Start's two splitter instances warn once.
 */
import fs from 'node:fs'
import {
  RawFactsCache,
  collectionSizes,
  compileModule,
  createCompilerCaches,
  digestOf,
  identify,
  invalidate,
  registerCompilerStats,
} from '@tanstack/router-utils/compiler'
import { routerPlannerConfig, routerPlanners } from '../planners'
import { RouteRegistryView, normalizePath } from '../planners/registry'
import { defaultCodeSplitGroupings } from '../core/constants'
import { contextInternals } from '../core/router-plugin-context'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type { HmrStyle, RouterPlannerConfig } from '../planners'
import type { RouteEntryFacts } from '../planners/route'
import type {
  CompileOutput,
  CompilerCaches,
  Diagnostic,
  EnvInfo,
  HostServices,
  InvalidateChange,
  PlanKey,
  Planner,
  WarningLedger,
} from '@tanstack/router-utils/compiler'

export type Bundler = 'vite' | 'rspack' | 'webpack'

export interface RouterCompilerOptions {
  context: RouterPluginContext
  config: Config
  bundler: Bundler
  mode: 'dev' | 'build'
  hmrStyle: HmrStyle
  /** Resolves a specifier from an importer (the bundler's resolver). */
  resolve?: HostServices['resolve']
}

export interface CompileRequest {
  /** The bundler's module id (path with query). */
  id: string
  code: string
  env: { name: string; type: 'client' | 'server'; routerSplit?: boolean }
  wantMap: boolean
}

export { normalizePath }

/** JS module ids the compiler may transform (query allowed). */
export const JS_ID_RE = /\.[cm]?[jt]sx?(\?|$)/

/**
 * The module id of a webpack / Rspack `resource`, slashes normalized. The
 * bundlers escape a `#` of the file path in `resource` (webpack as `\0#`,
 * Rspack as `\u200b#`; `resourcePath` is unescaped), so that their request
 * parsing reads it as a fragment only when meant as one: a project path with
 * a `#` (`C#`, `project #2`) must match the registry's file paths.
 */
export function resourceId(resource: string): string {
  return normalizePath(resource.replace(/[\0\u200b]#/g, '#'))
}

/** A query carrying one of the compiler-owned keys (derived module ids). */
export const OWNED_QUERY_RE =
  /(?:^|[?&])(?:tsr-split|tss-hydrate|tss-serverfn-split)(?:=|&|$)/

/** The derived outputs the router planners declare (`?tsr-split=`). */
const ROUTER_DERIVED_KINDS = new Set(['split', 'shared', 'export'])

export class RouterCompiler {
  readonly caches: CompilerCaches
  readonly host: HostServices
  readonly planners: Array<Planner>
  readonly plannerConfig: RouterPlannerConfig
  readonly configKey: string
  readonly warnings: WarningLedger
  readonly context: RouterPluginContext
  readonly config: Config
  readonly mode: 'dev' | 'build'
  readonly bundler: Bundler
  private readonly perPlanner: Record<string, unknown>
  private readonly registry: RouteRegistryView

  constructor(opts: RouterCompilerOptions) {
    this.context = opts.context
    this.config = opts.config
    this.mode = opts.mode
    this.bundler = opts.bundler
    const cs = opts.config.codeSplittingOptions
    this.plannerConfig = {
      framework: opts.config.target,
      split: opts.config.autoCodeSplitting === true,
      defaultGroupings: cs?.defaultBehavior ?? defaultCodeSplitGroupings,
      splitBehavior: cs?.splitBehavior,
      deleteNodes: cs?.deleteNodes ?? [],
      hmr: { enabled: cs?.addHmr ?? true, style: opts.hmrStyle },
    }
    this.perPlanner = routerPlannerConfig(this.plannerConfig)
    this.configKey = digestOf({
      bundler: opts.bundler,
      mode: opts.mode,
      framework: this.plannerConfig.framework,
      split: this.plannerConfig.split,
      groupings: this.plannerConfig.defaultGroupings,
      splitBehavior: this.plannerConfig.splitBehavior?.toString() ?? null,
      deleteNodes: [...this.plannerConfig.deleteNodes],
      hmr: this.plannerConfig.hmr,
    })
    this.planners = routerPlanners()
    const internals = contextInternals(opts.context)
    this.warnings = internals.warnings
    const rawFacts = new RawFactsCache({
      readFile: (p) => fs.promises.readFile(p, 'utf8').catch(() => null),
      loadVirtual: () => Promise.resolve(null),
    })
    this.caches = createCompilerCaches(
      rawFacts,
      `router-plugin:${opts.bundler}`,
    )
    this.registry = new RouteRegistryView(opts.context)
    registerCompilerStats(`router-plugin:${opts.bundler}:session`, this, (o) =>
      collectionSizes({ warnings: o.warnings, registry: o.registry }, 3),
    )
    this.host = {
      resolve: opts.resolve ?? (() => Promise.resolve(null)),
      readFile: (p) => fs.promises.readFile(p, 'utf8').catch(() => null),
      loadVirtual: () => Promise.resolve(null),
      rawFacts,
      routes: this.registry,
      services: { routes: this.registry },
    }
  }

  /** The registry entry of a file (the scanned path or the real path of a symlink). */
  routeEntry(path: string): RouteEntryFacts | null {
    return this.registry.lookup(path)
  }

  /** Whether the host should transform an id at all. */
  wants(id: string): boolean {
    if (!JS_ID_RE.test(id)) {
      return false
    }
    // a derived id another compiler owns (Start's `?tss-hydrate=`, server fn
    // providers) is that compiler's output: not a module of this session
    const derived = identify(id).derived
    return derived === null || ROUTER_DERIVED_KINDS.has(derived.kind)
  }

  /** Whether any planner can apply in an env of this type (else the host skips the parse). */
  appliesTo(envType: 'client' | 'server'): boolean {
    const c = this.plannerConfig
    return (
      c.split ||
      c.deleteNodes.length > 0 ||
      (c.hmr.enabled && this.mode === 'dev' && envType === 'client')
    )
  }

  envInfo(env: CompileRequest['env']): EnvInfo {
    return {
      name: env.name,
      type: env.type,
      mode: this.mode,
      bundler: this.bundler,
      framework: this.plannerConfig.framework,
      conditions: [],
      routerSplit: env.routerSplit ?? true,
    }
  }

  async compile(req: CompileRequest): Promise<CompileOutput | null> {
    return compileModule(
      {
        id: req.id,
        code: req.code,
        env: this.envInfo(req.env),
        planners: this.planners,
        config: { configKey: this.configKey, perPlanner: this.perPlanner },
        wantMap: req.wantMap,
      },
      this.host,
      this.caches,
    )
  }

  /** Reports a compile's diagnostics once per (file, reason) through `report`. */
  report(
    out: CompileOutput,
    path: string,
    report: (d: Diagnostic) => void,
  ): void {
    for (const d of out.diagnostics) {
      if (d.by === 'parse') {
        // a route module the compiler cannot parse is left as it is (J2.8:
        // a correct split, or unsplit plus a warning naming the file)
        const warning: Diagnostic = {
          severity: 'warning',
          message: `[tanstack-router] The compiler cannot parse the route module "${path}", so it is not code-split or hot-updated: ${d.message}`,
          range: d.range,
          by: 'parse',
          code: 'parse',
        }
        if (this.warnings.once(normalizePath(path), warning)) {
          report(warning)
        }
        continue
      }
      // an error refuses every compile that produces it; a warning once per
      // (file, reason and wording) per run: an edit that leaves the finding
      // as it is does not repeat it, a new finding is reported
      if (d.severity === 'error') {
        report(d)
        continue
      }
      const keyed = d.code ? { ...d, code: `${d.code}\u0000${d.message}` } : d
      if (this.warnings.once(normalizePath(path), keyed)) {
        report(d)
      }
    }
  }

  /** The one invalidation operation for a file event. */
  invalidate(
    path: string,
    kind: InvalidateChange['kind'],
  ): Promise<{ evicted: Array<PlanKey>; dependents: Array<PlanKey> }> {
    return invalidate(this.caches, { path, kind }, this.host)
  }

  /** The path of a module id (query stripped, slashes normalized). */
  static pathOf(id: string): string {
    return normalizePath(identify(id).path)
  }
}
