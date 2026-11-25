/**
 * The splice engine and v3 source-map builder (direct VLQ; no magic-string on
 * the emit path), and the one reader of rendered characters.
 *
 * - The character classes of ECMAScript source (`isLineTerminator`,
 *   `isWhiteSpace`) and where two pieces of code meet (`spaceBefore`,
 *   `spaceAfter`: L of `expression.ts`), for every module that asks.
 * - `SourceText`: one per input revision, shared by every output of a plan.
 *   Lines are ECMAScript line terminators by default (LF, CRLF, lone CR,
 *   U+2028, U+2029), which is what V8, oxc, esbuild, Babel and Yuku count.
 * - `RecipeWriter`: the segments of one output as freeze renders them, and
 *   what they render (the characters before and after a position, the line
 *   and the token a statement follows).
 * - `OutputBuilder`: one per output. `copy()` appends original text;
 *   `text()` appends generated glue (unmapped unless
 *   `mapTo` is given). Segments inside copied text sit at the start of every
 *   copy run, at the start of every word run and at every punctuator
 *   character; whitespace never starts one. The scan is syntax-agnostic.
 *   Lines follow the source's convention in copied and generated text alike.
 */
import type { Segment } from './plan'

/** Whether `c` is an ECMAScript LineTerminator (LF, CR, U+2028, U+2029). */
export function isLineTerminator(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029
}

/** Whether `c` is ECMAScript WhiteSpace (tab, VT, FF, space, U+00A0, U+FEFF, any other Zs). */
export function isWhiteSpace(c: number): boolean {
  return (
    c === 32 ||
    c === 9 ||
    c === 11 ||
    c === 12 ||
    (c >= 0xa0 &&
      (c === 0xa0 ||
        c === 0xfeff ||
        c === 0x1680 ||
        (c >= 0x2000 && c <= 0x200a) ||
        c === 0x202f ||
        c === 0x205f ||
        c === 0x3000))
  )
}

/** Whether `c` is ECMAScript whitespace or a line terminator (`\s`). */
export function isSpace(c: number): boolean {
  return isWhiteSpace(c) || isLineTerminator(c)
}

/**
 * Whether `c`, the first character of a statement, could continue the
 * statement before it: a parenthesis, a bracket, a template, a sign, a
 * regular expression, JSX or a type assertion (`foo` + `(x)` is a call).
 */
export function continuesStatement(c: string): boolean {
  return c !== '' && '([`+-/<'.includes(c)
}

/**
 * L at a boundary's start: whether a space goes between `a`, the last
 * character rendered before it (`beforeA` the one before that), and `b`, its
 * first character. Two identifier characters would be one name, `+ +` and
 * `- -` one operator (`n+F(+n)`), a division then `/` or `*` a comment
 * (`n/F(/re/g)`), `<` then `/` a closing tag to TypeScript's JSX scanner
 * (`x<F(/re/)`). What precedes a call in valid source is never a regular
 * expression's closing `/` (its letters would be flags), and the end of a
 * comment merges with nothing.
 */
export function spaceBefore(beforeA: string, a: string, b: string): boolean {
  return (
    meets(a, b) ||
    (a === '/' && beforeA !== '*' && (b === '/' || b === '*')) ||
    (a === '<' && b === '/')
  )
}

/**
 * L at a boundary's end: whether a space goes between `a`, its last
 * character, and `b`, the next one. As at the start, and: a regular
 * expression's `/` then letters would take them as flags (`F(/re/)in o`),
 * a number's last `.` then letters would be read as one token (`F(1.)in o`),
 * `!` then `=` an inequality (`F(n!)==5`).
 */
export function spaceAfter(a: string, b: string): boolean {
  return (
    meets(a, b) ||
    (a === '/' && (b === '/' || b === '*' || isIdentifierChar(b))) ||
    (a === '.' && isIdentifierChar(b)) ||
    (a === '!' && b === '=')
  )
}

