/**
 * Host contract (DESIGN §2.10; R3, R11, R25, R35) and the one invalidation
 * operation.
 */
import { identify, planKeyString } from './identity'
import { PlanCache, fingerprintCurrent, fingerprintPath } from './cache'
import type { DependencyLedger, FingerprintSource } from './cache'
import type { ModuleAnalysis } from './analysis'
import type { Diagnostic, WarningLedger } from './diagnostics'
import type { PlanKey, SourceIdentity } from './identity'
import type {
  EdgeRecord,
  EmitPlan,
  EnvInfo,
  PlanContext,
  PlanFacts,
} from './plan'
import type { OutputId } from './rewrite'
import type { RawFacts, RawFactsCache } from './facts'
import type { ExportResolver } from './resolve'
import type { ModuleSummary } from './summary'
import type { RawSourceMap } from './output-builder'

export interface CompileConfig {
  configKey: string
  perPlanner: Record<string, unknown>
}

export interface CompileInput {
  /** Host id as received (env or derived). */
  id: string
  /** The text the bundler hands us for THIS id. */
  code: string
  inputMap?: RawSourceMap | null
  env: EnvInfo
  planners: ReadonlyArray<Planner>
  config: CompileConfig
  wantMap: boolean
}

export interface CompileOutput {
  code: string
  map: RawSourceMap | null
  sideEffectFree: boolean
  /** This output's surviving edges after policy. */
  edges: Array<EdgeRecord>
  facts: PlanFacts
  diagnostics: Array<Diagnostic>
  /** Paths to watch / addDependency. */
  dependencies: Array<string>
  fingerprint: string
  /** The output the request mapped to. */
  output: OutputId
}

export interface RouteRegistry {
  digestFor: (path: string) => string | null
}

export interface HostServices {
  /** Full importer identity, passed to the bundler's resolver unchanged (R35). */
  resolve: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<{ id: string; external?: boolean } | null>
  readFile: (path: string) => Promise<string | null>
  loadVirtual: (id: string) => Promise<string | null>
  rawFacts: RawFactsCache
  routes?: RouteRegistry
  warnings?: WarningLedger
  /** Planner-specific services (onViolation, ipBuild, serverFns, refreshRuntime, …). */
  services?: Record<string, unknown>
}

export interface GateContext {
  identity: SourceIdentity
  env: EnvInfo
  config: unknown
}

export interface PrefetchContext {
  identity: SourceIdentity
  env: EnvInfo
  config: unknown
  host: HostServices
  ledger: DependencyLedger
  resolver: ExportResolver
  /** Resolves a specifier from this module (records a resolution fingerprint); returns the canonical id or null. */
  resolve: (specifier: string) => Promise<string | null>
  /** Resolves a specifier from another module (a re-export chain's importer); records the fingerprint. */
  resolveFrom: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<string | null>
  /** The raw-domain summary of a canonical id (records a summary fingerprint). */
  summary: (canonicalId: string) => Promise<ModuleSummary | null>
  /** Target facts (records a target-facts fingerprint). */
  targetFacts: (canonicalId: string) => Promise<RawFacts['targetFacts']>
  /** Stores this planner's phase A result for `PlanContext.prefetched`. */
  set: (data: unknown) => void
}

export interface PolicyContext {
  identity: SourceIdentity
  env: EnvInfo
  config: unknown
  host: HostServices
  ledger: DependencyLedger
  resolve: (
    specifier: string,
    importerCanonicalId?: string,
  ) => Promise<string | null>
  targetFacts: (canonicalId: string) => Promise<RawFacts['targetFacts']>
  /** Replaces the specifier literal of an edge in this output's recipe. */
  substitute: (edgeKey: string, specifier: string) => void
  /** Per-request memo: a restart after a snapshot mismatch does not ask twice. */
  memo: <T>(key: string, compute: () => Promise<T>) => Promise<T>
  diagnostic: (d: Diagnostic) => void
}

export interface Planner {
  name: string
  tier: 0 | 1
  gate: (t0: ModuleAnalysis, ctx: GateContext) => boolean
  /**
   * Phase A contributions. Resolving to `false` withdraws the planner from
   * this compile (an async refinement of `gate`); the facts it recorded stay
   * dependencies of the plan.
   */
  prefetch?: (
    t0: ModuleAnalysis,
    ctx: PrefetchContext,
  ) => Promise<void | boolean>
  prepare?: (ctx: PlanContext) => void
  plan: (ctx: PlanContext) => void
  policy?: (
    plan: EmitPlan,
    output: OutputId,
    edges: Array<EdgeRecord>,
    ctx: PolicyContext,
  ) => Promise<void>
}

