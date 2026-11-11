/**
 * Host contract (see README.md, "Hosts") and the one invalidation
 * operation.
 */
import { stat } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { OWNED_QUERY_KEYS, identify, pathOfId, planKeyString } from './identity'
import {
  EXTERNAL_DEPENDENCY,
  EXTERNAL_RESOLUTION,
  PlanCache,
  UNRESOLVED_DEPENDENCY,
  fingerprintCurrent,
  fingerprintPath,
} from './cache'
import { isVirtualId } from './facts'
import type {
  DependencyFingerprint,
  DependencyLedger,
  FingerprintSource,
  PersistedPlan,
  StaleSets,
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

/**
 * What each planner exchanges through the core, by planner name: `config`
 * (its `CompileConfig.perPlanner` entry, read as `ctx.config`), `prefetch`
 * (its phase A result: `PrefetchContext.set`, `PlanContext.prefetched`) and
 * `facts` (`PlanContext.setFacts`, `PlanFacts.planners`). A planner package
 * declares its planner's entry next to the planner (module augmentation):
 *
 * ```ts
 * declare module '@tanstack/router-utils/compiler' {
 *   interface PlannerData {
 *     router: { config: RouterPlannerConfig; prefetch: RouteEntryFacts | null }
 *   }
 * }
 * ```
 *
 * A member an entry leaves out is `never` (the planner has no such data); a
 * name without an entry carries `unknown`. The core joins name and data at
 * run time (`perPlanner[p.name]`, `prefetched.set(p.name, …)`): these types
 * only check the planners and hosts on both sides of it.
 */
export interface PlannerData {}

/** Member `TKey` of planner `TName`'s `PlannerData` entry. */
type PlannerDataOf<
  TName extends string,
  TKey extends 'config' | 'prefetch' | 'facts',
> = TName extends keyof PlannerData
  ? PlannerData[TName] extends Record<TKey, infer T>
    ? T
    : never
  : unknown

/** Planner `TName`'s configuration (`CompileConfig.perPlanner[TName]`, `ctx.config`). */
export type PlannerConfig<TName extends string> = PlannerDataOf<TName, 'config'>
/** Planner `TName`'s phase A result (`PrefetchContext.set`, `PlanContext.prefetched`). */
export type PlannerPrefetch<TName extends string> = PlannerDataOf<
  TName,
  'prefetch'
>
/** Planner `TName`'s facts (`PlanContext.setFacts`, `PlanFacts.planners[TName]`). */
export type PlannerFacts<TName extends string> = PlannerDataOf<TName, 'facts'>

/** `CompileConfig.perPlanner`: each planner's configuration under its name. */
export type PlannerConfigs = {
  [TName in keyof PlannerData & string]?: PlannerConfig<TName>
} & Record<string, unknown>

/** `PlanFacts.planners`: each planner's facts under its name; plain data only. */
export type PlannerFactsByName = {
  [TName in keyof PlannerData & string]?: PlannerFacts<TName>
} & Record<string, unknown>

/** `PlanContext.prefetched`: the phase A results of a compile, by planner name. */
export interface PlannerPrefetches extends ReadonlyMap<string, unknown> {
  /** Undefined when the planner stored none (it has no `prefetch`, or did not run). */
  get: <TName extends string>(
    planner: TName,
  ) => PlannerPrefetch<TName> | undefined
}

/**
 * The services a host gives its planners (`HostServices.services`),
 * declared by the planner packages (module augmentation, like
 * `PlannerData`).
 */
export interface PlannerServices {}

export interface CompileConfig {
  configKey: string
  perPlanner: PlannerConfigs
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
  /**
   * How the map's consumer counts lines: ECMAScript line terminators (LF,
   * CRLF, lone CR, U+2028, U+2029; the default), or
   * LF only (`lf`: webpack-sources, the webpack family's). Both axes of the
   * map count them so.
   */
  lines?: 'ecma' | 'lf'
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

/** `HostServices.modifiedAt` for a host whose modules are files on disk. */
export function fileModifiedAt(path: string): Promise<number | null> {
  return stat(path).then(
    (s) => s.mtimeMs,
    () => null,
  )
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
  /**
   * Full importer identity, passed to the bundler's resolver unchanged (a path alone would lose foreign queries and conditions).
   * Null when the resolver can't resolve the specifier, its failure included: the bundler decides on the import (a kept one fails there);
   * a rejection is a host's own error.
   */
  resolve: (
    specifier: string,
    importerCanonicalId: string,
  ) => Promise<{ id: string; external?: boolean } | null>
  /**
   * Which resolver of the environment `resolve` asks, when its modules do
   * not all resolve alike (Rsbuild's RSC layer: `react-server` through rule
   * `resolve` options); the resolution memo keeps each one's answers apart
   * (R35). Absent: the environment's one resolver.
   */
  resolveScope?: string
  rawFacts: RawFactsCache
  /** The project root: messages name a file relative to it (`displayPath`). */
  root?: string
  /** The prefix of the core's own messages (`[tanstack-router]`, `[tanstack-start]`); a planner's words take its own (`describeModule`). */
  tag?: string
  routes?: RouteRegistry
  /** When a file last changed on disk (`mtimeMs`), null when it isn't known; without it, differing input texts of one file go unreported. */
  modifiedAt?: (path: string) => Promise<number | null>
  /**
   * An invalidation could not re-validate a fingerprint (reading its source threw).
   * The plan counts as stale, so the error comes back from its next compile;
   * this is for a module nothing requests again.
   */
  onInvalidationError?: (error: unknown) => void
  /**
   * Every wait of the compile on the raw facts of a virtual module
   * (`isVirtualId`) goes through this, when given: a host whose virtual
   * reads settle only once the module's transforms are done (a Vite
   * build's `this.load`) fails a wait that can never end instead of
   * letting the build hang.
   */
  awaitVirtual?: <T>(canonicalId: string, read: Promise<T>) => Promise<T>
  /**
   * What a host gives particular planners beyond the core's services
   * (`PlannerServices`, declared by the planner packages). Today one key:
   * Start's `import-edges` planner reads the Rsbuild host's `importRewrite`.
   */
  services?: PlannerServices
}

export interface GateContext<TName extends string = string> {
  identity: SourceIdentity
  config: PlannerConfig<TName>
}

export interface PrefetchContext<TName extends string = string> {
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
  set: (data: PlannerPrefetch<TName>) => void
}

export interface PolicyContext {
  identity: SourceIdentity
  env: EnvInfo
  host: HostServices
  /** The input text of this compile (the plan's offsets index it). */
  code: string
  /**
   * The analysis of `code`, for a policy's rare paths (a reported edge: how
   * the importer uses its bindings). Only while the policy runs: nothing of
   * it goes into facts.
   */
  analysis: ModuleAnalysis
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

/**
 * A planner named `TName`: its contexts carry `TName`'s `PlannerData`.
 * `Planner` (the default, `any` name) is what the core's arrays hold: every
 * `Planner<'router'>` is one, and the core passes it its own data by name.
 */
export interface Planner<TName extends string = any> {
  name: TName
  tier: 0 | 1
  gate: (t0: ModuleAnalysis, ctx: GateContext<TName>) => boolean
  /**
   * Phase A contributions. Resolving to `false` withdraws the planner from
   * this compile (an async refinement of `gate`); the facts it recorded stay
   * dependencies of the plan.
   */
  prefetch?: (
    t0: ModuleAnalysis,
    ctx: PrefetchContext<TName>,
  ) => Promise<void | boolean>
  plan: (ctx: PlanContext<TName>) => void
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
   * filled at is the current one. It moves when a file appears or disappears
   * and when a `package.json` (`imports`, `exports`) or a `tsconfig` /
   * `jsconfig` (`paths`, `baseUrl`, which vite-tsconfig-paths reloads) changes:
   * what a resolver's answers depend on for the life of a server. The
   * bundler's own aliases need a restart of its resolver.
   */
  fileSetVersion: number
  /**
   * The file events `invalidate` applied, repeats included: a failed
   * resolution asked before one may be answered from before it (the file
   * the event made appear), so it is asked again (`resolveForAnalysis`, a
   * compile's snapshot).
   */
  events: number
  /** Per environment, the files whose modules its bundler must build again (`invalidate` and the compiles fill them, hosts take them). */
  stale: StaleSets
  /** Resolves once no `invalidate()` is running. */
  settled: () => Promise<void>
  /**
   * The session's own records of a file go with it (its server functions,
   * import protection's records): called where an invalidation applies a
   * removal (the file reads as missing), never for a removal of a file
   * that reads back.
   */
  removed: ((path: string) => void) | undefined
  /** The `invalidate()` running per path: calls for one path run one after the other. */
  invalidations: Map<string, Promise<unknown>>
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

export interface InvalidateChange {
  path: string
  kind: 'change' | 'add' | 'unlink' | 'registry'
}

/**
 * The hosts of an invalidation: one host for every plan, or a function of
 * the plan's key (a plan's resolutions are re-validated with its module's
 * own resolver: per-environment aliases and conditions, and an Rsbuild
 * layer's rule options, resolve a specifier differently).
 */
type InvalidationHosts = HostServices | ((key: PlanKey) => HostServices)

/**
 * The ONE invalidation operation, for a file event or a registry change.
 * Repeating it is harmless: a file whose text is what the caches read of it
 * (an echo, a touch, the same event through a second hook) changes nothing,
 * and calls for one path run one after the other (a repeat waits for the
 * first, then finds the text unchanged); an event is judged by the file as
 * it is (a removal of a file that reads back is a change). A change marks
 * the file's raw facts stale and re-validates dependents' fingerprints (the
 * file's own plans are keyed by its text and stay); the dependents
 * found stale enter their environment's stale set (`CompilerCaches.stale`),
 * and the host has its bundler build them again (the file's own modules are
 * its bundler's, which reported the event). A removed file's plans are
 * evicted, and every plan that read it is stale, unasked (held: their
 * modules wait for a file to appear).
 * Every file event, a repeat included, also re-resolves every failed
 * resolution of every env (one may hide a creation: a removal and a
 * re-creation the watcher folded into one change): a plan whose unresolved
 * specifier now resolves is a dependent; a change of a path the caches hold
 * nothing of that reads as a file is an `add`, which also re-resolves the
 * resolutions the new file may take (`shadowTest`). A registry change stales the file in every environment
 * that has compiled or whose bundler holds modules. Restored plans (`restorePlans`) are checked like
 * published ones. Each plan's fingerprints are checked with its host
 * (`hosts` of its key: the resolver its module resolves with). A removal
 * applied is told to the session (`CompilerCaches.removed`).
 */
export function invalidate(
  caches: CompilerCaches,
  change: InvalidateChange,
  hosts: InvalidationHosts,
): Promise<void> {
  const path = change.path
  const before = caches.invalidations.get(path)
  const apply = () => applyChange(caches, change, hosts)
  const run = before ? before.then(apply, apply) : apply()
  caches.invalidations.set(path, run)
  const done = () => {
    if (caches.invalidations.get(path) === run) {
      caches.invalidations.delete(path)
    }
  }
  run.then(done, done)
  return run
}

/** Whether a plan, a compile or the raw facts hold anything of `path`. */
function knownAt(caches: CompilerCaches, path: string): boolean {
  if (caches.rawFacts.knows(path)) {
    return true
  }
  for (const cache of caches.plans.values()) {
    if (cache.keysAt(path).length > 0 || cache.dependents.has(path)) {
      return true
    }
  }
  return false
}

async function applyChange(
  caches: CompilerCaches,
  event: InvalidateChange,
  hosts: InvalidationHosts,
): Promise<void> {
  const path = event.path
  if (event.kind !== 'registry') {
    caches.events++
  }
  // `imports` and `exports` decide what specifiers resolve to, as files
  // appearing do. (A resolution from a package to a target outside its
  // directory stays until its importer compiles again.) So do a tsconfig's
  // `paths`: each plan asks its resolutions again at its next request (the
  // bundler requests every module again after such an edit), and the
  // failed ones now (they name no file whose dependents would be reported)
  const manifestAt = path.endsWith('/package.json')
  const resolverFile = manifestAt || RESOLVER_CONFIG.test(path)
  let kind = event.kind
  let read: { text: string | null; same: boolean } | undefined
  /** The file reads as the caches read it: only the file set may have moved. */
  let unchanged = false
  /** A change to the text the caches read: a repeat of an applied event, or a file removed and created again unseen. */
  let repeat = false
  // (a virtual module has no file to read: its event always applies)
  if (kind !== 'registry' && !isVirtualId(path)) {
    // a change of a path the caches hold nothing of: nothing here tells a
    // file that was there all along from one that is back (its removal was
    // applied, and a module compiled meanwhile found nothing), so it is a
    // creation: what looked for the file asks again
    const created = kind === 'change' && !resolverFile && !knownAt(caches, path)
    // an event is judged by the file as it is: one delivered late (a
    // removal of a file that is back, a change of one that is gone) is
    // what the file says. A file the compiler has no language for is not
    // read: its event's kind stands
    const readable = resolverFile || identify(path).lang !== null
    if (readable || kind !== 'unlink') {
      read = await caches.rawFacts.readChange(path, readable)
      if (readable) {
        kind = read.text === null ? 'unlink' : kind === 'unlink' ? 'add' : kind
      }
      if (created && kind === 'change') {
        kind = 'add'
      }
      if (read.same) {
        // no fact of the file moved. A creation, or a removal of a file
        // that is back, still moves the file set: what looked for the file
        // meanwhile, and a resolver that answered before it existed
        // (another environment's event came first), ask again
        if (kind === 'change') {
          repeat = true
        } else {
          unchanged = true
        }
      }
    }
    if (kind === 'unlink' && !knownAt(caches, path)) {
      // nothing read the file, but a resolution memo may still name it
      caches.fileSetVersion++
      caches.removed?.(path)
      return
    }
  }
  const change: InvalidateChange = { path, kind }
  const hostOf = typeof hosts === 'function' ? hosts : () => hosts
  if (kind === 'unlink' || kind === 'registry') {
    // a changed file's plans are keyed by its text: a request of the new
    // text compiles it again, and a bundler that built it already keeps
    // the plan and its rows (its dependencies' events must find it)
    for (const cache of caches.plans.values()) {
      for (const key of cache.keysAt(path)) {
        cache.delete(key)
        cache.bump(key)
      }
    }
  }
  if (kind === 'unlink') {
    caches.rawFacts.forget(path)
    caches.stale.remove(path)
    caches.removed?.(path)
  } else if (!unchanged && !repeat) {
    caches.rawFacts.markStale(path, read?.text)
  }
  if (kind === 'registry') {
    // a module the host's route gate skipped has no plan to evict, and its
    // bundler sees no file event: every environment that compiled, and
    // every one whose bundler holds modules (`StaleSets.track`)
    for (const env of new Set([
      ...caches.plans.keys(),
      ...caches.stale.trackedEnvs(),
    ])) {
      caches.stale.add(env, path)
    }
  }
  // (a repeat moved nothing: the first event moved the file set)
  const manifest = !repeat && change.kind === 'change' && manifestAt
  const resolverConfig =
    manifest ||
    (!repeat && change.kind === 'change' && RESOLVER_CONFIG.test(change.path))
  const fileSetMoved =
    change.kind === 'add' || change.kind === 'unlink' || resolverConfig
  if (fileSetMoved) {
    caches.fileSetVersion++
  }
  const revalidate = async (
    cache: PlanCache,
    indexKey: string,
    relevant: (fp: DependencyFingerprint) => boolean,
    seen = new Set<string>(),
  ): Promise<void> => {
    for (const entry of cache.dependents.get(indexKey)) {
      const ks = `${cache.env}|${planKeyString(entry.key)}`
      if (seen.has(ks)) {
        continue
      }
      seen.add(ks)
      if (entry.asked && indexKey !== UNRESOLVED_DEPENDENCY) {
        // a compile running now asked for what changed: it starts again. A
        // failed resolution it met is its own to ask again (an event ran
        // since: its snapshot asks it), so the event leaves it running
        cache.bump(entry.key)
      }
      if (!entry.published) {
        continue
      }
      const host = hostOf(entry.key)
      const src = fingerprintSourceFor(caches, host, cache.env)
      const fps = cache.dependenciesOf(entry.key)?.filter(relevant)
      if (!fps) {
        continue
      }
      let stale = fps.length === 0 && change.kind === 'registry'
      for (const fp of fps) {
        // what read the removed file is stale, unasked (a resolver may
        // still cache the file until its next compile)
        if (
          (change.kind === 'unlink' && fingerprintPath(fp) === change.path) ||
          !(await checked(fp, src, host))
        ) {
          stale = true
          break
        }
      }
      if (stale) {
        cache.delete(entry.key)
        cache.bump(entry.key)
        caches.stale.add(
          cache.env,
          identify(entry.key.canonicalId).path,
          change.kind === 'unlink',
        )
      }
    }
  }
  const shadows =
    change.kind === 'add' || manifest ? shadowTest(change.path) : null
  for (const cache of caches.plans.values()) {
    // (a repeat of a change moved no fact of the file: only failed
    // resolutions may have moved, below)
    if (!repeat) {
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
    }
    if (kind !== 'registry') {
      // failed resolutions have no path; re-resolve them all (the memo asks
      // the host once per distinct entry). Every file event asks them: one
      // may hide a creation (a removal and re-creation reported as one
      // change, or a file back reported as modified)
      await revalidate(
        cache,
        UNRESOLVED_DEPENDENCY,
        (fp) => fp.kind === 'resolution' && fp.resolved === null,
      )
    }
    if (resolverConfig) {
      // an external answer stands until what decides it changes
      await revalidate(
        cache,
        EXTERNAL_DEPENDENCY,
        (fp) => fp.kind === 'resolution' && fp.resolved === EXTERNAL_RESOLUTION,
      )
    }
    if (shadows) {
      // a new file may take a resolution that found another file of its
      // name (`./x` found `x/index.ts`, and `x.ts` appeared)
      const shadowed = cache.dependents
        .shadowedBy(change.path)
        .filter((path) => path !== change.path)
      // only those resolutions are asked again, once per plan under many of
      // those paths: the plan's others found files the new one can't take.
      // A `package.json` decides more than the files it is next to (its
      // `imports` may name a target outside its directory): every resolution
      // of those plans is asked again
      const seen = new Set<string>()
      for (const path of shadowed) {
        await revalidate(
          cache,
          path,
          (fp) => {
            if (fp.kind !== 'resolution') {
              return false
            }
            if (manifestAt) {
              return true
            }
            const found = fingerprintPath(fp)
            return found !== null && found !== change.path && shadows(found)
          },
          seen,
        )
      }
    }
  }
}

/**
 * Whether a fingerprint is current. What can't be checked isn't known to be
 * current: an invalidation runs from file events and registry publications,
 * where a rejection would have nobody to answer to.
 */
function checked(
  fp: DependencyFingerprint,
  src: FingerprintSource,
  host: HostServices,
): Promise<boolean> {
  return fingerprintCurrent(fp, src).catch((error: unknown) => {
    host.onInvalidationError?.(error)
    return false
  })
}

/** A TypeScript or JavaScript project file (`tsconfig.json`, `tsconfig.app.json`, `jsconfig.json`): its `paths` decide resolutions. */
const RESOLVER_CONFIG = /\/[jt]sconfig(?:\.[^/]*)?\.json$/

/** The files dependencies name (a known package is recognised by its specifier, never read). */
export function dependencyPaths(
  dependencies: ReadonlyArray<DependencyFingerprint>,
  caches: CompilerCaches,
  out = new Set<string>(),
): Set<string> {
  const addModule = (canonicalId: string) => {
    if (!caches.rawFacts.isKnownSpecifier(canonicalId)) {
      out.add(pathOfId(canonicalId))
    }
  }
  for (const fp of dependencies) {
    if (
      fp.kind === 'summary' ||
      fp.kind === 'exports' ||
      fp.kind === 'target-facts' ||
      fp.kind === 'target-marker'
    ) {
      addModule(fp.canonicalId)
    } else if (fp.kind === 'route-registry') {
      out.add(fp.path)
    } else if (fp.resolved !== null && fp.resolved !== EXTERNAL_RESOLUTION) {
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
function shadowTest(added: string): (resolved: string) => boolean {
  const slash = added.lastIndexOf('/')
  const dir = added.slice(0, slash + 1)
  const base = added.slice(slash + 1)
  if (base === 'package.json') {
    return (resolved) => resolved.startsWith(dir)
  }
  const stem = dir + base.split('.')[0]!
  const end = stem.length
  // (the dependency paths it holds for are looked up: `shadowedBy`; this
  // asks it of their plans' resolutions)
  return (resolved) => {
    const next = resolved.charCodeAt(end)
    return (
      (next === 47 /* / */ ||
        (next === 46 /* . */ && !resolved.includes('/', end))) &&
      resolved.startsWith(stem)
    )
  }
}

/**
 * Restores plans an earlier process published, which the host persisted
 * with their modules (`CompileOutput.persisted`) and the bundler's
 * persistent cache restored without compiling them: a plan whose
 * dependencies are all current joins its environment's plans (the session's
 * invalidation finds it stale like a plan compiled now); the keys of the
 * others are returned, their modules are to be compiled again. Each plan
 * is checked with its host (`hosts` of its key).
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
      const src = fingerprintSourceFor(caches, hostOf(plan.key), env)
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
  caches.stale.release(env)
}

export function fingerprintSourceFor(
  caches: CompilerCaches,
  host: HostServices,
  env: string,
): FingerprintSource {
  return {
    summary: async (id) => (await caches.rawFacts.get(id, env)).summary,
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
 * environment's own, `resolveScope`); returns the canonical id of the
 * target, `EXTERNAL_RESOLUTION` for an external, or null when nothing
 * readable is behind it. The environment's memo answers a pair that resolver
 * resolved before at the current file-set version, settling or settled (the
 * compiles of a build ask for a barrel's re-exports once per importing
 * module); unresolved pairs are not kept. The caller records the answer in
 * its ledger.
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
  const memoKey =
    host.resolveScope === undefined
      ? importerCanonicalId
      : `${host.resolveScope}\0${importerCanonicalId}`
  let memo = memos.get(memoKey)
  if (!memo) {
    memo = new Map()
    memos.set(memoKey, memo)
  }
  const hit = memo.get(specifier)
  if (hit !== undefined) {
    return typeof hit === 'string' ? Promise.resolve(hit) : hit
  }
  const ask = async (): Promise<string | null> => {
    for (;;) {
      const askedAt = caches.events
      const r = await host.resolve(specifier, importerCanonicalId)
      if (r) {
        return r.external ? EXTERNAL_RESOLUTION : identify(r.id).canonicalId
      }
      if (caches.events === askedAt) {
        return null
      }
      // a failed answer a file event overlapped may be from before it (the
      // file it made appear): asked again before anyone records it
    }
  }
  const asked: Promise<string | null> = ask().then((resolved) => {
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
  // a rejected host call (the host's own error) is the caller's to report, and asked again next time
  asked.catch(() => {
    if (memo.get(specifier) === asked) {
      memo.delete(specifier)
    }
  })
  return asked
}