/** Two identifier characters, or the same one of `+`, `-`, `<`. */
function meets(a: string, b: string): boolean {
  if (a === '' || b === '') {
    return false
  }
  return isIdentifierChar(a)
    ? isIdentifierChar(b)
    : a === b && (a === '+' || a === '-' || a === '<')
}

/** A letter, a digit, `$`, `_`, `\` (an escape) or any character above ASCII. */
function isIdentifierChar(c: string): boolean {
  const n = c.charCodeAt(0)
  return (
    (n >= 97 && n <= 122) || // a-z
    (n >= 65 && n <= 90) || // A-Z
    (n >= 48 && n <= 57) || // 0-9
    n === 36 || // $
    n === 95 || // _
    n === 92 || // \
    n > 127
  )
}

const SPACE = 0
const WORD = 1
const PUNCT = 2
const LF = 3
const CR = 4
const CLS = new Uint8Array(128).fill(PUNCT)
for (const c of [9, 11, 12, 32]) {
  CLS[c] = SPACE
}
CLS[10] = LF
CLS[13] = CR
for (let c = 48; c <= 57; c++) {
  CLS[c] = WORD
}
for (let c = 65; c <= 90; c++) {
  CLS[c] = WORD
}
for (let c = 97; c <= 122; c++) {
  CLS[c] = WORD
}
CLS[95] = WORD // _
CLS[36] = WORD // $

function isUnicodeSpace(c: number): boolean {
  return (
    c === 0xa0 ||
    c === 0xfeff ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000
  )
}

const B64 = new Uint8Array(64)
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  .split('')
  .forEach((ch, i) => {
    B64[i] = ch.charCodeAt(0)
  })
const SEMI = 59
const COMMA = 44
const decoder = new TextDecoder()

interface SourceTextOptions {
  lines?: 'ecma' | 'lf'
}

export class SourceText {
  readonly code: string
  readonly ecma: boolean
  private _ls: Int32Array | null = null

  constructor(code: string, opts: SourceTextOptions = {}) {
    this.code = code
    this.ecma = opts.lines !== 'lf'
  }

  /** Whether the line table has been built (the forward cursor avoids it). */
  get hasLineTable(): boolean {
    return this._ls !== null
  }

  /** Start offset of every line, plus a sentinel so that `ls[line + 1]` is always defined. */
  get lineStarts(): Int32Array {
    if (this._ls !== null) {
      return this._ls
    }
    const code = this.code
    const starts = [0]
    if (
      !this.ecma ||
      (code.indexOf('\r') === -1 &&
        code.indexOf('\u2028') === -1 &&
        code.indexOf('\u2029') === -1)
    ) {
      for (
        let i = code.indexOf('\n');
        i !== -1;
        i = code.indexOf('\n', i + 1)
      ) {
        starts.push(i + 1)
      }
    } else {
      for (let i = 0; i < code.length; i++) {
        const c = code.charCodeAt(i)
        if (
          c === 10 ||
          c === 0x2028 ||
          c === 0x2029 ||
          (c === 13 && code.charCodeAt(i + 1) !== 10)
        ) {
          starts.push(i + 1)
        }
      }
    }
    starts.push(0x7fffffff)
    this._ls = Int32Array.from(starts)
    return this._ls
  }

  /** 0-based line of an offset. */
  lineOf(offset: number): number {
    const ls = this.lineStarts
    let lo = 0
    let hi = ls.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ls[mid]! <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return lo
  }

  /** 0-based line and UTF-16 column of an offset. */
  locate(offset: number): { line: number; column: number } {
    const line = this.lineOf(offset)
    return { line, column: offset - this.lineStarts[line]! }
  }
}

/**
 * Where the first token of `text[start, end)` starts (`end` when there is
 * none): whitespace and comments skipped (an unclosed block comment is a
 * token).
 */
