/**
 * Host contract (see README.md, "Hosts") and the one invalidation
 * operation.
 */
import { isBuiltin } from 'node:module'
import { posix } from 'node:path'
import {
  OWNED_QUERY_KEYS,
  identify,
  normalizePath,
  planKeyString,
} from './identity'
import {
  PlanCache,
  UNRESOLVED_DEPENDENCY,
  fingerprintCurrent,
  fingerprintPath,
} from './cache'
import type {
  DependencyFingerprint,
  DependencyLedger,
  FingerprintSource,
  PersistedPlan,
} from './cache'
import type { ModuleAnalysis } from './analysis'
import type { Diagnostic } from './diagnostics'
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
   * planners only, unless `inPlace`. Must be a function of the id. Ignored
   * for JS/TS ids.
   */
  lang?: Lang
  /**
   * With `lang`: Tier 1 planners run too, in place. Their plan declares no
   * derived output (its id would load the file, which is no JS/TS): a planner
   * declaring one is a bug, and the compile throws.
   */
  inPlace?: boolean
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
  /**
   * The key and dependencies of the plan the output came from, for a host
   * that persists them with the module (`restorePlans`); null without a plan
   * (a parse error).
   */
  persisted: PersistedPlan | null
  /** The output the request mapped to. */
  output: OutputId
}

/**
 * The route registry: the router planner reads a file's entry, plans record
 * its digest (`route-registry` fingerprint). `routerConstructor`: the file's
 * `Route` export is the router package's route constructor call, so a
 * consumer that only needs to know whether that export carries a value it
 * recognises may answer from the entry (and its digest) instead of reading
 * the file.
 */
export interface RouteRegistry {
  lookup: (
    path: string,
  ) => { routeId: string; routerConstructor?: boolean } | null
  digestFor: (path: string) => string | null
}

export interface HostServices {
  /** Full importer identity, passed to the bundler's resolver unchanged (a path alone would lose foreign queries and conditions). */
  resolve: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<{ id: string; external?: boolean } | null>
  rawFacts: RawFactsCache
  routes?: RouteRegistry
  /** Planner-specific services (onViolation, ipBuild, serverFns, refreshRuntime, …). */
  services?: Record<string, unknown>
}

export interface GateContext {
  identity: SourceIdentity
  config: unknown
}

export interface PrefetchContext {
  identity: SourceIdentity
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
  /** Target facts (records a target-facts fingerprint). */
  targetFacts: (canonicalId: string) => Promise<RawFacts['targetFacts']>
  /** Stores this planner's phase A result for `PlanContext.prefetched`. */
  set: (data: unknown) => void
}

export interface PolicyContext {
  identity: SourceIdentity
  env: EnvInfo
  host: HostServices
  /** The input text of this compile (the plan's offsets index it). */
  code: string
  /** The input text's map to the original source (read lazily; null when none). */
  inputMap: () => InputSourceMap | null
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
  plan: (ctx: PlanContext) => void
  policy?: (
    plan: EmitPlan,
    output: OutputId,
    edges: Array<EdgeRecord>,
    ctx: PolicyContext,
  ) => Promise<void>
}

/**
 * The caches of a compiler session: plans per environment (with the
 * environment's resolution memo, `PlanCache.resolutionsAt`) and raw facts.
 * A compile records each resolution it used in its ledger, and validation
 * asks the environment's resolver again once the file set may have changed
 * (`fileSetVersion`).
 */
export interface CompilerCaches {
  plans: Map<string, PlanCache>
  rawFacts: RawFactsCache
  /**
   * Bumped when a file appeared or disappeared (`invalidate` add/unlink).
   * A plan's recorded resolutions and an environment's
   * resolution memo are current while the version they were validated or
   * filled at is the current one: nothing a resolver answers changes
   * without a file appearing or disappearing.
   */
  fileSetVersion: number
}

/** The plan cache of an environment (created at its first use). */
export function planCacheFor(caches: CompilerCaches, env: string): PlanCache {
  let cache = caches.plans.get(env)
  if (!cache) {
    cache = new PlanCache(env)
    caches.plans.set(env, cache)
  }
  return cache
}

/** A query carrying one of the compiler-owned keys (`OWNED_QUERY_KEYS`: the derived module ids). */
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
  const dir = posix.dirname(normalizePath(identify(importer).path))
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
type InvalidationHosts = HostServices | ((env: string) => HostServices)

