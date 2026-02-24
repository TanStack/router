import { SourceMapConsumer } from 'source-map'
import * as path from 'pathe'

import { escapeRegExp, getOrCreate, normalizeFilePath } from './utils'
import type { Loc } from './trace'
import type { RawSourceMap } from 'source-map'

// Source-map type compatible with both Rollup's SourceMap and source-map's
// RawSourceMap.  Structural type avoids version: number vs string mismatch.

/**
 * Minimal source-map shape used throughout the import-protection plugin.
 */
export interface SourceMapLike {
  file?: string
  sourceRoot?: string
  version: number | string
  sources: Array<string>
  names: Array<string>
  sourcesContent?: Array<string | null>
  mappings: string
}

// Transform result provider (replaces ctx.load() which doesn't work in dev)
export interface TransformResult {
  code: string
  map: SourceMapLike | undefined
  originalCode: string | undefined
  /** Precomputed line index for `code` (index → line/col). */
  lineIndex?: LineIndex
}

/**
 * Provides the transformed code and composed sourcemap for a module.
 *
 * Populated from a late-running transform hook. By the time `resolveId`
 * fires for an import, the importer has already been fully transformed.
 */
export interface TransformResultProvider {
  getTransformResult: (id: string) => TransformResult | undefined
}

// Index → line/column conversion

export type LineIndex = {
  offsets: Array<number>
}

export function buildLineIndex(code: string): LineIndex {
  const offsets: Array<number> = [0]
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) {
      offsets.push(i + 1)
    }
  }
  return { offsets }
}

function upperBound(values: Array<number>, x: number): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid]! <= x) lo = mid + 1
    else hi = mid
  }
  return lo
}

function indexToLineColWithIndex(
  lineIndex: LineIndex,
  idx: number,
): { line: number; column0: number } {
  const offsets = lineIndex.offsets
  const ub = upperBound(offsets, idx)
  const lineIdx = Math.max(0, ub - 1)
  const line = lineIdx + 1

  const lineStart = offsets[lineIdx] ?? 0
  return { line, column0: Math.max(0, idx - lineStart) }
}

/**
 * Pick the most-likely original source text for `importerFile` from
 * a sourcemap that may contain multiple sources.
 */
