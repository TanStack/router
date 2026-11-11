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
 * `fileSetVersion` (no file event applied since), raw facts at an
 * unchanged `RawFactsCache.version`.
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
  /** The key's published (or restored) plan depends on the path. */
  published: boolean
  /** A compile of the key running now asked for it (`PlanCache.end` drops the asks). */
  asked: boolean
}

/**
 * Reverse index: dependency path (or a bucket of resolutions without one) →
 * plan keys, with each key's own buckets (`planKey → paths`) so publishing
 * and evicting a plan touch its rows only. A row holds two facts: the key's
 * published plan depends on the path, and a compile of the key running now
 * asked for it. Compiles of one key overlap (two quick saves) and share
 * their asks, which live until the key's last compile ends (`PlanCache.end`).
 * A row with neither fact is removed, and so is an empty bucket: the index
 * holds rows of live plans and compiles only.
 */
class DependentsIndex {
  private readonly byPath = new Map<string, Map<string, DependentEntry>>()
  private readonly byKey = new Map<string, Set<string>>()
  /**
   * The dependency paths by the name a created file shares with them
   * (`shadowedBy`): by directory and first name segment (`/app/x` for
   * `/app/x.web.ts`), and the directory tree (each directory to the paths
   * and directories directly in it).
   */
  private readonly byStem = new Map<string, string | Set<string>>()
  private readonly byDir = new Map<string, Set<string>>()

  /** The row of (path, key), created with neither fact. */
  private row(path: string, key: PlanKey): DependentEntry {
    let m = this.byPath.get(path)
    if (!m) {
      m = new Map()
      this.byPath.set(path, m)
      this.place(path)
    }
    const ks = planKeyString(key)
    let e = m.get(ks)
    if (!e) {
      e = { key, published: false, asked: false }
      m.set(ks, e)
      let paths = this.byKey.get(ks)
      if (!paths) {
        paths = new Set()
        this.byKey.set(ks, paths)
      }
      paths.add(path)
    }
    return e
  }

  /** A compile of `key` asked for a fact under `path`. */
  ask(path: string, key: PlanKey): void {
    this.row(path, key).asked = true
  }

  get(path: string): Array<DependentEntry> {
    return [...(this.byPath.get(path)?.values() ?? [])]
  }

  /** Whether a plan or a compile depends on `path`. */
  has(path: string): boolean {
    return this.byPath.has(path)
  }

  /**
   * The dependency paths whose resolution a file created at `added` may
   * take (`shadowTest` in the invalidation): a file of its directory and
   * first name segment (`x.ts` beside `x.web.ts`), any file under a
   * directory of its stem (`x.ts` beside `x/index.ts`), or any file under a
   * `package.json`'s directory. Looked up, not scanned: a checkout creates
   * thousands of files.
   */
  shadowedBy(added: string): Array<string> {
    const slash = added.lastIndexOf('/')
    const dir = added.slice(0, slash)
    const base = added.slice(slash + 1)
    if (base === 'package.json') {
      return this.under(dir)
    }
    const dot = base.indexOf('.')
    const stem = `${dir}/${dot < 0 ? base : base.slice(0, dot)}`
    const named = this.byStem.get(stem)
    const under = this.under(stem)
    return named === undefined
      ? under
      : typeof named === 'string'
        ? [named, ...under]
        : [...named, ...under]
  }

  /** Every dependency path under directory `dir`, at any depth. */
  private under(dir: string): Array<string> {
    const out: Array<string> = []
    const dirs = [dir]
    for (let d = dirs.pop(); d !== undefined; d = dirs.pop()) {
      for (const child of this.byDir.get(d) ?? []) {
        if (this.byPath.has(child)) {
          out.push(child)
        }
        if (this.byDir.has(child)) {
          dirs.push(child)
        }
      }
    }
    return out
  }

