/**
 * The splice engine and v3 source-map builder (direct VLQ; no magic-string on
 * the emit path).
 *
 * - `SourceText`: one per input revision, shared by every output of a plan.
 *   Lines are ECMAScript line terminators by default (LF, CRLF, lone CR,
 *   U+2028, U+2029), which is what V8, oxc, esbuild, Babel and Yuku count.
 * - `OutputBuilder`: one per output. `copy()` appends original text with
 *   nested edits applied; `text()` appends generated glue (unmapped unless
 *   `mapTo` is given). Segments inside copied text sit at the start of every
 *   copy run, at the start of every word run and at every punctuator
 *   character; whitespace never starts one. The scan is syntax-agnostic.
 */

/** Runs in the bundler's process only: the environment is read once, not per copy. */
const DEV = process.env.NODE_ENV !== 'production'

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
        code.indexOf(' ') === -1 &&
        code.indexOf(' ') === -1)
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

export type BuilderEditPart =
  | { text: string; mapTo?: number }
  | { start: number; end: number; edits?: Array<BuilderEdit> }

export type BuilderEdit =
  | { kind: 'remove'; start: number; end: number }
  | {
      kind: 'replace'
      start: number
      end: number
      parts: Array<BuilderEditPart>
    }
  | { kind: 'insert'; at: number; text: string; mapTo?: number }

export interface OutputBuilderOptions {
  map?: boolean
}

/**
 * No `sourcesContent`: the map of one output would then hold the whole file,
 * and the webpack family hashes a module's map with its code, so an edit
 * anywhere in the file would hot-update every output of it (its route
 * module refreshing the route) where only the edited output changed. The
 * source is the file `sources` names (Vite's dev server reads it from there).
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
  }

  /** Appends original `[start, end)` with `edits` (sorted, non-overlapping) applied. */
  copy(start: number, end: number, edits?: ReadonlyArray<BuilderEdit>): void {
    let pos = start
    if (edits !== undefined) {
      if (DEV) {
        assertSortedEdits(edits, start, end)
      }
      for (const ed of edits) {
        if (ed.kind === 'insert') {
          if (ed.at > pos) {
            this._run(pos, (pos = ed.at))
          }
          this.text(ed.text, ed.mapTo)
          continue
        }
        if (ed.start > pos) {
          this._run(pos, ed.start)
        }
        if (ed.kind === 'replace') {
          for (const p of ed.parts) {
            if ('text' in p) {
              this.text(p.text, p.mapTo)
            } else {
              this.copy(p.start, p.end, p.edits)
            }
          }
        }
        pos = ed.end
      }
    }
    if (end > pos) {
      this._run(pos, end)
    }
  }

  /** Appends generated text. Unmapped unless `mapTo` gives the original offset it stands for. */
  text(t: string, mapTo?: number): void {
    if (t.length === 0) {
      return
    }
    this.code += t
    if (!this.withMap) {
      return
    }
    if (mapTo !== undefined) {
      this._locate(mapTo)
      this._seg(this.genCol, this.curLine, mapTo - this.curLineStart)
    } else if (this.lastMapped) {
      this._unmapped()
    }
    let nl = t.indexOf('\n')
    if (nl === -1) {
      this.genCol += t.length
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

  /** Ends the current line unless the output is empty or already ends with LF. */
  newline(): void {
    if (
      this.code.length > 0 &&
      this.code.charCodeAt(this.code.length - 1) !== 10
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
    if (!this.withMap) {
      return
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

    const ecma = this.src.ecma
    let prev = -1
    for (let i = s; i < e; i++) {
      const c = code.charCodeAt(i)
      let k: number
      if (c < 128) {
        k = CLS[c]!
        if (k >= LF) {
          if (k === CR && (!ecma || code.charCodeAt(i + 1) === 10)) {
            k = SPACE
          } else {
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

  /** A 1-field segment: generated glue after mapped code is not attributed to that code. */
  private _unmapped(): void {
    if (this.len > this.buf.length - 48) {
      this._grow(this.len)
    }
    const buf = this.buf
    let p = this.len
    if (this.lineHasSeg) {
      buf[p++] = COMMA
    }
    p = vlq(buf, p, this.genCol - this.prevGenCol)
    this.len = p
    this.prevGenCol = this.genCol
    this.lineHasSeg = true
    this.lastMapped = false
  }

  private _newline(): void {
    if (this.len > this.buf.length - 48) {
      this._grow(this.len)
    }
    this.buf[this.len++] = SEMI
    this.prevGenCol = 0
    this.lineHasSeg = false
    this.lastMapped = false
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

function assertSortedEdits(
  edits: ReadonlyArray<BuilderEdit>,
  start: number,
  end: number,
): void {
  let pos = start
  for (const ed of edits) {
    const s = ed.kind === 'insert' ? ed.at : ed.start
    const e = ed.kind === 'insert' ? ed.at : ed.end
    if (s < pos || e > end || e < s) {
      throw new Error(
        `OutputBuilder: edits must be sorted and non-overlapping inside [${start}, ${end}) (got [${s}, ${e}) after ${pos})`,
      )
    }
    pos = e
  }
}
