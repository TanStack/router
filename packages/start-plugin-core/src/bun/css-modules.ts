import { createHash } from 'node:crypto'

/**
 * Match local class selectors, including compound forms (`.a.b`, `.a .b`, `.a[data-x]`).
 * Lookahead avoids false positives like `url(file.png)`.
 */
const CLASS_RE =
  /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)(?=[.#\s:\[{,~+>]|$)/g

/**
 * Minimal CSS Modules transform: hash local class names and emit an export map.
 * Supports compound selectors (`.a.b`, `.a .b`). Does not implement `:global` /
 * `composes` fully — good enough for common cases.
 */
export function transformCssModules(opts: {
  css: string
  filePath: string
}): { css: string; exports: Record<string, string> } {
  const hash = createHash('sha256')
    .update(opts.filePath)
    .digest('hex')
    .slice(0, 6)

  const exports: Record<string, string> = {}
  const renamed = new Map<string, string>()

  CLASS_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CLASS_RE.exec(opts.css)) !== null) {
    const local = match[1]
    if (!local || renamed.has(local)) {
      continue
    }
    const scoped = `${local}_${hash}`
    renamed.set(local, scoped)
    exports[local] = scoped
  }

  let css = opts.css
  for (const [local, scoped] of renamed) {
    const re = new RegExp(
      `\\.${escapeRegExp(local)}(?=[.#\\s:\\[{,~+>]|$)`,
      'g',
    )
    css = css.replace(re, `.${scoped}`)
  }

  return { css, exports }
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Return true for `*.module.css` (and similar) paths. */
export function isCssModulesFile(filePath: string): boolean {
  return /\.module\.(css|scss|sass|less)$/i.test(filePath.split('?')[0] ?? '')
}
