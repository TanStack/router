/**
 * Caches (see README.md, "Caches and invalidation"): `PlanCache` with validated
 * hits, the `DependencyLedger` with in-flight registration and snapshot
 * validation, and the dependents index. Only plain data is retained.
 */
import { pathOfId, planKeyString } from './identity'
import { exportKeyOf, summaryDigest } from './summary'
import { approxBytes, cacheDisabled } from './stats'
import type { OutputId } from './rewrite'
import type { PlanKey } from './identity'
import type { EmitPlan } from './plan'
import type { TargetFacts } from './facts'
import type { ModuleSummary } from './summary'
import type { Diagnostic } from './diagnostics'

export type DependencyFingerprint =
  /** The whole summary (a listing of the module's exports, or a module without one: null). */
  | { kind: 'summary'; canonicalId: string; digest: string | null }
  /**
   * The exports a plan read of one module, one record however many names it
   * read: per name, its `exportKeyOf` answer (null: the module
   * has no such export); `keys` is null when the module has none of them (a
   * star target a lookup passed through). `stars`: the module's `export *`
   * list, when a lookup of a name it does not export itself went through it.
   */
  | {
      kind: 'exports'
      canonicalId: string
      names: ReadonlyArray<string>
      keys: ReadonlyArray<string | null> | null
      stars?: ReadonlyArray<string>
    }
  | { kind: 'target-facts'; canonicalId: string; digest: string }
  /** Only the target's environment marker (a consumer that reads nothing else). */
  | {
      kind: 'target-marker'
      canonicalId: string
      marker: TargetFacts['marker']
    }
  | { kind: 'route-registry'; path: string; digest: string | null }
  | {
      kind: 'resolution'
      env: string
      importer: string
      specifier: string
      /** The target's canonical id; `EXTERNAL_RESOLUTION`: external; null: unresolved. */
      resolved: string | null
    }

function fingerprintId(fp: DependencyFingerprint): string {
  switch (fp.kind) {
    case 'summary':
      return `summary:${fp.canonicalId}`
    case 'exports':
      return `exports:${fp.canonicalId}`
    case 'target-facts':
      return `target:${fp.canonicalId}`
    case 'target-marker':
      return `marker:${fp.canonicalId}`
    case 'route-registry':
      return `route:${fp.path}`
    case 'resolution':
      return `resolve:${fp.env}:${fp.importer}:${fp.specifier}`
  }
}

/** The path a fingerprint depends on (for the dependents index and `invalidate`). */
export function fingerprintPath(fp: DependencyFingerprint): string | null {
  switch (fp.kind) {
    case 'summary':
    case 'exports':
    case 'target-facts':
    case 'target-marker':
      return pathOfId(fp.canonicalId)
    case 'route-registry':
      return fp.path
    case 'resolution':
      return fp.resolved === null || fp.resolved === EXTERNAL_RESOLUTION
        ? null
        : pathOfId(fp.resolved)
  }
}

/**
 * The `resolved` of a resolution the resolver answered `external`: an
 * answer like a found file (memoised, nothing readable behind it), which no
 * file appearing or disappearing replaces.
 */
export const EXTERNAL_RESOLUTION = '\u0000external'

/**
 * Dependents-index buckets of the resolutions with no path to watch.
 * Failed ones: file add/unlink events re-resolve every entry of their bucket
 * (`invalidate`). External ones: a `package.json` or `tsconfig` change does.
 */
export const UNRESOLVED_DEPENDENCY = '\u0000unresolved'
export const EXTERNAL_DEPENDENCY = '\u0000externals'

/** The dependents-index key of a fingerprint: its path, or a bucket of resolutions without one. */
function fingerprintIndexKey(fp: DependencyFingerprint): string | null {
  if (fp.kind === 'resolution') {
    if (fp.resolved === null) {
      return UNRESOLVED_DEPENDENCY
    }
    if (fp.resolved === EXTERNAL_RESOLUTION) {
      return EXTERNAL_DEPENDENCY
    }
  }
  return fingerprintPath(fp)
}

