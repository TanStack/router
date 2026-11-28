/**
 * Header: hashbang, leading comments (pragmas, license), directive prologue
 * and the insertion offset after them.
 */
import { isLineTerminator, isWhiteSpace } from './output-builder'
import type { Comment, SourceFile } from 'yuku'

export interface Range {
  start: number
  end: number
}

interface Pragma {
  range: Range
}

export interface Header {
  pragmas: Array<Pragma>
  /** License comments: stay in the env module (G12); one holding a JSX pragma's name is also a pragma, copied whole into derived outputs. */
  license: Array<Range>
  directives: Array<{ value: string; range: Range }>
  /** End of the header block; generated imports are inserted here. */
  end: number
  /** Number of leading `program.body` statements that are directives. */
  directiveCount: number
  /**
   * The comments after the header that hold a pragma, in source order: no
   * pragma for a transform reading leading comments only, and none once
   * an output renders them (`freeze.ts`).
   */
  latePragmas: Array<Range>
}

/**
 * Whether an offset stands in one of `ranges` (a range holds its start, not
 * its end): sorted and merged once, then a binary search per offset.
 */
export function rangeCover(ranges: Iterable<Range>): (at: number) => boolean {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const starts: Array<number> = []
  const ends: Array<number> = []
  for (const r of sorted) {
    const last = ends.length - 1
    if (last >= 0 && r.start <= ends[last]!) {
      ends[last] = Math.max(ends[last]!, r.end)
    } else {
      starts.push(r.start)
      ends.push(r.end)
    }
  }
  return (at) => {
    let lo = 0
    let hi = starts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (starts[mid]! <= at) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo > 0 && at < ends[lo - 1]!
  }
}

/**
 * A JSX pragma's name: a comment holding one is copied whole, as written,
 * wherever the file's JSX goes, and the host's JSX transform decides
 * whether it is in effect there as it does in the source (its own rules
 * for separators, lines and comment kinds).
 */
const PRAGMA_RE = /@jsx(?:ImportSource|Runtime|Frag)?(?![\w$])/

export function isLicenseComment(c: Comment): boolean {
  return (
    (c.type === 'Block' && c.value.startsWith('!')) ||
    /@license|@preserve/.test(c.value)
  )
}

/** Whether a comment holds a JSX pragma's name (`PRAGMA_RE`). */
export function holdsPragma(c: Comment): boolean {
  return PRAGMA_RE.test(c.value)
}

/** Counts the line terminators (CRLF = 1) in `code[start, end)`. */
function countLineBreaks(code: string, start: number, end: number): number {
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

/** What says something about the code after it: a bundler's annotation, a license. */
const APPLIES_TO_NEXT_RE =
  /[#@]__(?:PURE|NO_SIDE_EFFECTS)__|^!|@license|@preserve/

/**
 * Extends `end` over trailing same-line whitespace and comments through one
 * line terminator, so a removed statement takes its line with it. The code
 * after it keeps an annotation or a license comment written for it: on the
 * same line (`a; /* @__PURE__ *\/ mk()`), or ending the line, with `mk()` on
 * a later one (after a line comment or a multi-line comment too; a line
 * comment annotation, `// @__PURE__`, too). Moved with
 * `a`, it would apply to whatever comes next there.
 */
export function extendOverTrailingLine(code: string, end: number): number {
  let i = end
  const len = code.length
  /** The first comment that applies to the code after it. */
  let applying = -1
  while (i < len) {
    const c = code.charCodeAt(i)
    if (isWhiteSpace(c)) {
      i++
      continue
    }
    if (c === 47 && code.charCodeAt(i + 1) === 47) {
      const start = i
      while (i < len && !isLineTerminator(code.charCodeAt(i))) {
        i++
      }
      if (
        applying === -1 &&
        APPLIES_TO_NEXT_RE.test(code.slice(start + 2, i))
      ) {
        applying = start
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
        return applying === -1 ? i : applying
      }
      if (
        applying === -1 &&
        APPLIES_TO_NEXT_RE.test(code.slice(i + 2, close))
      ) {
        applying = i
      }
      i = close + 2
      continue
    }
    if (applying !== -1) {
      return applying
    }
    if (isLineTerminator(c)) {
      return c === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1
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
    const p = holdsPragma(c)
    const lic = isLicenseComment(c)
    if (i >= attachedFrom && !p && !lic) {
      continue
    }
    if (p) {
      pragmas.push({ range: { start: c.start, end: c.end } })
    }
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
  const latePragmas: Array<Range> = []
  if (code.includes('@jsx')) {
    for (const c of file.comments) {
      if (c.start >= end && holdsPragma(c)) {
        latePragmas.push({ start: c.start, end: c.end })
      }
    }
  }
  return {
    pragmas,
    license,
    directives,
    end,
    directiveCount,
    latePragmas,
  }
}
