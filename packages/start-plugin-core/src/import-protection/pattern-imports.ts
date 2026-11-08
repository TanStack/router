/**
 * The pattern import that brought a denied file into an environment
 * (`import.meta.glob`, `import.meta.webpackContext`, `require.context`, a
 * template literal `import()`): the compiler reads none of them, so a report
 * finds the call in the importer's raw text when it is printed (a rare path:
 * nothing of it is computed while compiling).
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
  /** The string patterns of a glob's first argument, when it is a literal (a string or an array of strings). */
  patterns: Array<string> | null
}

const CALL_RE =
  /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(|import\.meta\.webpackContext\s*\(|require\.context\s*\(|import\s*\(\s*`/g

function kindOf(call: string): PatternImportKind {
  return call.startsWith('import.meta.glob')
    ? 'import.meta.glob'
    : call.startsWith('import.meta.webpackContext')
      ? 'import.meta.webpackContext'
      : call.startsWith('require')
        ? 'require.context'
        : 'import()'
}

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
      value += text[i + 1] ?? ''
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

/** The literal patterns of a glob call's first argument (`'…'` or `['…', '…']`). */
function globPatterns(text: string, at: number): Array<string> | null {
  at = skipSpace(text, at)
  const single = stringAt(text, at)
  if (single) {
    return [single.value]
  }
  if (text[at] !== '[') {
    return null
  }
  const out: Array<string> = []
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
  return out
}

/** Whether a glob's patterns (Vite's: relative to the importer, `/` the root) match `file`. */
function globMatches(
  patterns: Array<string>,
  importer: string,
  file: string,
  root: string,
): boolean {
  const absolute = (p: string) =>
    p.startsWith('/')
      ? path.posix.join(root, p)
      : path.posix.join(path.posix.dirname(importer), p)
  const positive = patterns.filter((p) => !p.startsWith('!')).map(absolute)
  const negative = patterns
    .filter((p) => p.startsWith('!'))
    .map((p) => absolute(p.slice(1)))
  return (
    positive.some((p) => picomatch.isMatch(file, p, { dot: true })) &&
    !negative.some((p) => picomatch.isMatch(file, p, { dot: true }))
  )
}

/**
 * The pattern import of `importer` (its raw text) that reached `file`: the
 * glob whose literal patterns match it, else the importer's first pattern
 * import (a webpack context or a template literal is not matched here).
 * Null when its text has none.
 */
export function findPatternImport(
  text: string,
  importer: string,
  file: string,
  root: string,
): PatternImport | null {
  let first: PatternImport | null = null
  CALL_RE.lastIndex = 0
  for (let m = CALL_RE.exec(text); m !== null; m = CALL_RE.exec(text)) {
    const kind = kindOf(m[0])
    const patterns =
      kind === 'import.meta.glob'
        ? globPatterns(text, m.index + m[0].length)
        : null
    const found: PatternImport = { kind, offset: m.index, patterns }
    if (patterns && globMatches(patterns, importer, file, root)) {
      return found
    }
    first ??= found
  }
  return first
}

/** `file` as a specifier relative to `importer` (`./x.ts`, `../lib/x.ts`). */
export function relativeSpecifier(importer: string, file: string): string {
  const rel = path.posix.relative(path.posix.dirname(importer), file)
  return rel.startsWith('.') ? rel : `./${rel}`
}
