/**
 * Caches (see README.md, "Caches and invalidation"): `PlanCache` with validated
 * hits, the `DependencyLedger` with in-flight registration and snapshot
 * validation, and the dependents index. Only plain data is retained.
 */
import { identify, planKeyString } from './identity'
import { approxBytes, cacheDisabled } from './stats'
import type { OutputId } from './rewrite'
import type { PlanKey } from './identity'
import type { EmitPlan } from './plan'
import type { TargetFacts } from './facts'
import type { Diagnostic } from './diagnostics'

export type DependencyFingerprint =
  | { kind: 'summary'; canonicalId: string; digest: string | null }
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
      resolved: string | null
    }

function fingerprintId(fp: DependencyFingerprint): string {
  switch (fp.kind) {
    case 'summary':
      return `summary:${fp.canonicalId}`
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
    case 'target-facts':
    case 'target-marker':
      return identify(fp.canonicalId).path
    case 'route-registry':
      return fp.path
    case 'resolution':
      return fp.resolved === null ? null : identify(fp.resolved).path
  }
}

/**
 * Dependents-index bucket of failed resolutions. An unresolved
 * resolution has no path to watch: file add/unlink events re-resolve every
 * entry of this bucket instead (`invalidate`).
 */
export const UNRESOLVED_DEPENDENCY = '\u0000unresolved'

/** The dependents-index key of a fingerprint: its path, or the unresolved bucket. */
function fingerprintIndexKey(fp: DependencyFingerprint): string | null {
  if (fp.kind === 'resolution' && fp.resolved === null) {
    return UNRESOLVED_DEPENDENCY
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
  summaryDigest: (canonicalId: string) => Promise<string | null>
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
    case 'summary':
      return (await src.summaryDigest(fp.canonicalId)) === fp.digest
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
    emptyPaths: number
    entries: number
    keys: number
  } {
    let entries = 0
    let emptyPaths = 0
    for (const m of this.byPath.values()) {
      entries += m.size
      if (m.size === 0) {
        emptyPaths++
      }
    }
    return {
      paths: this.byPath.size,
      emptyPaths,
      entries,
      keys: this.byKey.size,
    }
  }
}

/**
 * Records the facts a compile acquires, registers them as in-flight
 * dependencies and validates the complete snapshot before publication. A
 * fact is recorded once per compile: a resolution asked again in the same
 * attempt reads the recorded answer (`resolved`), so one attempt sees one
 * answer and the snapshot validation decides whether it is still current.
 */
export class DependencyLedger {
  readonly entries: Array<DependencyFingerprint> = []
  private readonly byId = new Map<string, DependencyFingerprint>()
  /** The dependents-index buckets of `entries`. */
  private readonly indexKeys = new Set<string>()

  constructor(
    readonly key: PlanKey,
    readonly generation: number,
    private readonly index: DependentsIndex,
  ) {}

  record(fp: DependencyFingerprint): void {
    const id = fingerprintId(fp)
    if (this.byId.has(id)) {
      return
    }
    this.byId.set(id, fp)
    this.entries.push(fp)
    const indexKey = fingerprintIndexKey(fp)
    if (indexKey !== null && !this.indexKeys.has(indexKey)) {
      this.indexKeys.add(indexKey)
      this.index.add(indexKey, this.key)
    }
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

  /**
   * Whether every recorded fact is still current. Resolutions are skipped
   * when `fileSetCurrent` (no file appeared or disappeared since the
   * attempt started: the resolver's answers stand).
   */
  async validateSnapshot(
    src: FingerprintSource,
    fileSetCurrent = false,
  ): Promise<boolean> {
    const checks: Array<Promise<boolean>> = []
    for (const fp of this.entries) {
      if (fileSetCurrent && fp.kind === 'resolution') {
        continue
      }
      checks.push(fingerprintCurrent(fp, src))
    }
    return (await Promise.all(checks)).every((ok) => ok)
  }

  /** The plan is published: its rows replace the key's previous plan's. */
  publish(): void {
    this.index.publish(this.key, this.indexKeys)
  }
}

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
  /** `TSR_COMPILER_NO_CACHE=plans`: nothing is published (measurement knob). */
  private readonly disabled = cacheDisabled('plans')
  /** Use counts for `compilerStats()`: validated plan hits. */
  readonly counters = { planHits: 0 }
  /**
   * The environment's resolutions, importer → specifier → the resolver's
   * answer (settling, or the settled canonical id; unresolved pairs are not
   * kept), shared by every compile and validation of the environment. The
   * keys are the importer and specifier strings the compiles already hold.
   * The memo is good for one `fileSetVersion` (a file appearing or
   * disappearing, a `package.json` changing) and dropped as one at the next
   * (`resolutionsAt`): the plans' resolution fingerprints have the same
   * authority and no other. A `tsconfig` `paths` edit moves neither: the
   * bundler's resolver keeps its old answer until a restart too.
   */
  private readonly resolutions = new Map<string, ResolutionMemo>()
  private resolvedAt = -1
  /**
   * Plans an earlier process published, known by their dependencies only
   * (the bundler's persistent cache restored their modules without a
   * compile): never a hit, found stale by `invalidate` like a published
   * plan, replaced by the key's next publication.
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
    const path = identify(key.canonicalId).path
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

  /** Publishes; refuses stale completions (generation moved or a newer revision was seen). */
  set(entry: CacheEntry): boolean {
    const ks = planKeyString(entry.key)
    if ((this.generations.get(ks) ?? 0) !== entry.generation) {
      return false
    }
    if (this.latest.get(ks) !== entry.revision || this.disabled) {
      return false
    }
    this.entries.set(ks, entry)
    this.restored.delete(ks)
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
   * Adds a plan an earlier process published (`restorePlans` validated its
   * dependencies); a key this process compiled or compiles keeps its own.
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

  values(): IterableIterator<CacheEntry> {
    return this.entries.values()
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
      dependentEmptyPaths: d.emptyPaths,
      dependentEntries: d.entries,
      ...(withBytes && { planBytes }),
    }
  }
}