export function pickOriginalCodeFromSourcesContent(
  map: SourceMapLike | undefined,
  importerFile: string,
  root: string,
): string | undefined {
  if (!map?.sourcesContent || map.sources.length === 0) {
    return undefined
  }

  const file = normalizeFilePath(importerFile)
  const sourceRoot = map.sourceRoot
  const fileSeg = file.split('/').filter(Boolean)

  const resolveBase = sourceRoot ? path.resolve(root, sourceRoot) : root

  let bestIdx = -1
  let bestScore = -1

  for (let i = 0; i < map.sources.length; i++) {
    const content = map.sourcesContent[i]
    if (typeof content !== 'string') continue

    const src = map.sources[i] ?? ''

    const normalizedSrc = normalizeFilePath(src)
    if (normalizedSrc === file) {
      return content
    }

    let resolved: string
    if (!src) {
      resolved = ''
    } else if (path.isAbsolute(src)) {
      resolved = normalizeFilePath(src)
    } else {
      resolved = normalizeFilePath(path.resolve(resolveBase, src))
    }
    if (resolved === file) {
      return content
    }

    // Count matching path segments from the end.
    const normalizedSrcSeg = normalizedSrc.split('/').filter(Boolean)
    const resolvedSeg =
      resolved !== normalizedSrc
        ? resolved.split('/').filter(Boolean)
        : normalizedSrcSeg
    const score = Math.max(
      segmentSuffixScore(normalizedSrcSeg, fileSeg),
      segmentSuffixScore(resolvedSeg, fileSeg),
    )

    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  if (bestIdx !== -1 && bestScore >= 1) {
    return map.sourcesContent[bestIdx] ?? undefined
  }

  return map.sourcesContent[0] ?? undefined
}

/** Count matching path segments from the end of `aSeg` against `bSeg`. */
function segmentSuffixScore(aSeg: Array<string>, bSeg: Array<string>): number {
  let score = 0
  for (
    let i = aSeg.length - 1, j = bSeg.length - 1;
    i >= 0 && j >= 0;
    i--, j--
  ) {
    if (aSeg[i] !== bSeg[j]) break
    score++
  }
  return score
}

async function mapGeneratedToOriginal(
  map: SourceMapLike | undefined,
  generated: { line: number; column0: number },
  fallbackFile: string,
): Promise<Loc> {
  const fallback: Loc = {
    file: fallbackFile,
    line: generated.line,
    column: generated.column0 + 1,
  }

  if (!map) {
    return fallback
  }

  const consumer = await getSourceMapConsumer(map)
  if (!consumer) return fallback

  try {
    const orig = consumer.originalPositionFor({
      line: generated.line,
      column: generated.column0,
    })
    if (orig.line != null && orig.column != null) {
      return {
        file: orig.source ? normalizeFilePath(orig.source) : fallbackFile,
        line: orig.line,
        column: orig.column + 1,
      }
    }
  } catch {
    // Malformed sourcemap
  }

  return fallback
}

const consumerCache = new WeakMap<object, Promise<SourceMapConsumer | null>>()

function toRawSourceMap(map: SourceMapLike): RawSourceMap {
  return {
    ...map,
    file: map.file ?? '',
    version: Number(map.version),
    sourcesContent: map.sourcesContent?.map((s) => s ?? '') ?? [],
  }
}

async function getSourceMapConsumer(
  map: SourceMapLike,
): Promise<SourceMapConsumer | null> {
  const cached = consumerCache.get(map)
  if (cached) return cached

  const promise = (async () => {
    try {
      return await new SourceMapConsumer(toRawSourceMap(map))
    } catch {
      return null
    }
  })()

  consumerCache.set(map, promise)
  return promise
}

export type ImportLocEntry = { file?: string; line: number; column: number }

/**
 * Cache for import statement locations with reverse index for O(1)
 * invalidation by file.  Keys: `${importerFile}::${source}`.
 */
export class ImportLocCache {
  private cache = new Map<string, ImportLocEntry | null>()
  private reverseIndex = new Map<string, Set<string>>()

  has(key: string): boolean {
    return this.cache.has(key)
  }

  get(key: string): ImportLocEntry | null | undefined {
    return this.cache.get(key)
  }

  set(key: string, value: ImportLocEntry | null): void {
    this.cache.set(key, value)
    const file = key.slice(0, key.indexOf('::'))
    getOrCreate(this.reverseIndex, file, () => new Set()).add(key)
  }

  clear(): void {
    this.cache.clear()
    this.reverseIndex.clear()
  }

  /** Remove all cache entries where the importer matches `file`. */
  deleteByFile(file: string): void {
    const keys = this.reverseIndex.get(file)
    if (keys) {
      for (const key of keys) {
        this.cache.delete(key)
      }
      this.reverseIndex.delete(file)
    }
  }
}

// Import specifier search (regex-based)

const importPatternCache = new Map<string, Array<RegExp>>()

export function clearImportPatternCache(): void {
  importPatternCache.clear()
}

function findFirstImportSpecifierIndex(code: string, source: string): number {
  let patterns = importPatternCache.get(source)
  if (!patterns) {
    const escaped = escapeRegExp(source)
    patterns = [
      new RegExp(`\\bimport\\s+(['"])${escaped}\\1`),
      new RegExp(`\\bfrom\\s+(['"])${escaped}\\1`),
      new RegExp(`\\bimport\\s*\\(\\s*(['"])${escaped}\\1\\s*\\)`),
    ]
    importPatternCache.set(source, patterns)
  }

  let best = -1
  for (const re of patterns) {
    const m = re.exec(code)
    if (!m) continue
    const idx = m.index + m[0].indexOf(source)
    if (idx === -1) continue
    if (best === -1 || idx < best) best = idx
  }
  return best
}

/**
 * Find the location of an import statement in a transformed module
 * by searching the post-transform code and mapping back via sourcemap.
 * Results are cached in `importLocCache`.
 */
export async function findImportStatementLocationFromTransformed(
  provider: TransformResultProvider,
  importerId: string,
  source: string,
  importLocCache: ImportLocCache,
): Promise<Loc | undefined> {
  const importerFile = normalizeFilePath(importerId)
  const cacheKey = `${importerFile}::${source}`
  if (importLocCache.has(cacheKey)) {
    return importLocCache.get(cacheKey) ?? undefined
  }

  try {
    const res = provider.getTransformResult(importerId)
    if (!res) {
      importLocCache.set(cacheKey, null)
      return undefined
    }

    const { code, map } = res

    const lineIndex = res.lineIndex ?? buildLineIndex(code)

    const idx = findFirstImportSpecifierIndex(code, source)
    if (idx === -1) {
      importLocCache.set(cacheKey, null)
      return undefined
    }

    const generated = indexToLineColWithIndex(lineIndex, idx)
    const loc = await mapGeneratedToOriginal(map, generated, importerFile)
    importLocCache.set(cacheKey, loc)
    return loc
  } catch {
    importLocCache.set(cacheKey, null)
    return undefined
  }
}

/**
 * Find the first post-compile usage location for a denied import specifier.
 * Best-effort: searches transformed code for non-import uses of imported
 * bindings and maps back to original source via sourcemap.
 */
export async function findPostCompileUsageLocation(
  provider: TransformResultProvider,
  importerId: string,
  source: string,
  findPostCompileUsagePos: (
    code: string,
    source: string,
  ) => { line: number; column0: number } | undefined,
): Promise<Loc | undefined> {
  try {
    const importerFile = normalizeFilePath(importerId)
    const res = provider.getTransformResult(importerId)
    if (!res) return undefined
    const { code, map } = res

    if (!res.lineIndex) {
      res.lineIndex = buildLineIndex(code)
    }

    const pos = findPostCompileUsagePos(code, source)
    if (!pos) return undefined

    return await mapGeneratedToOriginal(map, pos, importerFile)
  } catch {
    return undefined
  }
}

/**
 * Annotate each trace hop with the location of the import that created the
 * edge (file:line:col). Skips steps that already have a location.
 */
export async function addTraceImportLocations(
  provider: TransformResultProvider,
  trace: Array<{
    file: string
    specifier?: string
    line?: number
    column?: number
  }>,
  importLocCache: ImportLocCache,
): Promise<void> {
  for (const step of trace) {
    if (!step.specifier) continue
    if (step.line != null && step.column != null) continue
    const loc = await findImportStatementLocationFromTransformed(
      provider,
      step.file,
      step.specifier,
      importLocCache,
    )
    if (!loc) continue
    step.line = loc.line
    step.column = loc.column
  }
}

// Code snippet extraction (vitest-style context around a location)

export interface CodeSnippet {
  /** Source lines with line numbers, e.g. `["  6 | import { getSecret } from './secret.server'", ...]` */
  lines: Array<string>
  /** The highlighted line (1-indexed original line number) */
  highlightLine: number
  /** Clickable file:line reference */
  location: string
}

/**
 * Build a vitest-style code snippet showing lines surrounding a location.
 *
 * Prefers `originalCode` from the sourcemap's sourcesContent; falls back
 * to transformed code when unavailable.
 */
export function buildCodeSnippet(
  provider: TransformResultProvider,
  moduleId: string,
  loc: Loc,
  contextLines: number = 2,
): CodeSnippet | undefined {
  try {
    const importerFile = normalizeFilePath(moduleId)
    const res = provider.getTransformResult(moduleId)
    if (!res) return undefined

    const { code: transformedCode, originalCode } = res

    const sourceCode = originalCode ?? transformedCode
    const targetLine = loc.line // 1-indexed
    const targetCol = loc.column // 1-indexed

    if (targetLine < 1) return undefined

    const wantStart = Math.max(1, targetLine - contextLines)
    const wantEnd = targetLine + contextLines

    // Advance to wantStart
    let lineNum = 1
    let pos = 0
    while (lineNum < wantStart && pos < sourceCode.length) {
      const ch = sourceCode.charCodeAt(pos)
      if (ch === 10) {
        lineNum++
      } else if (ch === 13) {
        lineNum++
        if (
          pos + 1 < sourceCode.length &&
          sourceCode.charCodeAt(pos + 1) === 10
        )
          pos++
      }
      pos++
    }
    if (lineNum < wantStart) return undefined

    const lines: Array<string> = []
    let curLine = wantStart
    while (curLine <= wantEnd && pos <= sourceCode.length) {
      // Find end of current line
      let eol = pos
      while (eol < sourceCode.length) {
        const ch = sourceCode.charCodeAt(eol)
        if (ch === 10 || ch === 13) break
        eol++
      }
      lines.push(sourceCode.slice(pos, eol))
      curLine++
      if (eol < sourceCode.length) {
        if (
          sourceCode.charCodeAt(eol) === 13 &&
          eol + 1 < sourceCode.length &&
          sourceCode.charCodeAt(eol + 1) === 10
        ) {
          pos = eol + 2
        } else {
          pos = eol + 1
        }
      } else {
        pos = eol + 1
      }
    }

    if (targetLine > wantStart + lines.length - 1) return undefined

    const actualEnd = wantStart + lines.length - 1
    const gutterWidth = String(actualEnd).length

    const sourceFile = loc.file ?? importerFile
    const snippetLines: Array<string> = []
    for (let i = 0; i < lines.length; i++) {
      const ln = wantStart + i
      const lineContent = lines[i]!
      const lineNumStr = String(ln).padStart(gutterWidth, ' ')
      const marker = ln === targetLine ? '>' : ' '
      snippetLines.push(`  ${marker} ${lineNumStr} | ${lineContent}`)

      if (ln === targetLine && targetCol > 0) {
        const padding = ' '.repeat(targetCol - 1)
        snippetLines.push(`    ${' '.repeat(gutterWidth)} | ${padding}^`)
      }
    }

    return {
      lines: snippetLines,
      highlightLine: targetLine,
      location: `${sourceFile}:${targetLine}:${targetCol}`,
    }
  } catch {
    return undefined
  }
}