export function tokenStart(text: string, start = 0, end = text.length): number {
  let i = start
  while (i < end) {
    const c = text.charCodeAt(i)
    if (isSpace(c)) {
      i++
      continue
    }
    if (c === 47 /* / */ && i + 1 < end) {
      const d = text.charCodeAt(i + 1)
      if (d === 42 /* * */) {
        const close = text.indexOf('*/', i + 2)
        if (close === -1 || close + 2 > end) {
          return i
        }
        i = close + 2
        continue
      }
      if (d === 47) {
        i += 2
        while (i < end && !isLineTerminator(text.charCodeAt(i))) {
          i++
        }
        continue
      }
    }
    return i
  }
  return end
}

/** Whether `text` holds a line terminator other than LF (CR, U+2028, U+2029). */
export function breaksNotLf(text: string): boolean {
  return NOT_LF_BREAK.test(text)
}

const NOT_LF_BREAK = /[\r\u2028\u2029]/

/**
 * The segments of one output as freeze renders them (`freeze.ts`), and the
 * one reader of what they render: the characters a position meets, the first
 * token after it, the line and the token a statement follows. Segments are
 * written whole (one literal per shape, `OutputRecipe` keeps them); a
 * reserved one is a text written later, dropped by `finish` when it stayed
 * empty.
 */
export class RecipeWriter {
  readonly segments: Array<Segment> = []
  private reserved = false

  constructor(private readonly code: string) {}

  get length(): number {
    return this.segments.length
  }

  push(seg: Segment): void {
    this.segments.push(seg)
  }

  /** A segment to write later (`set`): its index. */
  reserve(): number {
    this.reserved = true
    return this.segments.push({ k: 'text', text: '' }) - 1
  }

  set(i: number, seg: Segment): void {
    this.segments[i] = seg
  }

  /** Puts `text` before segment `i`. */
  insert(i: number, text: string): void {
    this.segments.splice(i, 0, { k: 'text', text })
  }

  /** Puts `text` before the source offset `offset`, which the segments from `from` on render (in a slice, split there). */
  insertAt(from: number, offset: number, text: string): void {
    const segs = this.segments
    for (let i = from; i < segs.length; i++) {
      const s = segs[i]!
      if (s.k === 'slice' && s.start <= offset && offset < s.end) {
        if (s.start === offset) {
          this.insert(i, text)
        } else {
          segs.splice(
            i,
            1,
            { k: 'slice', start: s.start, end: offset },
            { k: 'text', text },
            { k: 'slice', start: offset, end: s.end },
          )
        }
        return
      }
    }
    this.insert(from, text)
  }

  /** The segments without the reserved ones left empty (in place: the array the recipe keeps). */
  finish(): Array<Segment> {
    const segs = this.segments
    if (this.reserved) {
      let w = 0
      for (const s of segs) {
        if (s.k !== 'text' || s.text !== '' || s.edgeKey !== undefined) {
          segs[w++] = s
        }
      }
      segs.length = w
    }
    return segs
  }

  /** Whether no text segment breaks a line but with LF (`OutputRecipe.plainText`). */
  plainText(): boolean {
    for (const s of this.segments) {
      if (s.k === 'text' && breaksNotLf(s.text)) {
        return false
      }
    }
    return true
  }

  private textOf(seg: Segment): string {
    return seg.k === 'slice' ? this.code.slice(seg.start, seg.end) : seg.text
  }

  /** The text rendered from segment `from` on. */
  renderedText(from: number): string {
    let text = ''
    for (let i = from; i < this.segments.length; i++) {
      text += this.textOf(this.segments[i]!)
    }
    return text
  }

  /** The first character rendered from segment `from` on ('' when none). */
  firstChar(from: number): string {
    const segs = this.segments
    for (let i = from; i < segs.length; i++) {
      const seg = segs[i]!
      if (seg.k === 'slice' ? seg.end > seg.start : seg.text !== '') {
        return seg.k === 'slice' ? this.code.charAt(seg.start) : seg.text[0]!
      }
    }
    return ''
  }

