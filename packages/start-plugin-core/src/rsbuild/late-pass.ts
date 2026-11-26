/**
 * The late pass's file types on Rsbuild, and the check that keeps the list
 * fail-closed. The late `post` rule reads the JavaScript other loaders make
 * of the file types below. Any loader can make JavaScript of another file
 * type (a `.foo` rule typed `javascript/auto`); such a module that names a
 * Start package would reach the client with its server code, so a
 * compilation holding one fails, naming the file.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { displayPath } from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../compiler/recognizer'
import type { Rspack } from '@rsbuild/core'

/** The loader of Start's compiler (every pass's). */
export const COMPILER_LOADER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'compiler-loader.js',
)

/** The file types whose JavaScript output the late pass compiles. */
const LATE_PASS_EXTENSIONS = [
  'vue',
  'svelte',
  'md',
  'mdx',
  'astro',
  'marko',
] as const

/** A resource path of the late pass's file types (its rule's `test`). */
export const LATE_PASS_RE = new RegExp(
  `\\.(?:${LATE_PASS_EXTENSIONS.join('|')})$`,
  'i',
)

/** A JS/TS resource path (the main pass's). */
const JS_FILE_RE = /\.[cm]?[jt]sx?$/

/**
 * A Start package named as a module specifier (the recognizer's packages,
 * not the routers': a page naming only the router is no Start use).
 */
const START_PACKAGE_RE = new RegExp(
  `['"](?:${Object.keys(startRecognizer().factories)
    .filter((specifier) => !specifier.endsWith('-router'))
    .map((specifier) => specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|')})(?:/[^'"]*)?['"]`,
)

/** What the check reads of an Rspack module. */
interface CheckedModule {
  resource?: string
  type?: string
  request?: string
  originalSource?: () => { source: () => string | Buffer } | null
}

/**
 * The message of a module the late pass does not read that names a Start
 * package: one Rspack parses as JavaScript, of a resource that is no JS/TS
 * file, with no loader of Start's compiler in its request. `null` for any
 * other module.
 */
function uncompiledStartModule(m: unknown, root: string): string | null {
  const module = m as CheckedModule
  const resource = module.resource
  if (!resource || !module.type?.startsWith('javascript')) {
    return null
  }
  const q = resource.indexOf('?')
  const file = q === -1 ? resource : resource.slice(0, q)
  if (JS_FILE_RE.test(file) || module.request?.includes(COMPILER_LOADER_PATH)) {
    return null
  }
  const source = module.originalSource?.()?.source()
  const text = typeof source === 'string' ? source : (source?.toString() ?? '')
  if (!START_PACKAGE_RE.test(text)) {
    return null
  }
  const extension = path.extname(file) || path.basename(file)
  return (
    `[tanstack-start] ${displayPath(file, root)}: Rspack parses this module as JavaScript (module type ` +
    `\`${module.type}\`) and it uses TanStack Start, but Start's compiler ` +
    `does not compile \`${extension}\` files: its late pass reads only ` +
    `${LATE_PASS_EXTENSIONS.map((e) => `.${e}`).join(', ')} output, so its ` +
    `server code would ship to the client. Move the Start code into a ` +
    `JS/TS module this file imports, or ask for \`${extension}\` to be ` +
    `added to the late pass's file types.`
  )
}

/**
 * The check of one compiler's compilations (or of a child compiler's): at
 * `finishModules`, the modules the compilation built (all of them in the
 * compiler's first compilation, which may restore them from a persistent
 * cache), and the ones that failed before and are still in the graph (a
 * module the compilation kept is not built again, and the compilation
 * reports it again).
 */
export function lateFileTypeCheck(
  root: string,
): (
  compilation: Rspack.Compilation,
  modules: Iterable<unknown>,
) => Array<{ message: string; module: unknown }> {
  /** Failed modules by resource, with their message. */
  const failed = new Map<string, string>()
  let first = true
  return (compilation, modules) => {
    const checked = first ? modules : compilation.builtModules
    first = false
    for (const m of checked) {
      const resource = (m as CheckedModule).resource
      if (resource === undefined) {
        continue
      }
      failed.delete(resource)
      const message = uncompiledStartModule(m, root)
      if (message !== null) {
        failed.set(resource, message)
      }
    }
    if (failed.size === 0) {
      return []
    }
    // (only when a module failed: a walk of the whole graph)
    const present = new Map<string, unknown>()
    for (const m of modules) {
      const resource = (m as CheckedModule).resource
      if (resource !== undefined && failed.has(resource)) {
        present.set(resource, m)
      }
    }
    const out: Array<{ message: string; module: unknown }> = []
    for (const [resource, message] of [...failed]) {
      const module = present.get(resource)
      if (module === undefined) {
        failed.delete(resource)
      } else {
        out.push({ message, module })
      }
    }
    return out
  }
}
