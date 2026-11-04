import type { GeneratorPlugin, TreeModel } from '@tanstack/router-generator'

/**
 * this plugin gets the prerenderable paths and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function prerenderRoutesPlugin(): GeneratorPlugin {
  return {
    name: 'prerender-routes-plugin',
    onRouteTreeChanged: ({ model }) => {
      globalThis.TSS_PRERENDABLE_PATHS = getPrerenderablePaths(model)
    },
  }
}

function getPrerenderablePaths(model: TreeModel): Array<{ path: string }> {
  const paths = new Set<string>(['/'])

  for (const route of model.routes) {
    if (!route.routePath) continue
    // filter routes that are layout
    if (route.isNonPath) continue

    // filter dynamic routes
    // if routePath contains $ it is dynamic
    if (route.routePath.includes('$')) continue

    // filter routes that do not have a component, i.e api routes (a route
    // whose options may hold a key the generator could not read may have
    // one, SPEC J1.9)
    if (!route.props?.unknown && !route.props?.known.has('component')) continue

    paths.add(route.fullPath)
  }

  return Array.from(paths).map((path) => ({ path }))
}
