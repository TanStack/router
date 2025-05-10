import path from 'node:path'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import viteSolid from 'vite-plugin-solid'
import {
  TanStackStartServerRoutesVite,
  TanStackStartVitePluginCore,
} from '@tanstack/start-plugin-core'
import { getTanStackStartOptions } from './schema'
import type { PluginOption } from 'vite'
import type { TanStackStartInputConfig, WithSolidPlugin } from './schema'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
  WithSolidPlugin,
} from './schema'

export function TanStackStartVitePlugin(
  opts?: TanStackStartInputConfig & WithSolidPlugin,
): Array<PluginOption> {
  type OptionsWithSolid = ReturnType<typeof getTanStackStartOptions> &
    WithSolidPlugin
  const options: OptionsWithSolid = getTanStackStartOptions(opts)

  return [
    TanStackRouterVite({
      ...options.tsr,
      target: 'solid',
      enableRouteGeneration: true,
      autoCodeSplitting: true,
    }),
    TanStackStartVitePluginCore('solid', options),
    {
      name: 'tanstack-solid-start:resolve-entries',
      resolveId(id) {
        if (
          [
            '/~start/server-entry',
            '/~start/default-server-entry',
            '/~start/default-client-entry',
          ].includes(id)
        ) {
          return `${id}.tsx`
        }

        return null
      },
      load(id) {
        const routerImportPath = JSON.stringify(
          path.resolve(options.root, options.tsr.srcDirectory, 'router'),
        )

        if (id === '/~start/server-entry.tsx') {
          return `
import { toWebRequest, defineEventHandler, __setGlobalOrigin, __getAbsoluteUrl } from '@tanstack/solid-start/server';
import serverEntry from '${options.serverEntryPath}';

export default defineEventHandler(function(event) {
  const request = toWebRequest(event);
  __setGlobalOrigin(__getAbsoluteUrl(request));
  return serverEntry({ request });
})
`
        }

        if (id === '/~start/default-client-entry.tsx') {
          return `
import { hydrate } from 'solid-js/web'
import { StartClient } from '@tanstack/solid-start'
import { createRouter } from ${routerImportPath}

const router = createRouter()

hydrate(() => <StartClient router={router} />, document.body)
`
        }

        if (id === '/~start/default-server-entry.tsx') {
          return `
import { createStartHandler, defaultStreamHandler } from '@tanstack/solid-start/server'
import { createRouter } from ${routerImportPath}

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
`
        }

        return null
      },
    },
    TanStackServerFnPluginEnv({
      // This is the ID that will be available to look up and import
      // our server function manifest and resolve its module
      manifestVirtualImportId: 'tanstack:server-fn-manifest',
      client: {
        getRuntimeCode: () =>
          `import { createClientRpc } from '@tanstack/solid-start/server-functions-client'`,
        replacer: (d) =>
          `createClientRpc('${d.functionId}', '${options.serverFns.base}')`,
      },
      server: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/solid-start/server-functions-server'`,
        replacer: (d) =>
          `createServerRpc('${d.functionId}', '${options.serverFns.base}', ${d.fn})`,
      },
    }),
    TanStackStartServerRoutesVite({
      ...options.tsr,
      target: 'solid',
    }),
    viteSolid({ ...options.solid, ssr: true }),
  ]
}