/**
 * A plan's dependencies as a host persists them with the plan's module
 * (plain data): a later process restores them (`restorePlans`) for a module
 * the bundler's persistent cache restores without compiling it.
 */
export interface PersistedPlan {
  key: PlanKey
  dependencies: ReadonlyArray<DependencyFingerprint>
}

/** The current values fingerprints are validated against. */
export interface FingerprintSource {
  summary: (canonicalId: string) => Promise<ModuleSummary | null>
  targetDigest: (canonicalId: string) => Promise<string | null>
  targetMarker: (canonicalId: string) => Promise<TargetFacts['marker']>
  routeRegistryDigest: (path: string) => string | null
  /** Resolves through the environment's own resolver (the source is per environment: aliases and conditions differ). */
  resolution: (importer: string, specifier: string) => Promise<string | null>
}

export async function fingerprintCurrent(
  fp: DependencyFingerprint,
  src: FingerprintSource,
): Promise<boolean> {
  switch (fp.kind) {
    case 'summary': {
      const summary = await src.summary(fp.canonicalId)
      return (summary ? summaryDigest(summary) : null) === fp.digest
    }
    case 'exports': {
      const summary = await src.summary(fp.canonicalId)
      const stars = fp.stars
      return (
        summary !== null &&
        fp.names.every(
          (n, i) => exportKeyOf(summary, n) === (fp.keys?.[i] ?? null),
        ) &&
        (stars === undefined ||
          (summary.stars.length === stars.length &&
            summary.stars.every((s, i) => s === stars[i])))
      )
    }
    case 'target-facts':
      return (await src.targetDigest(fp.canonicalId)) === fp.digest
    case 'target-marker':
      return (await src.targetMarker(fp.canonicalId)) === fp.marker
    case 'route-registry':
      return src.routeRegistryDigest(fp.path) === fp.digest
    case 'resolution':
      return (await src.resolution(fp.importer, fp.specifier)) === fp.resolved
  }
}

/**
 * The answers a validation takes as current: resolutions at an unchanged
 * `fileSetVersion`, raw facts at an unchanged `RawFactsCache.version`.
 */
export interface StandingAnswers {
  resolutions: boolean
  facts: boolean
}

/**
 * Whether every fingerprint is still current; the standing answers are not
 * asked again. A route-registry digest is always asked (a synchronous
 * read): a registry publication reaches `invalidate` only on a dev server
 * (a watch build sees it here).
 */
export async function fingerprintsCurrent(
  fps: ReadonlyArray<DependencyFingerprint>,
  src: FingerprintSource,
  standing: StandingAnswers,
): Promise<boolean> {
  // every fingerprint at once: the checks are independent reads
  const checks: Array<Promise<boolean>> = []
  for (const fp of fps) {
    const skip =
      fp.kind === 'resolution'
        ? standing.resolutions
        : fp.kind !== 'route-registry' && standing.facts
    if (!skip) {
      checks.push(fingerprintCurrent(fp, src))
    }
  }
  return (await Promise.all(checks)).every((ok) => ok)
}

interface DependentEntry {
  key: PlanKey
  inFlight: boolean
}

/**
 * Reverse index: dependency path (or the unresolved bucket) → plan keys
 * (published or in flight), with each key's own buckets (`planKey → paths`)
 * so publishing and evicting a plan touch its rows only. A row is in flight
 * while an attempt of its key recorded it and no published plan of the key
 * depends on it; compiles of one key overlap (two quick saves) and share
 * their rows, so the rows in flight live until the key's last compile ends
 * (`PlanCache.end`). Empty buckets are removed: the index holds rows of live
 * plans and compiles only.
 */
class DependentsIndex {
  private readonly byPath = new Map<string, Map<string, DependentEntry>>()
  private readonly byKey = new Map<string, Set<string>>()