  /** The first character of the first token rendered from segment `from` on ('' when none: a comment is no token). */
  firstTokenChar(from: number): string {
    const segs = this.segments
    for (let i = from; i < segs.length; i++) {
      const seg = segs[i]!
      if (seg.k === 'slice') {
        const at = tokenStart(this.code, seg.start, seg.end)
        if (at < seg.end) {
          return this.code[at]!
        }
      } else {
        const at = tokenStart(seg.text)
        if (at < seg.text.length) {
          return seg.text[at]!
        }
      }
    }
    return ''
  }

  /** The character rendered `back` characters before segment `before` (0: the last one), after segment `after` ('' when none). */
  charBefore(before: number, back: 0 | 1, after = -1): string {
    let skip: number = back
    for (let i = before - 1; i > after; i--) {
      const seg = this.segments[i]!
      const n = seg.k === 'slice' ? seg.end - seg.start : seg.text.length
      if (n > skip) {
        return seg.k === 'slice'
          ? this.code.charAt(seg.end - 1 - skip)
          : seg.text.charAt(n - 1 - skip)
      }
      skip -= n
    }
    return ''
  }

  /** The index of the last segment from `from` on that renders text (-1: none). */
  lastRendered(from: number): number {
    const segs = this.segments
    for (let i = segs.length - 1; i >= from; i--) {
      const seg = segs[i]!
      if (seg.k === 'slice' ? seg.end > seg.start : seg.text !== '') {
        return i
      }
    }
    return -1
  }

  /** The source position the first text rendered from segment `from` on maps to, if it is mapped. */
  firstMapped(from: number): number | undefined {
    const segs = this.segments
    for (let i = from; i < segs.length; i++) {
      const seg = segs[i]!
      if (seg.k === 'slice' ? seg.end > seg.start : seg.text !== '') {
        return seg.k === 'slice'
          ? seg.start
          : seg.gen === true
            ? undefined
            : seg.mapTo
      }
    }
    return undefined
  }

  /**
   * Whether what renders before segment `from` ends with something a next
   * token could continue: anything but a `;` or a block's start (taken for a
   * comment's end when its line holds a `//`: another `;` costs nothing).
   */
  continuable(from: number): boolean {
    for (let i = from - 1; i >= 0; i--) {
      const seg = this.segments[i]!
      const text = seg.k === 'slice' ? this.code : seg.text
      const start = seg.k === 'slice' ? seg.start : 0
      let p = (seg.k === 'slice' ? seg.end : seg.text.length) - 1
      while (p >= start && isSpace(text.charCodeAt(p))) {
        p--
      }
      if (p < start) {
        continue
      }
      const last = text.charCodeAt(p)
      if (last !== 59 /* ; */ && last !== 123 /* { */) {
        return true
      }
      // (a `//` on its line, within the segment)
      for (; p - 2 >= start && !isLineTerminator(text.charCodeAt(p - 1)); p--) {
        if (text.charCodeAt(p - 1) === 47 && text.charCodeAt(p - 2) === 47) {
          return true
        }
      }
      return false
    }
    return false
  }

  /**
   * Whether the line of a token rendered first from segment `from` on, at
   * source offset `offset` (-1: generated), holds something rendered before
   * that segment: a line end between the segment's start and the token (in
   * a slice holding it: its comments before the token are its own) closes
   * what precedes.
   */
  lineOpenAt(from: number, offset: number): boolean {
    const seg = this.segments[from]
    if (seg?.k === 'slice' && offset > seg.start && offset <= seg.end) {
      for (let p = offset - 1; p >= seg.start; p--) {
        if (isLineTerminator(this.code.charCodeAt(p))) {
          return false
        }
      }
    }
    return this.lineOpen(from)
  }

  /** Whether the last line rendered before segment `from` holds anything but whitespace (what renders next would share it). */
  lineOpen(from: number): boolean {
    for (let i = from - 1; i >= 0; i--) {
      const seg = this.segments[i]!
      const text = seg.k === 'slice' ? this.code : seg.text
      const start = seg.k === 'slice' ? seg.start : 0
      for (
        let p = (seg.k === 'slice' ? seg.end : seg.text.length) - 1;
        p >= start;
        p--
      ) {
        const c = text.charCodeAt(p)
        if (isLineTerminator(c)) {
          return false
        }
        if (!isSpace(c)) {
          return true
        }
      }
    }
    return false
  }
}