export interface CompilerCaches {
  plans: Map<string, PlanCache>
  rawFacts: RawFactsCache
  /** Per env: `${importer}\0${specifier}` → resolved id (null = unresolved). */
  resolutions: Map<string, Map<string, string | null>>
}

export function planCacheFor(caches: CompilerCaches, env: string): PlanCache {
  let c = caches.plans.get(env)
  if (!c) {
    c = new PlanCache(env)
    caches.plans.set(env, c)
  }
  return c
}

export interface InvalidateChange {
  path: string
  kind: 'change' | 'add' | 'unlink' | 'registry'
}

/**
 * The ONE invalidation operation (R3). Evicts the plans of the changed file
 * in every env, bumps generations (published and in-flight), marks raw facts
 * stale and re-validates dependents' fingerprints; the host hard-invalidates
 * `evicted ∪ dependents` in the same operation.
 */
export async function invalidate(
  caches: CompilerCaches,
  change: InvalidateChange,
  host: HostServices,
): Promise<{ evicted: Array<PlanKey>; dependents: Array<PlanKey> }> {
  const evicted: Array<PlanKey> = []
  const dependents: Array<PlanKey> = []
  for (const cache of caches.plans.values()) {
    for (const key of cache.keysAt(change.path)) {
      if (cache.delete(key)) {
        evicted.push(key)
      }
      cache.bump(key)
    }
  }
  caches.rawFacts.markStale(change.path)
  if (change.kind === 'add' || change.kind === 'unlink') {
    for (const m of caches.resolutions.values()) {
      m.clear()
    }
  }
  const seen = new Set<string>()
  for (const cache of caches.plans.values()) {
    const src = fingerprintSourceFor(caches, host, cache.env, '')
    for (const entry of cache.dependents.get(change.path)) {
      const ks = `${cache.env}|${planKeyString(entry.key)}`
      if (seen.has(ks)) {
        continue
      }
      seen.add(ks)
      if (entry.inFlight) {
        cache.bump(entry.key)
        continue
      }
      const published = cache.get(entry.key)
      if (!published) {
        continue
      }
      const fps = published.plan.dependencies.filter(
        (d) => fingerprintPath(d) === change.path,
      )
      let stale = fps.length === 0 && change.kind === 'registry'
      for (const fp of fps) {
        if (
          !(await fingerprintCurrent(fp, {
            ...src,
            configKey: entry.key.configKey,
          }))
        ) {
          stale = true
          break
        }
      }
      if (stale) {
        dependents.push(entry.key)
        cache.delete(entry.key)
        cache.bump(entry.key)
      }
    }
  }
  return { evicted, dependents }
}

export function fingerprintSourceFor(
  caches: CompilerCaches,
  host: HostServices,
  env: string,
  configKey: string,
): FingerprintSource {
  return {
    summaryDigest: (id) => caches.rawFacts.digestOf(id),
    targetDigest: (id) => caches.rawFacts.targetDigestOf(id),
    routeRegistryDigest: (path) => host.routes?.digestFor(path) ?? null,
    resolution: (envName, importer, specifier) =>
      resolveCached(caches, host, envName, importer, specifier),
    configKey,
  }
}

/** Resolution through the per-env cache; returns the canonical id of the target (or null). */
export async function resolveCached(
  caches: CompilerCaches,
  host: HostServices,
  env: string,
  importerCanonicalId: string,
  specifier: string,
): Promise<string | null> {
  let m = caches.resolutions.get(env)
  if (!m) {
    m = new Map()
    caches.resolutions.set(env, m)
  }
  const k = `${importerCanonicalId}\u0000${specifier}`
  if (m.has(k)) {
    return m.get(k)!
  }
  if (caches.rawFacts.isKnownSpecifier(specifier)) {
    // D4: known packages are recognised by specifier, never resolved
    m.set(k, specifier)
    return specifier
  }
  const r = await host.resolve(specifier, importerCanonicalId)
  const id = r && !r.external ? identify(r.id).canonicalId : null
  m.set(k, id)
  return id
}
