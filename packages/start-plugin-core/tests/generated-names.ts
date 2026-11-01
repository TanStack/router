/**
 * Name-agnostic checks of planner outputs: which name the core's allocator
 * generates for glue (a lazy component, an import's local, a handler export)
 * is free, so tests read it from the output instead of spelling it.
 */

/** A name the core's name allocator may generate. */
export const NAME = String.raw`[\p{ID_Start}$_][\p{ID_Continue}$]*`

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * `pattern` as a regular expression in which `«x»` is a generated name (the
 * first `«x»` captures it as `groups.x`, a later one is the same name) and
 * `«…»` is any text. Everything else is literal.
 */
export function shape(pattern: string): RegExp {
  const seen = new Set<string>()
  let source = ''
  let at = 0
  for (const m of pattern.matchAll(/«(\w+|…)»/g)) {
    source += literal(pattern.slice(at, m.index))
    const name = m[1]!
    source +=
      name === '…'
        ? '[\\s\\S]*?'
        : seen.has(name)
          ? `\\k<${name}>`
          : `(?<${name}>${NAME})`
    seen.add(name)
    at = m.index + m[0].length
  }
  source += literal(pattern.slice(at))
  return new RegExp(source, 'u')
}

/** The groups of `shape(pattern)` in `code` (fails the test when it does not match). */
export function namesIn(code: string, pattern: string): Record<string, string> {
  const m = shape(pattern).exec(code)
  if (!m) {
    throw new Error(`no ${pattern} in:\n${code}`)
  }
  return { ...m.groups }
}

/** The local name under which `code` imports `imported` from `specifier`. */
export function importedAs(
  code: string,
  imported: string,
  specifier: string,
): string {
  return namesIn(code, `import { ${imported} as «local» } from '${specifier}'`)
    .local!
}