export interface OutputBuilderOptions {
  map?: boolean
  /** No `text()` breaks a line but with LF (a recipe's `plainText`): its lines are counted natively. */
  plainText?: boolean
}

/**
 * No `sourcesContent`: the map of one output would then hold the whole file,
 * and the webpack family hashes a module's map with its code, so an edit
 * anywhere in the file would hot-update every output of it (its route
 * module refreshing the route) where only the edited output changed. The
 * source is the file `sources` names: Vite's dev server reads it from there,
 * Rollup and Rolldown take the module's code; the webpack-family hosts add
 * the text (`hosts/emitted-maps.ts`).
 */
export interface RawSourceMap {
  version: 3
  sources: [string]
  names: []
  mappings: string
}

export class OutputBuilder {
  private readonly src: SourceText
  private readonly mapSource: string
  private readonly withMap: boolean
  private readonly plainText: boolean
  private code = ''
  private genCol = 0
  // VLQ state
  private buf: Uint8Array = new Uint8Array(256)
  private len = 0
  private prevGenCol = 0
  private prevLine = 0
  private prevCol = 0
  private lineHasSeg = false
  private lastMapped = false
  /**
   * Where unmapped glue started on a line nothing is mapped on yet, after
   * mapped code (-1: none): its 1-field segment is written once something
   * on the line maps, so a line holding no mapping holds no segment.
   */
  private pendingUnmapped = -1
  /** The output ends with a CR it counted as a line end: an LF written next is that terminator's (CRLF). */
  private endsCR = false
  // forward cursor in the original (offset, line, lineStart)
  private curOff = 0
  private curLine = 0
  private curLineStart = 0

  constructor(
    source: SourceText,
    mapSource: string,
    opts: OutputBuilderOptions = {},
  ) {
    this.src = source
    this.mapSource = mapSource
    this.withMap = opts.map !== false
    this.plainText = opts.plainText === true
  }

  /**
   * Appends original `[start, end)`. Lines are the output's: a CR ending
   * one write and an LF starting the next are one terminator there.
   */
  copy(start: number, end: number): void {
    if (end > start && this.endsCR && this.src.code.charCodeAt(start) === 10) {
      // (the line ended at the CR: the LF takes no column)
      this.code += '\n'
      this.endsCR = false
      start++
    }
    if (end > start) {
      this._run(start, end)
    }
  }

  /** Appends generated text. Unmapped unless `mapTo` gives the original offset it stands for. */
  text(t: string, mapTo?: number): void {
    if (t.length === 0) {
      return
    }
    this.code += t
    // (an LF after a CR the previous write ended with is that CR's line end)
    const skip = this.endsCR && t.charCodeAt(0) === 10 ? 1 : 0
    this.endsCR = this.src.ecma && t.charCodeAt(t.length - 1) === 13
    if (!this.withMap || skip === t.length) {
      return
    }
    if (mapTo !== undefined) {
      this._locate(mapTo)
      this._seg(this.genCol, this.curLine, mapTo - this.curLineStart)
    } else if (this.lastMapped) {
      this._unmapped()
    }
    // (the source's line convention: ECMAScript's, a CRLF one terminator,
    // or LF only; text breaking lines with LF alone counts them natively)
    if (!this.plainText && this.src.ecma && breaksNotLf(t)) {
      let lineStart = -1
      for (let i = skip; i < t.length; i++) {
        const c = t.charCodeAt(i)
        if (isLineTerminator(c)) {
          if (c === 13 && t.charCodeAt(i + 1) === 10) {
            i++
          }
          this._newline()
          lineStart = i + 1
        }
      }
      this.genCol =
        lineStart === -1 ? this.genCol + t.length - skip : t.length - lineStart
      return
    }
    let nl = t.indexOf('\n', skip)
    if (nl === -1) {
      this.genCol += t.length - skip
      return
    }
    let last: number
    do {
      this._newline()
      last = nl
      nl = t.indexOf('\n', nl + 1)
    } while (nl !== -1)
    this.genCol = t.length - last - 1
  }

