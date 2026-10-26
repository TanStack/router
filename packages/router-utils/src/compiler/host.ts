/**
 * Host contract (see README.md, "Hosts") and the one invalidation
 * operation.
 */
import { isBuiltin } from 'node:module'
import { posix } from 'node:path'
import { OWNED_QUERY_KEYS, identify, planKeyString } from './identity'
import {
  UNRESOLVED_DEPENDENCY,
  fingerprintCurrent,
  fingerprintPath,
} from './cache'
import type {
  DependencyFingerprint,
  DependencyLedger,
  FingerprintSource,
  PlanCache,
} from './cache'
import type { ModuleAnalysis } from './analysis'
import type { Diagnostic, WarningLedger } from './diagnostics'
import type { Lang, PlanKey, SourceIdentity } from './identity'
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

/** A source map another plugin produced for the input text (any number of sources). */
export interface InputSourceMap {
  version: number | string
  sources: Array<string | null>
  mappings: string
  names?: Array<string>
  sourceRoot?: string
  sourcesContent?: Array<string | null>
  file?: string
}

export interface CompileInput {
  /** Host id as received (env or derived). */
  id: string
  /** The text the bundler hands us for THIS id. */
  code: string
  /** The map of `code` to the original source (or a getter, read only when needed). */
  inputMap?: InputSourceMap | null | (() => InputSourceMap | null)
  /**
   * Language of `code` when the id itself is not JS/TS but the bundler hands
   * us JS (`.vue`, `.mdx`, custom module types). Such ids run Tier 0
   * planners only. Must be a function of the id. Ignored for JS/TS ids.
   */
  lang?: Lang
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
  /** Full importer identity, passed to the bundler's resolver unchanged (a path alone would lose foreign queries and conditions). */
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
  /** The target's environment marker only (records a marker fingerprint: no other target fact invalidates the plan). */
  targetMarker: (
    canonicalId: string,
  ) => Promise<RawFacts['targetFacts']['marker']>
  /** Stores this planner's phase A result for `PlanContext.prefetched`. */
  set: (data: unknown) => void
}

