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

  let script = `import('${startManifest.clientEntry}')`
  if (process.env.TSS_DEV_SERVER === 'true') {
    const { injectedHeadScripts } = await import(
      'tanstack-start-injected-head-scripts:v'
    )
    if (injectedHeadScripts) {
      script = `${injectedHeadScripts + ';'}${script}`
    }
  }
  rootRoute.assets.push({
    tag: 'script',
    attrs: {
      type: 'module',
      suppressHydrationWarning: true,
      async: true,
    },
    children: script,
  })

  const manifest = {
    ...startManifest,
    routes: Object.fromEntries(
      Object.entries(startManifest.routes).map(([k, v]) => {
        const { preloads, assets } = v
        const result = {} as {
          preloads?: Array<string>
          assets?: Array<RouterManagedTag>
        }
        if (preloads) {
          result['preloads'] = preloads
        }
        if (assets) {
          result['assets'] = assets
        }
        return [k, result]
      }),
    ),
  }

  // Strip out anything that isn't needed for the client
  return manifest
}
