/**
 * Dev-time on-demand ESM transform for Bun Start (Phase 2).
 */

import { existsSync as nodeExistsSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize } from 'pathe'
import { rewriteImportMetaHot } from './hmr-runtime'
import { isNodeBuiltinSpecifier } from './node-builtin-stub'
import type { CompileStartFrameworkOptions } from '../types'

export interface DevTransformOptions {
  root: string
  framework: CompileStartFrameworkOptions
  /**
   * Start entry aliases (`#tanstack-router-entry` → app `src/router.tsx`, etc.).
   * Without these, package.json `imports` resolve to empty fake stubs.
   */
  aliases?: Record<string, string>
  /** Bun/Vite-style define replacements applied to transformed modules. */
  define?: Record<string, string>
  /** Optional Start/route preprocess (code-splitter + serverFn) */
  transformAppModule?: (
    code: string,
    absPath: string,
  ) => string | Promise<string>
  /** Optional React Refresh Babel transform */
  applyReactRefresh?: (
    code: string,
    absPath: string,
  ) => string | Promise<string>
}

export interface DevTransformResult {
  code: string
  contentType: string
}

const APP_EXT = /\.(m|c)?[jt]sx?$/
const TEXT_EXT = /\.(css|json|svg)$/
const RESOLVE_EXTS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
] as const

function guessLoader(filePath: string): 'tsx' | 'ts' | 'jsx' | 'js' {
  const ext = extname(filePath)
  if (ext === '.tsx') return 'tsx'
  if (ext === '.jsx') return 'jsx'
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return 'ts'
  return 'js'
}

/**
 * Bun.Transpiler emits `jsxDEV_7x81h0kn(...)` without an import (runtime
 * injects it when executing under Bun). Browsers need an explicit ESM import.
 * The suffix is stable on Bun 1.3.x.
 */
function injectBunJsxRuntimeImports(code: string): string {
  const needsDev = /\bjsxDEV_7x81h0kn\b/.test(code)
  const needsJsx =
    /\bjsx_7x81h0kn\b/.test(code) || /\bjsxs_7x81h0kn\b/.test(code)
  if (!needsDev && !needsJsx) return code

  const lines: Array<string> = []
  if (needsDev && !code.includes('jsxDEV as jsxDEV_7x81h0kn')) {
    lines.push(
      `import { jsxDEV as jsxDEV_7x81h0kn } from "react/jsx-dev-runtime";`,
    )
  }
  if (
    needsJsx &&
    !code.includes('jsx as jsx_7x81h0kn') &&
    !code.includes('jsxs as jsxs_7x81h0kn')
  ) {
    lines.push(
      `import { jsx as jsx_7x81h0kn, jsxs as jsxs_7x81h0kn } from "react/jsx-runtime";`,
    )
  }
  if (lines.length === 0) return code
  return `${lines.join('\n')}\n${code}`
}

function toFsUrl(absPath: string): string {
  return `/@fs${absPath.startsWith('/') ? absPath : `/${absPath}`}`
}

/**
 * Bun (and NODE_ENV=development) resolve `isServer` to server/development.
 * For the browser ESM graph we must force the client build.
 */
export function remapDualPackageForBrowser(absPath: string): string {
  const n = absPath.replace(/\\/g, '/')
  const swapped = n
    .replace(
      /\/isServer\/(server|development)(\.[cm]?[jt]sx?)$/,
      '/isServer/client$2',
    )
    .replace(
      /\/scroll-restoration-script\/(server|development)(\.[cm]?[jt]sx?)$/,
      '/scroll-restoration-script/client$2',
    )
    .replace(
      /\/ssr\/server(\.[cm]?[jt]sx?)$/,
      '/ssr/client$1',
    )
  return swapped
}

