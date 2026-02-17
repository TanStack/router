import { SourceMapConsumer } from 'source-map'
import * as path from 'pathe'

import { normalizeFilePath } from './utils'
import type { Loc } from './trace'
import type { RawSourceMap } from 'source-map'

// ---------------------------------------------------------------------------
// Source-map type compatible with both Rollup's SourceMap and source-map's
// RawSourceMap.  We define our own structural type so that the value returned
// by `getCombinedSourcemap()` (version: number) flows seamlessly into
// `SourceMapConsumer` (version: string) without requiring a cast.
// ---------------------------------------------------------------------------

/**
 * Minimal source-map shape used throughout the import-protection plugin.
 *
 * Structurally compatible with both Rollup's `SourceMap` (version: number)
 * and the `source-map` package's `RawSourceMap` (version: string).
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

// ---------------------------------------------------------------------------
// Transform result provider (replaces ctx.load() which doesn't work in dev)
// ---------------------------------------------------------------------------

/**
 * A cached transform result for a single module.
 *
 * - `code`         – fully-transformed source (after all plugins).
 * - `map`          – composed sourcemap (chains back to the original file).
 * - `originalCode` – the untransformed source, extracted from the
 *                    sourcemap's `sourcesContent[0]` during the transform
 *                    hook.  Used by {@link buildCodeSnippet} so we never
 *                    have to re-derive it via a flaky `sourceContentFor`
 *                    lookup at display time.
 */
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
 * During `resolveId`, Vite's `this.load()` does NOT return code/map in dev
 * mode (the ModuleInfo proxy throws on `.code` access). Even in build mode,
 * Rollup's `ModuleInfo` has `.code` but not `.map`.
 *
 * Instead, we populate this cache from a late-running transform hook that
 * stores `{ code, map, originalCode }` for every module as it passes through
 * the pipeline.  By the time `resolveId` fires for an import, the importer
 * has already been fully transformed, so the cache always has the data we
 * need.
 *
 * The `id` parameter is the **raw** module ID (may include Vite query
 * parameters like `?tsr-split=component`).  Implementations should look up
 * with the full ID first, then fall back to the query-stripped path so that
 * virtual-module variants are resolved correctly without losing the base-file
 * fallback.
 */
export interface TransformResultProvider {
  getTransformResult: (id: string) => TransformResult | undefined
}

// ---------------------------------------------------------------------------
// Index → line/column conversion
// ---------------------------------------------------------------------------

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
  let line = 1

  const offsets = lineIndex.offsets
  const ub = upperBound(offsets, idx)
  const lineIdx = Math.max(0, ub - 1)
  line = lineIdx + 1

  const lineStart = offsets[lineIdx] ?? 0
  return { line, column0: Math.max(0, idx - lineStart) }
}

// ---------------------------------------------------------------------------
// Pick the best original source from sourcesContent
// ---------------------------------------------------------------------------

