// @ts-expect-error
import tsrGetManifest from 'tsr:routes-manifest'
import { getManifest } from 'vinxi/manifest'
import type { Manifest } from '@tanstack/react-router'

/**
 * @description Returns the full, unfiltered router manifest. This includes relationships
 * between routes, assets, and preloads and is NOT what you want to serialize and
 * send to the client.
 */
export function getFullRouterManifest() {
  const routerManifest = tsrGetManifest() as Manifest

  const CLIENT_BASE = process.env.CLIENT_BASE

  if (!CLIENT_BASE) {
    throw new Error(
      'Something went wrong. CLIENT_BASE is not defined in the environment for getFullRouterManifest',
    )
  }

  const rootRoute = (routerManifest.routes.__root__ =
    routerManifest.routes.__root__ || {})

  rootRoute.assets = rootRoute.assets || []

  // Always fake that HMR is ready
  if (process.env.NODE_ENV === 'development') {
    rootRoute.assets.push({
      tag: 'script',
      attrs: { type: 'module' },
      children: `import RefreshRuntime from "${CLIENT_BASE}/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true`,
    })
  }

  // Get the entry for the client from vinxi
  const vinxiClientManifest = getManifest('client')

  rootRoute.assets.push({
    tag: 'script',
    attrs: {
      src: vinxiClientManifest.inputs[vinxiClientManifest.handler]?.output.path,
      type: 'module',
      async: true,
      suppressHydrationWarning: true,
    },
  })

  return routerManifest
}

/**
 * @description Returns the router manifest that should be sent to the client.
 * This includes only the assets and preloads for the current route and any
 * special assets that are needed for the client. It does not include relationships
 * between routes or any other data that is not needed for the client.
 */
export function getRouterManifest() {
  const routerManifest = getFullRouterManifest()

  // Strip out anything that isn't needed for the client
  return {
    ...routerManifest,
    routes: Object.fromEntries(
      Object.entries(routerManifest.routes).map(([k, v]: any) => {
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
}
