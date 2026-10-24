import { rootRouteId } from '@tanstack/router-core'

import type { GeneratorPlugin, ModelRoute } from '@tanstack/router-generator'

/** The file of a route: its route file, or the lazy file or piece of a route the tree creates. */
function fileOf(route: ModelRoute) {
  return route.file ?? route.pieces.lazy ?? Object.values(route.pieces)[0] ?? ''
}

/**
 * this plugin builds the routes manifest and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function routesManifestPlugin(): GeneratorPlugin {
  return {
    name: 'routes-manifest-plugin',
    onRouteTreeChanged: ({ model }) => {
      const routes: typeof globalThis.TSS_ROUTES_MANIFEST = {
        [rootRouteId]: {
          filePath: model.root.file,
          children: model.children.map((child) => child.routePath),
        },
        ...Object.fromEntries(
          model.routes.map((route) => [
            route.routePath,
            {
              filePath: fileOf(route),
              children: route.children.length
                ? route.children.map((child) => child.routePath)
                : undefined,
            },
          ]),
        ),
      }

      globalThis.TSS_ROUTES_MANIFEST = routes
    },
  }
}
