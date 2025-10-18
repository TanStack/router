import { rootRouteId } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from './virtual-modules'
import { loadVirtualModule } from './loadVirtualModule'
import path from 'node:path'

/**
 * @description Returns the router manifest that should be sent to the client.
 * This includes only the assets and preloads for the current route and any
 * special assets that are needed for the client. It does not include relationships
 * between routes or any other data that is not needed for the client.
 */
export async function getStartManifest({basePath = '', routerBasePath}: { basePath?: string, routerBasePath?: string } = {}) {
  const { tsrStartManifest } = await loadVirtualModule(
    VIRTUAL_MODULES.startManifest,
  )
  const startManifest = tsrStartManifest()

  const rootRoute = (startManifest.routes[rootRouteId] =
    startManifest.routes[rootRouteId] || {})

  rootRoute.assets = rootRoute.assets || []
  let script = `import('${basePath + "/" + startManifest.clientEntry.replace(routerBasePath ?? '', '')}')`
  if (process.env.TSS_DEV_SERVER === 'true') {
    const { injectedHeadScripts } = await loadVirtualModule(
      VIRTUAL_MODULES.injectedHeadScripts,
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
        console.log({k, preloads, assets})
        return [
          k,
          {
            preloads: preloads?.map((url) => basePath + '/' + url.replace(routerBasePath ?? '', '')) || [],
            assets:
              assets?.map((asset) => {
                console.log(asset)
                if (asset.tag === 'link' && asset.attrs?.href) {
                  return {
                    ...asset,
                    attrs: {
                      ...asset.attrs,
                      href: basePath + '/' + asset.attrs.href,
                    },
                  }
                }
                return asset
              }) || [],
          },
        ]
      }),
    ),
  }

  // Strip out anything that isn't needed for the client
  return manifest
}
