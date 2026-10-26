import { isAbsolute, relative, resolve as resolvePath } from 'node:path'
import { normalizePath } from '../utils'

export type Pattern = string | RegExp

export function dedupePatterns(patterns: Array<Pattern>): Array<Pattern> {
  const out: Array<Pattern> = []
  const seen = new Set<string>()
  for (const p of patterns) {
    const key = typeof p === 'string' ? `s:${p}` : `r:${p.toString()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/**
 * Strip the `?query` and `#hash` of a module ID. A project path may carry a
 * `#` (`C#`, `project #2`): a `#` is a fragment only after the query.
 */
function stripQueryAndHash(id: string): string {
  const q = id.indexOf('?')
  if (q === -1) {
    return id
  }
  return id.slice(0, q)
}

/**
 * Strip Vite query/hash parameters and normalize the path in one step.
 *
 * Results are memoized because the same module IDs are processed many
 * times across resolveId, transform, and trace-building hooks (a miss costs
 * ~0.3 µs, a hit ~0.03 µs). Two generations bound the memo: when the current
 * one is full, it becomes the previous one and a fresh one starts, so at
 * most `2 × NORMALIZE_MEMO_LIMIT` ids are held and the ids in use stay hot;
 * ids of deleted files age out.
 */
const NORMALIZE_MEMO_LIMIT = 4096
let normalizeFilePathCache = new Map<string, string>()
let previousNormalizeFilePathCache = new Map<string, string>()
export function normalizeFilePath(id: string): string {
  let result = normalizeFilePathCache.get(id)
  if (result === undefined) {
    result =
      previousNormalizeFilePathCache.get(id) ??
      normalizePath(stripQueryAndHash(id))
    if (normalizeFilePathCache.size >= NORMALIZE_MEMO_LIMIT) {
      previousNormalizeFilePathCache = normalizeFilePathCache
      normalizeFilePathCache = new Map()
    }
    normalizeFilePathCache.set(id, result)
  }
  return result
}

/** Get a value from a Map, creating it with `factory` if absent. */
export function getOrCreate<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  factory: () => TValue,
): TValue {
  let value = map.get(key)
  if (value === undefined) {
    value = factory()
    map.set(key, value)
  }
  return value
}

/** Make a path relative to `root`, keeping non-rooted paths as-is. */
export function relativizePath(p: string, root: string): string {
  if (!p.startsWith(root)) return p
  const ch = p.charCodeAt(root.length)
  // Must be followed by a separator or end-of-string to be a true child
  if (ch !== 47 && !Number.isNaN(ch)) return p
  return ch === 47 ? p.slice(root.length + 1) : p.slice(root.length)
}

/**
 * Check whether `filePath` is contained inside `directory` using a
 * boundary-safe comparison.  A naïve `filePath.startsWith(directory)`
 * would incorrectly treat `/app/src2/foo.ts` as inside `/app/src`.
 */
export function isInsideDirectory(
  filePath: string,
  directory: string,
): boolean {
  const rel = relative(resolvePath(directory), resolvePath(filePath))
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}
