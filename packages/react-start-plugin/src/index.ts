import path from 'node:path'
import viteReact from '@vitejs/plugin-react'
import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import * as vite from 'vite'
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
    TanStackStartVitePluginCore({ framework: 'react' }, options),
    {
      name: 'tanstack-react-start:resolve-entries',
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
          const serverEntryPath = options.serverEntryPath
            ? vite.normalizePath(
                path.resolve(resolvedConfig.root, options.serverEntryPath),
              )
            : undefined

          return serverEntryPath
            ? `export * from '${serverEntryPath}';`
            : `
import { toWebRequest, createStartHandler, defaultStreamHandler, defineEventHandler } from '@tanstack/react-start/server';
import { createRouter } from ${routerImportPath};

const serverEntry = createStartHandler({
  createRouter,
})(defaultStreamHandler)

export default defineEventHandler(function(event) {
  const request = toWebRequest(event);
  return serverEntry({ request });
})
`
        }

        if (id === '/~start/default-client-entry.tsx') {
          return `
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from ${routerImportPath}

const router = createRouter()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient router={router} />
    </StrictMode>
  )
})
`
        }

        return null
      },
    },
    viteReact(options.react),
  ]
}

export { TanStackStartVitePlugin as tanstackStart }
