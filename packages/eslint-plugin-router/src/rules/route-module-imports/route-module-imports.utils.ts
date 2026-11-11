import fs from 'node:fs'
import path from 'node:path'

/** What the rule needs to know about the route module a file belongs to. */
export interface RouteModuleInfo {
  /** Ids of the modules the package lists in `tanstack.router.module.uses`. */
  uses: ReadonlyArray<string>
}

/** The nearest `package.json` of a directory; `null` when there is none. */
const packageJsonByDirectory = new Map<string, string | null>()
/** Parsed route-module declarations, revalidated by modification time. */
const routeModuleByPackageJson = new Map<
  string,
  { mtimeMs: number; info: RouteModuleInfo | null }
>()

function findPackageJson(directory: string): string | null {
  const visited: Array<string> = []
  let current = path.resolve(directory)
  let result: string | null = null
  for (;;) {
    const cached = packageJsonByDirectory.get(current)
    if (cached !== undefined) {
      result = cached
      break
    }
    visited.push(current)
    const packageJsonPath = path.join(current, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      result = packageJsonPath
      break
    }
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  for (const dir of visited) {
    packageJsonByDirectory.set(dir, result)
  }
  return result
}

function readRouteModule(packageJsonPath: string): RouteModuleInfo | null {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const declaration = packageJson?.tanstack?.router?.module
    if (declaration === undefined) {
      return null
    }
    const uses: Array<unknown> = Array.isArray(declaration?.uses)
      ? declaration.uses
      : []
    return {
      uses: uses.flatMap((entry) => {
        const module =
          typeof entry === 'string'
            ? entry
            : (entry as { module?: unknown } | null)?.module
        return typeof module === 'string' ? [module] : []
      }),
    }
  } catch {
    return null
  }
}

/**
 * The route module `directory` belongs to: its nearest `package.json`
 * declares `tanstack.router.module`. `null` for other packages. The
 * directory walk is cached for the process; the declaration is re-read when
 * the package.json changes, so a long-lived ESLint server sees edits.
 */
export function getRouteModule(directory: string): RouteModuleInfo | null {
  const packageJsonPath = findPackageJson(directory)
  if (packageJsonPath === null) {
    return null
  }
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(packageJsonPath).mtimeMs
  } catch {
    return null
  }
  const cached = routeModuleByPackageJson.get(packageJsonPath)
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.info
  }
  const info = readRouteModule(packageJsonPath)
  routeModuleByPackageJson.set(packageJsonPath, { mtimeMs, info })
  return info
}

/** The used module an import specifier points into, if any. */
export function getUsedModule(
  module: RouteModuleInfo,
  source: string,
): string | undefined {
  return module.uses.find(
    (used) => source === used || source.startsWith(`${used}/`),
  )
}

/**
 * Generated files: `routeScope.gen.ts`, the namespace files of every
 * `routeScopeNamespaceFiles` layout (`routeScope.gen.namespace0.ts`,
 * `routeScope.gen.products.ts`, `routeScope.gen/products.ts`) and the route
 * trees. They import the framework and used contracts themselves.
 */
export function isGeneratedFile(filename: string): boolean {
  return /\.gen(?:\.|[\\/])/.test(filename)
}
