/**
 * Measurement aids for the compiler's caches (D12), inert unless their
 * environment variables are set. They run in the bundler's Node process
 * only and never reach a bundle.
 *
 * - `TSR_COMPILER_STATS=1`: every cache owner registers a reader of its entry
 *   counts in a process-global registry (`compilerStats()`), held through a
 *   `WeakRef` so introspection never retains a cache.
 * - `TSR_COMPILER_NO_CACHE=<list>`: disables caches for an on/off
 *   comparison (`plans`, `facts`, `targets`, `resolutions`; `all`). Every
 *   cache stays correct when disabled (each request recomputes).
 */
import v8 from 'node:v8'

export type CacheKnob = 'plans' | 'facts' | 'targets' | 'resolutions'

/** Whether `TSR_COMPILER_NO_CACHE` disables a cache (read at cache creation). */
export function cacheDisabled(knob: CacheKnob): boolean {
  const list = process.env.TSR_COMPILER_NO_CACHE
  if (!list) {
    return false
  }
  const names = list.split(',').map((s) => s.trim())
  return names.includes(knob) || names.includes('all')
}

/** Entry counts (and approximate bytes, `*Bytes`) of one cache owner. */
export type CacheCounts = Record<string, number>

interface StatsSource {
  label: string
  owner: WeakRef<object>
  read: (owner: any) => CacheCounts
}

const REGISTRY = Symbol.for('tanstack.compiler.stats')

/**
 * Registers a reader of `owner`'s cache sizes when `TSR_COMPILER_STATS=1`.
 * `read` receives the owner and must not capture it.
 */
export function registerCompilerStats<T extends object>(
  label: string,
  owner: T,
  read: (owner: T) => CacheCounts,
): void {
  if (process.env.TSR_COMPILER_STATS !== '1') {
    return
  }
  const g = globalThis as { [REGISTRY]?: Array<StatsSource> }
  ;(g[REGISTRY] ??= []).push({ label, owner: new WeakRef(owner), read })
}

/** Current counts of every live registered owner, summed per label. */
export function compilerStats(): Record<
  string,
  CacheCounts & { instances: number }
> {
  const g = globalThis as { [REGISTRY]?: Array<StatsSource> }
  const out: Record<string, CacheCounts & { instances: number }> = {}
  const live: Array<StatsSource> = []
  for (const s of g[REGISTRY] ?? []) {
    const owner = s.owner.deref()
    if (!owner) {
      continue
    }
    live.push(s)
    const sum = (out[s.label] ??= { instances: 0 })
    sum.instances++
    for (const [k, v] of Object.entries(s.read(owner))) {
      sum[k] = (sum[k] ?? 0) + v
    }
  }
  if (g[REGISTRY]) {
    g[REGISTRY] = live
  }
  return out
}

/** Approximate retained bytes of plain data (its structured-clone size). */
export function approxBytes(value: unknown): number {
  try {
    return v8.serialize(value).length
  } catch {
    return -1
  }
}

/**
 * Sizes of the `Map`/`Set`/array fields of a host object, descending into
 * nested objects (and the values of maps) up to `depth` levels; values of
 * one map are summed under `field[*].`. For hosts whose state is spread
 * over plain fields (import protection, server-fn registries, sessions).
 */
export function collectionSizes(owner: object, depth = 2): CacheCounts {
  const out: CacheCounts = {}
  const seen = new WeakSet<object>()
  const isWalkable = (v: unknown): v is object =>
    typeof v === 'object' &&
    v !== null &&
    !(v instanceof Promise) &&
    !ArrayBuffer.isView(v) &&
    !(v instanceof WeakMap) &&
    !(v instanceof WeakSet) &&
    !(v instanceof WeakRef)
  const visit = (obj: object, prefix: string, left: number): void => {
    if (seen.has(obj)) {
      return
    }
    seen.add(obj)
    for (const [key, v] of Object.entries(obj)) {
      const name = prefix + key
      if (v instanceof Map || v instanceof Set) {
        out[name] = (out[name] ?? 0) + v.size
        if (left > 0) {
          for (const item of v.values()) {
            if (isWalkable(item) && !Array.isArray(item)) {
              visit(item, `${name}[*].`, left - 1)
            }
          }
        }
      } else if (Array.isArray(v)) {
        out[name] = (out[name] ?? 0) + v.length
      } else if (isWalkable(v) && left > 0) {
        visit(v, `${name}.`, left - 1)
      }
    }
  }
  visit(owner, '', depth)
  return out
}