  /** The row of (path, key); a new row is in flight. */
  add(path: string, key: PlanKey): DependentEntry {
    let m = this.byPath.get(path)
    if (!m) {
      m = new Map()
      this.byPath.set(path, m)
    }
    const ks = planKeyString(key)
    let e = m.get(ks)
    if (!e) {
      e = { key, inFlight: true }
      m.set(ks, e)
    }
    let paths = this.byKey.get(ks)
    if (!paths) {
      paths = new Set()
      this.byKey.set(ks, paths)
    }
    paths.add(path)
    return e
  }

  get(path: string): Array<DependentEntry> {
    return [...(this.byPath.get(path)?.values() ?? [])]
  }

  /** Whether a plan or a compile depends on `path`. */
  has(path: string): boolean {
    return this.byPath.has(path)
  }

  /** The dependency paths with rows (and the unresolved bucket, if it has any). */
  paths(): IterableIterator<string> {
    return this.byPath.keys()
  }

  /**
   * Publication of a key's plan whose dependencies index under `paths`: the
   * key's published rows become exactly those (rows in flight stay).
   */
  publish(key: PlanKey, paths: ReadonlySet<string>): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      if (!paths.has(path) && !this.byPath.get(path)!.get(ks)!.inFlight) {
        this.remove(path, ks)
      }
    }
    for (const path of paths) {
      this.add(path, key).inFlight = false
    }
  }

  /** Drops a key's published rows (eviction) or its rows in flight (its last compile ended). */
  drop(key: PlanKey, inFlight: boolean): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      if (this.byPath.get(path)!.get(ks)!.inFlight === inFlight) {
        this.remove(path, ks)
      }
    }
  }

  private remove(path: string, ks: string): void {
    const m = this.byPath.get(path)
    if (m) {
      m.delete(ks)
      if (m.size === 0) {
        this.byPath.delete(path)
      }
    }
    const paths = this.byKey.get(ks)
    if (paths) {
      paths.delete(path)
      if (paths.size === 0) {
        this.byKey.delete(ks)
      }
    }
  }

  /** Sizes for `compilerStats()`. */
  stats(): {
    paths: number
    entries: number
    keys: number
  } {
    let entries = 0
    for (const m of this.byPath.values()) {
      entries += m.size
    }
    return {
      paths: this.byPath.size,
      entries,
      keys: this.byKey.size,
    }
  }
}

/**
 * Records the facts a compile acquires and registers them as in-flight
 * dependencies; the complete snapshot (`published`) is validated before
 * publication. A fact is recorded once per compile: a resolution asked again
 * in the same attempt reads the recorded answer (`resolved`), so one attempt
 * sees one answer and the snapshot validation decides whether it is still
 * current.
 */
export class DependencyLedger {
  readonly entries: Array<DependencyFingerprint> = []
  private readonly byId = new Map<string, DependencyFingerprint>()
  /** What lookups read of a module: name → `exportKeyOf` answer (null: no such export), and its `export *` list if they walked it. */
  private readonly exportReads = new Map<string, ExportReads>()
  /** The dependents-index buckets of `entries` and `exportReads`. */
  private readonly indexKeys = new Set<string>()

  constructor(
    readonly key: PlanKey,
    private readonly index: DependentsIndex,
  ) {}

  record(fp: DependencyFingerprint): void {
    const id = fingerprintId(fp)
    if (this.byId.has(id)) {
      return
    }
    this.byId.set(id, fp)
    this.entries.push(fp)
    this.indexPath(fingerprintIndexKey(fp))
  }

  /** A lookup read export `name` of a module (`key`: its `exportKeyOf` answer, null when it has none). */
  recordExport(canonicalId: string, name: string, key: string | null): void {
    const { keys } = this.readsOf(canonicalId)
    if (!keys.has(name)) {
      keys.set(name, key)
    }
  }

  /** A lookup walked the module's `export *` list (a name it does not export itself). */
  recordStars(canonicalId: string, stars: ReadonlyArray<string>): void {
    const reads = this.readsOf(canonicalId)
    // a copy: the plan keeps it, the cache may drop its summary (most star
    // targets of a barrel have no stars: one list for all of them)
    reads.stars ??= stars.length === 0 ? NO_STARS : [...stars]
  }

