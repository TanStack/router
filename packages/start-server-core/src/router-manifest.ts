import { joinPaths, rootRouteId } from '@tanstack/router-core'
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

  // Get the entry for the client
  // const ClientManifest = getManifest('client')

  // const importPath =
  //   ClientManifest.inputs[ClientManifest.handler]?.output.path
  // if (!importPath) {
  //   invariant(importPath, 'Could not find client entry in manifest')
  // }

  if (process.env.NODE_ENV === 'development' && !process.env.TSS_CLIENT_ENTRY) {
    throw new Error(
      'tanstack/start-server-core: TSS_CLIENT_ENTRY must be defined in your environment for getStartManifest()',
    )
  }

  if (process.env.NODE_ENV === 'development') {
    // Always fake that HMR is ready
    // const CLIENT_BASE = sanitizeBase(process.env.TSS_CLIENT_BASE || '')

    // if (!CLIENT_BASE) {
    //   throw new Error(
    //     'tanstack/start-router-manifest: TSS_CLIENT_BASE must be defined in your environment for getFullRouterManifest()',
    //   )
    // }

    const clientEntry = joinPaths([opts.basePath, process.env.TSS_CLIENT_ENTRY])

    const script = `${globalThis.TSS_INJECTED_HEAD_SCRIPTS ? globalThis.TSS_INJECTED_HEAD_SCRIPTS + '; ' : ''}import('${clientEntry}')`

    rootRoute.assets.push({
      tag: 'script',
      attrs: {
        type: 'module',
        suppressHydrationWarning: true,
        async: true,
      },
      children: script,
    })
  }

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
