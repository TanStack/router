import { createHash } from 'node:crypto'

/**
 * Match local class selectors, including compound forms (`.a.b`, `.a .b`, `.a[data-x]`).
 * Only run on CSS that has had comments / strings / urls / @import stripped.
 */
const CLASS_RE =
  /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)(?=[.#\s:\[{,~+>]|$)/g

/**
 * Minimal CSS Modules transform: hash local class names and emit an export map.
 * Supports compound selectors (`.a.b`, `.a .b`). Does not implement `:global` /
 * `composes` fully — good enough for common cases.
 *
 * Non-selector regions (block comments, strings, `url(...)`, `@import`) are
 * protected so imports like `theme.module.css` and URLs like `a.b.png` are not rewritten.
 */
export function transformCssModules(opts: {
  css: string
  filePath: string
}): { css: string; exports: Record<string, string> } {
  const hash = createHash('sha256')
    .update(opts.filePath)
    .digest('hex')
    .slice(0, 6)

  const { text: protectedCss, restore } = protectNonSelectorCss(opts.css)

  const exports: Record<string, string> = {}
  const renamed = new Map<string, string>()

  CLASS_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CLASS_RE.exec(protectedCss)) !== null) {
    const local = match[1]
    if (!local || renamed.has(local)) {
      continue
    }
    const scoped = `${local}_${hash}`
    renamed.set(local, scoped)
    exports[local] = scoped
  }

  let css = protectedCss
  for (const [local, scoped] of renamed) {
    const re = new RegExp(
      `\\.${escapeRegExp(local)}(?=[.#\\s:\\[{,~+>]|$)`,
      'g',
    )
    css = css.replace(re, `.${scoped}`)
  }

  return { css: restore(css), exports }
}

/**
 * Replace comments, strings, urls, and @import rules with placeholders so class
 * rewriting only sees selector / declaration identifiers.
 */
function protectNonSelectorCss(css: string): {
  text: string
  restore: (value: string) => string
} {
  const regions: Array<string> = []
  const protect = (value: string): string => {
    const index = regions.length
    regions.push(value)
    // No leading `.` — must not look like a class selector to CLASS_RE.
    return `__TSS_CSS_PROT_${index}__`
  }

  let text = css
  // Order matters: protect @import before strings so the full rule restores cleanly.
  text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => protect(m))
  text = text.replace(/@import\b[^;]*;/gi, (m) => protect(m))
  text = text.replace(
    /url\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]+)\s*\)/gi,
    (m) => protect(m),
  )
  text = text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) =>
    protect(m),
  )

  return {
    text,
    restore(value: string) {
      let next = value
      for (let i = 0; i < regions.length + 2; i++) {
        const replaced = next.replace(
          /__TSS_CSS_PROT_(\d+)__/g,
          (_m, index: string) => regions[Number(index)] ?? '',
        )
        if (replaced === next) {
          break
        }
        next = replaced
      }
      return next
    },
  }
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Return true for `*.module.css` (and similar) paths. */
export function isCssModulesFile(filePath: string): boolean {
  return /\.module\.(css|scss|sass|less)$/i.test(filePath.split('?')[0] ?? '')
}
