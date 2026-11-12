/**
 * Positions in an original file (a Vue SFC, an MDX page) of offsets of the
 * JavaScript another plugin compiled from it, where no map gives one: a
 * production build's plugin or loader makes no map unless source maps are
 * on, and a map may cover no segment at an offset. The plugins keep the
 * author's statements as written, but tools after them may reprint them:
 * blanks, quote styles and `;` aside, a statement over several lines (SWC
 * prints an object literal's properties one per line).
 */
import { readFileSync } from 'node:fs'
import type { InputSourceMap } from '@tanstack/router-utils/compiler'

/** How many compiled lines a statement may span on each side of the offset's. */
const SPAN = 8

/** What a tool reprinting a statement may change: blanks, quote styles, `;`. */
const squash = (text: string) => text.replace(/[\s;]+/g, '').replace(/"/g, "'")

/**
 * The position of a compiled offset in `original`: the line holding the
 * offset's statement, when exactly one line of `original` has its text (a
 * run of compiled lines around the offset's, up to `SPAN` on each side;
 * `onLine`: only that line, the one a map of whole lines gave), and the
 * column of the offset in it. Else null (text on two lines is no
 * position).
 */
export function reprintedLocator(
  code: string,
  original: () => string,
): (
  offset: number,
  onLine?: number,
) => { line: number; column: number } | null {
  let lines: Array<{ start: number; text: string }> | undefined
  let originalLines: Array<string> | undefined
  /** Original line numbers (1-based) by their squashed text. */
  let byText: Map<string, Array<number>> | undefined
  return (offset, onLine) => {
    if (offset < 0 || offset > code.length) {
      return null
    }
    if (!lines || !originalLines || !byText) {
      lines = []
      for (let start = 0; start <= code.length; ) {
        const end = code.indexOf('\n', start)
        const stop = end === -1 ? code.length : end
        lines.push({ start, text: code.slice(start, stop) })
        start = stop + 1
      }
      originalLines = original().split(/\r?\n/)
      byText = new Map()
      for (const [i, text] of originalLines.entries()) {
        const key = squash(text)
        if (key !== '') {
          const at = byText.get(key)
          if (at) {
            at.push(i + 1)
          } else {
            byText.set(key, [i + 1])
          }
        }
      }
    }
    let i = 0
    for (let lo = 0, hi = lines.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1
      if (lines[mid]!.start <= offset) {
        i = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    // the offset's place in its statement: the kept characters before it
    const before = squash(code.slice(lines[i]!.start, offset)).length
    let found: { line: number; kept: number } | null = null
    let prefix = ''
    for (let k = 0; k <= SPAN && i - k >= 0; k++) {
      if (k > 0) {
        prefix = squash(lines[i - k]!.text) + prefix
      }
      let text = prefix
      for (let m = 0; m <= SPAN && i + m < lines.length; m++) {
        text += squash(lines[i + m]!.text)
        for (const line of byText.get(text) ?? []) {
          if (onLine !== undefined && line !== onLine) {
            continue
          }
          if (found && found.line !== line) {
            return null
          }
          found = { line, kept: prefix.length + before }
        }
      }
    }
    if (!found) {
      return null
    }
    // the column of the kept character the offset is at in the original line
    const text = originalLines[found.line - 1]!
    let seen = 0
    for (let c = 0; c < text.length; c++) {
      if (!/[\s;]/.test(text[c]!)) {
        if (seen === found.kept) {
          return { line: found.line, column: c + 1 }
        }
        seen++
      }
    }
    return { line: found.line, column: text.length + 1 }
  }
}

/**
 * The text of `file` the input map was made from (its source whose path
 * ends with the file's name), else the file's on disk.
 */
export function originalText(
  file: string,
  inputMap: () => InputSourceMap | null,
): string {
  const map = inputMap()
  const name = file.slice(file.lastIndexOf('/') + 1)
  const index = map?.sources.findIndex(
    (s) => typeof s === 'string' && s.split('?')[0]!.endsWith(name),
  )
  const content =
    index === undefined || index < 0 ? null : map?.sourcesContent?.[index]
  if (typeof content === 'string') {
    return content
  }
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}
