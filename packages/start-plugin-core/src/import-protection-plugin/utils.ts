import { normalizePath } from 'vite'

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

export function stripViteQuery(id: string): string {
  const q = id.indexOf('?')
  const h = id.indexOf('#')
  if (q === -1 && h === -1) return id
  if (q === -1) return id.slice(0, h)
  if (h === -1) return id.slice(0, q)
  return id.slice(0, Math.min(q, h))
}

/**
 * Strip Vite query parameters and normalize the path in one step.
 * Replaces the repeated `normalizePath(stripViteQuery(id))` pattern.
 *
 * Results are memoized because the same module IDs are processed many
 * times across resolveId, transform, and trace-building hooks.
 */
const normalizeFilePathCache = new Map<string, string>()
export function normalizeFilePath(id: string): string {
  let result = normalizeFilePathCache.get(id)
  if (result === undefined) {
    result = normalizePath(stripViteQuery(id))
    normalizeFilePathCache.set(id, result)
  }
  return result
}

/** Clear the memoization cache (call from buildStart to bound growth). */
export function clearNormalizeFilePathCache(): void {
  normalizeFilePathCache.clear()
}

/**
 * Lightweight regex to extract all import/re-export source strings from
 * post-transform code.  Matches:
 *   - `from "..."` / `from '...'`   (static import/export)
 *   - `import("...")` / `import('...')` (dynamic import)
 */
const importSourceRe =
  /\bfrom\s+(?:"([^"]+)"|'([^']+)')|import\s*\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

export function extractImportSources(code: string): Array<string> {
  const sources: Array<string> = []
  let m: RegExpExecArray | null
  importSourceRe.lastIndex = 0
  while ((m = importSourceRe.exec(code)) !== null) {
    const src = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (src) sources.push(src)
  }
  return sources
}