  /** Indexes a new dependency path by stem and directory (`shadowedBy`). */
  private place(path: string): void {
    const slash = path.lastIndexOf('/')
    if (slash < 0) {
      // (a bucket: the unresolved and external resolutions)
      return
    }
    const base = path.slice(slash + 1)
    const dot = base.indexOf('.')
    if (dot >= 0) {
      // (one path per stem is the rule: a string until a second one comes)
      const stem = path.slice(0, slash + 1 + dot)
      const named = this.byStem.get(stem)
      if (named === undefined) {
        this.byStem.set(stem, path)
      } else if (typeof named === 'string') {
        this.byStem.set(stem, new Set([named, path]))
      } else {
        named.add(path)
      }
    }
    let child = path
    for (let d = parentOf(child); d !== null; d = parentOf(child)) {
      const children = this.byDir.get(d)
      if (children) {
        children.add(child)
        return
      }
      this.byDir.set(d, new Set([child]))
      child = d
    }
  }

  /** Unindexes a dependency path without rows (`place` reversed). */
  private displace(path: string): void {
    const slash = path.lastIndexOf('/')
    if (slash < 0) {
      return
    }
    const dot = path.indexOf('.', slash + 1)
    if (dot >= 0) {
      const stem = path.slice(0, dot)
      const named = this.byStem.get(stem)
      if (named === path) {
        this.byStem.delete(stem)
      } else if (typeof named === 'object') {
        named.delete(path)
        if (named.size === 1) {
          this.byStem.set(stem, [...named][0]!)
        }
      }
    }
    // a name stays in its directory while it is a path or a directory
    let child = path
    for (let d = parentOf(child); d !== null; d = parentOf(child)) {
      if (this.byPath.has(child) || this.byDir.has(child)) {
        return
      }
      const children = this.byDir.get(d)
      children?.delete(child)
      if (children === undefined || children.size > 0) {
        return
      }
      this.byDir.delete(d)
      child = d
    }
  }

