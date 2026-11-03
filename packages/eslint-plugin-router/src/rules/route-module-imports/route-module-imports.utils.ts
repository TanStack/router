import fs from 'node:fs'
import path from 'node:path'

const routeModuleByDirectory = new Map<string, boolean>()

function readsAsRouteModule(packageJsonPath: string): boolean {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    return packageJson?.tanstack?.router?.module !== undefined
  } catch {
    return false
  }
}

/**
 * Whether `directory` belongs to a route module: its nearest `package.json`
 * declares `tanstack.router.module`. Results are cached per directory.
 */
export function isInRouteModule(directory: string): boolean {
  const visited: Array<string> = []
  let current = path.resolve(directory)
  let result = false
  for (;;) {
    const cached = routeModuleByDirectory.get(current)
    if (cached !== undefined) {
      result = cached
      break
    }
    visited.push(current)
    const packageJsonPath = path.join(current, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      result = readsAsRouteModule(packageJsonPath)
      break
    }
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  for (const dir of visited) {
    routeModuleByDirectory.set(dir, result)
  }
  return result
}

/** Generated files (`routeScope.gen.ts` imports the framework itself). */
export function isGeneratedFile(filename: string): boolean {
  return /\.gen\.[cm]?[jt]sx?$/.test(filename)
}
