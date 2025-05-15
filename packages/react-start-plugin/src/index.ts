import path from 'node:path'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {
  TanStackStartServerRoutesVite,
  TanStackStartVitePluginCore,
} from '@tanstack/start-plugin-core'
import { getTanStackStartOptions } from './schema'
import type { TanStackStartInputConfig, WithReactPlugin } from './schema'
import type { PluginOption, ResolvedConfig } from 'vite'

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

  let resolvedConfig: ResolvedConfig

  return [
    tanstackRouter({
      verboseFileRoutes: false,
      ...options.tsr,
      target: 'react',
      enableRouteGeneration: true,
      autoCodeSplitting: true,
    }),
    TanStackStartVitePluginCore({ framework: 'react' }, options),
    {
      name: 'tanstack-react-start:resolve-entries',
      // enforce: 'pre',
      configResolved: (config) => {
        resolvedConfig = config
      },
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
          const ssrEntryPath = path.resolve(
            resolvedConfig.root,
            options.serverEntryPath,
          )
          return `
import { toWebRequest, defineEventHandler } from '@tanstack/react-start/server';
import serverEntry from '${ssrEntryPath}';

export default defineEventHandler(function(event) {
  const request = toWebRequest(event);
  return serverEntry({ request });
})
`
        }

        if (id === '/~start/default-client-entry.tsx') {
          return `
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from ${routerImportPath}

const router = createRouter()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient router={router} />
  </StrictMode>
)
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
    TanStackStartServerRoutesVite({
      ...options.tsr,
      target: 'react',
    }),
    viteReact(options.react),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