  private readsOf(canonicalId: string): ExportReads {
    let reads = this.exportReads.get(canonicalId)
    if (!reads) {
      reads = { keys: new Map(), stars: undefined }
      this.exportReads.set(canonicalId, reads)
      this.indexPath(pathOfId(canonicalId))
    }
    return reads
  }

  private indexPath(indexKey: string | null): void {
    if (indexKey !== null && !this.indexKeys.has(indexKey)) {
      this.indexKeys.add(indexKey)
      this.index.add(indexKey, this.key)
    }
  }

  /**
   * Every fact recorded, as a published plan keeps it: what was read of a
   * module is one `exports` record. Names are sorted, so the star targets a
   * lookup visited for the same names share one list.
   */
  published(): Array<DependencyFingerprint> {
    const out = [...this.entries]
    const lists =
      this.exportReads.size > 1
        ? new Map<string, ReadonlyArray<string>>()
        : null
    for (const [canonicalId, { keys, stars }] of this.exportReads) {
      let names: ReadonlyArray<string> = [...keys.keys()].sort()
      if (lists) {
        const listId = names.join('\0')
        const shared = lists.get(listId)
        if (shared) {
          names = shared
        } else {
          lists.set(listId, names)
        }
      }
      // (sized once: a pushed array keeps room it does not use)
      const read = names.map((n) => keys.get(n) ?? null)
      const kept = read.some((k) => k !== null) ? read : null
      out.push(
        stars
          ? { kind: 'exports', canonicalId, names, keys: kept, stars }
          : { kind: 'exports', canonicalId, names, keys: kept },
      )
    }
    return out
  }

  /** The answer of a resolution this compile recorded (undefined: not asked yet). */
  resolved(
    env: string,
    importer: string,
    specifier: string,
  ): string | null | undefined {
    const fp = this.byId.get(
      fingerprintId({
        kind: 'resolution',
        env,
        importer,
        specifier,
        resolved: null,
      }),
    )
    return fp && fp.kind === 'resolution' ? fp.resolved : undefined
  }

  /** The plan is published: its rows replace the key's previous plan's. */
  publish(): void {
    this.index.publish(this.key, this.indexKeys)
  }
}

interface ExportReads {
  keys: Map<string, string | null>
  stars: ReadonlyArray<string> | undefined
}

const NO_STARS: ReadonlyArray<string> = Object.freeze([])

/** The dependents-index buckets of a plan's dependencies. */
function indexKeysOf(
  dependencies: ReadonlyArray<DependencyFingerprint>,
): Set<string> {
  const keys = new Set<string>()
  for (const fp of dependencies) {
    const key = fingerprintIndexKey(fp)
    if (key !== null) {
      keys.add(key)
    }
  }
  return keys
}

/** One importer's resolutions: specifier → canonical id, or the resolver's pending answer. */
type ResolutionMemo = Map<string, string | Promise<string | null>>

export interface CacheEntry {
  key: PlanKey
  revision: string
  generation: number
  plan: EmitPlan
  /** The `fileSetVersion` the plan's resolutions were last validated at. */
  resolvedAt: number
  /** The `RawFactsCache.version` the plan's raw facts were last validated at. */
  factsAt: number
  /** The output whose request compiled it, and when that compile started (`Date.now()`): see `textDiffers`. */
  compiledFor: OutputId
  compiledAt: number
}

/**
 * What compiling a key at one revision settled on: every request of that
 * revision emits its own output from it.
 */
export type Settled =
  | { kind: 'untouched' }
  | { kind: 'parse-error'; diagnostics: Array<Diagnostic> }
  /** `overtaken`: every attempt was overtaken; the last plan answers, unpublished. */
  | { kind: 'plan'; entry: CacheEntry; overtaken: boolean }

/** The compile of a key at one revision, from its first attempt until it settled. */
interface InFlight {
  revision: string
  settled: Promise<Settled>
}

