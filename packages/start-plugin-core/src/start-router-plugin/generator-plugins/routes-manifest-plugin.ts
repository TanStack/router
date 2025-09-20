import { rootRouteId } from '@tanstack/router-core'

import type { GeneratorPlugin } from '@tanstack/router-generator'

/**
 * this plugin builds the routes manifest and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function routesManifestPlugin(): GeneratorPlugin {
  return {
    name: 'routes-manifest-plugin',
    onRouteTreeChanged: ({ routeTree, rootRouteNode, routeNodes }) => {
      const routesManifest = {
        [rootRouteId]: {
          filePath: rootRouteNode.fullPath,
          children: routeTree.map((d) => d.routePath),
        },
        ...Object.fromEntries(
          routeNodes.map((d) => {
            const filePathId = d.routePath

            return [
              filePathId,
              {
                filePath: d.fullPath,
                parent: d.parent?.routePath ? d.parent.routePath : undefined,
                children: d.children?.map((childRoute) => childRoute.routePath),
              },
            ]
          }),
        ),
      }

      globalThis.TSS_ROUTES_MANIFEST = { routes: routesManifest }
    },
  }
}
