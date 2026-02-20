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
 */
export function normalizeFilePath(id: string): string {
  return normalizePath(stripViteQuery(id))
}