/**
 * The ONE invalidation operation. Evicts the plans of the changed file
 * in every env, bumps generations (published and in-flight), marks raw facts
 * stale and re-validates dependents' fingerprints; the host hard-invalidates
 * `evicted ∪ dependents` in the same operation (the Vite hosts through the
 * module graph, the webpack family by reporting the files as changed to the
 * watching compiler: `invalidateFiles`). File `add`/`unlink` events
 * also re-resolve every failed resolution of every env: a plan whose
 * unresolved specifier now resolves is a dependent; an `add` also
 * re-resolves the resolutions the new file may take (`mayShadow`). Restored
 * plans (`restorePlans`) are checked like published ones. Each environment's
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
    const src = fingerprintSourceFor(caches, hostOf(cache.env), cache.env)
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
      const fps = cache.dependenciesOf(entry.key)?.filter(relevant)
      if (!fps) {
        continue
      }
      let stale = fps.length === 0 && change.kind === 'registry'
      for (const fp of fps) {
        // a resolution that found the removed file is stale: no need to ask
        // a resolver (one may still cache the file until its next compile)
        if (
          (change.kind === 'unlink' &&
            fp.kind === 'resolution' &&
            fingerprintPath(fp) === change.path) ||
          !(await fingerprintCurrent(fp, src))
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
      // failed resolutions have no path; re-resolve them all (the memo asks the host once per distinct entry)
      await revalidate(
        cache,
        UNRESOLVED_DEPENDENCY,
        (fp) => fp.kind === 'resolution' && fp.resolved === null,
      )
    }
    if (change.kind === 'add') {
      // a new file may take a resolution that found another file of its
      // name (`./x` found `x/index.ts`, and `x.ts` appeared)
      for (const path of [...cache.dependents.paths()]) {
        if (path !== change.path && mayShadow(change.path, path)) {
          await revalidate(cache, path, (fp) => fp.kind === 'resolution')
        }
      }
    }
  }
  return { evicted, dependents }
}

/** The files dependencies name (a known package is recognised by its specifier, never read). */
export function dependencyPaths(
  dependencies: ReadonlyArray<DependencyFingerprint>,
  caches: CompilerCaches,
  out = new Set<string>(),
): Set<string> {
  const addModule = (canonicalId: string) => {
    if (!caches.rawFacts.isKnownSpecifier(canonicalId)) {
      out.add(identify(canonicalId).path)
    }
  }
  for (const fp of dependencies) {
    if (
      fp.kind === 'summary' ||
      fp.kind === 'target-facts' ||
      fp.kind === 'target-marker'
    ) {
      addModule(fp.canonicalId)
    } else if (fp.kind === 'route-registry') {
      out.add(fp.path)
    } else if (fp.resolved !== null) {
      addModule(fp.resolved)
    }
  }
  return out
}

/**
 * The files the plans of an environment's modules at `paths` read: what a
 * host whose modules depend on their own file only has its bundler watch
 * (the invalidation of a change decides which modules are stale).
 */
export function planDependencyFiles(
  caches: CompilerCaches,
  env: string,
  paths: Iterable<string>,
): Set<string> {
  const out = new Set<string>()
  const cache = caches.plans.get(env)
  if (cache) {
    for (const path of paths) {
      for (const key of cache.keysAt(path)) {
        dependencyPaths(cache.dependenciesOf(key) ?? [], caches, out)
      }
    }
  }
  return out
}

/**
 * Whether a file created at `added` can change a resolution that found
 * `resolved`: a file of the same name with another extension (`x.tsx`,
 * `x.web.ts` next to `x.ts`), a file or directory of the name of a
 * directory a resolution went into (`x.ts` next to `x/index.ts`), or a
 * `package.json` of such a directory (its `main`/`exports`). A resolver's
 * other candidates (alias targets elsewhere, a nearer `node_modules`) are not
 * looked at.
 */
function mayShadow(added: string, resolved: string): boolean {
  const slash = added.lastIndexOf('/')
  const dir = added.slice(0, slash + 1)
  const base = added.slice(slash + 1)
  if (base === 'package.json') {
    return resolved.startsWith(dir)
  }
  const stem = dir + base.split('.')[0]!
  return (
    resolved.startsWith(`${stem}/`) ||
    (resolved.startsWith(`${stem}.`) && !resolved.includes('/', stem.length))
  )
}

