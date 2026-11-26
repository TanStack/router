/**
 * The class of a module by the package that owns it, decided once per
 * package root for a session and shared by every reader (the compile
 * scope, the summaries, the hosts' filters):
 *
 * - `app`: under the source directory, in no `node_modules`;
 * - `workspace`: in no `node_modules`, outside the source directory (a
 *   linked workspace package, a shared directory of the project);
 * - `start-package`: under `node_modules`, in a package whose manifest
 *   declares Start (`declaresStart`);
 * - `package`: any other module under `node_modules`.
 *
 * The class decides one thing: whether a module is read on demand (a
 * namespace's escape, a `Hydrate` re-export, a server function's reach, the
 * late pass). Summaries do not depend on it: every module an import
 * resolution reaches has one, whatever its package. Import protection's
 * verdicts never read it: a marker is honoured in every module the compiler
 * is handed.
 *
 * Paths are the bundler's (a real path, or the linked one under
 * `preserveSymlinks`); a manifest is read once per session, so a manifest
 * edited while a dev server runs takes effect at its next start.
 */
import { readFileSync } from 'node:fs'
import { normalizePath } from '../utils'
import type { CompileStartFrameworkOptions } from '../types'

export type ModuleClass = 'app' | 'workspace' | 'start-package' | 'package'

/** Start's own packages, of any framework: their `dependencies` on each other declare nothing. */
const START_OWN_RE = /^@tanstack\/(?:(?:react|solid|vue)-)?start/

/** Whether a package is one of Start's own (`resolve.noExternal` bundles them already). */
export function isStartPackage(name: unknown): boolean {
  return typeof name === 'string' && START_OWN_RE.test(name)
}

/**
 * Whether a manifest declares Start: one of the packages a Start value can
 * be imported from (`@tanstack/<framework>-start`, `start-client-core`,
 * `start-server-core`, `start-fn-stubs`, `@tanstack/<framework>-start-rsc`)
 * in `peerDependencies` (an optional peer counts), or in `dependencies` or
 * `optionalDependencies` unless the package is one of Start's own. A
 * `peerDependenciesMeta` entry without its peer declares nothing.
 */
export function declaresStart(
  manifest: Record<string, unknown>,
  framework: CompileStartFrameworkOptions,
): boolean {
  return (
    namesStart(manifest, 'peerDependencies', framework) ||
    (!isStartPackage(manifest['name']) &&
      (namesStart(manifest, 'dependencies', framework) ||
        namesStart(manifest, 'optionalDependencies', framework)))
  )
}

/**
 * Whether a manifest's `field` (a map of package names) names one of the
 * packages a Start value can be imported from (`declaresStart`'s names).
 */
export function namesStart(
  manifest: Record<string, unknown> | null,
  field: string,
  framework: CompileStartFrameworkOptions,
): boolean {
  const deps = manifest?.[field]
  return (
    typeof deps === 'object' &&
    deps !== null &&
    [
      `@tanstack/${framework}-start`,
      '@tanstack/start-client-core',
      '@tanstack/start-server-core',
      '@tanstack/start-fn-stubs',
      `@tanstack/${framework}-start-rsc`,
    ].some((name) => name in deps)
  )
}

const NODE_MODULES_SEGMENT = '/node_modules/'

/**
 * The root directory of the package a (normalized) path under
 * `node_modules` is in, by the path alone: the last `node_modules`
 * segment and the package name after it. Null outside `node_modules`.
 */
export function packageRootOf(normalizedPath: string): string | null {
  const at = normalizedPath.lastIndexOf(NODE_MODULES_SEGMENT)
  if (at < 0) {
    return null
  }
  const start = at + NODE_MODULES_SEGMENT.length
  let end = normalizedPath.indexOf('/', start)
  if (end >= 0 && normalizedPath[start] === '@') {
    end = normalizedPath.indexOf('/', end + 1)
  }
  return end < 0 ? null : normalizedPath.slice(0, end)
}

/**
 * The manifests a session reads (one read and parse per file) and the
 * classes of package roots.
 */
export class PackageClasses {
  private readonly manifests = new Map<string, Record<string, unknown> | null>()
  private readonly declared = new Map<string, boolean>()
  private readonly src: string | undefined

  constructor(
    private readonly opts: {
      framework: CompileStartFrameworkOptions
      srcDirectory: string | undefined
    },
  ) {
    this.src =
      opts.srcDirectory === undefined
        ? undefined
        : normalizePath(opts.srcDirectory).replace(/\/?$/, '/')
  }

  /** The parsed `package.json` at `file`, null when it is missing or no JSON object. */
  manifest(file: string): Record<string, unknown> | null {
    let manifest = this.manifests.get(file)
    if (manifest === undefined) {
      manifest = null
      try {
        const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
        if (typeof value === 'object' && value !== null) {
          manifest = value as Record<string, unknown>
        }
      } catch {
        // (missing or not JSON: no manifest)
      }
      this.manifests.set(file, manifest)
    }
    return manifest
  }

  /** Whether the package at `root` declares Start (its manifest, read once). */
  private declares(root: string): boolean {
    let v = this.declared.get(root)
    if (v === undefined) {
      const manifest = this.manifest(`${root}/package.json`)
      v = manifest !== null && declaresStart(manifest, this.opts.framework)
      this.declared.set(root, v)
    }
    return v
  }

  /** The class of the module at `file` (a path or an id: the query is ignored). */
  classOf(file: string): ModuleClass {
    const p = normalizePath(pathOf(file))
    const root = packageRootOf(p)
    if (root === null) {
      return this.src !== undefined && p.startsWith(this.src)
        ? 'app'
        : 'workspace'
    }
    return this.declares(root) ? 'start-package' : 'package'
  }

  /** Whether the module at `file` belongs to a package that declares Start. */
  startPackage(file: string): boolean {
    const root = packageRootOf(normalizePath(pathOf(file)))
    return root !== null && this.declares(root)
  }

  /**
   * Whether a module is read on demand like the app's: the app's, a
   * workspace package's, a Start package's (not a virtual module's, not an
   * ordinary package's).
   */
  readsOnDemand(file: string): boolean {
    if (file.startsWith('\0')) {
      return false
    }
    const root = packageRootOf(normalizePath(pathOf(file)))
    return root === null || this.declares(root)
  }
}

/** An id's path (its query cut off). */
function pathOf(id: string): string {
  const q = id.indexOf('?')
  return q < 0 ? id : id.slice(0, q)
}
