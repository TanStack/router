import { buildDevStylesUrl, rootRouteId } from '@tanstack/router-core'
import type { AnyRoute, RouterManagedTag } from '@tanstack/router-core'

// Pre-computed constant for dev styles URL
const ROUTER_BASEPATH = process.env.TSS_ROUTER_BASEPATH || '/'

/**
 * @description Returns the router manifest that should be sent to the client.
 * This includes only the assets and preloads for the current route and any
 * special assets that are needed for the client. It does not include relationships
 * between routes or any other data that is not needed for the client.
 *
 * @param matchedRoutes - In dev mode, the matched routes are used to build
 * the dev styles URL for route-scoped CSS collection.
 */
export async function getStartManifest(
  matchedRoutes?: ReadonlyArray<AnyRoute>,
) {
  const { tsrStartManifest } = await import('tanstack-start-manifest:v')
  const startManifest = tsrStartManifest()

  const rootRoute = (startManifest.routes[rootRouteId] =
    startManifest.routes[rootRouteId] || {})

  rootRoute.assets = rootRoute.assets || []

  // Inject dev styles link in dev mode
  if (process.env.TSS_DEV_SERVER === 'true' && matchedRoutes) {
    const matchedRouteIds = matchedRoutes.map((route) => route.id)
    rootRoute.assets.push({
      tag: 'link',
      attrs: {
        rel: 'stylesheet',
        href: buildDevStylesUrl(ROUTER_BASEPATH, matchedRouteIds),
        'data-tanstack-router-dev-styles': 'true',
      },
    })
  }

  let script = `import('${startManifest.clientEntry}')`
  if (process.env.TSS_DEV_SERVER === 'true') {
    const { injectedHeadScripts } =
      await import('tanstack-start-injected-head-scripts:v')
    if (injectedHeadScripts) {
      script = `${injectedHeadScripts + ';'}${script}`
    }
  }
  rootRoute.assets.push({
    tag: 'script',
    attrs: {
      type: 'module',
      async: true,
    },
    children: script,
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
