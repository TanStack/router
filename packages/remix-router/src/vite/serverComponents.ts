/**
 * Vite plugin that rewrites every `serverComponent('id', factory)` call
 * so the second argument is gated behind `import.meta.env.SSR`. Vite's
 * environment-specific `define` then collapses the conditional at build
 * time:
 *
 *   serverComponent('@/foo', factoryFn)
 *     ↓ transform
 *   serverComponent('@/foo', import.meta.env.SSR ? factoryFn : null)
 *     ↓ Vite/rolldown DCE on the client build (SSR === false)
 *   serverComponent('@/foo', null)
 *
 * The factory body — and any imports only it referenced — gets
 * tree-shaken out of the client bundle. The runtime stub in
 * `serverComponent.tsx` handles the `null` arg by rendering an empty
 * span; the SSR-rendered `innerHTML` survives hydration via the
 * client's prerendered-HTML map.
 */

export interface RemixServerComponentsPluginOptions {
  /**
   * File extensions to scan. Defaults to JS/TS/JSX/TSX.
   */
  include?: ReadonlyArray<RegExp>
  /**
   * Whether to apply the transform during dev mode. Default `true` —
   * the transform is a no-op on the server side (where `SSR === true`)
   * and only matters on the client. Set `false` to keep dev builds
   * 1:1 with source.
   */
  applyInDev?: boolean
}

const DEFAULT_INCLUDE = [/\.[cm]?[jt]sx?$/]

