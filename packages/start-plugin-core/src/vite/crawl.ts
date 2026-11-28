/**
 * Which dependency names Vite must keep out of the optimizer
 * (`optimizeDeps.exclude`) and bundle for SSR (`ssr.noExternal`): those
 * whose package declares Start (`declaresStart`), so that the compiler
 * transforms their Start APIs, which the optimizer and Node would load
 * uncompiled.
 *
 * The walk starts at the app's nearest manifest and reads its
 * `dependencies`, installed `optionalDependencies` and `devDependencies`.
 * It goes on through every package that declares Start and every workspace
 * package (a real path outside `node_modules`; their `devDependencies`
 * too), and stops at any other installed package. A name is the dependency
 * KEY its importer wrote: an npm alias keeps its alias, which is what Vite
 * matches, and two aliases of one package instance give two names.
 *
 * Its reach is limited to chains Vite transforms: a Start package imported
 * through an ordinary installed parent stays behind that parent, which Vite
 * optimizes in dev and keeps external on the server, whatever the walk
 * lists (the parent must be `ssr.noExternal` itself).
 *
 * Each key is resolved with one `realpath` per `node_modules` level (the
 * walk vitefu does, without its synchronous `realpath` per path); each
 * manifest is read, parsed and classified once per walk. Under Yarn PnP,
 * vitefu resolves. With `preserveSymlinks`, paths stay as linked, so a
 * linked workspace package is a package of `node_modules`, as the compiler
 * classes see it.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { findClosestPkgJsonPath, findDepPkgJsonPath } from 'vitefu'
import { declaresStart } from '../compiler/package-class'
import { normalizePath } from '../utils'
import type { CompileStartFrameworkOptions } from '../types'

const IN_PACKAGES = /[\\/]node_modules[\\/]/

type Manifest = Record<string, unknown>

async function readManifest(file: string): Promise<Manifest | null> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    return typeof value === 'object' && value !== null
      ? (value as Manifest)
      : null
  } catch {
    return null
  }
}

/**
 * What the walk found from `root`: the names of the dependencies that
 * declare Start (sorted: Vite's configuration), and the directories of the
 * package instances they name (as the bundler names their modules: what a
 * diagnostic compares a module's package with).
 */
export interface StartPackages {
  names: Array<string>
  roots: Set<string>
}

export async function crawlStartPackages(
  root: string,
  framework: CompileStartFrameworkOptions,
  opts: { preserveSymlinks?: boolean } = {},
): Promise<StartPackages> {
  const resolveManifest = async (
    key: string,
    dir: string,
  ): Promise<string | null> => {
    if (process.versions.pnp) {
      const found = await findDepPkgJsonPath(key, dir)
      return found ?? null
    }
    for (let at = dir; ; ) {
      const file = path.join(at, 'node_modules', key, 'package.json')
      try {
        if (opts.preserveSymlinks) {
          await fs.stat(file)
          return file
        }
        return await fs.realpath(file)
      } catch {
        // (not installed at this level)
      }
      const up = path.dirname(at)
      if (up === at) {
        return null
      }
      at = up
    }
  }

  const names = new Set<string>()
  const roots = new Set<string>()
  /** By manifest path, whether it declares Start (each read and classified once). */
  const checked = new Map<string, Promise<boolean>>()
  const visits: Array<Promise<void>> = []

  const visit = async (file: string, manifest: Manifest, isRoot: boolean) => {
    const keys = (field: string) => {
      const deps = manifest[field]
      return typeof deps === 'object' && deps !== null ? Object.keys(deps) : []
    }
    // (an optional dependency that is not installed resolves to nothing)
    const deps = new Set([
      ...keys('dependencies'),
      ...keys('optionalDependencies'),
      ...(isRoot || !IN_PACKAGES.test(file) ? keys('devDependencies') : []),
    ])
    await Promise.all(
      [...deps].map(async (key) => {
        const found = await resolveManifest(key, path.dirname(file))
        if (found !== null && (await check(found))) {
          names.add(key)
          roots.add(normalizePath(path.dirname(found)))
        }
      }),
    )
  }

  const check = (file: string): Promise<boolean> => {
    let declares = checked.get(file)
    if (declares === undefined) {
      declares = readManifest(file).then((manifest) => {
        if (manifest === null) {
          return false
        }
        const start = declaresStart(manifest, framework)
        // (queued, not awaited: a cycle of packages cannot wait on itself)
        if (start || !IN_PACKAGES.test(file)) {
          visits.push(visit(file, manifest, false))
        }
        return start
      })
      checked.set(file, declares)
    }
    return declares
  }

  const closest = await findClosestPkgJsonPath(root)
  if (closest) {
    const file = opts.preserveSymlinks ? closest : await fs.realpath(closest)
    const manifest = await readManifest(file)
    if (manifest !== null) {
      checked.set(file, Promise.resolve(declaresStart(manifest, framework)))
      visits.push(visit(file, manifest, true))
    }
  }
  while (visits.length > 0) {
    await Promise.all(visits.splice(0))
  }
  return { names: [...names].sort(), roots }
}
