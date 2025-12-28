import { rootRouteId } from '@tanstack/router-core'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * @description Returns the router manifest that should be sent to the client.
 * This includes only the assets and preloads for the current route and any
 * special assets that are needed for the client. It does not include relationships
 * between routes or any other data that is not needed for the client.
 */
export async function getStartManifest() {
  const { tsrStartManifest } = await import('tanstack-start-manifest:v')
  const startManifest = tsrStartManifest()

  const rootRoute = (startManifest.routes[rootRouteId] =
    startManifest.routes[rootRouteId] || {})

  rootRoute.assets = rootRoute.assets || []

  // In dev mode, add React Refresh separately so it can be kept for hydrate: false
  if (process.env.TSS_DEV_SERVER === 'true') {
    const { injectedHeadScripts } = await import(
      'tanstack-start-injected-head-scripts:v'
    )
    if (injectedHeadScripts) {
      // Add React Refresh script (keep for HMR even when hydrate: false)
      rootRoute.assets.push({
        tag: 'script',
        attrs: {
          type: 'module',
          async: true,
        },
        children: injectedHeadScripts,
      })
    }
  }

  // Add client entry (will be filtered when hydrate: false)
  rootRoute.assets.push({
    tag: 'script',
    attrs: {
      type: 'module',
      async: true,
      'data-tsr-client-entry': 'true',
    },
    children: `import('${startManifest.clientEntry}')`,
  })

  const manifest = {
    routes: Object.fromEntries(
      Object.entries(startManifest.routes).flatMap(([k, v]) => {
        const result = {} as {
          preloads?: Array<string>
          assets?: Array<RouterManagedTag>
        }
        let hasData = false
        if (v.preloads && v.preloads.length > 0) {
          result['preloads'] = v.preloads
          hasData = true
        }
        if (v.assets && v.assets.length > 0) {
          result['assets'] = v.assets
          hasData = true
        }
        if (!hasData) {
          return []
        }
        return [[k, result]]
      }),
    ),
  }

  // Strip out anything that isn't needed for the client
  return manifest
}
