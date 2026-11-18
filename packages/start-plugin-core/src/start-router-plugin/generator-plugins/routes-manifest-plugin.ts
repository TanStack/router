import { rootRouteId } from '@tanstack/router-core/tooling'

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
    onRouteTreeChanged: ({ model, generator }) => {
      // a symlinked route file's modules have its real path as their id (the
      // bundler's default): the manifest joins its chunks by either path
      const filePaths = (file: string) => {
        const realFilePath = generator.realPathOf(file)
        return realFilePath
          ? { filePath: file, realFilePath }
          : { filePath: file }
      }
      const routes: typeof globalThis.TSS_ROUTES_MANIFEST = {
        [rootRouteId]: {
          ...filePaths(model.root.file),
          children: model.children.map((child) => child.routePath),
        },
        ...Object.fromEntries(
          model.routes.map((route) => [
            route.routePath,
            {
              ...filePaths(fileOf(route)),
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
