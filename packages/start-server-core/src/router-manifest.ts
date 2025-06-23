import { rootRouteId } from '@tanstack/router-core'
import { VIRTUAL_MODULES } from './virtual-modules'
import { loadVirtualModule } from './loadVirtualModule'

/**
 * @description Returns the router manifest that should be sent to the client.
 * This includes only the assets and preloads for the current route and any
 * special assets that are needed for the client. It does not include relationships
 * between routes or any other data that is not needed for the client.
 */
export async function getStartManifest(opts: { basePath: string }) {
  const { tsrStartManifest } = await loadVirtualModule(
    VIRTUAL_MODULES.startManifest,
  )
  const startManifest = tsrStartManifest()

  const rootRoute = (startManifest.routes[rootRouteId] =
    startManifest.routes[rootRouteId] || {})

  rootRoute.assets = rootRoute.assets || []

  let script = `import('${startManifest.clientEntry}')`
  if (process.env.NODE_ENV === 'development') {
    if (globalThis.TSS_INJECTED_HEAD_SCRIPTS) {
      script = `${globalThis.TSS_INJECTED_HEAD_SCRIPTS + ';'}${script}`
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
        return [
          k,
          {
            preloads,
            assets,
          },
        ]
      }),
    ),
  }

  // Strip out anything that isn't needed for the client
  return manifest
}
