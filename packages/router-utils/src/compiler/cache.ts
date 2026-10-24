/**
 * Caches (DESIGN §4.5; D12, R3, R19, R34): `PlanCache` with validated hits,
 * the `DependencyLedger` with in-flight registration and snapshot
 * validation, and the dependents index. Only plain data is retained.
 */
import { identify, planKeyString } from './identity'
import type { PlanKey } from './identity'
import type { EmitPlan } from './plan'
import type { Emitted } from './emit'

export type DependencyFingerprint =
  | { kind: 'summary'; canonicalId: string; digest: string | null }
  | { kind: 'target-facts'; canonicalId: string; digest: string }
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
      return identify(fp.canonicalId).path
    case 'route-registry':
      return fp.path
    case 'resolution':
      return fp.resolved === null ? null : identify(fp.resolved).path
    case 'config':
      return null
  }
}

/** The current values fingerprints are validated against. */
export interface FingerprintSource {
  summaryDigest: (canonicalId: string) => Promise<string | null>
  targetDigest: (canonicalId: string) => Promise<string | null>
  routeRegistryDigest: (path: string) => string | null
  resolution: (
    env: string,
    importer: string,
    specifier: string,
  ) => Promise<string | null>
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
    case 'route-registry':
      return src.routeRegistryDigest(fp.path) === fp.digest
    case 'resolution':
      return (
        (await src.resolution(fp.env, fp.importer, fp.specifier)) ===
        fp.resolved
      )
    case 'config':
      return src.configKey === fp.configKey
  }
}

interface DependentEntry {
  key: PlanKey
  inFlight: boolean
}

/** Reverse index: dependency path → plan keys (published or in flight). */
export class DependentsIndex {
  private readonly byPath = new Map<string, Map<string, DependentEntry>>()

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
  }

  get(path: string): Array<DependentEntry> {
    return [...(this.byPath.get(path)?.values() ?? [])]
  }

  /** Promotes a key's in-flight entries to published (on publication). */
  promote(key: PlanKey): void {
    const ks = planKeyString(key)
    for (const m of this.byPath.values()) {
      const e = m.get(ks)
      if (e) {
        e.inFlight = false
      }
    }
  }

  /** Drops a key's in-flight entries (discarded attempt). */
  dropInFlight(key: PlanKey): void {
    const ks = planKeyString(key)
    for (const m of this.byPath.values()) {
      const e = m.get(ks)
      if (e && e.inFlight) {
        m.delete(ks)
      }
    }
  }

  /** Drops every entry of a key (eviction). */
  drop(key: PlanKey): void {
    const ks = planKeyString(key)
    for (const m of this.byPath.values()) {
      m.delete(ks)
    }
  }
}

/**
 * Records the facts a compile acquires, registers them as in-flight
 * dependencies and validates the complete snapshot before publication.
 */
export class DependencyLedger {
  readonly entries: Array<DependencyFingerprint> = []
  private readonly ids = new Set<string>()

  constructor(
    readonly key: PlanKey,
    readonly generation: number,
    private readonly index: DependentsIndex,
  ) {}

  record(fp: DependencyFingerprint): void {
    const id = fingerprintId(fp)
    if (this.ids.has(id)) {
      return
    }
    this.ids.add(id)
    this.entries.push(fp)
    const path = fingerprintPath(fp)
    if (path !== null) {
      this.index.add(path, this.key, true)
    }
  }

  async validateSnapshot(src: FingerprintSource): Promise<boolean> {
    for (const fp of this.entries) {
      if (!(await fingerprintCurrent(fp, src))) {
        return false
      }
    }
    return true
  }

  publish(): void {
    this.index.promote(this.key)
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
  emitted: Map<string, Emitted>
}

export interface InFlight {
  key: PlanKey
  revision: string
  generation: number
  promise: Promise<unknown>
  ledger: DependencyLedger
}

/** One plan per (env, canonical id, config) at its latest content hash. */
export class PlanCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly generations = new Map<string, number>()
  private readonly latest = new Map<string, string>()
  readonly inFlight = new Map<string, InFlight>()
  readonly dependents = new DependentsIndex()

  constructor(readonly env: string) {}

  generation(key: PlanKey): number {
    return this.generations.get(planKeyString(key)) ?? 0
  }

  bump(key: PlanKey): void {
    const ks = planKeyString(key)
    this.generations.set(ks, (this.generations.get(ks) ?? 0) + 1)
  }

  /** Notes the revision a request arrives with; a new revision bumps the generation. */
  noteRevision(key: PlanKey, revision: string): void {
    const ks = planKeyString(key)
    if (this.latest.get(ks) !== revision) {
      this.latest.set(ks, revision)
      this.bump(key)
    }
  }

  latestRevision(key: PlanKey): string | undefined {
    return this.latest.get(planKeyString(key))
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
    if (this.latest.get(ks) !== entry.revision) {
      return false
    }
    this.entries.set(ks, entry)
    return true
  }

  delete(key: PlanKey): boolean {
    const ks = planKeyString(key)
    const had = this.entries.delete(ks)
    this.dependents.drop(key)
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
}
