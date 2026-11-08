/**
 * The pattern import that brought a denied file into an environment
 * (`import.meta.glob`, `import.meta.webpackContext`, `require.context`, an
 * `import()` with a variable path): the compiler reads none of them, so a
 * report finds the call in the importer's raw text when it is printed (a rare
 * path: nothing of it is computed while compiling).
 */
import path from 'node:path'
import picomatch from 'picomatch'

export type PatternImportKind =
  | 'import.meta.glob'
  | 'import.meta.webpackContext'
  | 'require.context'
  | 'import()'

export interface PatternImport {
  kind: PatternImportKind
  /** UTF-16 offset of the call in the importer's text. */
  offset: number
  /**
   * The string patterns of a glob's first argument, when they are literal (a
   * string or an array of strings) and relative to the importer or the root
   * (no alias, no `base` option): the patterns a negative pattern extends.
   */
  patterns: Array<string> | null
}

/** A comment or a string literal's comment-free form (`/*…*\/`, `//…`). */
const COMMENT = String.raw`\/\*[\s\S]*?\*\/`
const CALL_RE = new RegExp(
  [
    String.raw`import\.meta\.glob\b`,
    String.raw`import\.meta\.webpackContext\s*\(`,
    String.raw`require\.context\s*\(`,
    // an import() whose path has a variable part: a template literal or a concatenation
    String.raw`import\s*\(\s*(?:${COMMENT}\s*)*(?:\x60|(?:'[^'\n]*'|"[^"\n]*")\s*\+)`,
  ].join('|'),
  'g',
)

function kindOf(call: string): PatternImportKind {
  return call.startsWith('import.meta.glob')
    ? 'import.meta.glob'
    : call.startsWith('import.meta.webpackContext')
      ? 'import.meta.webpackContext'
      : call.startsWith('require')
        ? 'require.context'
        : 'import()'
}

/**
 * The ranges of the comments and string literals of `text` (template
 * literals whole): a call written in one is no call. Regular expression
 * literals are not told apart (a quote in one can shift the ranges).
 */
function inertRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    let end = -1
    if (c === '/' && text[i + 1] === '/') {
      end = text.indexOf('\n', i)
      end = end < 0 ? text.length : end
    } else if (c === '/' && text[i + 1] === '*') {
      end = text.indexOf('*/', i + 2)
      end = end < 0 ? text.length : end + 2
    } else if (c === "'" || c === '"' || c === '`') {
      end = i + 1
      while (end < text.length && text[end] !== c) {
        end += text[end] === '\\' ? 2 : 1
      }
      end = Math.min(text.length, end + 1)
    }
    if (end > i) {
      ranges.push([i, end])
      i = end - 1
    }
  }
  return ranges
}

const inside = (ranges: Array<[number, number]>, offset: number) =>
  ranges.some(([start, end]) => offset >= start && offset < end)

/** A JS string literal at `at` (quote included), or null. */
function stringAt(
  text: string,
  at: number,
): { value: string; end: number } | null {
  const quote = text[at]
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return null
  }
  let value = ''
  for (let i = at + 1; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\') {
      // (an escape other than a quote or a backslash: not a plain pattern)
      const next = text[i + 1] ?? ''
      if (next !== quote && next !== '\\') {
        return null
      }
      value += next
      i++
    } else if (c === quote) {
      return { value, end: i + 1 }
    } else if (quote === '`' && c === '$' && text[i + 1] === '{') {
      return null
    } else {
      value += c
    }
  }
  return null
}

const skipSpace = (text: string, at: number) => {
  while (at < text.length && /\s/.test(text[at]!)) {
    at++
  }
  return at
}

/** Past a type argument list `<…>` at `at` (nested), or `at`. */
function skipTypeArguments(text: string, at: number): number {
  if (text[at] !== '<') {
    return at
  }
  let depth = 0
  for (let i = at; i < text.length; i++) {
    if (text[i] === '<') {
      depth++
    } else if (text[i] === '>' && text[i - 1] !== '=') {
      depth--
      if (depth === 0) {
        return i + 1
      }
    }
  }
  return at
}