/**
 * One plan per (env, canonical id, config) at its latest content hash. A
 * key's generation and latest revision are kept while it has a plan or a
 * compile in flight (`begin`/`end`); then they are retired: no attempt holds
 * a generation number any more, and the next request starts over.
 */
export class PlanCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly generations = new Map<string, number>()
  private readonly latest = new Map<string, string>()
  /** Compiles in flight per key (a compile of a newer revision may have replaced the key's `inFlight` record). */
  private readonly active = new Map<string, number>()
  /**
   * Path → live keys (`keysAt`): a key is indexed from its first attempt or
   * publication until it is retired, so an invalidation of a path never
   * scans the cache. `pathOf` is the reverse (key → its row's path).
   */
  private readonly byPath = new Map<string, Map<string, PlanKey>>()
  private readonly pathOf = new Map<string, string>()
  /** The compile in flight per key: requests at its revision wait for it instead of compiling again. */
  readonly inFlight = new Map<string, InFlight>()
  readonly dependents = new DependentsIndex()
  /** `TSR_COMPILER_NO_CACHE=plans`: no plan is a hit (measurement knob); dependencies are still kept. */
  private readonly disabled = cacheDisabled('plans')
  /**
   * Use counts for `compilerStats()`: validated plan hits, and hits that
   * failed validation while no invalidation ran (a change no `invalidate()`
   * reported: a defect of a host, or of the core).
   */
  /**
   * `staleHits`: plan hits that failed validation on a fact (an
   * invalidation missed it: a defect); `lazyHits`: on a resolution or a
   * route-registry digest, which the next request asks again by design (a
   * tsconfig edit).
   */
  readonly counters = { planHits: 0, staleHits: 0, lazyHits: 0 }
  /**
   * The environment's resolutions, importer → specifier → the resolver's
   * answer (settling, or the settled canonical id; unresolved pairs are not
   * kept), shared by every compile and validation of the environment. The
   * keys are the importer and specifier strings the compiles already hold.
   * The memo is good for one `fileSetVersion` (a file appearing or
   * disappearing, a `package.json` changing) and dropped as one at the next
   * (`resolutionsAt`): the plans' resolution fingerprints have the same
   * authority and no other. A `tsconfig` edit moves it too
   * (`fileSetVersion`); the bundler's own aliases need a restart.
   */
  private readonly resolutions = new Map<string, ResolutionMemo>()
  private resolvedAt = -1
  /**
   * Plans known by their dependencies only, whose outputs a bundler holds:
   * one an earlier process published (the bundler's persistent cache
   * restored its module without a compile), the last attempt of a
   * compile every attempt of which was overtaken, or every plan when plan
   * caching is off (`TSR_COMPILER_NO_CACHE=plans`). Never a hit, found stale
   * by `invalidate` like a published plan, replaced by the key's next
   * publication.
   */
  private readonly restored = new Map<string, PersistedPlan>()

  constructor(readonly env: string) {}

  /** The resolution memo at `fileSetVersion` (empty when the file set changed since it was filled). */
  resolutionsAt(fileSetVersion: number): Map<string, ResolutionMemo> {
    if (this.resolvedAt !== fileSetVersion) {
      this.resolutions.clear()
      this.resolvedAt = fileSetVersion
    }
    return this.resolutions
  }

  generation(key: PlanKey): number {
    return this.generations.get(planKeyString(key)) ?? 0
  }

  /** Makes attempts in flight for `key` stale (nothing to do when there are none). */
  bump(key: PlanKey): void {
    const ks = planKeyString(key)
    if (this.retire(ks)) {
      return
    }
    this.generations.set(ks, (this.generations.get(ks) ?? 0) + 1)
  }

  /** Notes the revision a request arrives with; a new revision bumps the generation. */
  noteRevision(key: PlanKey, revision: string): void {
    const ks = planKeyString(key)
    if (this.latest.get(ks) !== revision) {
      this.latest.set(ks, revision)
      this.generations.set(ks, (this.generations.get(ks) ?? 0) + 1)
    }
  }

  latestRevision(key: PlanKey): string | undefined {
    return this.latest.get(planKeyString(key))
  }

  /** A compile of `key` starts (its generation must stay meaningful until `end`). */
  begin(key: PlanKey): void {
    const ks = planKeyString(key)
    this.active.set(ks, (this.active.get(ks) ?? 0) + 1)
    this.track(ks, key)
  }

  /** Indexes a live key under its path (idempotent). */
  private track(ks: string, key: PlanKey): void {
    if (this.pathOf.has(ks)) {
      return
    }
    const path = pathOfId(key.canonicalId)
    this.pathOf.set(ks, path)
    let keys = this.byPath.get(path)
    if (!keys) {
      keys = new Map()
      this.byPath.set(path, keys)
    }
    keys.set(ks, key)
  }

  private untrack(ks: string): void {
    const path = this.pathOf.get(ks)
    if (path === undefined) {
      return
    }
    this.pathOf.delete(ks)
    const keys = this.byPath.get(path)
    if (keys) {
      keys.delete(ks)
      if (keys.size === 0) {
        this.byPath.delete(path)
      }
    }
  }

  /** A compile of `key` ended (published or not); the last one takes the key's rows in flight along. */
  end(key: PlanKey): void {
    const ks = planKeyString(key)
    const n = (this.active.get(ks) ?? 1) - 1
    if (n > 0) {
      this.active.set(ks, n)
    } else {
      this.active.delete(ks)
      this.dependents.drop(key, true)
    }
    this.retire(ks)
  }

  /** Forgets a key's generation and latest revision when nothing holds them; true when retired. */
  private retire(ks: string): boolean {
    if (this.entries.has(ks) || this.active.has(ks) || this.restored.has(ks)) {
      return false
    }
    this.generations.delete(ks)
    this.latest.delete(ks)
    this.untrack(ks)
    return true
  }

  /** A hit by key and revision; the caller validates the dependency snapshot. */
  lookup(key: PlanKey, revision: string): CacheEntry | null {
    const e = this.entries.get(planKeyString(key))
    return e && e.revision === revision ? e : null
  }

  get(key: PlanKey): CacheEntry | null {
    return this.entries.get(planKeyString(key)) ?? null
  }

  /**
   * Publishes; refuses stale completions (generation moved or a newer
   * revision was seen). With plan caching off, the plan is kept by its
   * dependencies only (`restored`: never a hit, its dependents still reported).
   */
  set(entry: CacheEntry): boolean {
    const ks = planKeyString(entry.key)
    if ((this.generations.get(ks) ?? 0) !== entry.generation) {
      return false
    }
    if (this.latest.get(ks) !== entry.revision) {
      return false
    }
    if (this.disabled) {
      this.restored.set(ks, {
        key: entry.key,
        dependencies: entry.plan.dependencies,
      })
    } else {
      this.entries.set(ks, entry)
      this.restored.delete(ks)
    }
    this.track(ks, entry.key)
    return true
  }

  /** Evicts a key's published or restored plan; true when it had one. */
  delete(key: PlanKey): boolean {
    const ks = planKeyString(key)
    const had = this.entries.delete(ks) || this.restored.delete(ks)
    this.dependents.drop(key, false)
    this.retire(ks)
    return had
  }

  /**
   * Adds a plan known by its dependencies only (`restored`); a key with a
   * published plan or a compile running keeps its own.
   */
  restore(plan: PersistedPlan): void {
    const ks = planKeyString(plan.key)
    if (this.entries.has(ks) || this.active.has(ks)) {
      return
    }
    this.restored.set(ks, plan)
    this.track(ks, plan.key)
    this.dependents.publish(plan.key, indexKeysOf(plan.dependencies))
  }

  /** The dependencies of a key's published or restored plan (null: none). */
  dependenciesOf(key: PlanKey): ReadonlyArray<DependencyFingerprint> | null {
    const ks = planKeyString(key)
    return (
      this.entries.get(ks)?.plan.dependencies ??
      this.restored.get(ks)?.dependencies ??
      null
    )
  }

  /** The keys of the published and restored plans. */
  keys(): Array<PlanKey> {
    return [
      ...[...this.entries.values()].map((e) => e.key),
      ...[...this.restored.values()].map((p) => p.key),
    ]
  }

  /** Live keys (published, restored, or with an attempt active) whose canonical id lives at `path`. */
  keysAt(path: string): Array<PlanKey> {
    return [...(this.byPath.get(path)?.values() ?? [])]
  }

  /** Sizes for `compilerStats()` (bytes: plans, approximate). */
  stats(withBytes: boolean): Record<string, number> {
    let dependencies = 0
    let planBytes = 0
    for (const e of this.entries.values()) {
      dependencies += e.plan.dependencies.length
      if (withBytes) {
        planBytes += approxBytes(e.plan)
      }
    }
    const d = this.dependents.stats()
    let resolutions = 0
    for (const m of this.resolutions.values()) {
      resolutions += m.size
    }
    return {
      plans: this.entries.size,
      restored: this.restored.size,
      resolutions,
      dependencies,
      generations: this.generations.size,
      latest: this.latest.size,
      inFlight: this.inFlight.size,
      active: this.active.size,
      keyPaths: this.byPath.size,
      trackedKeys: this.pathOf.size,
      ...this.counters,
      dependentPaths: d.paths,
      dependentKeys: d.keys,
      dependentEntries: d.entries,
      ...(withBytes && { planBytes }),
    }
  }
}