// Match `serverComponent(<id-literal>, <factory>)`. The factory is
// captured as the rest-of-arguments substring so we can rewrite it.
//
// Caveats:
// - We require the call to be a top-level `serverComponent(...)` form
//   (no aliased imports). Build-time renaming will break detection;
//   document the convention.
// - String-based regex isn't AST-aware, so we won't catch calls hidden
//   in dynamic eval contexts. Real-world code wraps factories at the
//   module top-level — that's covered.
const CALL_RE =
  /\bserverComponent\s*\(\s*(['"`])((?:(?!\1).)+?)\1\s*,\s*/g

/**
 * Vite plugin entry point. Mount alongside the rest of your Vite
 * plugins; the `clientEntry` plugin from this package can sit next to
 * it without conflict (different transforms, different markers).
 */
export function remixServerComponents(
  opts: RemixServerComponentsPluginOptions = {},
) {
  const include = opts.include ?? DEFAULT_INCLUDE
  const applyInDev = opts.applyInDev ?? true

  return {
    name: '@tanstack/remix-router/serverComponents',
    enforce: 'pre' as const,

    transform(code: string, id: string, viteOptions?: { ssr?: boolean }) {
      if (!code.includes('serverComponent')) return null
      if (id.includes('node_modules/')) return null
      if (!include.some((re) => re.test(id))) return null
      // We only need to rewrite for the client build. Server keeps the
      // factory; the conditional collapses to the truthy branch at
      // build time anyway, so on the server the transform is a wash.
      // Skipping the rewrite on the server bundle keeps source maps
      // simpler.
      if (viteOptions?.ssr) return null

      const isDev =
        typeof process !== 'undefined' &&
        process.env.NODE_ENV !== 'production'
      if (isDev && !applyInDev) return null

      // Build a bitmap of comment ranges (line + block + JSDoc) and
      // string-literal ranges. We'll skip any `serverComponent(` match
      // whose offset falls inside one of these — that filters out
      // documentation examples and avoids accidentally rewriting code
      // we shouldn't touch.
      const skipMask = buildSkipMask(code)

      let touched = false
      const out = code.replace(
        CALL_RE,
        (match, _quote, _idLiteral, offset: number) => {
          if (skipMask[offset]) return match
          touched = true
          return `${match}/* SC */ import.meta.env.SSR ? (`
        },
      )

      if (!touched) return null

      // Walk the result, finding each `/* SC */ import.meta.env.SSR ? (`
      // marker and inserting `) : null)` at the matching close paren of
      // the enclosing serverComponent call. Paren-depth aware.
      const final = closeServerComponentCalls(out)

      return { code: final, map: null }
    },
  }
}

/**
 * Build a `Uint8Array`-backed skip mask: index → 1 if that character is
 * inside a comment or string literal, 0 otherwise. Cheap state machine,
 * no full lexer.
 */
function buildSkipMask(code: string): Uint8Array {
  const mask = new Uint8Array(code.length)
  let i = 0
  while (i < code.length) {
    const c = code[i]
    const n = code[i + 1]
    if (c === '/' && n === '/') {
      // Line comment.
      let j = i
      while (j < code.length && code[j] !== '\n') {
        mask[j] = 1
        j++
      }
      i = j
      continue
    }
    if (c === '/' && n === '*') {
      // Block / JSDoc comment.
      let j = i
      while (j < code.length) {
        mask[j] = 1
        if (code[j] === '*' && code[j + 1] === '/') {
          mask[j + 1] = 1
          j += 2
          break
        }
        j++
      }
      i = j
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      // String literal. Backticks include nested template expressions —
      // we DON'T mark those expressions as skip-zones (they're real
      // code), but we still don't want to match inside them as a
      // simplification. The cost is small; template-literal embedded
      // serverComponent calls are exotic.
      const quote = c
      let j = i
      mask[j] = 1
      j++
      while (j < code.length) {
        mask[j] = 1
        if (code[j] === '\\') {
          mask[j + 1] = 1
          j += 2
          continue
        }
        if (code[j] === quote) {
          j++
          break
        }
        j++
      }
      i = j
      continue
    }
    i++
  }
  return mask
}

/**
 * Find each `/* SC *​/ import.meta.env.SSR ? (` marker emitted by the
 * `transform` step and insert ` : null)` at the matching closing
 * paren that ends the surrounding `serverComponent(...)` call.
 *
 * Walks character-by-character respecting paren depth, single-/double-
 * /backtick string boundaries, and `//` / `/* *​/` comments. Not a full
 * JS parser — but enough for the well-formed call shapes the runtime
 * accepts.
 */
function closeServerComponentCalls(code: string): string {
  const MARKER = '/* SC */ import.meta.env.SSR ? ('
  const out: Array<string> = []
  let i = 0
  while (i < code.length) {
    const at = code.indexOf(MARKER, i)
    if (at === -1) {
      out.push(code.slice(i))
      break
    }
    out.push(code.slice(i, at + MARKER.length))
    // Now scan from `at + MARKER.length` to find the matching `)` that
    // closes the wrapping `serverComponent(...)` call. We started the
    // marker with an extra `(`, so we need depth=1 to bring us back to
    // the close.
    let j = at + MARKER.length
    let depth = 1 // we just opened one paren in the marker
    let inS: false | "'" | '"' | '`' = false
    let inLineComment = false
    let inBlockComment = false
    while (j < code.length) {
      const ch = code[j]!
      const next = code[j + 1]
      if (inLineComment) {
        if (ch === '\n') inLineComment = false
        j++
        continue
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          j += 2
          continue
        }
        j++
        continue
      }
      if (inS) {
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === inS) inS = false
        j++
        continue
      }
      if (ch === '/' && next === '/') {
        inLineComment = true
        j += 2
        continue
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true
        j += 2
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inS = ch as any
        j++
        continue
      }
      if (ch === '(') {
        depth++
        j++
        continue
      }
      if (ch === ')') {
        depth--
        if (depth === 0) {
          // We've reached the close of the serverComponent call's outer
          // paren. The factory expression sits between (at + MARKER.length)
          // and j (exclusive of the close paren). The original source
          // may have a trailing comma after the factory (multi-arg call
          // with prettier style); wrapping it as `(expr,) : null` is a
          // syntax error, so elide the trailing comma — and any
          // whitespace that followed it — when we close.
          let bodyEnd = j
          let trailing = ''
          // Walk back over whitespace.
          let k = j - 1
          while (k >= at + MARKER.length && /\s/.test(code[k]!)) {
            trailing = code[k] + trailing
            k--
          }
          if (k >= at + MARKER.length && code[k] === ',') {
            // Drop the comma — emit only the leading part + the trailing
            // whitespace after the close.
            bodyEnd = k
          } else {
            trailing = ''
          }
          const body = code.slice(at + MARKER.length, bodyEnd)
          out.push(body)
          out.push(') : null')
          out.push(trailing)
          out.push(')')
          j++
          break
        }
        j++
        continue
      }
      j++
    }
    if (depth !== 0) {
      // Couldn't find a close — bail by appending the rest verbatim.
      out.push(code.slice(at + MARKER.length))
      break
    }
    i = j
  }
  return out.join('')
}
