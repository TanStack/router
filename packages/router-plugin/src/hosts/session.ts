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
  displayPath,
  fileModifiedAt,
  identify,
  invalidate,
  normalizePath,
  registerCompilerStats,
  reportCompileDiagnostics,
} from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerApplies,
  routerPlannerConfigDigest,
  routerPlannerConfigFrom,
} from '../planners'
import { RouteRegistryView } from '../planners/registry'
import { contextInternals } from '../core/router-plugin-context'
import type { RouterPluginContext } from '../core/router-plugin-context'
import type { Config } from '../core/config'
import type { RouterPlannerConfig } from '../planners'
import type { RouteEntryFacts } from '../planners/route'
import type {
  CompileConfig,
  CompileOutput,
  CompilerCaches,
  DiagnosticSink,
  EnvInfo,
  HostServices,
  InvalidateChange,
  Planner,
  WarningLedger,
} from '@tanstack/router-utils/compiler'

export type Bundler = 'vite' | 'rspack' | 'webpack'

interface RouterCompilerOptions {
  context: RouterPluginContext
  config: Config
  /** The project root: messages name files relative to it. */
  root: string
  /**
   * The routes directory, absolute, as the instance's generator resolves
   * it: a derived id of a file there that is no route (any more) is this
   * instance's (`owns`).
   */
  routesDirectory: string
  bundler: Bundler
  mode: 'dev' | 'build'
}

interface CompileRequest {
  /** The bundler's module id (path with query). */
  id: string
  code: string
  env: { name: string; type: 'client' | 'server' }
  wantMap: boolean
  /** How the map's consumer counts lines (`CompileInput.lines`). */
  lines?: 'ecma' | 'lf'
}

/** JS module ids the compiler may transform (query allowed). */
export const JS_ID_RE = /\.[cm]?[jt]sx?(\?|$)/

/**
 * A dependency module: `node_modules` in its path (not its query). The hosts
 * never compile one (each bundler filters them out natively); a route file
 * there is reported with `dependencyRouteFileWarning`.
 */
export const DEPENDENCY_ID_RE = /^[^?]*[\\/]node_modules[\\/]/

/**
 * The warning, once per file per run, for a route file the hosts leave out
 * as a dependency module (a routes package resolved without following
 * symlinks, a `physical()` mount of an installed package): it is not split.
 */
export function dependencyRouteFileWarning(shown: string): string {
  return `[tanstack-router] ${shown} is not code-split: it is a route file under node_modules, and the router plugin does not compile files there. Keep route files outside node_modules to have them split.`
}

/** The derived outputs the router planner declares (`?tsr-split=`). */
const ROUTER_DERIVED_KINDS = new Set(['split', 'shared'])

/** The router planner's configuration of an environment type, and the compile config holding it. */
interface EnvConfig {
  planner: RouterPlannerConfig
  compile: CompileConfig
}

export class RouterCompiler {
  readonly caches: CompilerCaches
  readonly host: HostServices
  readonly planners: Array<Planner> = [routerPlanner()]
  readonly warnings: WarningLedger
  readonly mode: 'dev' | 'build'
  private readonly configs: Record<'client' | 'server', EnvConfig>
  private readonly registry: RouteRegistryView
  private readonly routesDirectory: string

  constructor(opts: RouterCompilerOptions) {
    this.mode = opts.mode
    this.routesDirectory = normalizePath(opts.routesDirectory)
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
      modifiedAt: fileModifiedAt,
      loadVirtual: () => Promise.resolve(null),
      recognizer: EMPTY_RECOGNIZER,
    })
    this.caches = createCompilerCaches(
      rawFacts,
      `router-plugin:${opts.bundler}`,
    )
    this.registry = new RouteRegistryView(opts.context)
    registerCompilerStats(
      `router-plugin:${opts.bundler}:session`,
      this,
      RouterCompiler.readStats,
    )
    this.host = {
      // the router planner resolves nothing: route options are read from the module itself
      resolve: () => Promise.resolve(null),
      rawFacts,
      root: opts.root,
      tag: '[tanstack-router]',
      routes: this.registry,
      modifiedAt: fileModifiedAt,
    }
  }

  private static readStats(o: RouterCompiler) {
    return collectionSizes({ warnings: o.warnings, registry: o.registry }, 3)
  }

  /** The registry entry of a file (the scanned path or the real path of a symlink). */
  routeEntry(path: string): RouteEntryFacts | null {
    return this.registry.lookup(path)
  }

  /**
   * Whether a file is this instance's: a route of its registry, or a file
   * under its routes directory (a derived id of one that is no route any
   * more gets an empty module here). Another instance's route is not: an
   * app may run one plugin instance per route tree, and each instance
   * leaves the others' modules as they are.
   */
  owns(path: string): boolean {
    return (
      this.registry.lookup(path) !== null ||
      path.startsWith(this.routesDirectory + '/')
    )
  }

  /** Whether the host should transform an id at all. */
  wants(id: string): boolean {
    if (!JS_ID_RE.test(id) || DEPENDENCY_ID_RE.test(id)) {
      return false
    }
    // a derived id another compiler owns (Start's `?tss-hydrate=`, server fn
    // providers) is that compiler's output: not a module of this session
    const derived = identify(id).derived
    return derived === null || ROUTER_DERIVED_KINDS.has(derived.kind)
  }

  /** The digest of the compile configuration of an env type (a persisted plan's `key.configKey`). */
  configKey(envType: 'client' | 'server'): string {
    return this.configs[envType].compile.configKey
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
        lines: req.lines,
      },
      this.host,
      this.caches,
    )
  }

  /** Reports a compile's diagnostics (`reportCompileDiagnostics`); `file` is the module's normalized path. */
  report(
    out: CompileOutput,
    file: string,
    code: string,
    sink: DiagnosticSink,
  ): void {
    reportCompileDiagnostics(
      out.diagnostics,
      file,
      code,
      this.warnings,
      sink,
      // a route module the compiler cannot parse is left as it is (J2.8: a
      // correct split, or unsplit plus a warning naming the file)
      (d) => ({
        severity: 'warning',
        message: `[tanstack-router] The compiler cannot parse the route module ${displayPath(file, this.host.root)}, so it is not code-split or hot-updated: ${d.message}`,
        range: d.range,
        by: 'parse',
        code: 'parse',
      }),
    )
  }

  /** The one invalidation operation for a file event. */
  invalidate(path: string, kind: InvalidateChange['kind']): Promise<void> {
    return invalidate(this.caches, { path, kind }, this.host)
  }
}