export interface PolicyContext {
  identity: SourceIdentity
  env: EnvInfo
  config: unknown
  host: HostServices
  /** The input text of this compile (the plan's offsets index it). */
  code: string
  /** The input text's map to the original source (read lazily; null when none). */
  inputMap: () => InputSourceMap | null
  ledger: DependencyLedger
  resolve: (
    specifier: string,
    importerCanonicalId?: string,
  ) => Promise<string | null>
  targetFacts: (canonicalId: string) => Promise<RawFacts['targetFacts']>
  /** The target's environment marker only (records a marker fingerprint: no other target fact invalidates the plan). */
  targetMarker: (
    canonicalId: string,
  ) => Promise<RawFacts['targetFacts']['marker']>
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

/**
 * The caches of a compiler session: plans per environment and raw facts.
 * Resolutions are not cached (a cache measured no faster and complicated
 * invalidation): a compile records each answer in its
 * ledger, and validation asks the environment's resolver again once the
 * file set may have changed (`fileSetVersion`).
 */
export interface CompilerCaches {
  plans: Map<string, PlanCache>
  rawFacts: RawFactsCache
  /**
   * Bumped when a file appeared or disappeared (`invalidate` add/unlink; a
   * host that gets no such events for files nothing imports bumps it per
   * watch compilation). A plan's recorded resolutions are current while
   * the version they were validated at is the current one: nothing a
   * resolver answers changes without a file appearing or disappearing.
   */
  fileSetVersion: number
}

/** A query carrying one of the compiler-owned keys (derived module ids: `?tsr-split=`, `?tss-hydrate=`, `?tss-serverfn-split`). */
export const OWNED_QUERY_RE = new RegExp(
  `(?:^|[?&])(?:${Object.values(OWNED_QUERY_KEYS).join('|')})(?:=|&|$)`,
)

/**
 * Resolves a compiler-derived specifier (`./route.tsx?tsr-split=…`, as glue
 * emits it) to the importer's sibling with the query verbatim, without the
 * file system: the derived module is the importer's own file. Null for any
 * other specifier.
 */
export function resolveDerivedSibling(
  specifier: string,
  importer: string | undefined,
): string | null {
  if (!importer || !specifier.startsWith('./')) {
    return null
  }
  const q = specifier.indexOf('?')
  if (q === -1 || !OWNED_QUERY_RE.test(specifier.slice(q))) {
    return null
  }
  const basename = specifier.slice(2, q)
  if (basename.includes('/')) {
    return null
  }
  const dir = posix.dirname(identify(importer).path.replace(/\\/g, '/'))
  return `${dir}/${basename}${specifier.slice(q)}`
}

export interface InvalidateChange {
  path: string
  kind: 'change' | 'add' | 'unlink' | 'registry'
}

/**
 * The host of each environment for an invalidation: one host for every
 * environment, or a function of the environment name (an environment's
 * resolutions are re-validated with its own resolver: per-environment
 * aliases and conditions resolve a specifier differently).
 */
export type InvalidationHosts = HostServices | ((env: string) => HostServices)

/**
 * The ONE invalidation operation. Evicts the plans of the changed file
 * in every env, bumps generations (published and in-flight), marks raw facts
 * stale and re-validates dependents' fingerprints; the host hard-invalidates
 * `evicted ∪ dependents` in the same operation. File `add`/`unlink` events
 * also re-resolve every failed resolution of every env: a plan whose
 * unresolved specifier now resolves is a dependent. Each environment's
 * fingerprints are checked with that environment's host (its own resolver).
 */
export async function invalidate(
  caches: CompilerCaches,
  change: InvalidateChange,
  hosts: InvalidationHosts,
): Promise<{ evicted: Array<PlanKey>; dependents: Array<PlanKey> }> {
  const hostOf = typeof hosts === 'function' ? hosts : () => hosts
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
  if (change.kind === 'unlink') {
    caches.rawFacts.forget(change.path)
  } else {
    caches.rawFacts.markStale(change.path)
  }
  if (change.kind === 'add' || change.kind === 'unlink') {
    caches.fileSetVersion++
  }
  const revalidate = async (
    cache: PlanCache,
    indexKey: string,
    relevant: (fp: DependencyFingerprint) => boolean,
  ): Promise<void> => {
    const seen = new Set<string>()
    const src = fingerprintSourceFor(caches, hostOf(cache.env), '')
    for (const entry of cache.dependents.get(indexKey)) {
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
      const fps = published.plan.dependencies.filter(relevant)
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
  for (const cache of caches.plans.values()) {
    await revalidate(
      cache,
      change.path,
      // a change keeps the file set: the resolver's answers stand (as for
      // plan validation at an unchanged `fileSetVersion`); the file's new
      // facts are what its dependents are checked against
      (fp) =>
        fingerprintPath(fp) === change.path &&
        !(change.kind === 'change' && fp.kind === 'resolution'),
    )
    if (change.kind === 'add' || change.kind === 'unlink') {
      // failed resolutions have no path; re-resolve them all (one host resolve per distinct entry)
      await revalidate(
        cache,
        UNRESOLVED_DEPENDENCY,
        (fp) => fp.kind === 'resolution' && fp.resolved === null,
      )
    }
  }
  return { evicted, dependents }
}

/**
 * Releases what the caches hold for one environment: its plans, their
 * generations and dependents index. A host calls it once the environment
 * can compile nothing more (a production build of the environment is
 * finished); everything else in the caches is shared by the environments
 * and stays. A later compile in the environment starts from an empty plan
 * cache, so a host that builds the environment again gets the same output,
 * only slower.
 */
export function releaseEnvironment(caches: CompilerCaches, env: string): void {
  caches.plans.delete(env)
}

export function fingerprintSourceFor(
  caches: CompilerCaches,
  host: HostServices,
  configKey: string,
): FingerprintSource {
  return {
    summaryDigest: (id) => caches.rawFacts.digestOf(id),
    targetDigest: (id) => caches.rawFacts.targetDigestOf(id),
    targetMarker: async (id) =>
      (await caches.rawFacts.getTarget(id)).targetFacts.marker,
    routeRegistryDigest: (path) => host.routes?.digestFor(path) ?? null,
    resolution: (importer, specifier) =>
      resolveForAnalysis(caches, host, importer, specifier),
    configKey,
  }
}

/**
 * Whether a specifier can name a module the analysis reads (a project module
 * or a package). A Node builtin and a URL-scheme specifier (`node:`, `bun:`,
 * `cloudflare:`, `data:`, …) never do: the bundler resolves them for the
 * bundle, and asking it only for the analysis surfaces its diagnostics for
 * an import the output may not keep (Vite's "externalized for browser
 * compatibility" warning for a builtin a deleted handler read, G16). A
 * bundler's `virtual:` module passes: it may be a project module.
 */
export function isAnalyzableSpecifier(specifier: string): boolean {
  if (isBuiltin(specifier)) {
    return false
  }
  const scheme = /^([a-z][\w+.-]+):/i.exec(specifier)
  return scheme === null || scheme[1]!.toLowerCase() === 'virtual'
}

/**
 * Resolves a specifier for the analysis through the host's resolver (the
 * environment's own); returns the canonical id of the target, or null
 * when nothing readable is behind it. Not cached: the caller records
 * the answer in its ledger.
 */
export async function resolveForAnalysis(
  caches: CompilerCaches,
  host: HostServices,
  importerCanonicalId: string,
  specifier: string,
): Promise<string | null> {
  if (caches.rawFacts.isKnownSpecifier(specifier)) {
    // known packages are recognised by specifier, never resolved
    return specifier
  }
  if (!isAnalyzableSpecifier(specifier)) {
    return null
  }
  const r = await host.resolve(specifier, importerCanonicalId)
  return r && !r.external ? identify(r.id).canonicalId : null
}