/** Whether a pattern is one a negative pattern relative to the importer can extend. */
const relativePattern = (p: string) =>
  /^!?(?:\.\.?\/|\/)/.test(p) && !p.includes('\\')

/**
 * The literal patterns of a glob call whose `(` is at `at` (`'…'` or
 * `['…', '…']`, with no `base` option); null when they are not plain.
 */
function globPatterns(text: string, at: number): Array<string> | null {
  at = skipSpace(text, at + 1)
  const out: Array<string> = []
  const single = stringAt(text, at)
  if (single) {
    out.push(single.value)
    at = single.end
  } else if (text[at] === '[') {
    at = skipSpace(text, at + 1)
    while (text[at] !== ']') {
      const s = stringAt(text, at)
      if (!s) {
        return null
      }
      out.push(s.value)
      at = skipSpace(text, s.end)
      if (text[at] === ',') {
        at = skipSpace(text, at + 1)
      } else if (text[at] !== ']') {
        return null
      }
    }
    at++
  } else {
    return null
  }
  // the options: a `base` makes the patterns relative to another directory
  at = skipSpace(text, at)
  if (text[at] === ',') {
    const close = text.indexOf(')', at)
    if (/\bbase\s*:/.test(text.slice(at, close < 0 ? undefined : close))) {
      return null
    }
  }
  return out.every(relativePattern) ? out : null
}

/**
 * Whether a glob's patterns (relative to the importer, `/` the root) match
 * `file`. Matched relative to the importer's directory, so its own name is
 * never read as a pattern (`routes/(auth)/`).
 */
function globMatches(
  patterns: Array<string>,
  importer: string,
  file: string,
  root: string,
): boolean {
  const dir = path.posix.dirname(importer)
  // (a `/` pattern against the path from the root, another from the importer's directory)
  const test = (p: string) =>
    p.startsWith('/')
      ? picomatch.isMatch(path.posix.relative(root, file), p.slice(1), {
          dot: true,
        })
      : picomatch.isMatch(
          path.posix.relative(dir, file),
          path.posix.normalize(p),
          { dot: true },
        )
  return (
    patterns.some((p) => !p.startsWith('!') && test(p)) &&
    !patterns.some((p) => p.startsWith('!') && test(p.slice(1)))
  )
}

/**
 * The pattern import of `importer` (its raw text) that reached `file`: the
 * literal glob whose patterns match it, else the first call that may have
 * (a glob whose patterns are not plain, a webpack context, an `import()` with
 * a variable path). A literal glob that does not match it is never named.
 * Null when there is none.
 */
export function findPatternImport(
  text: string,
  importer: string,
  file: string,
  root: string,
): PatternImport | null {
  const inert = inertRanges(text)
  let candidate: PatternImport | null = null
  const re = new RegExp(CALL_RE.source, 'g')
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (inside(inert, m.index)) {
      continue
    }
    const kind = kindOf(m[0])
    let patterns: Array<string> | null = null
    if (kind === 'import.meta.glob') {
      const open = skipSpace(
        text,
        skipTypeArguments(text, skipSpace(text, m.index + m[0].length)),
      )
      if (text[open] !== '(') {
        continue
      }
      patterns = globPatterns(text, open)
      if (patterns) {
        if (globMatches(patterns, importer, file, root)) {
          return { kind, offset: m.index, patterns }
        }
        continue
      }
    }
    candidate ??= { kind, offset: m.index, patterns: null }
  }
  return candidate
}

/**
 * Whether `text` holds any pattern import (outside comments and strings).
 * An importer without one reached a file through an import another
 * plugin's transform added to it (an auto-import).
 */
export function hasPatternImport(text: string): boolean {
  const inert = inertRanges(text)
  const re = new RegExp(CALL_RE.source, 'g')
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (!inside(inert, m.index)) {
      return true
    }
  }
  return false
}

/** `file` as a specifier relative to `importer` (`./x.ts`, `../lib/x.ts`). */
export function relativeSpecifier(importer: string, file: string): string {
  const rel = path.posix.relative(path.posix.dirname(importer), file)
  return rel.startsWith('./') || rel.startsWith('../') ? rel : `./${rel}`
}