/**
 * Restores plans an earlier process published, which the host persisted
 * with their modules (`CompileOutput.persisted`) and the bundler's
 * persistent cache restored without compiling them: a plan whose
 * dependencies are all current joins its environment's plans (the session's
 * invalidation finds it stale like a plan compiled now); the keys of the
 * others are returned, their modules are to be compiled again. Each
 * environment's plans are checked with that environment's host.
 */
export async function restorePlans(
  caches: CompilerCaches,
  plans: Iterable<PersistedPlan>,
  hosts: InvalidationHosts,
): Promise<Array<PlanKey>> {
  const hostOf = typeof hosts === 'function' ? hosts : () => hosts
  const stale: Array<PlanKey> = []
  await Promise.all(
    [...plans].map(async (plan) => {
      const env = plan.key.env
      const src = fingerprintSourceFor(caches, hostOf(env), env)
      const current = await Promise.all(
        plan.dependencies.map((fp) => fingerprintCurrent(fp, src)),
      )
      if (current.every((ok) => ok)) {
        planCacheFor(caches, env).restore(plan)
      } else {
        stale.push(plan.key)
      }
    }),
  )
  return stale
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
  env: string,
): FingerprintSource {
  return {
    summaryDigest: (id) => caches.rawFacts.digestOf(id, env),
    targetDigest: (id) => caches.rawFacts.targetDigestOf(id, env),
    targetMarker: (id) => caches.rawFacts.marker(id, env),
    routeRegistryDigest: (path) => host.routes?.digestFor(path) ?? null,
    resolution: (importer, specifier) =>
      resolveForAnalysis(caches, host, env, importer, specifier),
  }
}

/** The schemes of what only a runtime loads (`node:fs`, `cloudflare:workers`, `data:…`). */
const RUNTIME_SCHEME_RE =
  /^(?:node|bun|deno|cloudflare|workerd|data|https?|file):/i

/**
 * Whether a specifier can name a module the analysis reads (a project module
 * or a package). A Node builtin and a runtime's scheme never do: the bundler
 * resolves them for the bundle, and asking it only for the analysis surfaces
 * its diagnostics for an import the output may not keep (Vite's "externalized
 * for browser compatibility" warning for a builtin a deleted handler read,
 * G16). Any other `name:` may be a plugin's or an alias's.
 */
export function isAnalyzableSpecifier(specifier: string): boolean {
  return !isBuiltin(specifier) && !RUNTIME_SCHEME_RE.test(specifier)
}

/**
 * Resolves a specifier for the analysis through the host's resolver (the
 * environment's own); returns the canonical id of the target, or null
 * when nothing readable is behind it. The environment's memo answers a
 * pair resolved before at the current file-set version, settling or
 * settled (the compiles of a build ask for a barrel's re-exports once per
 * importing module); unresolved pairs are not kept. The caller records the
 * answer in its ledger.
 */
export function resolveForAnalysis(
  caches: CompilerCaches,
  host: HostServices,
  env: string,
  importerCanonicalId: string,
  specifier: string,
): Promise<string | null> {
  if (caches.rawFacts.isKnownSpecifier(specifier)) {
    // known packages are recognised by specifier, never resolved
    return Promise.resolve(specifier)
  }
  if (!isAnalyzableSpecifier(specifier)) {
    return Promise.resolve(null)
  }
  const memos = planCacheFor(caches, env).resolutionsAt(caches.fileSetVersion)
  let memo = memos.get(importerCanonicalId)
  if (!memo) {
    memo = new Map()
    memos.set(importerCanonicalId, memo)
  }
  const hit = memo.get(specifier)
  if (hit !== undefined) {
    return typeof hit === 'string' ? Promise.resolve(hit) : hit
  }
  const asked: Promise<string | null> = host
    .resolve(specifier, importerCanonicalId)
    .then((r) => {
      const resolved = r && !r.external ? identify(r.id).canonicalId : null
      if (memo.get(specifier) === asked) {
        // the settled id replaces the promise; an unresolved specifier is
        // asked again next time: the file may be about to appear (a file's
        // `add` event re-resolves failed resolutions)
        if (resolved === null) {
          memo.delete(specifier)
        } else {
          memo.set(specifier, resolved)
        }
      }
      return resolved
    })
  memo.set(specifier, asked)
  // a failed resolver call is the caller's to report, and asked again next time
  asked.catch(() => {
    if (memo.get(specifier) === asked) {
      memo.delete(specifier)
    }
  })
  return asked
}