  /** Ends the current line unless the output is empty or already ends with a line terminator (the source's convention). */
  newline(): void {
    const c = this.code.charCodeAt(this.code.length - 1)
    if (
      this.code.length > 0 &&
      c !== 10 &&
      !(this.src.ecma && isLineTerminator(c))
    ) {
      this.text('\n')
    }
  }

  finish(): { code: string; map: RawSourceMap | null } {
    if (!this.withMap) {
      return { code: this.code, map: null }
    }
    return {
      code: this.code,
      map: {
        version: 3,
        sources: [this.mapSource],
        names: [],
        mappings: decoder.decode(this.buf.subarray(0, this.len)),
      },
    }
  }

  // --- internals ---------------------------------------------------------

  private _locate(off: number): void {
    const src = this.src
    if (
      off < this.curOff ||
      (off - this.curOff > 16384 && !src.hasLineTable) ||
      (src.hasLineTable && off - this.curOff > 1024)
    ) {
      const line = src.lineOf(off)
      this.curLine = line
      this.curLineStart = src.lineStarts[line]!
    } else {
      const code = src.code
      let line = this.curLine
      let lineStart = this.curLineStart
      if (src.ecma) {
        for (let i = this.curOff; i < off; i++) {
          const c = code.charCodeAt(i)
          if (
            c === 10 ||
            c === 0x2028 ||
            c === 0x2029 ||
            (c === 13 && code.charCodeAt(i + 1) !== 10)
          ) {
            line++
            lineStart = i + 1
          }
        }
      } else {
        for (
          let i = code.indexOf('\n', this.curOff);
          i !== -1 && i < off;
          i = code.indexOf('\n', i + 1)
        ) {
          line++
          lineStart = i + 1
        }
      }
      this.curLine = line
      this.curLineStart = lineStart
    }
    this.curOff = off
  }

  private _run(s: number, e: number): void {
    const code = this.src.code
    this.code += code.slice(s, e)
    const ecma = this.src.ecma
    this.endsCR = ecma && code.charCodeAt(e - 1) === 13
    if (!this.withMap) {
      return
    }
    if (this.pendingUnmapped !== -1) {
      this._writeUnmapped()
    }
    this._locate(s)
    let line = this.curLine
    let lineStart = this.curLineStart
    let base = this.genCol - s
    let buf = this.buf
    let p = this.len
    let cap = buf.length - 48
    let pgc = this.prevGenCol
    let pl = this.prevLine
    let pc = this.prevCol
    let has = this.lineHasSeg

    if (p > cap) {
      ;({ buf, cap } = this._grow(p))
    }
    if (has) {
      buf[p++] = COMMA
    }
    p = vlq(buf, p, base + s - pgc)
    buf[p++] = 65
    p = vlq(buf, p, line - pl)
    p = vlq(buf, p, s - lineStart - pc)
    pgc = base + s
    pl = line
    pc = s - lineStart
    has = true

    let prev = -1
    for (let i = s; i < e; i++) {
      const c = code.charCodeAt(i)
      let k: number
      if (c < 128) {
        k = CLS[c]!
        if (k >= LF) {
          // (a CR ending the run ends its line: an LF the next write
          // starts with is skipped, `copy`/`text`)
          if (
            k === CR &&
            (!ecma || (i + 1 < e && code.charCodeAt(i + 1) === 10))
          ) {
            k = SPACE
          } else {
            if (p > cap) {
              ;({ buf, cap } = this._grow(p))
            }
            buf[p++] = SEMI
            pgc = 0
            has = false
            // (an output line; the source's ends at the LF of its CRLF
            // when the run ends between the two)
            if (k === CR && code.charCodeAt(i + 1) === 10) {
              base = -(i + 1)
            } else {
              line++
              lineStart = i + 1
              base = -lineStart
            }
            prev = SPACE
            continue
          }
        }
      } else if (c === 0x2028 || c === 0x2029) {
        if (ecma) {
          if (p > cap) {
            ;({ buf, cap } = this._grow(p))
          }
          buf[p++] = SEMI
          pgc = 0
          has = false
          line++
          lineStart = i + 1
          base = -lineStart
          prev = SPACE
          continue
        }
        k = SPACE
      } else {
        k = isUnicodeSpace(c) ? SPACE : WORD
      }
      if (k !== SPACE && (k === PUNCT || k !== prev) && i !== s) {
        if (p > cap) {
          ;({ buf, cap } = this._grow(p))
        }
        if (has) {
          buf[p++] = COMMA
        }
        p = vlq(buf, p, base + i - pgc)
        buf[p++] = 65
        p = vlq(buf, p, line - pl)
        p = vlq(buf, p, i - lineStart - pc)
        pgc = base + i
        pl = line
        pc = i - lineStart
        has = true
      }
      prev = k
    }
    this.len = p
    this.prevGenCol = pgc
    this.prevLine = pl
    this.prevCol = pc
    this.lineHasSeg = has
    this.lastMapped = true
    this.genCol = base + e
    this.curOff = e
    this.curLine = line
    this.curLineStart = lineStart
  }