function suffixSegmentScore(a: string, b: string): number {
  const aSeg = a.split('/').filter(Boolean)
  const bSeg = b.split('/').filter(Boolean)
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

function normalizeSourceCandidate(
  source: string,
  root: string,
  sourceRoot: string | undefined,
): string {
  // Prefer resolving relative source paths against root/sourceRoot when present.
  if (!source) return ''
  if (path.isAbsolute(source)) return normalizeFilePath(source)
  const base = sourceRoot ? path.resolve(root, sourceRoot) : root
  return normalizeFilePath(path.resolve(base, source))
}

/**
 * Pick the most-likely original source text for `importerFile`.
 *
 * Sourcemaps can contain multiple sources (composed maps), so `sourcesContent[0]`
 * is not guaranteed to represent the importer.
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

  let bestIdx = -1
  let bestScore = -1

  for (let i = 0; i < map.sources.length; i++) {
    const content = map.sourcesContent[i]
    if (typeof content !== 'string') continue

    const src = map.sources[i] ?? ''

    // Exact match via raw normalized source.
    const normalizedSrc = normalizeFilePath(src)
    if (normalizedSrc === file) {
      return content
    }

    // Exact match via resolved absolute candidate.
    const resolved = normalizeSourceCandidate(src, root, sourceRoot)
    if (resolved === file) {
      return content
    }

    const score = Math.max(
      suffixSegmentScore(normalizedSrc, file),
      suffixSegmentScore(resolved, file),
    )

    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  // Require at least a basename match; otherwise fall back to index 0.
  if (bestIdx !== -1 && bestScore >= 1) {
    const best = map.sourcesContent[bestIdx]
    return typeof best === 'string' ? best : undefined
  }

  const fallback = map.sourcesContent[0]
  return typeof fallback === 'string' ? fallback : undefined
}

// ---------------------------------------------------------------------------
// Sourcemap: generated → original mapping
// ---------------------------------------------------------------------------

export async function mapGeneratedToOriginal(
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
    // Invalid or malformed sourcemap — fall through to fallback.
  }

  return fallback
}

// Cache SourceMapConsumer per sourcemap object.
const consumerCache = new WeakMap<object, Promise<SourceMapConsumer | null>>()

async function getSourceMapConsumer(
  map: SourceMapLike,
): Promise<SourceMapConsumer | null> {
  // WeakMap requires an object key; SourceMapLike should be an object in all
  // real cases, but guard anyway.
  // (TypeScript already guarantees `map` is an object here.)

  const cached = consumerCache.get(map)
  if (cached) return cached

  const promise = (async () => {
    try {
      return await new SourceMapConsumer(map as unknown as RawSourceMap)
    } catch {
      return null
    }
  })()

  consumerCache.set(map, promise)
  return promise
}

// ---------------------------------------------------------------------------
// Import specifier search (regex-based, no AST needed)
// ---------------------------------------------------------------------------

export function findFirstImportSpecifierIndex(
  code: string,
  source: string,
): number {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const patterns: Array<RegExp> = [
    // import 'x'
    new RegExp(`\\bimport\\s+(['"])${escaped}\\1`),
    // import ... from 'x' / export ... from 'x'
    new RegExp(`\\bfrom\\s+(['"])${escaped}\\1`),
    // import('x')
    new RegExp(`\\bimport\\s*\\(\\s*(['"])${escaped}\\1\\s*\\)`),
  ]

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

// ---------------------------------------------------------------------------
// High-level location finders (use transform result cache, no disk reads)
// ---------------------------------------------------------------------------

/**
 * Find the location of an import statement in a transformed module.
 *
 * Looks up the module's transformed code + composed sourcemap from the
 * {@link TransformResultProvider}, finds the import specifier in the
 * transformed code, and maps back to the original source via the sourcemap.
 *
 * Results are cached in `importLocCache`.
 */
export async function findImportStatementLocationFromTransformed(
  provider: TransformResultProvider,
  importerId: string,
  source: string,
  importLocCache: Map<
    string,
    { file?: string; line: number; column: number } | null
  >,
): Promise<Loc | undefined> {
  const importerFile = normalizeFilePath(importerId)
  const cacheKey = `${importerFile}::${source}`
  if (importLocCache.has(cacheKey)) {
    return importLocCache.get(cacheKey) || undefined
  }

  try {
    // Pass the raw importerId so the provider can look up the exact virtual
    // module variant (e.g. ?tsr-split=component) before falling back to the
    // base file path.
    const res = provider.getTransformResult(importerId)
    if (!res) {
      importLocCache.set(cacheKey, null)
      return undefined
    }

    const { code, map } = res
    if (typeof code !== 'string') {
      importLocCache.set(cacheKey, null)
      return undefined
    }

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
 *
 * Best-effort: looks up the module's transformed output from the
 * {@link TransformResultProvider}, finds the first non-import usage of
 * an imported binding, and maps back to original source via sourcemap.
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
    // Pass the raw importerId so the provider can look up the exact virtual
    // module variant (e.g. ?tsr-split=component) before falling back to the
    // base file path.
    const res = provider.getTransformResult(importerId)
    if (!res) return undefined
    const { code, map } = res
    if (typeof code !== 'string') return undefined

    // Ensure we have a line index ready for any downstream mapping.
    // (We don't currently need it here, but keeping it hot improves locality
    // for callers that also need import-statement mapping.)
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
  importLocCache: Map<
    string,
    { file?: string; line: number; column: number } | null
  >,
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

// ---------------------------------------------------------------------------
// Code snippet extraction (vitest-style context around a location)
// ---------------------------------------------------------------------------

export interface CodeSnippet {
  /** Source lines with line numbers, e.g. `["  6 | import { getSecret } from './secret.server'", ...]` */
  lines: Array<string>
  /** The highlighted line (1-indexed original line number) */
  highlightLine: number
  /** Clickable file:line reference */
  location: string
}

/**
 * Build a vitest-style code snippet showing the lines surrounding a location.
 *
 * Uses the `originalCode` stored in the transform result cache (extracted from
 * `sourcesContent[0]` of the composed sourcemap at transform time).  This is
 * reliable regardless of how the sourcemap names its sources.
 *
 * Falls back to the transformed code only when `originalCode` is unavailable
 * (e.g. a virtual module with no sourcemap).
 *
 * @param contextLines Number of lines to show above/below the target line (default 2).
 */
export function buildCodeSnippet(
  provider: TransformResultProvider,
  moduleId: string,
  loc: Loc,
  contextLines: number = 2,
): CodeSnippet | undefined {
  try {
    const importerFile = normalizeFilePath(moduleId)
    // Pass the raw moduleId so the provider can look up the exact virtual
    // module variant (e.g. ?tsr-split=component) before falling back to the
    // base file path.
    const res = provider.getTransformResult(moduleId)
    if (!res) return undefined

    const { code: transformedCode, originalCode } = res
    if (typeof transformedCode !== 'string') return undefined

    // Prefer the original source that was captured at transform time from the
    // sourcemap's sourcesContent.  This avoids the source-name-mismatch
    // problem that plagued the old sourceContentFor()-based lookup.
    const sourceCode = originalCode ?? transformedCode

    const allLines = sourceCode.split(/\r?\n/)
    const targetLine = loc.line // 1-indexed
    const targetCol = loc.column // 1-indexed

    if (targetLine < 1 || targetLine > allLines.length) return undefined

    const startLine = Math.max(1, targetLine - contextLines)
    const endLine = Math.min(allLines.length, targetLine + contextLines)
    const gutterWidth = String(endLine).length

    const sourceFile = loc.file ?? importerFile
    const snippetLines: Array<string> = []
    for (let i = startLine; i <= endLine; i++) {
      const lineContent = allLines[i - 1] ?? ''
      const lineNum = String(i).padStart(gutterWidth, ' ')
      const marker = i === targetLine ? '>' : ' '
      snippetLines.push(`  ${marker} ${lineNum} | ${lineContent}`)

      // Add column pointer on the target line
      if (i === targetLine && targetCol > 0) {
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