  /**
   * Publication of a key's plan whose dependencies index under `paths`: the
   * key's published rows become exactly those (asks stay).
   */
  publish(key: PlanKey, paths: ReadonlySet<string>): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      if (!paths.has(path)) {
        this.unset(path, ks, 'published')
      }
    }
    for (const path of paths) {
      this.row(path, key).published = true
    }
  }

  /** Drops a key's published rows (eviction) or its asks (its last compile ended). */
  drop(key: PlanKey, fact: 'published' | 'asked'): void {
    const ks = planKeyString(key)
    for (const path of [...(this.byKey.get(ks) ?? [])]) {
      this.unset(path, ks, fact)
    }
  }

  /** Clears one fact of a row; a row with neither goes. */
  private unset(path: string, ks: string, fact: 'published' | 'asked'): void {
    const e = this.byPath.get(path)?.get(ks)
    if (e) {
      e[fact] = false
      if (!e.published && !e.asked) {
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
        this.displace(path)
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
    stems: number
    dirs: number
  } {
    let entries = 0
    for (const m of this.byPath.values()) {
      entries += m.size
    }
    return {
      paths: this.byPath.size,
      entries,
      keys: this.byKey.size,
      stems: this.byStem.size,
      dirs: this.byDir.size,
    }
  }
}

/** The directory of a path (null: none, the root's parent). */
function parentOf(path: string): string | null {
  const slash = path.lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : null
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
      this.index.ask(indexKey, this.key)
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
  /** (unpublished when every attempt was overtaken: the last plan answers) */
  | { kind: 'plan'; entry: CacheEntry }

/** The compile of a key at one revision, from its first attempt until it settled. */
export interface InFlight {
  revision: string
  settled: Promise<Settled>
}

/**
 * What the cache keeps of one key while it is live: from a request's first
 * note of a revision, or a restored plan, until the key has no plan and no
 * compile running (then it is retired: no attempt holds its generation
 * number any more, and the next request starts over).
 */
interface PlanRecord {
  key: PlanKey
  /** The path of the key's canonical id (`PlanCache.keysAt`). */
  path: string
  /** Moved by a newer revision or an invalidation: attempts begun before it are stale. */
  generation: number
  /** The revision the key's last request arrived with. */
  latest: string | undefined
  /** Compiles running (two quick saves overlap). */
  active: number
  /** The published plan. */
  entry: CacheEntry | null
  /** A plan known by its dependencies only (`PlanCache.restore`). */
  restored: PersistedPlan | null
  /** The compile in flight: requests at its revision wait for it instead of compiling again. */
  flight: InFlight | null
}

/**
 * One plan per (env, canonical id, config) at its latest content hash, with
 * one record per live key (`PlanRecord`), indexed by path so an invalidation
 * of a path never scans the cache.
 */
export class PlanCache {
  private readonly records = new Map<string, PlanRecord>()
  /** Path → its live keys' records. */
  private readonly byPath = new Map<string, Map<string, PlanRecord>>()
  readonly dependents = new DependentsIndex()
  /** `TSR_COMPILER_NO_CACHE=plans`: no plan is a hit (measurement knob); dependencies are still kept. */
  private readonly disabled = cacheDisabled('plans')
  /**
   * Use counts for `compilerStats()`: validated plan hits; `staleHits`:
   * plan hits that failed validation on a fact (an invalidation missed it:
   * a defect); `lazyHits`: on a resolution or a route-registry digest, which
   * the next request asks again by design (a tsconfig edit).
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

  constructor(readonly env: string) {}

  /** The resolution memo at `fileSetVersion` (empty when the file set changed since it was filled). */
  resolutionsAt(fileSetVersion: number): Map<string, ResolutionMemo> {
    if (this.resolvedAt !== fileSetVersion) {
      this.resolutions.clear()
      this.resolvedAt = fileSetVersion
    }
    return this.resolutions
  }

  /** The key's record, created live. */
  private recordOf(key: PlanKey): PlanRecord {
    const ks = planKeyString(key)
    let r = this.records.get(ks)
    if (!r) {
      const path = pathOfId(key.canonicalId)
      r = {
        key,
        path,
        generation: 0,
        latest: undefined,
        active: 0,
        entry: null,
        restored: null,
        flight: null,
      }
      this.records.set(ks, r)
      let keys = this.byPath.get(path)
      if (!keys) {
        keys = new Map()
        this.byPath.set(path, keys)
      }
      keys.set(ks, r)
    }
    return r
  }

  /** Retires a record that holds nothing (`PlanRecord`); true when retired. */
  private retire(ks: string, r: PlanRecord): boolean {
    if (r.entry || r.restored || r.active > 0) {
      return false
    }
    this.records.delete(ks)
    const keys = this.byPath.get(r.path)
    if (keys) {
      keys.delete(ks)
      if (keys.size === 0) {
        this.byPath.delete(r.path)
      }
    }
    return true
  }

  generation(key: PlanKey): number {
    return this.records.get(planKeyString(key))?.generation ?? 0
  }

  /** Makes attempts in flight for `key` stale (nothing to do when there are none). */
  bump(key: PlanKey): void {
    const ks = planKeyString(key)
    const r = this.records.get(ks)
    if (r && !this.retire(ks, r)) {
      r.generation++
    }
  }

  /** Notes the revision a request arrives with; a new revision bumps the generation. */
  noteRevision(key: PlanKey, revision: string): void {
    const r = this.recordOf(key)
    if (r.latest !== revision) {
      r.latest = revision
      r.generation++
    }
  }

  latestRevision(key: PlanKey): string | undefined {
    return this.records.get(planKeyString(key))?.latest
  }

  /** A compile of `key` starts (its generation must stay meaningful until `end`). */
  begin(key: PlanKey): void {
    this.recordOf(key).active++
  }

  /** A compile of `key` ended (published or not); the last one takes the key's asks along. */
  end(key: PlanKey): void {
    const ks = planKeyString(key)
    const r = this.records.get(ks)
    if (!r) {
      return
    }
    r.active = Math.max(0, r.active - 1)
    if (r.active === 0) {
      this.dependents.drop(key, 'asked')
    }
    this.retire(ks, r)
  }

  /** The compile in flight of `key` (null: none). */
  flight(key: PlanKey): InFlight | null {
    return this.records.get(planKeyString(key))?.flight ?? null
  }

  /** A compile of `key` is in flight (its `settle` began: the key is live). */
  fly(key: PlanKey, flight: InFlight): void {
    this.recordOf(key).flight = flight
  }

  /** The compile in flight `flight` of `key` settled (a newer one may have replaced it). */
  land(key: PlanKey, flight: InFlight): void {
    const r = this.records.get(planKeyString(key))
    if (r?.flight === flight) {
      r.flight = null
    }
  }

  /** A hit by key and revision; the caller validates the dependency snapshot. */
  lookup(key: PlanKey, revision: string): CacheEntry | null {
    const e = this.records.get(planKeyString(key))?.entry
    return e && e.revision === revision ? e : null
  }

  get(key: PlanKey): CacheEntry | null {
    return this.records.get(planKeyString(key))?.entry ?? null
  }

  /**
   * Publishes; refuses stale completions (generation moved or a newer
   * revision was seen). With plan caching off, the plan is kept by its
   * dependencies only (`restored`: never a hit, its dependents still reported).
   */
  set(entry: CacheEntry): boolean {
    const r = this.records.get(planKeyString(entry.key))
    if (
      !r ||
      r.generation !== entry.generation ||
      r.latest !== entry.revision
    ) {
      return false
    }
    if (this.disabled) {
      r.restored = { key: entry.key, dependencies: entry.plan.dependencies }
    } else {
      r.entry = entry
      r.restored = null
    }
    return true
  }

  /** Evicts a key's published or restored plan; true when it had one. */
  delete(key: PlanKey): boolean {
    const ks = planKeyString(key)
    const r = this.records.get(ks)
    if (!r) {
      return false
    }
    const had = r.entry !== null || r.restored !== null
    r.entry = null
    r.restored = null
    this.dependents.drop(key, 'published')
    this.retire(ks, r)
    return had
  }

  /**
   * Adds a plan known by its dependencies only (`restored`); a key with a
   * published plan or a compile running keeps its own.
   */
  restore(plan: PersistedPlan): void {
    const live = this.records.get(planKeyString(plan.key))
    if (live && (live.entry || live.active > 0)) {
      return
    }
    this.recordOf(plan.key).restored = plan
    this.dependents.publish(plan.key, indexKeysOf(plan.dependencies))
  }

  /** The dependencies of a key's published or restored plan (null: none). */
  dependenciesOf(key: PlanKey): ReadonlyArray<DependencyFingerprint> | null {
    const r = this.records.get(planKeyString(key))
    return r?.entry?.plan.dependencies ?? r?.restored?.dependencies ?? null
  }

  /** The keys of the published and restored plans. */
  keys(): Array<PlanKey> {
    const out: Array<PlanKey> = []
    for (const r of this.records.values()) {
      if (r.entry || r.restored) {
        out.push(r.key)
      }
    }
    return out
  }

  /** Live keys (published, restored, or with a request or compile) whose canonical id lives at `path`. */
  keysAt(path: string): Array<PlanKey> {
    return [...(this.byPath.get(path)?.values() ?? [])].map((r) => r.key)
  }

  /** Sizes for `compilerStats()` (bytes: plans, approximate). */
  stats(withBytes: boolean): Record<string, number> {
    let plans = 0
    let restored = 0
    let active = 0
    let inFlight = 0
    let dependencies = 0
    let planBytes = 0
    for (const r of this.records.values()) {
      if (r.entry) {
        plans++
        dependencies += r.entry.plan.dependencies.length
        if (withBytes) {
          planBytes += approxBytes(r.entry.plan)
        }
      }
      restored += r.restored ? 1 : 0
      active += r.active > 0 ? 1 : 0
      inFlight += r.flight ? 1 : 0
    }
    const d = this.dependents.stats()
    let resolutions = 0
    for (const m of this.resolutions.values()) {
      resolutions += m.size
    }
    return {
      plans,
      restored,
      resolutions,
      dependencies,
      records: this.records.size,
      inFlight,
      active,
      keyPaths: this.byPath.size,
      ...this.counters,
      dependentPaths: d.paths,
      dependentKeys: d.keys,
      dependentEntries: d.entries,
      dependentStems: d.stems,
      dependentDirs: d.dirs,
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
  /** The environments whose bundler holds modules (`track`). */
  private readonly tracked = new Set<string>()

  /**
   * The environment's bundler holds modules from now on (a dev server's
   * environment, a compiler past its first compilation's make): a registry
   * change stales its file there whether or not a plan of it exists (a
   * module served before it was a route has none).
   */
  track(env: string): void {
    this.tracked.add(env)
  }

  /** The tracked environments (`track`). */
  trackedEnvs(): ReadonlySet<string> {
    return this.tracked
  }

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

  /** The paths of the environment's set (held ones included), left in it. */
  paths(env: string): Array<string> {
    return [...(this.byEnv.get(env)?.keys() ?? [])]
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
    this.tracked.delete(env)
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