/**
 * The stale set of each environment: the files whose modules its bundler
 * must build again and will not build on its own (the dependents an
 * invalidation found stale, a registry change's file, a plan hit that
 * failed validation, a compile every attempt of which was overtaken). A
 * path stays until a host takes it. `held`: stale only because a file it
 * read was removed (a host may wait for a file to appear before it builds
 * the module again).
 */
export class StaleSets {
  private readonly byEnv = new Map<string, Map<string, boolean>>()

  add(env: string, path: string, held = false): void {
    let set = this.byEnv.get(env)
    if (!set) {
      set = new Map()
      this.byEnv.set(env, set)
    }
    const was = set.get(path)
    set.set(path, was === undefined ? held : was && held)
  }

  /** Reads and empties the environment's set; the held paths stay unless `held`. */
  take(env: string, opts: { held?: boolean } = {}): Array<string> {
    const set = this.byEnv.get(env)
    if (!set) {
      return []
    }
    const out: Array<string> = []
    for (const [path, held] of set) {
      if (!held || opts.held === true) {
        out.push(path)
        set.delete(path)
      }
    }
    if (set.size === 0) {
      this.byEnv.delete(env)
    }
    return out
  }

  /** Whether the environment's set holds a path (held ones included). */
  has(env: string): boolean {
    return this.byEnv.has(env)
  }

