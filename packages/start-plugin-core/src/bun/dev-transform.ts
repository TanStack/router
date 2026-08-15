/**
 * Dev-time on-demand ESM transform for Bun Start (Phase 2).
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize } from 'pathe'
import { rewriteImportMetaHot } from './hmr-runtime'
import type { CompileStartFrameworkOptions } from '../types'

export interface DevTransformOptions {
  root: string
  framework: CompileStartFrameworkOptions
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

function guessLoader(filePath: string): 'tsx' | 'ts' | 'jsx' | 'js' {
  const ext = extname(filePath)
  if (ext === '.tsx') return 'tsx'
  if (ext === '.jsx') return 'jsx'
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return 'ts'
  return 'js'
}

function toFsUrl(absPath: string): string {
  return `/@fs${absPath.startsWith('/') ? absPath : `/${absPath}`}`
}

/**
 * Rewrite bare and relative imports so the browser loads them through
 * the Bun Start transform middleware.
 */
export function rewriteImportsForDevMiddleware(
  code: string,
  filePath: string,
  root: string,
): string {
  const importRe =
    /(\bfrom\s+|\bimport\s*\(\s*)(['"])([^'"]+)\2|(\bimport\s+)(['"])([^'"]+)\5/g

  return code.replace(
    importRe,
    (
      full,
      fromOrDyn,
      q1,
      spec1,
      importKw,
      q2,
      spec2,
    ) => {
      const spec = (spec1 ?? spec2) as string
      const quote = (q1 ?? q2) as string
      const prefix = (fromOrDyn ?? importKw) as string
      const rewritten = rewriteOneSpecifier(spec, filePath, root)
      return `${prefix}${quote}${rewritten}${quote}`
    },
  )
}

function rewriteOneSpecifier(
  spec: string,
  filePath: string,
  root: string,
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
      const base = dirname(filePath)
      const resolved = spec.startsWith('file:')
        ? spec.replace(/^file:\/\//, '')
        : isAbsolute(spec)
          ? spec
          : normalize(join(base, spec))
      return `${toFsUrl(resolved)}`
    } catch {
      return spec
    }
  }

  // Bare specifier → resolve with Bun and serve via /@fs
  try {
    // Sync resolve is not always available; leave bare for async path
    return `/@id/${encodeURIComponent(spec)}?importer=${encodeURIComponent(filePath)}`
  } catch {
    return spec
  }
}

export async function resolveBareSpecifier(
  spec: string,
  importer: string,
): Promise<string | null> {
  try {
    return await Bun.resolve(spec, dirname(importer))
  } catch {
    try {
      return await Bun.resolve(spec, importer)
    } catch {
      return null
    }
  }
}

export async function transformDevModule(
  opts: DevTransformOptions,
  absPath: string,
): Promise<DevTransformResult> {
  const filePath = absPath.split('?')[0]!
  const code = await readFile(filePath, 'utf8')

  if (filePath.endsWith('.css')) {
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

  let next = code
  if (opts.transformAppModule && shouldTransformApp(filePath, opts.root)) {
    next = await opts.transformAppModule(next, filePath)
  }

  // Transpile TSX/TS with Bun
  if (APP_EXT.test(filePath)) {
    const loader = guessLoader(filePath)
    const transpiler = new Bun.Transpiler({ loader })
    next = transpiler.transformSync(next, loader)
  }

  if (opts.applyReactRefresh && opts.framework === 'react') {
    next = await opts.applyReactRefresh(next, filePath)
  }

  next = rewriteImportMetaHot(next)
  next = rewriteImportsForDevMiddleware(next, filePath, opts.root)

  return {
    code: next,
    contentType: 'text/javascript; charset=utf-8',
  }
}

function shouldTransformApp(filePath: string, root: string): boolean {
  const n = filePath.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  if (n.includes('/node_modules/')) return false
  return n.startsWith(r)
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
