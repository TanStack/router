/**
 * The router compiler session of a host (see the compiler README, "Hosts"): the compiler caches,
 * the host services the core needs, the planner configuration, the warning
 * ledger (once per file per run) and the route registry view. One session
 * per plugin instance; the registry and the ledger are shared through the
 * `RouterPluginContext` so Start's two splitter instances warn once.
 */
import fs from 'node:fs'
import {
  EMPTY_RECOGNIZER,
  RawFactsCache,
  collectionSizes,
  compileModule,
  createCompilerCaches,
  digestOf,
  identify,
  invalidate,
  registerCompilerStats,
} from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerApplies,
  routerPlannerConfigDigest,
  routerPlannerConfigFrom,
  routerPureCalls,
} from '../planners'
import { RouteRegistryView, normalizePath } from '../planners/registry'
import { contextInternals } from '../core/router-plugin-context'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type { RouterPlannerConfig } from '../planners'
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
}

export interface CompileRequest {
  /** The bundler's module id (path with query). */
  id: string
  code: string
  env: { name: string; type: 'client' | 'server' }
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

/** The derived outputs the router planner declares (`?tsr-split=`). */
const ROUTER_DERIVED_KINDS = new Set(['split', 'shared', 'export'])

/** The router planner's configuration of an environment type, and the compile config holding it. */
interface EnvConfig {
  planner: RouterPlannerConfig
  compile: { configKey: string; perPlanner: Record<string, unknown> }
}

export class RouterCompiler {
  readonly caches: CompilerCaches
  readonly host: HostServices
  readonly planners: Array<Planner> = [routerPlanner()]
  readonly warnings: WarningLedger
  readonly mode: 'dev' | 'build'
  private readonly configs: Record<'client' | 'server', EnvConfig>
  private readonly registry: RouteRegistryView

  constructor(opts: RouterCompilerOptions) {
    this.mode = opts.mode
    const configFor = (envType: 'client' | 'server'): EnvConfig => {
      const planner = routerPlannerConfigFrom(
        opts.config.codeSplittingOptions,
        {
          framework: opts.config.target,
          envType,
          mode: opts.mode,
          // the bundler's hot API: Vite's, or webpack's (Rspack too)
          hmrStyle: opts.bundler === 'vite' ? 'vite' : 'webpack',
          start: false,
          autoCodeSplitting: opts.config.autoCodeSplitting,
        },
      )
      return {
        planner,
        compile: {
          configKey: digestOf({
            bundler: opts.bundler,
            mode: opts.mode,
            router: routerPlannerConfigDigest(planner),
          }),
          perPlanner: { [ROUTER_PLANNER]: planner },
        },
      }
    }
    this.configs = { client: configFor('client'), server: configFor('server') }
    const internals = contextInternals(opts.context)
    this.warnings = internals.warnings
    const rawFacts = new RawFactsCache({
      readFile: (p) => fs.promises.readFile(p, 'utf8').catch(() => null),
      loadVirtual: () => Promise.resolve(null),
      // the router's own pure APIs
      recognizer: { ...EMPTY_RECOGNIZER, pureCalls: routerPureCalls() },
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
      // the router planner resolves nothing: route options are read from the module itself
      resolve: () => Promise.resolve(null),
      rawFacts,
      routes: this.registry,
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

  /** Whether the router planner can apply in an env of this type (else the host skips the parse). */
  appliesTo(envType: 'client' | 'server'): boolean {
    return routerPlannerApplies(this.configs[envType].planner)
  }

  envInfo(env: CompileRequest['env']): EnvInfo {
    return {
      name: env.name,
      type: env.type,
      mode: this.mode,
    }
  }

  async compile(req: CompileRequest): Promise<CompileOutput | null> {
    return compileModule(
      {
        id: req.id,
        code: req.code,
        env: this.envInfo(req.env),
        planners: this.planners,
        config: this.configs[req.env.type].compile,
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
        if (
          this.warnings.once(normalizePath(path), {
            ...warning,
            code: `parse\u0000${warning.message}`,
          })
        ) {
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
}
