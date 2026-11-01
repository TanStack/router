import path from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import crypto from 'node:crypto'

export const ROUTE_MODULE_MANIFEST_VERSION = 2

/** A route of a module subtree, with its path relative to the module root. */
export interface ManifestRoute {
  id: string
  /**
   * Id of the parent route; `null` for the module root, whose parent is the
   * route the module is mounted under.
   */
  parent: string | null
  /** Full path relative to the module root (module-local for own routes). */
  fullPath: string
  /** Whether the route has no children (used for path conflict checks). */
  leaf: boolean
  /** Provider-side page eligibility; consumers resolve the final URL. */
  prerender?: boolean
}

/** A module installed in the subtree of a manifest's module. */
export interface ManifestInstalledModule {
  id: string
  /** Runtime installation identity; differs from id for an explicit name. */
  key: string
  /** Modules whose routes this module references. */
  uses: Array<string>
  /** Full path of the module root relative to the manifest's module root. */
  mountPath: string
  /** Package that installs the module (`null` for the manifest's module). */
  includedBy: string | null
}

/**
 * `.tanstack/route-module.json`: the topology of a route module, written by its
 * own route generation and read by the packages that install or use it.
 */
export interface RouteModuleManifest {
  version: typeof ROUTE_MODULE_MANIFEST_VERSION
  id: string
  packageName: string
  /** All routes of the module's subtree, including installed modules. */
  routes: Array<ManifestRoute>
  /**
   * Route source paths relative to their provider. `owner` is the dependency
   * chain from this package to that provider, resolved in order by consumers.
   * Relative physical() paths outside a provider retain their source layout.
   */
  routeFiles: Array<{ owner: Array<string>; file: string; routeId: string }>
  /** Portable client-only views of provider route trees. */
  clientTrees: Array<{ owner: Array<string>; file: string; clientFile: string }>
  /** The module itself and every module installed in its subtree. */
  modules: Array<ManifestInstalledModule>
  /**
   * Whether the module's runtime entry exports `startModules`: the TanStack
   * Start fragments of the module and of the modules it installs.
   */
  startModules: boolean
  /** Hash of the topology above; changes whenever includers must regenerate. */
  topologyToken: string
}

export function getManifestPath(packageRoot: string) {
  return path.join(packageRoot, '.tanstack', 'route-module.json')
}

function readVersioned<T>(file: string, what: string): T | undefined {
  if (!existsSync(file)) {
    return undefined
  }
  const value = JSON.parse(readFileSync(file, 'utf8')) as { version: number }
  if (value.version !== ROUTE_MODULE_MANIFEST_VERSION) {
    throw new Error(
      `The ${what} "${file}" has version ${value.version}; this generator reads version ${ROUTE_MODULE_MANIFEST_VERSION}. Regenerate it with the same version of @tanstack/router-generator.`,
    )
  }
  return value as T
}

/** Writes `value` as JSON if the content changed. Returns whether it wrote. */
async function writeJson(file: string, value: unknown): Promise<boolean> {
  const content = `${JSON.stringify(value, null, 2)}\n`
  if (existsSync(file) && readFileSync(file, 'utf8') === content) {
    return false
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, content)
  await fsp.rename(tmp, file)
  return true
}

export function readManifest(
  packageRoot: string,
): RouteModuleManifest | undefined {
  return readVersioned(getManifestPath(packageRoot), 'route module manifest')
}

export function writeManifest(
  packageRoot: string,
  manifest: RouteModuleManifest,
): Promise<boolean> {
  return writeJson(getManifestPath(packageRoot), manifest)
}

export function computeTopologyToken(
  manifest: Omit<RouteModuleManifest, 'topologyToken'>,
): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        id: manifest.id,
        routes: manifest.routes,
        routeFiles: manifest.routeFiles,
        clientTrees: manifest.clientTrees,
        modules: manifest.modules,
        startModules: manifest.startModules,
      }),
    )
    .digest('hex')
    .slice(0, 16)
}
