/**
 * Original positions of a compile's offsets (J6.5, G6): an offset of the input
 * text → its 1-based line and column, through the input map when the input is
 * another plugin's output (MDX, Vue, an alias transform). A position the map
 * does not cover is no position (never compiled coordinates).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SourceText, normalizePath } from '@tanstack/router-utils/compiler'
import type { InputSourceMap } from '@tanstack/router-utils/compiler'

export interface OriginalLocation {
  /** Absolute path of the original source. */
  file: string
  /** 1-based line. */
  line: number
  /** 1-based UTF-16 column. */
  column: number
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_VALUE = new Int8Array(128).fill(-1)
for (let i = 0; i < B64.length; i++) {
  B64_VALUE[B64.charCodeAt(i)] = i
}

/** One decoded mapping segment: generated column, source index, original line, original column (all 0-based). */
type Segment = [number, number, number, number]

/** Decoded lines of a map, decoded once per map object and lazily up to the line asked for. */
class MappingCursor {
  private readonly lines: Array<Array<Segment>> = []
  private pos = 0
  private source = 0
  private origLine = 0
  private origColumn = 0

  constructor(private readonly mappings: string) {}

  line(index: number): Array<Segment> {
    while (this.lines.length <= index && this.pos <= this.mappings.length) {
      this.decodeLine()
    }
    return this.lines[index] ?? []
  }

  private decodeLine(): void {
    const s = this.mappings
    const segments: Array<Segment> = []
    let genColumn = 0
    while (this.pos < s.length) {
      const c = s.charCodeAt(this.pos)
      if (c === 59 /* ; */) {
        this.pos++
        break
      }
      if (c === 44 /* , */) {
        this.pos++
        continue
      }
      const fields: Array<number> = []
      while (this.pos < s.length) {
        const ch = s.charCodeAt(this.pos)
        if (ch === 44 || ch === 59) {
          break
        }
        fields.push(this.vlq())
      }
      genColumn += fields[0] ?? 0
      if (fields.length >= 4) {
        this.source += fields[1]!
        this.origLine += fields[2]!
        this.origColumn += fields[3]!
        segments.push([genColumn, this.source, this.origLine, this.origColumn])
      }
    }
    if (this.pos >= s.length) {
      this.pos = s.length + 1
    }
    segments.sort((a, b) => a[0] - b[0])
    this.lines.push(segments)
  }

  private vlq(): number {
    const s = this.mappings
    let result = 0
    let shift = 0
    for (;;) {
      const v = B64_VALUE[s.charCodeAt(this.pos++)] ?? -1
      if (v < 0) {
        return 0
      }
      result += (v & 31) << shift
      if ((v & 32) === 0) {
        break
      }
      shift += 5
    }
    const negative = result & 1
    result >>>= 1
    return negative ? -result : result
  }
}

const cursors = new WeakMap<InputSourceMap, MappingCursor>()

/** The original position of a 0-based generated line/column, or null when the map does not cover it. */
export function originalPositionFor(
  map: InputSourceMap,
  line: number,
  column: number,
  mapFile: string,
): OriginalLocation | null {
  let cursor = cursors.get(map)
  if (!cursor) {
    cursor = new MappingCursor(map.mappings)
    cursors.set(map, cursor)
  }
  const segments = cursor.line(line)
  let found: Segment | null = null
  for (const seg of segments) {
    if (seg[0] > column) {
      break
    }
    found = seg
  }
  if (!found) {
    return null
  }
  const source = map.sources[found[1]]
  if (typeof source !== 'string') {
    return null
  }
  const root = map.sourceRoot ?? ''
  return {
    file: resolveSource(mapFile, root, source),
    line: found[2] + 1,
    column: found[3] + 1,
  }
}

/** A map `sources` entry, absolute (relative entries resolve against the map's file, never taken as a file name). */
function resolveSource(
  mapFile: string,
  sourceRoot: string,
  source: string,
): string {
  if (source.startsWith('file://')) {
    try {
      return normalizePath(fileURLToPath(source))
    } catch {
      return source
    }
  }
  const joined = sourceRoot ? path.posix.join(sourceRoot, source) : source
  if (path.isAbsolute(joined)) {
    return normalizePath(joined)
  }
  return normalizePath(path.resolve(path.dirname(mapFile), joined))
}

/**
 * Locates offsets of one input text: `at(offset)` is the original position
 * (through `inputMap` when there is one; `file` is the importer when there
 * is none).
 */
export class Locator {
  /** Lines by every ECMAScript terminator (positions of the input itself). */
  private ecma: SourceText | null = null
  /** Lines by LF only: how a map's producer counts the generated lines (a lone CR breaks no line). */
  private lf: SourceText | null = null

  constructor(
    private readonly code: string,
    private readonly file: string,
    private readonly inputMap: () => InputSourceMap | null,
  ) {}

  at(offset: number): OriginalLocation | null {
    if (offset < 0 || offset > this.code.length) {
      return null
    }
    const map = this.inputMap()
    if (map === null) {
      this.ecma ??= new SourceText(this.code)
      const { line, column } = this.ecma.locate(offset)
      return { file: this.file, line: line + 1, column: column + 1 }
    }
    this.lf ??= new SourceText(this.code, { lines: 'lf' })
    const { line, column } = this.lf.locate(offset)
    return originalPositionFor(map, line, column, this.file)
  }

  /** The code frame of an original location `at` gave (null without the original text). */
  frame(loc: OriginalLocation): CodeFrame | null {
    const map = this.inputMap()
    let text: string | null = null
    if (map === null) {
      text = loc.file === this.file ? this.code : null
    } else {
      const root = map.sourceRoot ?? ''
      const index = map.sources.findIndex(
        (s) =>
          typeof s === 'string' &&
          resolveSource(this.file, root, s) === loc.file,
      )
      text = index < 0 ? null : (map.sourcesContent?.[index] ?? null)
    }
    // (lines counted like `at` counts them: the input by every ECMAScript
    // terminator, a map's sources by LF)
    return text === null
      ? null
      : codeFrame(text, loc, map === null ? /\r\n|[\n\r\u2028\u2029]/ : /\r?\n/)
  }
}

/** Vitest-style lines of the original source around a location (`ViolationInfo.snippet`). */
export interface CodeFrame {
  lines: Array<string>
  highlightLine: number
  /** `file:line:column`. */
  location: string
}

const CONTEXT_LINES = 2

function codeFrame(
  text: string,
  loc: OriginalLocation,
  lineBreaks: RegExp,
): CodeFrame | null {
  const all = text.split(lineBreaks)
  if (loc.line > all.length) {
    return null
  }
  const first = Math.max(1, loc.line - CONTEXT_LINES)
  const last = Math.min(all.length, loc.line + CONTEXT_LINES)
  const gutter = String(last).length
  const lines: Array<string> = []
  for (let n = first; n <= last; n++) {
    const marker = n === loc.line ? '>' : ' '
    lines.push(`  ${marker} ${String(n).padStart(gutter)} | ${all[n - 1]}`)
    if (n === loc.line) {
      lines.push(`    ${' '.repeat(gutter)} | ${' '.repeat(loc.column - 1)}^`)
    }
  }
  return {
    lines,
    highlightLine: loc.line,
    location: `${loc.file}:${loc.line}:${loc.column}`,
  }
}
