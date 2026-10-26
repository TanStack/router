/**
 * Header: hashbang, leading comments (pragmas, license), directive prologue
 * and the insertion offset after them.
 */
import type { Comment, SourceFile } from 'yuku'

export interface Range {
  start: number
  end: number
}

export type PragmaKind = 'jsx' | 'jsxFrag' | 'jsxRuntime' | 'jsxImportSource'

export interface Pragma {
  kind: PragmaKind
  value: string
  range: Range
}

export interface Header {
  hashbang: Range | null
  /** Every comment of the header block (pragmas and license included), in order. */
  comments: Array<Range>
  pragmas: Array<Pragma>
  /** License comments: stay in the env module, never copied into derived outputs (G12). */
  license: Array<Range>
  directives: Array<{ value: string; range: Range }>
  /** End of the header block; generated imports are inserted here. */
  end: number
  /** Number of leading `program.body` statements that are directives. */
  directiveCount: number
}

const PRAGMA_RE = /@(jsxImportSource|jsxRuntime|jsxFrag|jsx)\s+(\S+)/g

export function isLicenseComment(c: Comment): boolean {
  return (
    (c.type === 'Block' && c.value.startsWith('!')) ||
    /@license|@preserve/.test(c.value)
  )
}

export function pragmasOf(c: Comment): Array<Pragma> {
  const out: Array<Pragma> = []
  PRAGMA_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PRAGMA_RE.exec(c.value)) !== null) {
    out.push({
      kind: m[1] as PragmaKind,
      value: m[2]!,
      range: { start: c.start, end: c.end },
    })
  }
  return out
}

export function isLineTerminator(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029
}

/** Counts the line terminators (CRLF = 1) in `code[start, end)`. */
export function countLineBreaks(
  code: string,
  start: number,
  end: number,
): number {
  let n = 0
  for (let i = start; i < end; i++) {
    const c = code.charCodeAt(i)
    if (c === 13) {
      n++
      if (code.charCodeAt(i + 1) === 10) {
        i++
      }
    } else if (c === 10 || c === 0x2028 || c === 0x2029) {
      n++
    }
  }
  return n
}

/**
 * Extends `end` over trailing same-line whitespace and comments through one
 * line terminator, so a removed statement takes its line with it.
 */
export function extendOverTrailingLine(code: string, end: number): number {
  let i = end
  const len = code.length
  while (i < len) {
    const c = code.charCodeAt(i)
    if (c === 32 || c === 9 || c === 11 || c === 12) {
      i++
      continue
    }
    if (c === 47 && code.charCodeAt(i + 1) === 47) {
      while (i < len && !isLineTerminator(code.charCodeAt(i))) {
        i++
      }
      continue
    }
    if (c === 47 && code.charCodeAt(i + 1) === 42) {
      const close = code.indexOf('*/', i + 2)
      if (close === -1) {
        return len
      }
      let hasBreak = false
      for (let j = i + 2; j < close; j++) {
        if (isLineTerminator(code.charCodeAt(j))) {
          hasBreak = true
          break
        }
      }
      if (hasBreak) {
        return i
      }
      i = close + 2
      continue
    }
    if (c === 13) {
      return code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1
    }
    if (c === 10 || c === 0x2028 || c === 0x2029) {
      return i + 1
    }
    return i
  }
  return i
}

export function analyzeHeader(file: SourceFile): Header {
  const code = file.source
  const program = file.program
  const body = program.body
  const hashbang = program.hashbang
    ? { start: program.hashbang.start, end: program.hashbang.end }
    : null
  let directiveCount = 0
  while (
    directiveCount < body.length &&
    body[directiveCount]!.type === 'ExpressionStatement' &&
    typeof (body[directiveCount] as { directive?: unknown }).directive ===
      'string'
  ) {
    directiveCount++
  }
  // Header comments lead the first statement after the directive prologue (a
  // pragma may follow `'use client'`; the JSX transforms read it there too).
  const firstStart =
    body.length > directiveCount
      ? body[directiveCount]!.start
      : body.length > 0
        ? body[body.length - 1]!.end
        : hashbang
          ? hashbang.end
          : 0
  const leading = file.comments.filter(
    (c) => c.end <= firstStart && (!hashbang || c.start >= hashbang.end),
  )

  const comments: Array<Range> = []
  const pragmas: Array<Pragma> = []
  const license: Array<Range> = []

  // Comments directly attached to the first statement (no blank line between
  // them and it) belong to the statement, unless they are pragmas/license.
  let attachedFrom = leading.length
  if (body.length > directiveCount) {
    let next = firstStart
    for (let i = leading.length - 1; i >= 0; i--) {
      const c = leading[i]!
      if (countLineBreaks(code, c.end, next) > 1) {
        break
      }
      attachedFrom = i
      next = c.start
    }
  }
  let end = hashbang ? extendOverTrailingLine(code, hashbang.end) : 0
  for (let i = 0; i < leading.length; i++) {
    const c = leading[i]!
    const p = pragmasOf(c)
    const lic = isLicenseComment(c)
    if (i >= attachedFrom && p.length === 0 && !lic) {
      continue
    }
    comments.push({ start: c.start, end: c.end })
    pragmas.push(...p)
    if (lic) {
      license.push({ start: c.start, end: c.end })
    }
    end = Math.max(end, extendOverTrailingLine(code, c.end))
  }
  const directives: Header['directives'] = []
  for (let i = 0; i < directiveCount; i++) {
    const d = body[i]!
    directives.push({
      value: (d as unknown as { directive: string }).directive,
      range: { start: d.start, end: d.end },
    })
    end = Math.max(end, extendOverTrailingLine(code, d.end))
  }
  const firstItem = body[directiveCount]
  if (firstItem !== undefined && end > firstItem.start) {
    end = firstItem.start
  }
  return {
    hashbang,
    comments,
    pragmas,
    license,
    directives,
    end,
    directiveCount,
  }
}
