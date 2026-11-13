/**
 * Positions in an original file (a Vue SFC, an MDX page) of offsets of the
 * JavaScript another plugin compiled from it: the one owner of where the
 * compiler's refusals and import protection's reports point
 * (`originalPositions`). Through the input map when there is one; where
 * there is none or it covers no segment at an offset (a production build's
 * plugin or loader makes no map unless source maps are on), the statement's
 * line found by its text: the plugins keep the author's statements as
 * written, but tools after them may reprint them: blanks, quote styles and
 * `;` aside, a statement over several lines (SWC prints an object literal's
 * properties one per line). Never a position of the compiled code in the
 * original file (SPEC J6.5).
 */
import { readFileSync } from 'node:fs'
import { Locator, codeFrame } from '../import-protection/locate'
import type { CodeFrame, OriginalLocation } from '../import-protection/locate'
import type { InputSourceMap } from '@tanstack/router-utils/compiler'

/** Where an offset of a compile's input is in the original file, and its code frame there. */
export interface OriginalPositions {
  /** The position (a map's may be in another file it names), or null when none is known. */
  at: (offset: number) => OriginalLocation | null
  /** The code frame of a position `at` gave (null without the original text). */
  frame: (loc: OriginalLocation) => CodeFrame | null
}

/**
 * Positions in `file` of offsets of `code`, its text or another plugin's
 * output from it. A Vue SFC's script: through the input map, with the
 * column of the offset in its statement when the mapped line has the
 * statement's text (a map of whole lines: vue-loader in development);
 * without a map, the line holding the offset's statement when the SFC has
 * its text once. Other files: `code`'s own positions when it is the file's
 * text; else through the map (a position in a file it names), and where
 * there is none or it covers none, the statement's line by its text. Else
 * no position.
 */
export function originalPositions(
  file: string,
  code: string,
  inputMap: () => InputSourceMap | null,
): OriginalPositions {
  const locator = new Locator(code, file, inputMap)
  let text: string | undefined
  const original = () => (text ??= originalText(file, inputMap))
  const reprinted = reprintedLocator(code, original)
  /**
   * Without a map, whether `code` is the file's text (else its positions
   * are no file's). A module with no text to read (a virtual module) is its
   * code; an SFC never is.
   */
  let ownText: boolean | undefined
  const own = () => {
    if (ownText === undefined) {
      const read = file.endsWith('.vue') ? '' : readOriginal(file, inputMap)
      ownText = read === null || read === code
    }
    return ownText
  }
  const inFile = (loc: { line: number; column: number } | null) =>
    loc && { file, ...loc }
  return {
    at: (offset) => {
      if (inputMap() === null) {
        return own() ? locator.at(offset) : inFile(reprinted(offset))
      }
      const at = locator.at(offset)
      if (!file.endsWith('.vue')) {
        return at ?? inFile(reprinted(offset))
      }
      return at === null || at.file !== file
        ? null
        : inFile(reprinted(offset, at.line) ?? at)
    },
    frame: (loc) => {
      // (the map's text of the file, or `code` when it is the file's text)
      const framed = inputMap() !== null || own() ? locator.frame(loc) : null
      return (
        framed ??
        (loc.file === file ? codeFrame(original(), loc, /\r?\n/) : null)
      )
    },
  }
}

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
  return readOriginal(file, inputMap) ?? ''
}

/** `originalText`, or null when there is none to read (a virtual module, a file gone). */
function readOriginal(
  file: string,
  inputMap: () => InputSourceMap | null,
): string | null {
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
    return null
  }
}
