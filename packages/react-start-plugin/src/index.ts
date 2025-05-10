import path from 'node:path'
import { TanStackServerFnPluginEnv } from '@tanstack/server-functions-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {
  TanStackStartServerRoutesVite,
  TanStackStartVitePluginCore,
} from '@tanstack/start-plugin-core'
import { getTanStackStartOptions } from './schema'
import type { TanStackStartInputConfig, WithReactPlugin } from './schema'
import type { PluginOption } from 'vite'

export type {
  TanStackStartInputConfig,
  TanStackStartOutputConfig,
  WithReactPlugin,
} from './schema'

export function TanStackStartVitePlugin(
  opts?: TanStackStartInputConfig & WithReactPlugin,
): Array<PluginOption> {
  type OptionsWithReact = ReturnType<typeof getTanStackStartOptions> &
    WithReactPlugin
  const options: OptionsWithReact = getTanStackStartOptions(opts)

  return [
    tanstackRouter({
      verboseFileRoutes: false,
      ...options.tsr,
      target: 'react',
      enableRouteGeneration: true,
      autoCodeSplitting: true,
    }),
    TanStackStartVitePluginCore('react', options),
    {
      name: 'tanstack-react-start:resolve-entries',
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
        if (id === '/~start/server-entry.tsx') {
          return id
        }

        return null
      },
      load(id) {
        const routerImportPath = JSON.stringify(
          path.resolve(options.root, options.tsr.srcDirectory, 'router'),
        )

        if (id === '/~start/server-entry.tsx') {
          return `
import { toWebRequest, defineEventHandler, __setGlobalOrigin, __getAbsoluteUrl } from '@tanstack/react-start/server';
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
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from ${routerImportPath}

const router = createRouter()

hydrateRoot(document, <StartClient router={router} />)
`
        }

        if (id === '/~start/default-server-entry.tsx') {
          return `
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
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
          `import { createClientRpc } from '@tanstack/react-start/server-functions-client'`,
        replacer: (d) =>
          `createClientRpc('${d.functionId}', '${options.serverFns.base}')`,
      },
      server: {
        getRuntimeCode: () =>
          `import { createServerRpc } from '@tanstack/react-start/server-functions-server'`,
        replacer: (d) =>
          `createServerRpc('${d.functionId}', '${options.serverFns.base}', ${d.fn})`,
      },
    }),
    TanStackStartServerRoutesVite({
      ...options.tsr,
      target: 'react',
    }),
    viteReact(options.react),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