/** Sync existence check for extension probing. */
function isFileSync(path: string): boolean {
  try {
    return nodeExistsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve extensionless / index paths (and apply browser dual-package remap).
 */
export function resolveFsCandidate(absPath: string): string | null {
  const cleaned = normalize(absPath.split('?')[0]!)
  const remapped = remapDualPackageForBrowser(cleaned)
  for (const base of remapped === cleaned ? [cleaned] : [remapped, cleaned]) {
    for (const ext of RESOLVE_EXTS) {
      const candidate = `${base}${ext}`
      if (isFileSync(candidate)) return candidate
    }
  }
  return null
}

function resolveRelativeSpecifier(spec: string, filePath: string): string {
  const base = dirname(filePath)
  try {
    const resolved = Bun.resolveSync(spec, base)
    return remapDualPackageForBrowser(resolved)
  } catch {
    const joined = spec.startsWith('file:')
      ? spec.replace(/^file:\/\//, '')
      : isAbsolute(spec)
        ? spec
        : normalize(join(base, spec))
    return resolveFsCandidate(joined) ?? remapDualPackageForBrowser(joined)
  }
}

/**
 * Import / dynamic-import / side-effect import.
 * Must not run inside strings — a naive `String.replace` rewrites React
 * messages like `from " + componentName + "` into `/@id/...`, which becomes
 * `SyntaxError: illegal character U+0040`.
 */
const IMPORT_SPEC_RE =
  /(\bfrom\s+|\bimport\s*\(\s*)(['"])([^'"]+)\2|(\bimport\s+)(['"])([^'"]+)\5/y

function isPlausibleModuleSpecifier(spec: string): boolean {
  if (!spec || /[\s+]/.test(spec)) return false
  return /^(?:\.{1,2}\/|\/|file:|node:|data:|blob:|[A-Za-z@#])/.test(spec)
}

/**
 * Rewrite bare and relative imports so the browser loads them through
 * the Bun Start transform middleware.
 */
export function rewriteImportsForDevMiddleware(
  code: string,
  filePath: string,
  root: string,
  aliases?: Record<string, string>,
): string {
  let out = ''
  let i = 0
  const n = code.length

  while (i < n) {
    const c = code[i]!
    const c2 = code[i + 1]

    if (c === '/' && c2 === '/') {
      const end = code.indexOf('\n', i)
      const stop = end === -1 ? n : end + 1
      out += code.slice(i, stop)
      i = stop
      continue
    }

    if (c === '/' && c2 === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      out += code.slice(i, stop)
      i = stop
      continue
    }

    // Try import/from at this code position *before* treating `"` as a string.
    // Only probe at plausible starts (`import` / `from`) for large CJS bundles.
    if (c === 'i' || c === 'f') {
      IMPORT_SPEC_RE.lastIndex = i
      const m = IMPORT_SPEC_RE.exec(code)
      if (m && m.index === i) {
        const spec = (m[3] ?? m[6]) as string
        const quote = (m[2] ?? m[5]) as string
        const prefix = (m[1] ?? m[4]) as string
        if (isPlausibleModuleSpecifier(spec)) {
          out += `${prefix}${quote}${rewriteOneSpecifier(spec, filePath, root, aliases)}${quote}`
        } else {
          out += m[0]
        }
        i = m.index + m[0].length
        continue
      }
    }

    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      let j = i + 1
      while (j < n) {
        const ch = code[j]!
        if (ch === '\\') {
          j += 2
          continue
        }
        if (quote === '`' && ch === '$' && code[j + 1] === '{') {
          j += 2
          let depth = 1
          while (j < n && depth > 0) {
            const ec = code[j]!
            if (ec === '\\') {
              j += 2
              continue
            }
            if (ec === '`' || ec === "'" || ec === '"') {
              const q = ec
              j++
              while (j < n) {
                if (code[j] === '\\') {
                  j += 2
                  continue
                }
                if (q === '`' && code[j] === '$' && code[j + 1] === '{') {
                  j += 2
                  let d = 1
                  while (j < n && d > 0) {
                    if (code[j] === '{') d++
                    else if (code[j] === '}') d--
                    j++
                  }
                  continue
                }
                if (code[j] === q) {
                  j++
                  break
                }
                j++
              }
              continue
            }
            if (ec === '{') depth++
            else if (ec === '}') depth--
            j++
          }
          continue
        }
        if (ch === quote) {
          j++
          break
        }
        j++
      }
      out += code.slice(i, j)
      i = j
      continue
    }

    out += c
    i++
  }

  return out
}

function rewriteOneSpecifier(
  spec: string,
  filePath: string,
  root: string,
  aliases?: Record<string, string>,
): string {
  if (
    spec.startsWith('/@') ||
    spec.startsWith('/__') ||
    spec.startsWith('data:') ||
    spec.startsWith('blob:') ||
    spec.startsWith('http:') ||
    spec.startsWith('https:')
  ) {
    return spec
  }

  // Relative / absolute filesystem
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('file:')) {
    try {
      return toFsUrl(resolveRelativeSpecifier(spec, filePath))
    } catch {
      return spec
    }
  }

  // Start entry aliases must win over package.json fake stubs
  const aliased = aliases?.[spec]
  if (aliased) {
    return toFsUrl(remapDualPackageForBrowser(aliased))
  }

  // Node builtins must never hit /@fs (Bun.resolve returns "node:…" literally)
  if (isNodeBuiltinSpecifier(spec)) {
    return `/@id/${encodeURIComponent(spec)}?importer=${encodeURIComponent(filePath)}`
  }

  // Bare specifier → resolve to a stable /@fs URL so the browser dedupes
  // (especially `react` / `react-dom`). Prefer app root, then the importer.
  try {
    let resolved: string
    try {
      resolved = Bun.resolveSync(spec, root)
    } catch {
      resolved = Bun.resolveSync(spec, dirname(filePath))
    }
    return toFsUrl(remapDualPackageForBrowser(resolved))
  } catch {
    return `/@id/${encodeURIComponent(spec)}?importer=${encodeURIComponent(filePath)}`
  }
}

export async function resolveBareSpecifier(
  spec: string,
  importer: string,
  aliases?: Record<string, string>,
): Promise<string | null> {
  const aliased = aliases?.[spec]
  if (aliased) return remapDualPackageForBrowser(aliased)

  try {
    const resolved = await Bun.resolve(spec, dirname(importer))
    return remapDualPackageForBrowser(resolved)
  } catch {
    try {
      const resolved = await Bun.resolve(spec, importer)
      return remapDualPackageForBrowser(resolved)
    } catch {
      return null
    }
  }
}

/** Apply Bun/Vite-style define map (longer keys first). */
export function applyDefineReplacements(
  code: string,
  define?: Record<string, string>,
): string {
  if (!define) return code
  let next = code
  const keys = Object.keys(define).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const value = define[key]
    if (value === undefined || !next.includes(key)) continue
    next = next.split(key).join(value)
  }
  return next
}

function looksLikeCjs(code: string): boolean {
  return (
    /\bmodule\.exports\b/.test(code) ||
    /\bexports\.\w+\s*=/.test(code) ||
    (/\brequire\s*\(/.test(code) && !/\bimport\s+/.test(code))
  )
}

const cjsEsmCache = new Map<string, string>()

/** Bare deps externalized when entry lives under Bun's install cache. */
const CJS_BROWSER_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'react-dom/server',
  'scheduler',
] as const

async function tryBundleCjs(absPath: string): Promise<string | null> {
  // Externalize only React singletons. A catch-all "externalize every bare
  // import" makes Bun emit `__require("…")` stubs (e.g. with-selector →
  // use-sync-external-store/shim) that throw in the browser.
  const built = await Bun.build({
    entrypoints: [absPath],
    target: 'browser',
    format: 'esm',
    write: false,
    external: [...CJS_BROWSER_EXTERNALS],
  } as never)
  if (!built.success || !built.outputs[0]) return null
  const raw = await built.outputs[0].text()
  if (/\b__require\s*\(/.test(raw)) {
    // Remaining dynamic requires cannot run in the browser ESM graph.
    return null
  }
  return addCjsNamedReexports(softenNamespaceImportsForCjsReassign(raw))
}

/**
 * Bun turns `var React = require("react")` into `import * as React`, but
 * react/jsx-dev-runtime later does `React = { react_stack_bottom_frame }` —
 * illegal on an import binding. Mirror CJS with a mutable local.
 */
function softenNamespaceImportsForCjsReassign(code: string): string {
  return code.replace(
    /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\2\s*;?\s*$/gm,
    (full, name: string, quote: string, spec: string) => {
      if (!isIdentifierReassigned(code, name)) return full
      const tmp = `__import_${name}`
      return `import * as ${tmp} from ${quote}${spec}${quote};\nvar ${name} = ${tmp};`
    },
  )
}

/** True if `name` is assigned to (not declared / compared). */
function isIdentifierReassigned(code: string, name: string): boolean {
  const re = new RegExp(String.raw`\b${name}\s*=(?!=)`, 'g')
  for (const m of code.matchAll(re)) {
    const start = m.index ?? 0
    const before = code.slice(Math.max(0, start - 24), start)
    if (
      /\b(?:const|let|var)\s+$/.test(before) ||
      /\bexport\s+(?:const|let|var)\s+$/.test(before) ||
      /\bexport\s+$/.test(before)
    ) {
      continue
    }
    return true
  }
  return false
}

async function bundleCjsToEsm(absPath: string): Promise<string | null> {
  const cached = cjsEsmCache.get(absPath)
  if (cached) return cached
  try {
    const text = await tryBundleCjs(absPath)
    if (text) {
      cjsEsmCache.set(absPath, text)
      return text
    }
  } catch {
    // Cache-path entries may still fail resolve; nothing more to try.
  }
  return null
}

/**
 * Bun CJS→ESM only emits `export default`. Browser named imports need
 * matching `export const …`. Collect keys from `exports.foo =` in the
 * bundle (covers react, use-sync-external-store, etc.).
 */
function collectCjsExportNames(bundledEsm: string): Array<string> {
  const names = new Set<string>()
  for (const m of bundledEsm.matchAll(
    /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
  )) {
    const name = m[1]!
    if (name !== '__esModule' && name !== 'default') names.add(name)
  }
  return [...names]
}

function addCjsNamedReexports(bundledEsm: string): string {
  if (!/export\s+default\s+/.test(bundledEsm)) return bundledEsm

  const names = collectCjsExportNames(bundledEsm)
  const namedBlock =
    names.length > 0
      ? names.map((n) => `export const ${n} = __cjsMod.${n};`).join('\n')
      : // Fallback when the CJS wrapper hides `exports.*` (rare)
        `export const {
  jsx,
  jsxs,
  jsxDEV,
  Fragment,
  createElement,
  useSyncExternalStoreWithSelector,
} = __cjsMod || {};`

  const replaced = bundledEsm.replace(
    /export\s+default\s+([^;]+);?\s*$/,
    `const __cjsMod = $1;
export default __cjsMod;
${namedBlock}
`,
  )
  return replaced === bundledEsm ? bundledEsm : replaced
}

export async function transformDevModule(
  opts: DevTransformOptions,
  absPath: string,
): Promise<DevTransformResult> {
  const qIndex = absPath.indexOf('?')
  const pathPart = qIndex >= 0 ? absPath.slice(0, qIndex) : absPath
  const query = qIndex >= 0 ? absPath.slice(qIndex) : ''
  const filePath = (resolveFsCandidate(pathPart) ?? pathPart.split('?')[0])!
  /** Preserve `?tsr-split=` / `?tsr-shared=` for the code-splitter. */
  const moduleId = `${filePath}${query}`

  const code = await readFile(filePath, 'utf8')

  if (filePath.endsWith('.css')) {
    // `import x from './file.css?url'` must export a stylesheet URL, not raw
    // CSS (raw `@import "tailwindcss"` would 404 as `/tailwindcss`).
    if (/(?:^\?|&)url(?:=|&|$)/.test(query) || query === '?url') {
      return {
        code: `export default ${JSON.stringify('/@tanstack-start/styles.css')}`,
        contentType: 'text/javascript; charset=utf-8',
      }
    }
    const escaped = JSON.stringify(code)
    return {
      code: `const css = ${escaped};
if (typeof document !== 'undefined') {
  const el = document.createElement('style');
  el.setAttribute('data-tanstack-dev-css', ${JSON.stringify(filePath)});
  el.textContent = css;
  document.head.appendChild(el);
}
export default css;
`,
      contentType: 'text/javascript; charset=utf-8',
    }
  }

  if (filePath.endsWith('.json')) {
    return {
      code: `export default ${code}`,
      contentType: 'text/javascript; charset=utf-8',
    }
  }

  // CJS packages (react/jsx-runtime, etc.) → ESM bundle for the browser
  if (looksLikeCjs(code)) {
    const bundled = await bundleCjsToEsm(filePath)
    if (bundled) {
      return {
        code: applyDefineReplacements(
          rewriteImportsForDevMiddleware(
            rewriteImportMetaHot(bundled),
            filePath,
            opts.root,
            opts.aliases,
          ),
          opts.define,
        ),
        contentType: 'text/javascript; charset=utf-8',
      }
    }
  }

  let next = code
  if (opts.transformAppModule && shouldTransformApp(filePath, opts.root)) {
    next = await opts.transformAppModule(next, moduleId)
  }

  // Transpile TSX/TS with Bun
  if (APP_EXT.test(filePath)) {
    const loader = guessLoader(filePath)
    const transpiler = new Bun.Transpiler({ loader })
    next = transpiler.transformSync(next, loader)
    next = injectBunJsxRuntimeImports(next)
  }

  if (opts.applyReactRefresh && opts.framework === 'react') {
    next = await opts.applyReactRefresh(next, filePath)
  }

  next = rewriteImportMetaHot(next)
  next = rewriteImportsForDevMiddleware(
    next,
    filePath,
    opts.root,
    opts.aliases,
  )
  next = applyDefineReplacements(next, opts.define)

  return {
    code: next,
    contentType: 'text/javascript; charset=utf-8',
  }
}

function shouldTransformApp(filePath: string, root: string): boolean {
  const n = filePath.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  if (n.startsWith(r) && !n.includes('/node_modules/')) return true
  // ESM-dev serves workspace / published Start packages as raw files. Without
  // the Start compiler, `createIsomorphicFn().client().server()` keeps the
  // uncompiled runtime fallback (server impl wins) → ALS errors on the client.
  if (
    n.includes('/start-client-core/') ||
    n.includes('/@tanstack/start-client-core/') ||
    n.includes('/packages/react-start/') ||
    n.includes('/@tanstack/react-start/') ||
    n.includes('/packages/solid-start/') ||
    n.includes('/@tanstack/solid-start/') ||
    n.includes('/packages/vue-start/') ||
    n.includes('/@tanstack/vue-start/')
  ) {
    return true
  }
  return false
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export function isTransformablePath(pathname: string): boolean {
  return (
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/@id/') ||
    pathname.startsWith('/src/') ||
    APP_EXT.test(pathname) ||
    TEXT_EXT.test(pathname)
  )
}