  private _seg(genCol: number, line: number, col: number): void {
    if (this.pendingUnmapped !== -1) {
      this._writeUnmapped()
    }
    if (this.len > this.buf.length - 48) {
      this._grow(this.len)
    }
    const buf = this.buf
    let p = this.len
    if (this.lineHasSeg) {
      buf[p++] = COMMA
    }
    p = vlq(buf, p, genCol - this.prevGenCol)
    buf[p++] = 65
    p = vlq(buf, p, line - this.prevLine)
    p = vlq(buf, p, col - this.prevCol)
    this.len = p
    this.prevGenCol = genCol
    this.prevLine = line
    this.prevCol = col
    this.lineHasSeg = true
    this.lastMapped = true
  }

  /**
   * A 1-field segment: generated glue after mapped code is not attributed
   * to that code. On a line nothing maps on yet it waits for the line's
   * first mapping (`pendingUnmapped`).
   */
  private _unmapped(): void {
    this.lastMapped = false
    if (this.lineHasSeg) {
      this._unmappedAt(this.genCol)
    } else if (this.pendingUnmapped === -1) {
      this.pendingUnmapped = this.genCol
    }
  }

  private _writeUnmapped(): void {
    const col = this.pendingUnmapped
    this.pendingUnmapped = -1
    this._unmappedAt(col)
  }

  private _unmappedAt(col: number): void {
    if (this.len > this.buf.length - 48) {
      this._grow(this.len)
    }
    const buf = this.buf
    let p = this.len
    if (this.lineHasSeg) {
      buf[p++] = COMMA
    }
    p = vlq(buf, p, col - this.prevGenCol)
    this.len = p
    this.prevGenCol = col
    this.lineHasSeg = true
  }

  private _newline(): void {
    if (this.len > this.buf.length - 48) {
      this._grow(this.len)
    }
    this.buf[this.len++] = SEMI
    this.prevGenCol = 0
    this.lineHasSeg = false
    this.lastMapped = false
    this.pendingUnmapped = -1
  }

  private _grow(p: number): { buf: Uint8Array; cap: number } {
    const b = new Uint8Array(this.buf.length * 2)
    b.set(this.buf.subarray(0, p))
    this.buf = b
    return { buf: b, cap: b.length - 48 }
  }
}

function vlq(buf: Uint8Array, p: number, v: number): number {
  let n = v < 0 ? (-v << 1) | 1 : v << 1
  if (n < 32) {
    buf[p] = B64[n]!
    return p + 1
  }
  do {
    let d = n & 31
    n >>>= 5
    if (n > 0) {
      d |= 32
    }
    buf[p++] = B64[d]!
  } while (n > 0)
  return p
}
