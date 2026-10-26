/**
 * Caches (see README.md, "Caches and invalidation"): `PlanCache` with validated
 * hits, the `DependencyLedger` with in-flight registration and snapshot
 * validation, and the dependents index. Only plain data is retained.
 */
import { identify, planKeyString } from './identity'
import { approxBytes, cacheDisabled } from './stats'
import type { PlanKey } from './identity'
import type { EmitPlan } from './plan'
import type { TargetFacts } from './facts'

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
  | { kind: 'config'; configKey: string }

export function fingerprintId(fp: DependencyFingerprint): string {
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
    case 'config':
      return 'config'
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
    case 'config':
      return null
  }
}

/**
 * Dependents-index bucket of failed resolutions. An unresolved
 * resolution has no path to watch: file add/unlink events re-resolve every
 * entry of this bucket instead (`invalidate`).
 */
export const UNRESOLVED_DEPENDENCY = '\u0000unresolved'

/** The dependents-index key of a fingerprint: its path, or the unresolved bucket. */
export function fingerprintIndexKey(fp: DependencyFingerprint): string | null {
  if (fp.kind === 'resolution' && fp.resolved === null) {
    return UNRESOLVED_DEPENDENCY
  }
  return fingerprintPath(fp)
}

/** The current values fingerprints are validated against. */
export interface FingerprintSource {
  summaryDigest: (canonicalId: string) => Promise<string | null>
  targetDigest: (canonicalId: string) => Promise<string | null>
  targetMarker: (canonicalId: string) => Promise<TargetFacts['marker']>
  routeRegistryDigest: (path: string) => string | null
  /** Resolves through the environment's own resolver (the source is per environment: aliases and conditions differ). */
  resolution: (importer: string, specifier: string) => Promise<string | null>
  configKey: string
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
    case 'config':
      return src.configKey === fp.configKey
  }
}

interface DependentEntry {
  key: PlanKey
  inFlight: boolean
}

/**
 * Reverse index: dependency path (or the unresolved bucket) → plan keys
 * (published or in flight), with each key's own buckets (`planKey → paths`)
 * so publishing, discarding and evicting a plan touch its rows only. Empty
 * buckets are removed: the index holds rows of live plans and attempts only.
 */
export class DependentsIndex {
  private readonly byPath = new Map<string, Map<string, DependentEntry>>()
  private readonly byKey = new Map<string, Set<string>>()

  add(path: string, key: PlanKey, inFlight: boolean): void {
    let m = this.byPath.get(path)
    if (!m) {
      m = new Map()
      this.byPath.set(path, m)
    }
    const ks = planKeyString(key)
    const prev = m.get(ks)
    if (!prev || (prev.inFlight && !inFlight)) {
      m.set(ks, { key, inFlight })
    }
    let paths = this.byKey.get(ks)
    if (!paths) {
      paths = new Set()
      this.byKey.set(ks, paths)
    }
    paths.add(path)
  }

  get(path: string): Array<DependentEntry> {
    return [...(this.byPath.get(path)?.values() ?? [])]
  }

  /**
   * Publication of a key's plan whose dependencies index under `paths`: those
   * rows become published, and the key's published rows of a previous plan
   * that no longer depends on them are removed (rows of other attempts still
   * in flight stay).
   */
  publish(key: PlanKey, paths: ReadonlySet<string>): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      const e = this.byPath.get(path)?.get(ks)
      if (!e) {
        continue
      }
      if (paths.has(path)) {
        e.inFlight = false
      } else if (!e.inFlight) {
        this.remove(path, ks)
      }
    }
  }

  /** Drops a key's in-flight entries (discarded attempt). */
  dropInFlight(key: PlanKey): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      if (this.byPath.get(path)?.get(ks)?.inFlight) {
        this.remove(path, ks)
      }
    }
  }

  /** Drops every entry of a key (eviction). */
  drop(key: PlanKey): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      this.remove(path, ks)
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
    if (indexKey !== null) {
      this.indexKeys.add(indexKey)
      this.index.add(indexKey, this.key, true)
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

  discard(): void {
    this.index.dropInFlight(this.key)
  }

  /** Paths to watch (host `addDependency`). */
  paths(): Array<string> {
    const out = new Set<string>()
    for (const fp of this.entries) {
      const p = fingerprintPath(fp)
      if (p !== null) {
        out.add(p)
      }
    }
    return [...out]
  }
}

export interface CacheEntry {
  key: PlanKey
  revision: string
  generation: number
  plan: EmitPlan
  /** The `fileSetVersion` the plan's resolutions were last validated at. */
  resolvedAt: number
}

export interface InFlight {
  key: PlanKey
  revision: string
  generation: number
  promise: Promise<unknown>
  ledger: DependencyLedger
}

/**
 * One plan per (env, canonical id, config) at its latest content hash. A
 * key's generation and latest revision are kept while it has a plan or an
 * attempt in flight (`begin`/`end`); then they are retired: no attempt holds
 * a generation number any more, and the next request starts over.
 */
export class PlanCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly generations = new Map<string, number>()
  private readonly latest = new Map<string, string>()
  /** Attempts in flight per key (an overlapping attempt may have replaced the key's `inFlight` record). */
  private readonly active = new Map<string, number>()
  readonly inFlight = new Map<string, InFlight>()
  readonly dependents = new DependentsIndex()
  /** `TSR_COMPILER_NO_CACHE=plans`: nothing is published (measurement knob). */
  private readonly disabled = cacheDisabled('plans')
  /** Use counts for `compilerStats()`: validated plan hits. */
  readonly counters = { planHits: 0 }

  constructor(readonly env: string) {}

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

  /** An attempt for `key` starts (its generation must stay meaningful until `end`). */
  begin(key: PlanKey): void {
    const ks = planKeyString(key)
    this.active.set(ks, (this.active.get(ks) ?? 0) + 1)
  }

  /** An attempt for `key` ended (published or not). */
  end(key: PlanKey): void {
    const ks = planKeyString(key)
    const n = (this.active.get(ks) ?? 1) - 1
    if (n > 0) {
      this.active.set(ks, n)
    } else {
      this.active.delete(ks)
    }
    this.retire(ks)
  }

  /** Forgets a key's generation and latest revision when nothing holds them; true when retired. */
  private retire(ks: string): boolean {
    if (this.entries.has(ks) || this.active.has(ks)) {
      return false
    }
    this.generations.delete(ks)
    this.latest.delete(ks)
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
    return true
  }

  delete(key: PlanKey): boolean {
    const ks = planKeyString(key)
    const had = this.entries.delete(ks)
    this.dependents.drop(key)
    this.retire(ks)
    return had
  }

  /** Keys whose canonical id lives at `path`. */
  keysAt(path: string): Array<PlanKey> {
    const out: Array<PlanKey> = []
    for (const e of this.entries.values()) {
      if (identify(e.key.canonicalId).path === path) {
        out.push(e.key)
      }
    }
    for (const f of this.inFlight.values()) {
      if (
        identify(f.key.canonicalId).path === path &&
        !out.some((k) => planKeyString(k) === planKeyString(f.key))
      ) {
        out.push(f.key)
      }
    }
    return out
  }

  get size(): number {
    return this.entries.size
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
    return {
      plans: this.entries.size,
      dependencies,
      generations: this.generations.size,
      latest: this.latest.size,
      inFlight: this.inFlight.size,
      active: this.active.size,
      ...this.counters,
      dependentPaths: d.paths,
      dependentKeys: d.keys,
      dependentEmptyPaths: d.emptyPaths,
      dependentEntries: d.entries,
      ...(withBytes && { planBytes }),
    }
  }
}
