// import path from 'node:path'
// @ts-expect-error
import tsrStartManifest from 'tsr:start-manifest'
import type { Manifest } from '@tanstack/router-core'

/**
 * @description Returns the router manifest that should be sent to the client.
 * This includes only the assets and preloads for the current route and any
 * special assets that are needed for the client. It does not include relationships
 * between routes or any other data that is not needed for the client.
 */
export function getStartManifest() {
  const startManifest = tsrStartManifest() as Manifest

  const rootRoute = (startManifest.routes.__root__ =
    startManifest.routes.__root__ || {})

  rootRoute.assets = rootRoute.assets || []

  // Get the entry for the client from vinxi
  // const vinxiClientManifest = getManifest('client')

  // const importPath =
  //   vinxiClientManifest.inputs[vinxiClientManifest.handler]?.output.path
  // if (!importPath) {
  //   invariant(importPath, 'Could not find client entry in vinxi manifest')
  // }

  if (process.env.NODE_ENV === 'development' && !process.env.TSS_CLIENT_ENTRY) {
    throw new Error(
      'tanstack/start-router-manifest: TSS_CLIENT_ENTRY must be defined in your environment for getStartManifest()',
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

    const entryScript = `import(${JSON.stringify(process.env.TSS_CLIENT_ENTRY)})`
    // const entryScript = `import RefreshRuntime from "${path.join('/', '@react-refresh')}";
    // RefreshRuntime.injectIntoGlobalHook(window)
    // window.$RefreshReg$ = () => {}
    // window.$RefreshSig$ = () => (type) => type
    // window.__vite_plugin_react_preamble_installed__ = true;
    // import(${JSON.stringify(process.env.TSS_CLIENT_ENTRY)})`

    rootRoute.assets.push({
      tag: 'script',
      attrs: {
        type: 'module',
        suppressHydrationWarning: true,
        async: true,
      },
      children: entryScript,
    })
  }

  const manifest = {
    ...startManifest,
    routes: Object.fromEntries(
      Object.entries(startManifest.routes).map(([k, v]: any) => {
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