  /** Whether the environment's set holds `path`. */
  holds(env: string, path: string): boolean {
    return this.byEnv.get(env)?.has(path) ?? false
  }

  /**
   * Paths an environment's bundler is building again now on its own (their
   * files' events): its stale set lets them go.
   */
  drop(env: string, paths: Iterable<string>): void {
    const set = this.byEnv.get(env)
    if (!set) {
      return
    }
    for (const path of paths) {
      set.delete(path)
    }
    if (set.size === 0) {
      this.byEnv.delete(env)
    }
  }

  /** A removed file: no environment builds its modules again. */
  remove(path: string): void {
    for (const [env, set] of this.byEnv) {
      set.delete(path)
      if (set.size === 0) {
        this.byEnv.delete(env)
      }
    }
  }

  /** An environment that compiles nothing more (`releaseEnvironment`). */
  release(env: string): void {
    this.byEnv.delete(env)
  }

  /** Sizes for `compilerStats()`. */
  stats(): { stalePaths: number; staleHeld: number } {
    let stalePaths = 0
    let staleHeld = 0
    for (const set of this.byEnv.values()) {
      stalePaths += set.size
      for (const held of set.values()) {
        staleHeld += held ? 1 : 0
      }
    }
    return { stalePaths, staleHeld }
  }
}
