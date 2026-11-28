/**
 * The late pass's file types on Rsbuild, and the check that keeps the list
 * fail-closed. The late `post` rule reads the JavaScript other loaders make
 * of the file types below. Any loader can make JavaScript of another file
 * type (a `.foo` rule typed `javascript/auto`); such a module that imports
 * a Start package would reach the client with its server code, so a
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
 * The Start packages a module may import (the recognizer's packages, not
 * the routers': a page importing only the router is no Start use).
 */
const START_PACKAGES = Object.keys(startRecognizer().factories).filter(
  (specifier) => !specifier.endsWith('-router'),
)

/** What the check reads of an Rspack module or async block. */
interface DependencyHolder {
  dependencies?: ReadonlyArray<{ request?: string }>
  blocks?: ReadonlyArray<DependencyHolder>
}

/** What the check reads of an Rspack module. */
interface CheckedModule extends DependencyHolder {
  resource?: string
  type?: string
  request?: string
  identifier: () => string
}

/**
 * The Start package a module (or async block) imports, if any: a request
 * of the dependencies Rspack parsed (static and dynamic imports, `require`),
 * not its text (a string quoting a package is no import).
 */
function startImportOf(holder: DependencyHolder): string | null {
  for (const dependency of holder.dependencies ?? []) {
    const request = dependency.request
    if (
      request !== undefined &&
      START_PACKAGES.some(
        (specifier) =>
          request === specifier || request.startsWith(`${specifier}/`),
      )
    ) {
      return request
    }
  }
  for (const block of holder.blocks ?? []) {
    const request = startImportOf(block)
    if (request !== null) {
      return request
    }
  }
  return null
}

/**
 * The file of a module the late pass does not read, which the check reads:
 * one Rspack parses as JavaScript, of a resource that is no JS/TS file, with
 * no loader of Start's compiler in its request. `null` for any other module
 * (the same for every build of a module: its identifier holds its request).
 */
function uncompiledFile(module: CheckedModule): string | null {
  const resource = module.resource
  if (!resource || !module.type?.startsWith('javascript')) {
    return null
  }
  const q = resource.indexOf('?')
  const file = q === -1 ? resource : resource.slice(0, q)
  return JS_FILE_RE.test(file) || module.request?.includes(COMPILER_LOADER_PATH)
    ? null
    : file
}

/** The error of an uncompiled module (`uncompiledFile`) that imports a Start package, else `null`. */
function startUseMessage(
  module: CheckedModule,
  file: string,
  root: string,
): string | null {
  const request = startImportOf(module)
  if (request === null) {
    return null
  }
  const extension = path.extname(file) || path.basename(file)
  return (
    `[tanstack-start] ${displayPath(file, root)}: Rspack parses this module as JavaScript (module type ` +
    `\`${module.type}\`) and it imports \`${request}\`, but Start's compiler ` +
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
  /**
   * Failed modules by identifier (one file can be several modules: a
   * loader's request, a layer), with their message.
   */
  const failed = new Map<string, string>()
  let first = true
  return (compilation, modules) => {
    const checked = first ? modules : compilation.builtModules
    first = false
    for (const m of checked) {
      const module = m as CheckedModule
      const file = uncompiledFile(module)
      if (file === null) {
        continue
      }
      const id = module.identifier()
      failed.delete(id)
      const message = startUseMessage(module, file, root)
      if (message !== null) {
        failed.set(id, message)
      }
    }
    if (failed.size === 0) {
      return []
    }
    // (only when a module failed: a walk of the whole graph)
    const present = new Map<string, unknown>()
    for (const m of modules) {
      const module = m as CheckedModule
      if (uncompiledFile(module) !== null) {
        const id = module.identifier()
        if (failed.has(id)) {
          present.set(id, m)
        }
      }
    }
    const out: Array<{ message: string; module: unknown }> = []
    for (const [id, message] of [...failed]) {
      const module = present.get(id)
      if (module === undefined) {
        failed.delete(id)
      } else {
        out.push({ message, module })
      }
    }
    return out
  }
}
