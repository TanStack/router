import { readdirSync } from 'node:fs'
import { rootPathId } from '@tanstack/router-generator'
import type { Config } from '@tanstack/router-generator'

/**
 * Whether a project has what a route tree is generated from: a router entry,
 * and either a virtual route config or a routes directory with a root route.
 *
 * A package that only uses Start's compile-time APIs has neither, and under a
 * test runner nothing is generated for it.
 */
export function hasRouteTreeSources(opts: {
  routerFilePath: string
  generatorConfig: Pick<
    Config,
    'routesDirectory' | 'virtualRouteConfig' | 'routeFilePrefix'
  >
}): boolean {
  if (!opts.routerFilePath) {
    return false
  }
  if (opts.generatorConfig.virtualRouteConfig) {
    return true
  }
  try {
    // (with a route file prefix the generator reads only files that have it)
    const rootFile = `${opts.generatorConfig.routeFilePrefix ?? ''}${rootPathId}.`
    return readdirSync(opts.generatorConfig.routesDirectory).some((name) =>
      name.startsWith(rootFile),
    )
  } catch {
    return false
  }
}
